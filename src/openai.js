import { getConfig, distance_km } from './utils.js';
import { GetPrompt, GetSystemMessage } from './prompt_utils.js';
import { getLocationCoord } from './gmap.js';
import { isTestMode, getOpenaiApiKey } from './interfaces.js';

// Implement a hydrid '3-3-3' Multi-Source Aggregation Cache:
// 1. show [first 3] from 10x list {places_a}, which is popularity-based
// 2. prompt LLM to pick [top 3] from places_a
// 3. prompt LLM to generate [additional 3] outside of places_a
// 4. cache 6x LLM responses
export async function selectLandmarksWithGPT(
  locationData,
  placeList,
  lat,
  lon,
  radius_km = 15,
  locale = 'en'
) {
  // Check if OpenAI API key is available
  if (!getOpenaiApiKey()) {
    throw new Error('OpenAI API key is not configured');
  }

  if (!locationData || !Array.isArray(placeList) || placeList.length === 0) {
    throw new Error('No landmarks found (no input data)');
  }

  try {
    // convert list of places into a lookup table keyed by name
    const placeNames = Object.fromEntries(
      placeList.map((place) => [place.name, place])
    );

    // Get prompt from template
    const prompt = GetPrompt('landmarks.selector', {
      places_a: Object.keys(placeNames).join('\n'),
      locale,
    });

    // Get system message from template
    const systemMsg = GetSystemMessage('landmark_specialist');
    if (!prompt || !systemMsg) {
      throw new Error('Failed to load prompt templates');
    }

    const source = 'gpt-4.1-nano';
    console.info(
      `Selecting from ${placeList.length} places nearby ${locationData.locationName} by ${source} in ${locale}`
    );
    let landmarks_json = await callOpenAI(source, systemMsg, prompt);
    landmarks_json = landmarks_json?.landmarks;
    if (!Array.isArray(landmarks_json) || landmarks_json.length === 0) {
      throw new Error(
        `No landmarks found or invalid JSON response from ${source}`
      );
    }

    // Process the landmarks
    const landmarks = [];
    for (let i = 0; i < landmarks_json.length; i++) {
      const item = landmarks_json[i];
      if (typeof item !== 'object' || !item.name?.trim()) continue;

      const landmarkName = item.name.trim();
      let landmarkLat = item.lat ?? lat;
      let landmarkLon = item.lon ?? lon;

      const samePlace = placeNames[landmarkName];
      if (samePlace) {
        landmarkLat = samePlace.lat;
        landmarkLon = samePlace.lon;
      } else {
        const query = `${landmarkName}, ${locationData.country}`;
        const isValid = await checkLandmarkCoord(
          query,
          landmarkLat,
          landmarkLon,
          lat,
          lon,
          radius_km
        );
        if (!isValid) continue;
      }

      const landmark = {
        name: landmarkName,
        local: item.local || '',
        name2: item.name2 || '',
        desc: item.description || '',
        lat: parseFloat(landmarkLat),
        lon: parseFloat(landmarkLon),
        loc: item.location || locationData.locationName,
        type: samePlace?.type || item.type || source,
      };

      landmarks.push(landmark);
      console.debug(
        `Pick ${i}: ${landmarkName} . ${landmark.local} . ${landmark.name2}`
      );
    }

    return {
      location: locationData.locationName,
      coordinates: [lat, lon],
      landmarks: landmarks,
      cache_type: 'gpt_select',
    };
  } catch (error) {
    console.error('Error getting landmarks:', error);
    throw error;
  }
}

