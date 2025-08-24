/* eslint-disable no-unused-vars */
import { getLocationCoord } from './gmap.js';
import {
  getCachedLandmarks,
  setCachedLandmarks,
  enableLandmarkCache,
  getHistory,
} from './cache.js';
import {
  getConfig,
  validateCoords,
  normalizeCoordValue,
  setLoading,
  handleError,
} from './utils.js';
import { landmarkService, mapInterface, isTestMode } from './interfaces.js';
import { cachingNotification } from './components.js';

// DOM Elements
const myLocationButton = document.getElementById('my-location');
const searchSideBar = document.getElementById('search-bar-container');
const searchInput = document.getElementById('search-input');
const searchHistory = document.getElementById('search-history');
const searchButton = document.getElementById('search-button');
const landmarkSidebar = document.getElementById('landmarks-sidebar');
const landmarksList = document.getElementById('landmarks-list');

const default_radius = 15;
const default_zoom = 12;

// Map instance
let map;

// State variable to save last center position
let lastCenter = { lat: 37.323, lng: -122.0322 };

// State variable to save last dataset
let last_result = null;

/**
 * Calculates the search radius based on the current zoom level.
 * The radius is halved for each zoom level between defaultRadius and maxRadius.
 * Lower zoom = larger radius (higher zoom = smaller radius)
 * @param {number} zoomLevel - Current map zoom level
 * @returns {number} - Search radius in kilometers
 */
function calculateSearchRadius(zoomLevel, maxRadius = 50) {
  const zoomDiff = zoomLevel - default_zoom;
  const scaledRadius = default_radius * Math.pow(0.5, zoomDiff);
  return Math.min(Math.max(default_radius, scaledRadius), maxRadius);
}

export function initSearch() {
  // Get map instance from global scope (set in map.js)
  map = window.mapInstance;
  if (!map) {
    console.error('Map instance not found. Please initialize the map first.');
    return;
  }

  window.addEventListener('CachingNotification_updated', async (event) => {
    // console.debug('Landmarks updated at:', event.detail.timestamp);
    const currentCenter = mapInterface.getMapCenter(map);
    if (
      Math.abs(currentCenter.lat - lastCenter.lat) < 0.1 &&
      Math.abs(currentCenter.lng - lastCenter.lng) < 0.1
    )
      // auto-refresh landmarks based on updated server-side cache
      await searchLandmarks();
  });

  setupTextSearch();
}

export async function searchLandmarks() {
  try {
    // Clear any existing landmarks and markers
    landmarksList.innerHTML = '';
    mapInterface.clearLandMarkers();

    // Get current map center
    lastCenter = mapInterface.getMapCenter(map);
    const lat = normalizeCoordValue(lastCenter.lat);
    const lon = normalizeCoordValue(lastCenter.lng);
    const radius_km = calculateSearchRadius(map.getZoom());

    let landmarkData = null;
    if (isTestMode()) {
      console.log('Using test landmarks (test mode enabled)');
      const config = await getConfig();
      landmarkData = {
        location: config?.defaults?.default_location?.name,
        coordinates: [lat, lon],
        landmarks: config?.test_mode?.test_landmarks || [],
        cache_type: 'test_mode',
      };
    } else {
      // Check cache first
      const cached_data = getCachedLandmarks(lat, lon, radius_km, last_result);
      if (cached_data) {
        await mapInterface.displayLandmarks(cached_data);
        last_result = cached_data;
        if (cached_data?.cache_type == 'gpt_select') {
          // update cache with images after displaying them
          setCachedLandmarks(lat, lon, radius_km, cached_data);
        }
        return;
      }

      // Show loading indicator and fetch from API
      setLoading(true);
      landmarkData = await landmarkService.get_landmark_data(
        lat,
        lon,
        radius_km,
        last_result
      );
      if (landmarkData?.cache_type == 'nearby_places') {
        cachingNotification.show();
      }
    }
    if (landmarkData?.landmarks?.length > 0) {
      console.log(
        `Found ${landmarkData.landmarks.length} landmarks`,
        landmarkData
      );

      // Display landmarks and show sidebar
      const imagesToCache = await mapInterface.displayLandmarks(landmarkData);
      if (landmarkData?.cache_type != 'nearby_places') {
        // client-side caching for GPT results only
        last_result = landmarkData;
        setCachedLandmarks(lat, lon, radius_km, landmarkData);
        await landmarkService.cacheImages(imagesToCache);
      }

      // Update URL parameters with current position
      updateUrlParameters();
    } else handleError('No landmarks found in this area.');
  } catch (error) {
    console.error('Error searching for landmarks:', error);
    console.error('Error details:', error.message || 'Unknown error');

    // Show error message
    landmarksList.innerHTML = `
                <div class="landmark-item error">
                    <div class="landmark-name">Couldn't connect to service</div>
                    <div class="landmark-summary">
                        <p>There was a problem retrieving landmarks information. This could be due to:</p>
                        <ul>
                            <li>Network connectivity issues</li>
                            <li>API service temporarily unavailable</li>
                        </ul>
                        <p>Please check your network connection and try again later.</p>
                        <button id="retry-landmarks" class="btn">Try Again</button>
                    </div>
                </div>
            `;

    // Add event listener to retry button
    const retryButton = document.getElementById('retry-landmarks');
    if (retryButton) {
      retryButton.addEventListener('click', function () {
        searchLandmarks();
      });
    }

    // Show landmarks panel with error
    landmarkSidebar.classList.remove('hidden');
    mapInterface.clearLandMarkers();
    handleError('There was an error retrieving landmarks information.');
  } finally {
    setLoading(false);
  }
}

