import { isTestMode } from './interfaces.js';

// Rate limiting variables
let lastRequestTime = 0;
const REQUEST_THROTTLE_MS = 100; // Min time between requests

/**
 * Get an image URL from Wikipedia for a landmark
 * @param {string} landmarkName - The name of the landmark
 * @returns {Promise<string>} - Promise that resolves to the image URL
 */
export async function getWikiImageURL(landmarkName) {
  try {
    if (!landmarkName) return '';
    if (isTestMode()) {
      console.debug(`Skipping Wiki for: ${landmarkName} (test mode enabled)`);
      return '';
    }
    // Encode the landmark name for the URL
    const encodedName = encodeURIComponent(landmarkName);

    // Check if we should throttle based on rate limits
    if (shouldThrottleRequest()) {
      console.debug('Throttling request...');
      await waitForThrottle();
    }

    // First, search for the Wikipedia page
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedName}&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    if (!searchData.query.search.length) {
      console.warn(`No Wiki page found for: ${landmarkName}`);
      return '';
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
      console.debug(`Found Wiki thumbnail for: ${landmarkName}`);
      return thumbPages[thumbPageId].thumbnail.source;
    }
    console.warn(`No good Wiki image for: ${landmarkName}`);
    return '';
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
  if (now - lastRequestTime < REQUEST_THROTTLE_MS) return true;
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
