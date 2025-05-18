import { getPrompt } from './utils.js';

// Get the API keys from environment variables
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

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
      country = "Unknown";
    }
    
    return { locationName, country };
  } catch (error) {
    console.error('Error getting location name:', error);
    throw error;
  }
}

// Get landmarks near location using OpenAI API
export async function getLandmarksWithGPT(locationData, language = 'en') {
  try {
    console.log('OpenAI API Key available:', !!OPENAI_API_KEY);
    
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }
    
    console.log('Getting prompt with location data:', locationData);
    
    // Get the prompt for landmarks
    const prompt = await getPrompt('landmarks', {
      locationName: locationData.locationName,
      country: locationData.country,
      language
    });
    
    console.log('Using prompts:', prompt);
    
    // Call the OpenAI API
    console.log('Calling OpenAI API...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using the preferred model
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        response_format: { type: 'json_object' }
      })
    });
    
    console.log('OpenAI API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error response:', errorText);
      
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`);
      } catch (e) {
        throw new Error(`OpenAI API error: ${response.status} ${errorText.substring(0, 100)}`);
      }
    }
    
    const data = await response.json();
    console.log('OpenAI API response data:', data);
    
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    
    // Parse the JSON response
    let landmarks;
    try {
      landmarks = JSON.parse(content);
    } catch (e) {
      console.error('Error parsing JSON response:', e);
      console.log('Raw content:', content);
      throw new Error('Invalid JSON response from OpenAI');
    }
    
    console.log('Parsed landmarks data:', landmarks);
    
    // Check if landmarks has the expected structure
    if (!landmarks.landmarks || !Array.isArray(landmarks.landmarks)) {
      // If not, try to create a compatible structure
      if (Array.isArray(landmarks)) {
        landmarks = { landmarks: landmarks };
      } else {
        // Create a default structure with empty landmarks
        landmarks = { landmarks: [] };
      }
    }
    
    // Ensure we're using 'lon' consistently (API might return 'lng' in some cases)
    landmarks.landmarks = landmarks.landmarks.map(landmark => {
      // If latitude/longitude not provided, generate random coordinates near the center
      if (landmark.lat === undefined) {
        landmark.lat = parseFloat((Math.random() * 0.01 - 0.005).toFixed(6));
      }
      
      if (landmark.lon === undefined && landmark.lng !== undefined) {
        landmark.lon = landmark.lng;
        delete landmark.lng;
      } else if (landmark.lon === undefined) {
        landmark.lon = parseFloat((Math.random() * 0.01 - 0.005).toFixed(6));
      }
      
      return landmark;
    });
    
    return landmarks;
  } catch (error) {
    console.error('Error getting landmarks:', error);
    throw error;
  }
}

// Function to get landmark data given map center coordinates
export async function getLandmarkData(lat, lng, language = 'en') {
  try {
    // Get location name from coordinates
    const locationData = await getLocationName(lat, lng);
    
    // Get landmarks using OpenAI
    const landmarksData = await getLandmarksWithGPT(locationData, language);
    
    return landmarksData;
  } catch (error) {
    console.error("Error finding landmarks:", error);
    throw error;
  }
}