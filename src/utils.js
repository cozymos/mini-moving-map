import { mapInterface } from './interfaces.js';

export const SETTINGS_KEY = 'MAP_SETTINGS';
const LEGACY_SETTINGS_KEY = 'APP_SETTINGS';
export const screenWidthThreshold = 768; // The screen width below which is narrow
export const EARTH_RADIUS_KM = 6371; // Earth's mean radius

export function getSettings(requiredKey = null) {
  try {
    let rawSettings = localStorage.getItem(SETTINGS_KEY);

    // One-time migration for older saved settings.
    if (!rawSettings) {
      const legacySettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
      if (legacySettings) {
        localStorage.setItem(SETTINGS_KEY, legacySettings);
        localStorage.removeItem(LEGACY_SETTINGS_KEY);
        rawSettings = legacySettings;
      }
    }

    const settings = JSON.parse(rawSettings) || {};
    let updated = false;

    if (requiredKey) {
      const keys = Array.isArray(requiredKey) ? requiredKey : [requiredKey];
      keys.forEach((key) => {
        if (!(key in settings)) {
          settings[key] = '';
          updated = true;
        }
      });
    }

    if (updated) {
      setSettings(settings);
    }

    return settings;
  } catch (error) {
    console.error(`Error getting ${SETTINGS_KEY}:`, error);
    return {};
  }
}

export function setSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error(`Error setting ${SETTINGS_KEY}:`, error);
  }
}

let CONFIG_CACHE = null;