/**
 * Set up text search functionality
 */
function setupTextSearch() {
  searchSideBar.classList.remove('hidden');

  // Add click event to search button
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) searchText(query);
  });

  // Add event listener for Enter key in search input
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) searchText(query);
    }
  });

  console.debug('Local cache enabled: ', enableLandmarkCache());
  searchInput.addEventListener('focus', (e) => {
    updateSearchHistory();
    landmarkSidebar.classList.add('hidden');
    e.target.select();
  });

  window.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input already
    const isTyping =
      document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA';
    if (isTyping) return;

    if (e.key === '/') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select(); // select all text
    }
  });
}

function updateSearchHistory() {
  const history = getHistory().slice(-10);
  searchHistory.innerHTML = ''; // Clear existing options
  history.forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    searchHistory.appendChild(option);
  });
}

let lastQuery = null;
let lastPlace = null;
let lastCoord = null;
let lastLoc = null;

/**
 * Perform a text search for location (not landmarks)
 * @param {string} query - The search query entered by the user
 */
async function searchText(query) {
  try {
    if (!query || query.trim() === '') {
      handleError('Please enter a valid search query.');
      return;
    }

    let locData = null;
    landmarksList.innerHTML = '';
    mapInterface.clearLandMarkers();
    landmarkSidebar.classList.add('hidden');
    setLoading(true);

    // Check if the query is the same as the last one
    if (query != lastQuery) {
      // New Queries Pass 1: Geocoding API to lookup location
      lastQuery = query;
      lastPlace = lastLoc = null;
      const coords = await getLocationCoord(query);
      if (coords && validateCoords(coords.lat, coords.lon)) {
        lastCoord = coords;
        mapInterface.mapPanTo(lastCoord.lat, lastCoord.lon);
        return;
      }
    }

    if (!lastPlace) {
      // Pass 2: call Google Text Search API
      const lat = normalizeCoordValue(lastCoord?.lat);
      const lon = normalizeCoordValue(lastCoord?.lon);
      locData = await landmarkService.queryLocation(query, lat, lon, false);
      if (locData?.landmarks?.length > 0) {
        lastPlace = locData.landmarks[0];
        mapInterface.mapPanTo(lastPlace.lat, lastPlace.lon);
        locData.landmarks[0].local = query;
      }
    } else {
      // Pass 3: GPT query with pass2 info
      const lat = normalizeCoordValue(lastPlace.lat);
      const lon = normalizeCoordValue(lastPlace.lon);
      if (lastLoc) {
        query = `${lastPlace.name}, ${lastPlace.loc}`;
        searchInput.value = '';
        lastQuery = null;
      }
      locData = await landmarkService.queryLocation(query, lat, lon, true);
      if (locData?.landmarks?.length > 0) {
        lastLoc = locData.landmarks[0];
        mapInterface.mapPanTo(lastLoc.lat, lastLoc.lon);
      }
    }

    if (locData) {
      await mapInterface.displayLandmarks(locData);
    } else {
      handleError(`Location not found for "${query}"`);
    }
  } catch (error) {
    console.error('Error searching for text:', error);
    handleError(`Error searching for "${query}": ${error.message}`);
  } finally {
    setLoading(false);

    if (!lastPlace && !lastLoc) {
      // Push new position to browser history
      updateUrlParameters(true);
    }
  }
}

/**
 * Update the URL parameters with the current map center and zoom level
 */
export function updateUrlParameters(pushState = false) {
  if (!map) return;

  const center = mapInterface.getMapCenter(map);
  const lat = normalizeCoordValue(center.lat);
  const lon = normalizeCoordValue(center.lng);
  const zoom = parseInt(map.getZoom());

  // Create URL with the new parameters
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set('lat', lat);
  urlParams.set('lon', lon);
  urlParams.set('zoom', zoom);

  const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
  console.debug('URL:', newUrl);

  if (pushState) window.history.pushState({ lat, lon, zoom }, '', newUrl);
  else window.history.replaceState({ lat, lon, zoom }, '', newUrl);
}

/**
 * Set up the location control to center the map on the user's location
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      handleError('Geolocation is not supported by your browser');
      myLocationButton.disabled = true;
      myLocationButton.title = 'Geolocation is not supported by your browser';
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        console.error(`Error with Geolocation: ${error.message}`);
        handleError('Unable to get your Geolocation.');
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Get the user's current location and toggle between user location and last center
 */
export async function getUserLocation() {
  // Step 1: Get current center and user location
  const currentCenter = mapInterface.getMapCenter(map);
  const userLocation = await getCurrentPosition();

  // Step 2: Check if at user location
  const isAtUserLocation =
    Math.abs(currentCenter.lat - userLocation.lat) < 0.1 &&
    Math.abs(currentCenter.lng - userLocation.lng) < 0.1;

  // Step 3: Determine target location
  let targetLocation;
  let shouldShowMarker = false;

  if (isAtUserLocation && lastCenter) {
    // At user location → go to last center
    targetLocation = lastCenter;
  } else {
    // Not at user location → save current as last center and go to user location
    lastCenter = currentCenter;
    targetLocation = userLocation;
    shouldShowMarker = true;
  }

  // Step 4: Pan to coordinate and show marker if needed
  mapInterface.mapPanTo(targetLocation.lat, targetLocation.lng);

  // Update URL parameters with current position
  updateUrlParameters();
  return shouldShowMarker ? targetLocation : null;
}
