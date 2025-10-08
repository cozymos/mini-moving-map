import { getLocationCoord, getLocationDetails } from './gmap.js';
import { getLandmarksWithGPT } from './openai.js';
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
  escapeHTML,
} from './utils.js';
import { landmarkService, mapInterface, isTestMode } from './interfaces.js';
import { cachingNotification } from './components.js';
import { i18n, setTooltip } from './lion.js';

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

  window.addEventListener('CachingNotification_updated', async () => {
    // Get current map center
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
        `🏛️ Found ${landmarkData.landmarks.length} landmarks`,
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
    } else handleError(i18n.t('errors.no_landmarks_found'));
  } catch (error) {
    console.error(
      'Error searching for landmarks:',
      error.message || 'Unknown error'
    );

    // Show error message
    const connectionTitle = escapeHTML(i18n.t('search.error.connection_title'));
    const connectionDescription = escapeHTML(
      i18n.t('search.error.connection_description')
    );
    const networkIssue = escapeHTML(i18n.t('search.error.network_issue'));
    const apiUnavailable = escapeHTML(i18n.t('search.error.api_unavailable'));
    const retryButtonText = escapeHTML(i18n.t('search.error.retry_button'));

    landmarksList.innerHTML = `
                <div class="landmark-item error">
                    <div class="landmark-name">${connectionTitle}</div>
                    <div class="landmark-summary">
                        <p>${connectionDescription}</p>
                        <ul>
                            <li>${networkIssue}</li>
                            <li>${apiUnavailable}</li>
                        </ul>
                        <button id="retry-landmarks" class="btn">${retryButtonText}</button>
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
      handleError(i18n.t('errors.location_not_found'));
    }
  } catch (error) {
    console.error(`Error searching for "${query}": ${error.message}`);
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
      handleError(i18n.t('errors.geolocation_not_supported'));
      myLocationButton.disabled = true;
      setTooltip(myLocationButton, 'errors.geolocation_not_supported');
      reject(new Error('Geolocation not supported'));
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
        handleError(i18n.t('errors.unable_to_get_geolocation'));
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

import { getLastKnownPosition } from './simconnect.js';

/**
 * Get the user's current location and toggle between user location and last center
 */
export async function getUserLocation() {
  let userLocation, targetLocation;
  let shouldShowMarker = false;

  // Step 1: Get current center and user location
  const currentCenter = mapInterface.getMapCenter(map);
  const aircraftPosition = getLastKnownPosition();
  if (aircraftPosition) userLocation = aircraftPosition;
  else userLocation = await getCurrentPosition();

  // Step 2: Check if at user location
  const isAtUserLocation =
    Math.abs(currentCenter.lat - userLocation.lat) < 0.1 &&
    Math.abs(currentCenter.lng - userLocation.lng) < 0.1;

  // Step 3: Determine target location
  if (isAtUserLocation && lastCenter) {
    // At user location → go to last center
    targetLocation = lastCenter;
  } else {
    // Not at user location → save current as last center and go to user location
    lastCenter = currentCenter;
    targetLocation = userLocation;
    shouldShowMarker = !aircraftPosition;
  }

  // Step 4: Pan to coordinate and show marker if needed
  mapInterface.mapPanTo(targetLocation.lat, targetLocation.lng);

  // Update URL parameters with current position
  updateUrlParameters();
  return shouldShowMarker ? targetLocation : null;
}

export async function searchAirport() {
  try {
    landmarksList.innerHTML = '';
    mapInterface.clearLandMarkers();
    setLoading(true);

    const center = mapInterface.getMapCenter(map);
    const lat = normalizeCoordValue(center.lat);
    const lon = normalizeCoordValue(center.lng);
    const locationData = await getLocationDetails(lat, lon);
    const landmarkData = await getLandmarksWithGPT(
      locationData,
      lat,
      lon,
      100,
      i18n.lang.preferLocale,
      'landmarks.airport'
    );
    if (landmarkData?.landmarks?.length > 0) {
      await mapInterface.displayLandmarks(landmarkData);
    }
  } catch {
    handleError(i18n.t('errors.no_results'));
  } finally {
    setLoading(false);
  }
}

export async function openInternetRadio() {
  try {
    const center = mapInterface.getMapCenter(map);
    const locationData = await getLocationDetails(center.lat, center.lng);
    const params = new URLSearchParams({
      city: locationData.city,
      countrycode: locationData.countryCode,
      // limit: 10,
    });
    if (locationData.state) params.set('state', locationData.state);

    const playerUrl = `src/radio-player.html?${params.toString()}`;
    window.open(playerUrl, '_blank');
  } catch {
    handleError(i18n.t('errors.no_results'));
  }
}
