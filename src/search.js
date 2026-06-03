import {
  getLocationCoord,
  getLocationDetails,
  PlaceNearbySearch,
} from './gmap.js';
import { getLandmarksWithGPT } from './openai.js';
import { getLandmarksWithGemini } from './gemini.js';
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
  distance_km,
} from './utils.js';
import { landmarkService, mapInterface, isTestMode } from './interfaces.js';
import { cachingNotification } from './components.js';
import { i18n } from './lion.js';
import { updateUrlParameters } from './utils.js';

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchHistory = document.getElementById('search-history');
const searchButton = document.getElementById('search-button');
const infoSidebar = document.getElementById('info-sidebar');
const infoContent = document.getElementById('info-content');

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

  window.addEventListener('AsyncNotification_updated', async () => {
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
    infoContent.innerHTML = '';
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
      updateUrlParameters(map);
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

    infoContent.innerHTML = `
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
    infoSidebar.classList.remove('hidden');
    mapInterface.clearLandMarkers();
  } finally {
    setLoading(false);
  }
}

/**
 * Set up text search functionality
 */
function setupTextSearch() {
  // Add click event to search button
  searchButton.addEventListener('click', () => {
    if (searchInput.style.display === 'none') {
      searchInput.style.display = '';
      searchInput.focus();
      return;
    }
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
    infoSidebar.classList.add('hidden');
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
    } else if (e.key === 'Escape') {
      infoSidebar.classList.add('hidden');
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

    infoSidebar.classList.add('hidden');
    infoContent.innerHTML = '';
    mapInterface.clearLandMarkers();
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
        updateUrlParameters(map, true);
        return;
      }
    }

    let locData = null;
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
  }
}

/**
 * Set up the location control to center the map on the user's location
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      handleError(i18n.t('errors.geolocation_not_supported'));
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

/**
 * Pan to user's current location
 */
export async function showUserLocation() {
  updateUrlParameters(map, false);
  lastCenter = mapInterface.getMapCenter(map);
  const userLocation = await getCurrentPosition();
  mapInterface.mapPanTo(userLocation.lat, userLocation.lng, 0);
  updateUrlParameters(map, true);
  return userLocation;
}

export async function searchAirport() {
  try {
    infoContent.innerHTML = '';
    mapInterface.clearLandMarkers();
    setLoading(true);

    lastCenter = mapInterface.getMapCenter(map);
    const lat = normalizeCoordValue(lastCenter.lat);
    const lon = normalizeCoordValue(lastCenter.lng);
    const urlParams = new URLSearchParams(window.location.search);
    const locationData = await getLocationDetails(lat, lon);
    if (!locationData || locationData.locationName === 'Unknown Location') {
      throw new Error('Unknown location');
    }

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
    } else if (urlParams.has('gpt')) {
      landmarkData = await getLandmarksWithGPT(
        locationData,
        lat,
        lon,
        100,
        i18n.userLocale,
        'landmarks.airport'
      );
    } else if (urlParams.has('gmp')) {
      const filterType = {
        includedPrimaryTypes: ['airport', 'international_airport'],
        rankPreference: 'DISTANCE',
      };
      landmarkData = await PlaceNearbySearch(
        lat,
        lon,
        50,
        20,
        i18n.userLocale,
        filterType
      );
    } else {
      landmarkData = await getLandmarksWithGemini(
        locationData,
        lat,
        lon,
        100,
        i18n.userLocale,
        'landmarks.airport'
      );
    }

    if (landmarkData?.landmarks?.length > 0) {
      await mapInterface.displayLandmarks(landmarkData);

      // Zoom out if the closest result is too far to be visible at the current zoom
      let closestDist = Infinity;
      for (const lm of landmarkData.landmarks) {
        if (lm.lat != null && lm.lon != null) {
          const dist = distance_km(lat, lon, lm.lat, lm.lon);
          if (dist < closestDist) closestDist = dist;
        }
      }
      if (closestDist < Infinity) {
        const targetZoom = Math.floor(
          12 + Math.log2(15 / Math.max(closestDist * 1.5, 1))
        );
        if (targetZoom < map.getZoom()) {
          mapInterface.mapPanTo(lat, lon, Math.max(targetZoom, 1));
        }
      }
    }
    updateUrlParameters(map);
  } catch {
    handleError(i18n.t('errors.no_results'));
  } finally {
    setLoading(false);
  }
}

export async function openInternetRadio() {
  try {
    const { lat, lng } = mapInterface.getMapCenter(map);
    const locationData = await getLocationDetails(lat, lng);
    if (!locationData || locationData.locationName === 'Unknown Location') {
      throw new Error('Unknown location');
    }
    const config = await getConfig();

    const params = new URLSearchParams({
      city: locationData.city,
      countrycode: locationData.countryCode,
      limit: config?.defaults?.radio_limit || 40,
    });
    if (locationData.state) params.set('state', locationData.state);

    const playerUrl = `radio-player.html?${params.toString()}`;
    window.open(playerUrl, '_blank');
  } catch {
    handleError(i18n.t('errors.no_results'));
  }
}
