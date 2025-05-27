import { getLanguageCodeForCountry } from './utils.js';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * Get country information for the specified coordinates using Geocoding API
 * @param {number} latitude - The latitude
 * @param {number} longitude - The longitude
 * @returns {Promise<Object>} - Promise that resolves to the country information
 */
export async function getCountryFromCoordinates(latitude, longitude) {
  try {
    // Construct the Geocoding API URL
    const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}&result_type=country`;

    // Make the request
    const response = await fetch(geocodingUrl);

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn('No country found in geocoding results:', data);
      return null;
    }

    // Extract the country information from the first result
    const country = {
      name: null,
      code: null,
    };

    // Get country name from formatted address
    country.name = data.results[0].formatted_address;

    // Extract country code from address components
    const addressComponents = data.results[0].address_components;
    for (const component of addressComponents) {
      if (component.types.includes('country')) {
        country.code = component.short_name;
        if (!country.name) {
          country.name = component.long_name;
        }
        break;
      }
    }

    console.log(`Geocoding found country: ${country.name} (${country.code})`);
    return country;
  } catch (error) {
    console.error('Error getting country from coordinates:', error);
    return null;
  }
}

// Get location name from coordinates using Google Geocoding API
export async function getLocationName(latitude, longitude) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch location name');
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      throw new Error('No location data found');
    }

    // Find the most appropriate result (locality or neighborhood)
    let locationName = '';
    let country = '';

    // Try to find a locality or administrative area
    for (const result of data.results) {
      const types = result.types || [];
      if (types.includes('locality') || types.includes('political')) {
        locationName = result.formatted_address.split(',')[0].trim();
      }

      // Extract country from address components
      const addressComponents = result.address_components || [];
      for (const component of addressComponents) {
        const componentTypes = component.types || [];
        if (componentTypes.includes('country')) {
          country = component.long_name;
          break;
        }
      }

      if (locationName && country) break;
    }

    // If no specific locality found, use the first result
    if (!locationName && data.results[0]) {
      locationName = data.results[0].formatted_address.split(',')[0].trim();
    }

    // Default country if not found
    if (!country) {
      country = 'Unknown';
    }

    return { locationName, country };
  } catch (error) {
    console.error('Error getting location name:', error);
    throw error;
  }
}

/**
 * Search for locations and landmarks using Text Search (New) API
 * @param {string} query - The search query text
 * @param {string} languageCode - Optional language code for the API request
 */
export async function PlaceTextSearch(query, languageCode = null) {
  // URL for the Text Search (New) API endpoint
  const apiUrl = 'https://places.googleapis.com/v1/places:searchText';
  const maxResultCount = 3;

  // Create request body for Text Search (New)
  const requestBody = {
    textQuery: query,
    maxResultCount: maxResultCount,
  };

  // Add languageCode to request if provided
  if (languageCode) {
    requestBody.languageCode = languageCode;
  }

  // Headers including field mask for AI-powered summaries and photos
  let fieldmask =
    'places.id,places.displayName,places.location,places.generativeSummary';
  fieldmask += ',places.googleMapsLinks.placeUri,places.formattedAddress';
  if (maxResultCount > 1) {
    fieldmask += ',places.types,places.primaryType';
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
    'X-Goog-FieldMask': fieldmask,
  };

  console.log('API Req:', JSON.stringify(requestBody));

  try {
    // Make the API request using fetch
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('API Error Status:', response.status);
      console.error(
        'API Error Headers:',
        JSON.stringify([...response.headers.entries()])
      );
      const text = await response.text();
      console.error('API Error Response:', text);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Text Search Resp:', data);

    // Check if we need to make a new request with a different language code
    if (
      data.places &&
      data.places.length > 0 &&
      data.places[0].formattedAddress
    ) {
      const place = data.places[0];
      const formattedAddress = place.formattedAddress;
      // Extract country from the formatted address - usually the last part
      const addressParts = formattedAddress.split(', ');
      const currentLanguageCode = place.displayName?.languageCode || 'en';
      const country = {
        name: addressParts[addressParts.length - 1],
        code: currentLanguageCode,
      };
      console.log('Which country:', country);

      // Determine correct language code based on country
      let correctLanguageCode = getLanguageCodeForCountry(country);

      // If language code doesn't match and we have a correction, make another API call
      if (
        correctLanguageCode &&
        currentLanguageCode !== correctLanguageCode &&
        !languageCode
      ) {
        console.log(`Search again with lang code: ${correctLanguageCode}`);

        // Make a new request with the correct language code
        return PlaceTextSearch(query, correctLanguageCode);
      }
    }
    return data.places;
  } catch (error) {
    console.error('Error in text search:', error);
  }
}

/**
 * Search for nearby landmarks based on current map center and zoom level
 * Using the new Places API with AI-powered summaries
 */
export async function PlaceNearbySearch(position, radius) {
  // Get country information for the current location
  let languageCode = null;
  try {
    const country = await getCountryFromCoordinates(position.lat, position.lng);
    if (country) {
      languageCode = getLanguageCodeForCountry(country);
      if (languageCode) {
        console.log(`Which lang code: ${country.name} > ${languageCode}`);
      }
    }
  } catch (error) {
    console.error('Error determining country:', error);
    // Continue without country-specific language code
  }

  // URL for the Nearby Search (New) API endpoint
  const apiUrl = 'https://places.googleapis.com/v1/places:searchNearby';
  const maxResultCount = 19;

  // Create request body for Nearby Search (New)
  const requestBody = {
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
    maxResultCount: maxResultCount,
    locationRestriction: {
      circle: {
        center: {
          latitude: position.lat,
          longitude: position.lng,
        },
        radius: radius,
      },
    },
    rankPreference: 'POPULARITY',
  };

  // Add language code if available
  if (languageCode) {
    requestBody.languageCode = languageCode;
  }

  // Headers including proper field mask for AI-powered summaries
  let fieldmask =
    'places.id,places.displayName,places.location,places.generativeSummary';
  if (maxResultCount > 5) {
    fieldmask += ',places.types,places.primaryType';
  } else {
    fieldmask += ',places.googleMapsLinks.placeUri,places.primaryType';
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
    'X-Goog-FieldMask': fieldmask,
  };

  console.log('API Req:', JSON.stringify(requestBody));

  try {
    // Make the API request using fetch
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('API Error Status:', response.status);
      console.error(
        'API Error Headers:',
        JSON.stringify([...response.headers.entries()])
      );
      const text = await response.text();
      console.error('API Error Response:', text);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Nearby Search Resp:', data);
    return data.places;
  } catch (error) {
    console.error('Error fetching landmarks:', error);
  }
}