// Utility function for loading configuration
export async function getConfig() {
  if (CONFIG_CACHE) return CONFIG_CACHE;

  const url = window.APP_CONFIG?.jsonConfig_url;
  if (!url) {
    console.warn('No jsonConfig_url found in window.APP_CONFIG');
    return null;
  }

  try {
    const response = await fetchJSON(url);
    if (!response.ok) {
      console.warn(`Failed to load config from ${url}:`, response.statusText);
      return null;
    }

    CONFIG_CACHE = await response.json();
    return CONFIG_CACHE;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
}

export function setConfig(config) {
  CONFIG_CACHE = config;
}

export function fetchJSON(path) {
  const base_url = import.meta.env?.BASE_URL || '/';
  path = path.replace(/^\/+/, '');

  return fetch(base_url + path, {
    headers: { Accept: 'application/json' },
  });
}

/**
 * Checks overlap count between new_landmarks and last_landmarks.
 * If limit is null, returns true if all new_landmarks exist in last_landmarks.
 * If limit is set, returns true if number of matches > limit.
 * @param {Array} new_landmarks - Array of new landmark objects
 * @param {Array} last_landmarks - Array of previous landmark objects
 * @param {number|null} [limit=null] - Optional threshold
 * @returns {boolean}
 */
export function same_landmarks(new_landmarks, last_landmarks, limit = null) {
  if (!new_landmarks || !last_landmarks) return false;
  let count = 0;
  for (const new_item of new_landmarks) {
    const found = last_landmarks.some(
      (last_item) => new_item.name === last_item.name
    );
    if (found) {
      count += 1;
    }
  }
  if (limit === null) {
    return count === new_landmarks.length; // all must match
  }
  return count > limit;
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} unsafe - Unsafe string that might contain HTML
 * @returns {string} - Escaped safe HTML string
 */
export function escapeHTML(unsafe) {
  if (!unsafe) return '';

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalize coordinate value to a float rounded to appropriate decimal precision:
 * 0 decimal places: ≈ 111 km (Can locate a country or large region).
 * 1 decimal place: ≈ 11.1 km (Can locate a large city or district).
 * 2 decimal places: ≈ 1.11 km (Can locate a town or village).
 * 3 decimal places: ≈ 111 meters (Can locate a neighborhood or street).
 * 4 decimal places: ≈ 11.1 meters (Can locate a building, as typical consumer-grade GPS).
 * @param {number|string} value - The coordinate value to normalize
 * @returns {number|null} - Normalized value or null if invalid
 */
export function normalizeCoordValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  // Convert string to number if needed
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // Check if it's a valid number
  if (isNaN(numValue)) {
    return null;
  }

  // Round to 4 decimal places (approximately 11 meters of precision)
  return Math.round(numValue * 10000) / 10000;
}

/**
 * Validate that coordinates are within valid ranges
 * @param {number|string} lat - Latitude value
 * @param {number|string} lon - Longitude value
 * @returns {boolean} - True if coordinates are valid
 */
export function validateCoords(lat, lon) {
  const normalizedLat = normalizeCoordValue(lat);
  const normalizedLon = normalizeCoordValue(lon);

  if (normalizedLat === null || normalizedLon === null) {
    return false;
  }

  // Validate ranges: lat (-90 to 90), lon (-180 to 180)
  return (
    normalizedLat >= -90 &&
    normalizedLat <= 90 &&
    normalizedLon >= -180 &&
    normalizedLon <= 180
  );
}

/**
 * Parse coordinates from URL parameters
 * @returns {Object|null} - Object with lat, lon, and zoom properties or null if invalid
 */
export function parseMapParamsFromURL() {
  const urlParams = new URLSearchParams(window.location.search);

  // Look for various possible parameter names
  const lat = normalizeCoordValue(
    urlParams.get('lat') || urlParams.get('latitude')
  );
  const lon = normalizeCoordValue(
    urlParams.get('lon') || urlParams.get('lng') || urlParams.get('longitude')
  );

  // Get zoom level (integer between 1-20)
  let zoom = urlParams.get('zoom') || urlParams.get('z');
  if (zoom !== null) {
    zoom = parseInt(zoom);
    if (isNaN(zoom) || zoom < 1 || zoom > 20) {
      zoom = null;
    }
  }

  // Only return if we have both valid coordinates
  if (lat !== null && lon !== null && validateCoords(lat, lon)) {
    return {
      //center: [lat, lon],
      center: { lat: lat, lng: lon },
      zoom: zoom,
    };
  }

  return null;
}

/**
 * Update the URL parameters with the current map center and zoom level
 */
export function updateUrlParameters(map, pushState = false) {
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

  const currentState = window.history.state || {};
  const newState = { ...currentState, lat, lon, zoom };

  if (pushState) {
    delete newState.appStart;
    window.history.pushState(newState, '', newUrl);
  } else window.history.replaceState(newState, '', newUrl);
}

/**
 * Calculate distance between two coordinates in kilometers
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @returns {number} - Distance in kilometers
 */
export function distance_km(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Normalize longitude values to the range [-180, 180]
 * @param {number} lng - Raw longitude value
 * @returns {number} Normalized longitude
 */
export function normalizeLng(lng) {
  lng = ((lng % 360) + 360) % 360; // Ensures 0 <= lng < 360
  if (lng > 180) lng -= 360;
  return lng;
}

/**
 * Toggle the loading spinner
 * @param {boolean} isLoading - Whether to show the spinner
 */
export function setLoading(isLoading) {
  const loadingElement = document.getElementById('loading');
  if (!loadingElement) return;

  if (isLoading) {
    loadingElement.classList.remove('hidden');
  } else {
    loadingElement.classList.add('hidden');
  }
}

function showError(message) {
  const errorElement = document.getElementById('error-message');
  if (!errorElement) return;

  errorElement.textContent = '⚠️ ' + message;
  errorElement.classList.remove('hidden');

  // Hide after 5 seconds
  setTimeout(() => {
    hideError();
  }, 5000);
}

function hideError() {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.classList.add('hidden');
  }
}

/**
 * Log and surface an error message to the user
 * @param {string} error - The error message
 */
export function handleError(error) {
  console.error(error);
  setLoading(false);
  showError(error);
}
