import { getLocationName } from './gmap.js';
import { isTestMode, getPrompt, getConfig } from './utils.js';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// Rate limiting variables
let lastRequestTime = 0;
const REQUEST_THROTTLE_MS = 100; // Min time between requests

// Get landmarks near location using OpenAI API
export async function getLandmarksWithGPT(locationData, language = 'en') {
  try {
    if (isTestMode()) {
      const config = await getConfig();
      if (config) {
        return config.test_mode;
      }
    }

    // Check if we should throttle based on rate limits
    if (shouldThrottleRequest()) {
      console.log('Throttling request...');
      await waitForThrottle();
    }

    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    // Get the prompt for landmarks
    const prompt = await getPrompt('landmarks', {
      locationName: locationData.locationName,
      country: locationData.country,
      language,
    });

    console.log('Prompting:', prompt);

    // Call the OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using the preferred model
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error response:', errorText);

      try {
        const errorData = JSON.parse(errorText);
        throw new Error(
          `OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`
        );
      } catch (e) {
        throw new Error(
          `OpenAI API error: ${response.status} ${errorText.substring(0, 100)}`,
          e
        );
      }
    }

    const data = await response.json();
    console.log('OpenAI resp:', data);

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
      console.error('content:', content);
      throw new Error('Invalid JSON response from OpenAI');
    }

    console.log('Parsed data:', landmarks);

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
    landmarks.landmarks = landmarks.landmarks.map((landmark) => {
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
    console.error('Error finding landmarks:', error);
    throw error;
  }
}

/**
 * Get an image URL from Wikipedia for a landmark
 * @param {string} landmarkName - The name of the landmark
 * @returns {Promise<string>} - Promise that resolves to the image URL
 */
export async function getWikiImageURL(landmarkName) {
  try {
    // Encode the landmark name for the URL
    const encodedName = encodeURIComponent(landmarkName);

    // First, search for the Wikipedia page
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedName}&format=json&origin=*`;

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.query.search.length) {
      console.warn(`No Wiki page found for: ${landmarkName}`);
      return null;
    }

    // Get the title of the first search result
    const pageTitle = searchData.query.search[0].title;
    const encodedTitle = encodeURIComponent(pageTitle);

    // First try to get the thumbnail image
    const thumbnailUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodedTitle}&prop=pageimages&format=json&pithumbsize=500&origin=*`;

    const thumbnailResponse = await fetch(thumbnailUrl);
    const thumbnailData = await thumbnailResponse.json();

    // Extract page id for thumbnail
    const thumbPages = thumbnailData.query.pages;
    const thumbPageId = Object.keys(thumbPages)[0];

    // Check if we have a thumbnail and it's not an SVG
    if (
      thumbPages[thumbPageId].thumbnail &&
      thumbPages[thumbPageId].thumbnail.source &&
      !thumbPages[thumbPageId].thumbnail.source.endsWith('.svg')
    ) {
      return thumbPages[thumbPageId].thumbnail.source;
    }

    // If no thumbnail, then get images from that page
    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodedTitle}&prop=images&format=json&origin=*`;

    const imageResponse = await fetch(imageUrl);
    const imageData = await imageResponse.json();

    // Extract page id and images
    const pages = imageData.query.pages;
    const pageId = Object.keys(pages)[0];

    if (!pages[pageId].images || pages[pageId].images.length === 0) {
      console.warn(`No Wiki images found for: ${landmarkName}`);
      return null;
    }

    // Find a suitable image (avoiding SVG and icons)
    let possibleImages = [];

    // First, collect all potential good images
    for (const image of pages[pageId].images) {
      const name = image.title;
      if (
        !name.endsWith('.svg') &&
        !name.toLowerCase().includes('icon') &&
        !name.toLowerCase().includes('logo') &&
        !name.toLowerCase().includes('map') &&
        !name.toLowerCase().includes('disambig') &&
        !name.toLowerCase().includes('arrow') &&
        !name.toLowerCase().includes('symbol') &&
        !name.toLowerCase().includes('diagram')
      ) {
        possibleImages.push(name);
      }
    }

    // Try each image in our filtered list until we find a good one
    for (let i = 0; i < possibleImages.length; i++) {
      try {
        // Get details for this image
        const currentImage = possibleImages[i];
        const imageInfoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          currentImage
        )}&prop=imageinfo&iiprop=url|size&format=json&origin=*`;

        const infoResponse = await fetch(imageInfoUrl);
        const infoData = await infoResponse.json();

        const imagePages = infoData.query.pages;
        const imagePageId = Object.keys(imagePages)[0];

        if (
          imagePages[imagePageId].imageinfo &&
          imagePages[imagePageId].imageinfo.length > 0
        ) {
          const imageInfo = imagePages[imagePageId].imageinfo[0];

          // Additional checks to avoid icons/diagrams (often small or have certain aspect ratios)
          if (imageInfo.width && imageInfo.height) {
            // Skip very small images or ones with odd aspect ratios (likely diagrams/icons)
            if (imageInfo.width < 100 || imageInfo.height < 100) {
              continue;
            }

            // Skip perfect squares or very wide/narrow images (likely icons or diagrams)
            const aspectRatio = imageInfo.width / imageInfo.height;
            if (aspectRatio === 1 || aspectRatio > 3 || aspectRatio < 0.3) {
              continue;
            }
          }

          // This image passed all our checks
          return imageInfo.url;
        }
      } catch (error) {
        console.error(`Error checking image #${i + 1}:`, error);
        // Continue to next image
      }
    }

    // If all filtered images failed, try any image from the original list
    if (pages[pageId].images && pages[pageId].images.length > 0) {
      // Try up to 3 images from the original list
      for (let i = 0; i < Math.min(3, pages[pageId].images.length); i++) {
        try {
          const fallbackImage = pages[pageId].images[i].title;
          if (fallbackImage.endsWith('.svg')) continue; // Skip SVGs entirely

          const fallbackUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
            fallbackImage
          )}&prop=imageinfo&iiprop=url&format=json&origin=*`;
          const fallbackResponse = await fetch(fallbackUrl);
          const fallbackData = await fallbackResponse.json();

          const fbPages = fallbackData.query.pages;
          const fbPageId = Object.keys(fbPages)[0];

          if (
            fbPages[fbPageId].imageinfo &&
            fbPages[fbPageId].imageinfo.length > 0
          ) {
            return fbPages[fbPageId].imageinfo[0].url;
          }
        } catch (error) {
          console.error(`Error with fallback image #${i + 1}:`, error);
        }
      }
    }

    console.log(`No good Wiki image for: ${landmarkName}`);
    return null;
  } catch (error) {
    console.error(`Error fetching Wiki image for ${landmarkName}:`, error);
    return null;
  }
}

/**
 * Check if we should throttle our requests
 * @returns {boolean} True if we should wait, false if we can proceed
 */
function shouldThrottleRequest() {
  const now = Date.now();
  if (now - lastRequestTime < REQUEST_THROTTLE_MS) {
    return true;
  }
  lastRequestTime = now;
  return false;
}

/**
 * Wait for the throttle period
 * @returns {Promise} A promise that resolves after waiting
 */
function waitForThrottle() {
  return new Promise((resolve) => {
    setTimeout(() => {
      lastRequestTime = Date.now();
      resolve();
    }, REQUEST_THROTTLE_MS);
  });
}
