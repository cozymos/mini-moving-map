import { getGeminiApiKey } from './interfaces.js';
import { GetPrompt, GetSystemMessage } from './prompt_utils.js';
import { i18n } from './lion.js';

// Configuration for the Gemini model
const MODEL_NAME = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

/**
 * Call Gemini API with Google Maps Grounding tool
 */
async function callGeminiWithMaps(
  prompt,
  systemInstruction,
  lat = null,
  lon = null
) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Gemini API key is not configured');

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    // Note: REST API uses 'google_maps', while JS SDK uses 'googleMaps'
    tools: [{ google_maps: {} }],
    generationConfig: {
      temperature: 0.4,
    },
  };

  // Add location context if available to improve grounding accuracy
  if (lat != null && lon != null) {
    payload.tool_config = {
      retrieval_config: {
        lat_lng: {
          latitude: lat,
          longitude: lon,
        },
      },
    };
  }

  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) throw new Error('No content in Gemini response');

  // The model may return JSON wrapped in markdown or with other text.
  // Extract the main JSON object from the response.
  const jsonMatch = content.match(/{[\s\S]*}/);
  if (!jsonMatch) {
    console.error('No JSON object found in Gemini response:', content);
    throw new Error('Invalid JSON response from Gemini');
  }

  try {
    // The model sometimes returns JSON with trailing commas, which is invalid.
    const cleanedJson = jsonMatch[0].replace(/,(?=\s*?[}\]])/g, '');
    return JSON.parse(cleanedJson);
  } catch (e) {
    console.error('Failed to parse Gemini JSON:', content, e);
    throw new Error('Invalid JSON response from Gemini');
  }
}

/**
 * Get landmarks using Gemini with Maps Grounding
 */
export async function getLandmarksWithGemini(
  locationData,
  lat,
  lon,
  radius_km = 15,
  locale = i18n.lang.preferLocale,
  promptPath = 'landmarks.discovery',
  extraVariables = {}
) {
  try {
    const prompt = GetPrompt(promptPath, {
      location_name: locationData.locationName,
      radius: radius_km,
      lat,
      lon,
      locale,
      ...extraVariables,
    });

    const systemMsg = GetSystemMessage('travel_agent');
    if (!prompt || !systemMsg) {
      throw new Error('Failed to load prompt templates');
    }

    console.info(
      `Asking Gemini (${MODEL_NAME}) to find landmarks in ${locationData.locationName}...`
    );
    const data = await callGeminiWithMaps(prompt, systemMsg, lat, lon);

    // Post-process to ensure we have valid coordinates
    const validLandmarks = (data.landmarks || []).filter(
      (l) => l.lat && l.lon && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180
    );

    return {
      location: locationData.locationName,
      coordinates: [lat, lon],
      landmarks: validLandmarks,
      cache_type: 'gemini_grounded',
    };
  } catch (error) {
    console.error('Gemini Landmark Search failed:', error);
    throw error;
  }
}

/**
 * Discover location coordinates from text using Gemini
 */
export async function queryLocationWithGemini(
  query,
  locale = i18n.lang.preferLocale,
  lat = null,
  lon = null
) {
  try {
    const prompt = GetPrompt('locations.discovery', {
      query,
      locale,
    });

    const systemMsg = GetSystemMessage('location_finder');
    console.info(`Asking Gemini to locate: "${query}"`);
    const data = await callGeminiWithMaps(prompt, systemMsg, lat, lon);
    // Handle case where Gemini might return an array or single object
    const result = Array.isArray(data) ? data[0] : data.landmarks?.[0] || data;

    if (!result || !result.lat) throw new Error('Location not found');

    return {
      location: query,
      landmarks: [result], // Standardize output format for the app
      cache_type: 'gemini_grounded',
    };
  } catch (error) {
    console.error('Gemini Location Query failed:', error);
    throw error;
  }
}
