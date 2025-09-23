import { same_landmarks, distance_km } from './utils.js';

/**
 * Client-side caching module for landmark search results
 * Uses localStorage with proximity-based keys and TTL expiration
 */

const CACHE_PREFIX = 'landmarks_';
const CACHE_TTL_HOURS = window.APP_CONFIG?.CACHE_TTL_HOURS ?? 48;
const CACHE_TTL_MS = CACHE_TTL_HOURS * 60 * 60 * 1000;

const location_index = {};

/**
 * Generate cache key based on coordinates and radius
 * @param {number} lat - Latitude (rounded to 1 decimal)
 * @param {number} lng - Longitude (rounded to 1 decimal)
 * @param {number} radius - Search radius in km
 * @returns {string} Cache key
 */
function getCacheKey(lat, lng, radius) {
  // Round coordinates to generate cache keys that allow proximity matching
  // 1 decimal place: ≈ 11.1 km (Can locate a large city or district).
  // 2 decimal places: ≈ 1.11 km (Can locate a town or village).
  const roundedLat = lat.toFixed(1);
  const roundedLng = lng.toFixed(1);
  const roundedRadius = Math.round(radius);
  return `${CACHE_PREFIX}${roundedLat}_${roundedLng}_${roundedRadius}`;
}

/**
 * Get cached landmarks data
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in km
 * @returns {Object|null} Cached data or null if not found/expired
 */
export function getCachedLandmarks(lat, lng, radius, last_result) {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('cache')) {
      const param = urlParams.get('cache');
      if (param === 'false' || param === '0') {
        return null;
      }
    }

    const proximity_key = getCacheKey(lat, lng, radius);
    const cachedItem = localStorage.getItem(proximity_key);
    if (!cachedItem) return null;

    const parsed = JSON.parse(cachedItem);
    const cached_data = parsed.data;
    // Skip cache hit if cached data is the same as last dataset
    if (!same_landmarks(cached_data?.landmarks, last_result?.landmarks)) {
      console.log(
        `Pass 1: Proximity cache hit <${proximity_key}>`,
        cached_data
      );
      return cached_data;
    }
  } catch (error) {
    console.error('Error reading from cache:', error);
  }
  return null;
}

/**
 * Store landmarks data in cache
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in km
 * @param {Object} data - Landmarks data to cache
 */
export function setCachedLandmarks(lat, lng, radius, data) {
  try {
    const key = getCacheKey(lat, lng, radius);
    const cacheItem = {
      timestamp: Date.now(),
      data: data,
    };

    localStorage.setItem(key, JSON.stringify(cacheItem));
    const loc = data.location;
    if (loc) {
      if (!location_index[loc]) {
        location_index[loc] = new Set();
      }
      location_index[loc].add(key);
    }
  } catch (error) {
    console.error('Error writing to cache:', error);
    // Handle quota exceeded or other localStorage errors gracefully
    if (error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, skipping cache write');
    }
  }
}

/**
 * Clear all landmark cache entries (utility function)
 */
export function clearLandmarkCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

export function enableLandmarkCache() {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    let totalSize = 0;
    let expiredCount = 0;
    const now = Date.now();

    cacheKeys.forEach((key) => {
      const item = localStorage.getItem(key);
      if (item) {
        try {
          const parsed = JSON.parse(item);
          if (now - parsed.timestamp > CACHE_TTL_MS) {
            expiredCount++;
            localStorage.removeItem(key);
          } else {
            const loc = parsed.data.location;
            if (loc) {
              if (!location_index[loc]) {
                location_index[loc] = new Set();
              }
              location_index[loc].add(key);
            }
            totalSize += item.length;
          }
        } catch (error) {
          console.error('Invalid cache entry:', error);
        }
      }
    });

    return {
      Entries: cacheKeys.length,
      locations: Object.keys(location_index).length,
      ttlHours: CACHE_TTL_HOURS,
      expired: expiredCount,
      cacheSize: totalSize,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { error: error.message };
  }
}

export function findByLocation(locationName, lat, lon, radius_km, last_result) {
  function withinRadius(cacheInfo) {
    if (!cacheInfo || !Array.isArray(cacheInfo)) return false;
    const dist = distance_km(
      lat,
      lon,
      parseFloat(cacheInfo[0]),
      parseFloat(cacheInfo[1])
    );
    return dist <= radius_km;
  }

  if (Object.keys(location_index).length === 0) {
    console.debug('Local cache enabled: ', enableLandmarkCache());
  }

  const cacheKeys = location_index[locationName] || [];
  for (const key of cacheKeys) {
    const item = localStorage.getItem(key);
    if (item) {
      try {
        const parsed = JSON.parse(item);
        const cached_data = parsed.data;
        if (
          withinRadius(cached_data?.coordinates) &&
          !same_landmarks(cached_data?.landmarks, last_result?.landmarks)
        ) {
          console.debug(`Pass 2: Exact match location name: ${locationName}`);
          return cached_data;
        }
      } catch (error) {
        console.error('Invalid cache entry:', error);
      }
    }
  }

  return null;
}

export function getHistory() {
  return Object.keys(location_index);
}
