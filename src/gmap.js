import { getConfig, validateCoords } from './utils.js';
import { isTestMode, getGoogleMapsApiKey } from './interfaces.js';
import { getCountryLanguage } from './lion.js';
import { i18n } from './lion.js';

// Simple location cache to reduce API calls
const locationCache = {};

// Get location details (location name and country info) from coordinates
export async function getLocationDetails(latitude, longitude) {
  // Validate coordinates first
  if (!validateCoords(latitude, longitude)) {
    console.warn(`Invalid coordinates: ${latitude}, ${longitude}`);
    return { locationName: '', country: '', countryCode: null };
  }

  // If test mode is enabled, return the default location from config
  if (isTestMode()) {
    const config = await getConfig();
    const loc = config?.defaults?.default_location;
    if (loc) {
      console.log('Using test location (test mode enabled)');
      return {
        locationName: loc.name,
        country: loc.country || 'Unknown',
        countryCode: loc.country_code,
      };
    }
  }

  // Round coordinates to reduce API calls
  // 1 decimal place: ≈ 11.1 km (Can locate a large city or district).
  // 2 decimal places: ≈ 1.11 km (Can locate a town or village).
  const roundedLat = latitude.toFixed(1);
  const roundedLon = longitude.toFixed(1);
  const cacheKey = `${roundedLat},${roundedLon}`;

  // Return cached details if available
  if (locationCache[cacheKey]) {
    return locationCache[cacheKey];
  }

  if (!getGoogleMapsApiKey()) {
    console.warn('Unknown Location: Google Maps API key not available');
    return {
      locationName: 'Unknown Location',
      country: 'Unknown',
      countryCode: null,
    };
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${getGoogleMapsApiKey()}`
    );
    if (!response.ok) {
      console.error(
        `Unknown Location: Google Reverse Geocoding API error: ${response.status}`
      );
      return {
        locationName: 'Unknown Location',
        country: 'Unknown',
        countryCode: null,
      };
    }

    const data = await response.json();
    if (data.status === 'OK' && data.results && data.results.length) {
      const result = data.results[0];
      const components = result.address_components || [];

      let locality = '';
      let adminArea = '';
      let country = '';
      let countryCode = null;

      for (const comp of components) {
        const types = comp.types || [];
        if (types.includes('locality')) {
          locality = comp.long_name || '';
        } else if (types.includes('administrative_area_level_1')) {
          adminArea = comp.long_name || '';
        } else if (types.includes('country')) {
          country = comp.long_name || '';
          countryCode = comp.short_name;
        }
      }

      const parts = [];
      if (locality) parts.push(locality);
      if (adminArea && adminArea !== locality) parts.push(adminArea);
      if (country && country !== locality && country !== adminArea)
        parts.push(country);

      const locationName = parts.length ? parts.join(', ') : 'Unknown Location';
      console.debug(`Where is (${cacheKey}): ${locationName} (${countryCode})`);

      const resultDict = {
        locationName,
        country: country || 'Unknown',
        countryCode,
      };
      locationCache[cacheKey] = resultDict;
      return resultDict;
    }
  } catch (error) {
    console.error('Error getting location details:', error);
  }

  return { locationName: '', country: '', countryCode: null };
}

// Get coordinates from a location name
export async function getLocationCoord(locationName) {
  try {
    if (isTestMode()) {
      const config = await getConfig();
      const loc = config?.defaults?.default_location;
      if (loc) {
        console.log('Using test coordinates (test mode enabled)');
        return {
          lat: loc.lat,
          lon: loc.lon,
        };
      }
    }

    const encoded = encodeURIComponent(locationName);
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${getGoogleMapsApiKey()}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch location coordinates');
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      throw new Error('Location not found');
    }

    const coords = data.results[0].geometry.location;
    const lat = parseFloat(coords.lat);
    const lon = parseFloat(coords.lng !== undefined ? coords.lng : coords.lon);

    return { lat, lon };
  } catch (error) {
    console.error(locationName, error);
  }
}

function placeData(places) {
  const place_data = { landmarks: [] };
  if (places && places.length > 0) {
    place_data.landmarks = places.map((field) => ({
      name: field.displayName?.text || 'Unknown place',
      desc: field.generativeSummary?.overview?.text,
      lat: field.location.latitude,
      lon: field.location.longitude,
      type: field.primaryTypeDisplayName?.text,
      loc: field.formattedAddress,
    }));
  }
  return place_data;
}

/**
 * Search for locations and landmarks using Text Search (New) API
 * @param {string} query - The search query text
 * @param {string} langCode - Optional language code for the API request
 */
export async function PlaceTextSearch(
  query,
  langCode = null,
  maxResultCount = 2
) {
  if (isTestMode()) {
    console.log('Using test place (test mode enabled)');
    const config = await getConfig();
    return {
      location: config?.defaults?.default_location?.name,
      landmarks: config?.test_mode?.test_landmarks.slice(0, 1) || [],
      cache_type: 'test_mode',
    };
  }

  if (!getGoogleMapsApiKey()) {
    throw new Error('Google Maps API key is not configured');
  }

  // URL for the Text Search (New) API endpoint
  const apiUrl = 'https://places.googleapis.com/v1/places:searchText';

  // Headers including proper field mask
  let fieldmask =
    'places.displayName,places.location,places.primaryTypeDisplayName,places.formattedAddress';
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': getGoogleMapsApiKey(),
    'X-Goog-FieldMask': fieldmask,
  };

  // Create request body for Text Search (New)
  const requestBody = {
    textQuery: query,
    maxResultCount: maxResultCount,
  };

  // Add languageCode to request if provided
  if (langCode) {
    requestBody.languageCode = langCode;
  }

  try {
    // console.debug('Text Search Req:', requestBody);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('API Error Response:', text);
      throw new Error(`API status: ${response.status}`);
    }

    const data = await response.json();
    // console.debug('Text Search Resp:', data);

    // Check if we need to make a new request with a different language code
    if (
      !langCode &&
      data.places?.length > 0 &&
      data.places[0].formattedAddress
    ) {
      const place = data.places[0];
      const formattedAddress = place.formattedAddress;
      const addressParts = formattedAddress.split(', ');
      const currentLanguageCode = place.displayName?.languageCode || langCode;
      const country = addressParts[addressParts.length - 1];

      // Determine correct language code based on country
      let correctLanguageCode = getCountryLanguage(country);
      if (correctLanguageCode && currentLanguageCode !== correctLanguageCode) {
        console.debug(
          `Which country: ${country} > Search again in: ${correctLanguageCode}`
        );
        return PlaceTextSearch(query, correctLanguageCode);
      }
    }
    const place_data = placeData(data?.places);
    place_data.location = query;
    return place_data;
  } catch (error) {
    console.error('Error in text search:', error);
  }
}

/**
 * Search for nearby landmarks using the new Places API
 */
export async function PlaceNearbySearch(
  lat,
  lon,
  radius_km = 15,
  maxResultCount = 10,
  langCode = i18n.lang.preferLangCode
) {
  if (isTestMode()) {
    console.log('Using test places (test mode enabled)');
    const config = await getConfig();
    return {
      location: config?.defaults?.default_location?.name,
      coordinates: [lat, lon],
      landmarks: config?.test_mode?.test_landmarks || [],
      cache_type: 'test_mode',
    };
  }

  if (!getGoogleMapsApiKey()) {
    throw new Error('Google Maps API key is not configured');
  }

  // URL for the Nearby Search (New) API endpoint
  const apiUrl = 'https://places.googleapis.com/v1/places:searchNearby';

  // Headers including proper field mask
  let fieldmask =
    'places.displayName,places.location,places.primaryTypeDisplayName,places.formattedAddress';
  // fieldmask += ',places.id,places.googleMapsLinks.placeUri';  // Place Details Pro $
  // fieldmask += ',places.generativeSummary';  // AI-powered summaries - Place Details Enterprise $$

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': getGoogleMapsApiKey(),
    'X-Goog-FieldMask': fieldmask,
  };

  // Create request body for Nearby Search (New)
  const requestBody = {
    locationRestriction: {
      circle: {
        center: {
          latitude: lat,
          longitude: lon,
        },
        radius: radius_km * 1000,
      },
    },
    rankPreference: 'POPULARITY',
    includedTypes: [
      'historical_landmark',
      'tourist_attraction',
      'historical_place',
    ],
    excludedTypes: [
      'park',
      'store',
      'shopping_mall',
      'restaurant',
      'bar',
      'stadium',
    ],
    languageCode: langCode,
    maxResultCount: maxResultCount,
  };

  try {
    console.debug('Nearby Search Req:', requestBody);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('API Error Response:', text);
      throw new Error(`API status: ${response.status}`);
    }

    const data = await response.json();
    // console.debug('Nearby Search Resp:', data);
    const place_data = placeData(data?.places);
    place_data.cache_type = 'nearby_places';
    return place_data;
  } catch (error) {
    console.error('Error fetching landmarks:', error);
  }
}
