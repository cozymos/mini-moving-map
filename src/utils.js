// Function to get and parse prompts from prompts.json
export async function getPrompt(promptName, variables = {}) {
  try {
    // Fetch the prompts.json file
    const response = await fetch('/prompts.json');
    const prompts = await response.json();

    if (!prompts[promptName]) {
      throw new Error(`Prompt "${promptName}" not found`);
    }

    // Get the prompt templates
    const promptTemplates = prompts[promptName];

    // Replace variables in the templates
    const processedPrompt = {};
    for (const key in promptTemplates) {
      let text = promptTemplates[key];
      // Replace each variable in the template
      for (const varName in variables) {
        const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
        text = text.replace(regex, variables[varName]);
      }
      processedPrompt[key] = text;
    }

    return processedPrompt;
  } catch (error) {
    console.error('Error loading prompt:', error);
    throw error;
  }
}

/**
 * Get the appropriate language code based on country
 * @param {Object} country - The country information
 * @returns {string|null} - The language code or null if no special handling needed
 */
export function getLanguageCodeForCountry(country) {
  if (!country || !country.name) return null;

  const countryName = country.name.toLowerCase();
  const countryCode = country.code;

  if (countryName.includes('hong kong') || countryName.includes('macau')) {
    return 'zh-HK';
  } else if (countryName.includes('china') || countryCode === 'CN') {
    return 'zh-CN';
  } else if (
    countryName.includes('taiwan') ||
    countryName.includes('singapore') ||
    countryName.includes('japan') ||
    countryName.includes('korea')
  ) {
    return 'zh-TW';
  } else if (
    !countryName.includes('usa') &&
    !countryName.includes('united states')
  )
    return 'en';

  return null;
}

/**
 * Utility functions for handling map coordinates
 */

/**
 * Standardize coordinate name to 'lat' or 'lon'
 * @param {string} name - The coordinate name to normalize
 * @returns {string} - Standardized name ('lat' or 'lon') or null if invalid
 */
function normalizeCoordName(name) {
  if (!name || typeof name !== 'string') {
    return null;
  }

  const lowerName = name.toLowerCase();

  if (lowerName === 'lat' || lowerName === 'latitude') {
    return 'lat';
  } else if (
    lowerName === 'lon' ||
    lowerName === 'lng' ||
    lowerName === 'longitude'
  ) {
    return 'lon';
  }

  return null;
}

/**
 * Normalize coordinate value to a float rounded to 4 decimal places
 * @param {number|string} value - The coordinate value to normalize
 * @returns {number|null} - Normalized value or null if invalid
 */
function normalizeCoordValue(value) {
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
 * Parse a coordinate from any input
 * @param {any} input - The input to parse
 * @returns {number|null} - Parsed coordinate value or null if invalid
 */
function parseCoord(input) {
  if (input === undefined || input === null) {
    return null;
  }

  return normalizeCoordValue(input);
}

/**
 * Format coordinates in standard [lat, lon] format
 * @param {number|string} lat - Latitude value
 * @param {number|string} lon - Longitude value
 * @returns {Array|null} - Formatted [lat, lon] array or null if invalid
 */
function formatCoords(lat, lon) {
  const normalizedLat = normalizeCoordValue(lat);
  const normalizedLon = normalizeCoordValue(lon);

  if (normalizedLat === null || normalizedLon === null) {
    return null;
  }

  return [normalizedLat, normalizedLon];
}

/**
 * Validate that coordinates are within valid ranges
 * @param {number|string} lat - Latitude value
 * @param {number|string} lon - Longitude value
 * @returns {boolean} - True if coordinates are valid
 */
function validateCoords(lat, lon) {
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
function parseMapParamsFromURL() {
  const urlParams = new URLSearchParams(window.location.search);

  // Look for various possible parameter names
  const lat = parseCoord(urlParams.get('lat') || urlParams.get('latitude'));
  const lon = parseCoord(
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
      center: [lat, lon],
      zoom: zoom,
    };
  }

  return null;
}

/**
 * Get default coordinates if URL parsing fails
 * @param {Array} defaultCenter - Default center coordinates [lat, lon]
 * @param {number} defaultZoom - Default zoom level
 * @returns {Object} - Object with lat, lon, and zoom properties
 */
function getDefaultMapParams(defaultCenter, defaultZoom) {
  const coords = formatCoords(
    defaultCenter && defaultCenter[0] !== undefined
      ? defaultCenter[0]
      : 37.7749,
    defaultCenter && defaultCenter[1] !== undefined
      ? defaultCenter[1]
      : -122.4194
  );

  return {
    center: coords || [37.7749, -122.4194],
    zoom: typeof defaultZoom === 'number' ? defaultZoom : 12,
  };
}

// Make these functions globally available
window.normalizeCoordName = normalizeCoordName;
window.normalizeCoordValue = normalizeCoordValue;
window.parseCoord = parseCoord;
window.formatCoords = formatCoords;
window.validateCoords = validateCoords;
window.parseMapParamsFromURL = parseMapParamsFromURL;
window.getDefaultMapParams = getDefaultMapParams;