// Get landmarks near location using OpenAI API
export async function getLandmarksWithGPT(
  locationData,
  lat,
  lon,
  radius_km = 15,
  locale = 'en'
) {
  if (isTestMode()) {
    console.log('Using test landmarks (test mode enabled)');
    const config = await getConfig();
    return {
      location: config?.defaults?.default_location?.name,
      coordinates: [lat, lon],
      landmarks: config?.test_mode?.test_landmarks || [],
      cache_type: 'test_mode',
    };
  }

  if (!getOpenaiApiKey()) {
    throw new Error('OpenAI API key is not configured');
  }

  try {
    const prompt = GetPrompt('landmarks.discovery', {
      location_name: locationData.locationName,
      radius: radius_km,
      lat,
      lon,
      locale,
    });

    const systemMsg = GetSystemMessage('travel_agent');
    if (!prompt || !systemMsg) {
      throw new Error('Failed to load prompt templates');
    }

    const source = 'gpt-4o-mini';
    console.info(
      `Getting landmarks in ${locale} from ${source} near ${locationData.locationName} within ${radius_km}km`
    );
    let landmarks_json = await callOpenAI(source, systemMsg, prompt);
    landmarks_json = landmarks_json?.landmarks;
    if (!Array.isArray(landmarks_json) || landmarks_json.length === 0) {
      throw new Error(
        `No landmarks found or invalid JSON response from ${source}`
      );
    }

    // Process the landmarks
    const landmarks = [];
    for (let i = 0; i < landmarks_json.length; i++) {
      const item = landmarks_json[i];
      if (typeof item !== 'object' || !item.name?.trim()) continue;

      const landmarkName = item.name.trim();
      let landmarkLat = item.lat ?? lat;
      let landmarkLon = item.lon ?? lon;
      const query = `${landmarkName}, ${locationData.country}`;
      const isValid = await checkLandmarkCoord(
        query,
        landmarkLat,
        landmarkLon,
        lat,
        lon,
        radius_km
      );
      if (!isValid) continue;

      const landmark = {
        name: landmarkName,
        local: item.local || '',
        name2: item.name2 || '',
        desc: item.description || '',
        lat: parseFloat(landmarkLat),
        lon: parseFloat(landmarkLon),
        loc: item.location || locationData.locationName,
        type: item.type || source,
      };

      landmarks.push(landmark);
      console.debug(
        `Got ${i}: ${landmarkName}, ${landmark.loc} (${landmarkLat}, ${landmarkLon})`
      );
    }

    return {
      location: locationData.locationName,
      coordinates: [lat, lon],
      landmarks: landmarks,
      cache_type: 'with_gpt',
    };
  } catch (error) {
    console.error('Error getting landmarks:', error);
    throw error;
  }
}

// Discover the most relevant location name from a natural language query
export async function queryLocationWithGPT(query, locale) {
  if (isTestMode()) {
    console.log('Using test location (test mode enabled)');
    const config = await getConfig();
    return {
      location: query,
      landmarks: config?.defaults?.default_location,
    };
  }

  if (!getOpenaiApiKey()) {
    throw new Error('OpenAI API key is not configured');
  }

  try {
    const prompt = GetPrompt('locations.discovery', {
      query,
      locale,
    });

    const systemMsg = GetSystemMessage('location_finder');
    if (!prompt || !systemMsg) {
      throw new Error('Failed to load prompt templates');
    }

    // console.debug('Prompting:', prompt.slice(0, 100));
    let source = 'gpt-4.1-mini';
    const loc_data = await callOpenAI(source, systemMsg, prompt);
    return { location: query, landmarks: [loc_data] };
  } catch (error) {
    console.error('Error getting landmarks:', error);
    throw error;
  }
}

// Helper to call OpenAI with system message and prompt
async function callOpenAI(model, systemMsg, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getOpenaiApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error response:', errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  return JSON.parse(content);
}

// Try to verify coordinate accuracy by geocoding the landmark (to reduce hallucination)
async function checkLandmarkCoord(
  query,
  landmarkLat,
  landmarkLon,
  lat,
  lon,
  radius_km
) {
  try {
    const intLatMatch = Math.floor(landmarkLat) === Math.floor(lat);
    const intLonMatch = Math.floor(landmarkLon) === Math.floor(lon);
    const dist = distance_km(
      lat,
      lon,
      parseFloat(landmarkLat),
      parseFloat(landmarkLon)
    );

    // Check if rough distance check is already outside radius
    if (!intLatMatch && !intLonMatch && dist > radius_km) {
      const coords = await getLocationCoord(query);
      if (!coords) return false;

      console.debug(
        `Geocode ${query}: (${coords.lat}, ${coords.lon}) vs GPT (${landmarkLat}, ${landmarkLon})`
      );

      const intLatMatch2 = Math.floor(landmarkLat) === Math.floor(coords.lat);
      const intLonMatch2 = Math.floor(landmarkLon) === Math.floor(coords.lon);
      if (!intLatMatch2 && !intLonMatch2) return false;
    }
  } catch (e) {
    console.warn(`Error geocoding ${query}: ${e.message}`);
  }
  return true;
}
