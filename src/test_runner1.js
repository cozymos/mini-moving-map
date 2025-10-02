/**
 * Standalone test script, running direct function testing to verify core
 * functionalities independently and sequentially as minimal regression.
 * • Built-in test mode with mock data from config.json
 * • Online mode returns live API calls from external services
 * • Runnable in both browser console and Node.js CLI
 *
 * Browser usage:
 *   import('./src/test_runner.js').then(m => m.testRunner());
 *
 * Node.js CLI usage:
 *   node src/test_runner.js [--test-mode (default) |--online]
 */

// Environment detection
const isBrowser = typeof window !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Mock functions for Node.js environment
if (isNode) {
  global.window = {
    location: { hostname: 'localhost', search: '?test=true' },
    TEST_MODE: true,
    APP_CONFIG: {},
  };
  const store = {};
  window.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      for (const k in store) delete store[k];
    },
  };
  global.localStorage = window.localStorage;
  global.document = {
    querySelector: () => null,
    getElementById: () => null,
    readyState: 'complete',
    addEventListener: () => {},
  };
}

// Simple logging
const log = (...args) => console.log(...args);
function error(message) {
  console.error(`❌ ${message}`);
}

// Configuration loading
async function loadConfig() {
  let config = null;
  try {
    if (isBrowser) {
      // Browser environment - call getConfig
      const { getConfig } = await import('./utils.js');
      config = await getConfig();
    } else if (isNode) {
      // Node.js environment
      window.APP_CONFIG.GOOGLE_MAPS_API_KEY =
        process.env.GOOGLE_MAPS_API_KEY || null;
      window.APP_CONFIG.OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
      config = {
        defaults: {
          default_location: {
            name: 'San Francisco',
            country: 'United States',
            country_code: 'US',
            lat: 37.7749,
            lon: -122.4194,
          },
          search_radius: 15,
        },
        test_mode: {
          test_landmarks: [
            {
              name: 'Golden Gate Bridge',
              lat: 37.8199,
              lon: -122.4783,
              loc: 'San Francisco',
            },
          ],
        },
      };
    }
    return config;
  } catch (error) {
    log(`⚠️ Failed to load configuration: ${error.message}`);
    return null;
  }
}

import { testI18n } from './lion.js';

async function runAllTests() {
  log('✅ I18n passed', testI18n());
  log('Testing getConfig()');
  const config = await loadConfig();
  if (
    !config?.defaults ||
    !config?.test_mode ||
    !config?.test_mode?.test_landmarks ||
    !config.test_mode.test_landmarks?.length
  ) {
    error('getConfig returned invalid config');
    return false;
  }
  log('✅ getConfig passed', { hasDefaults: !!config.defaults });

  // Check default location
  const default_location = config?.defaults?.default_location;
  const default_lat = default_location.lat;
  const default_lon = default_location.lon;
  log(`🌍 Default location: (${default_lat}, ${default_lon})`);
  const default_radius = config?.defaults?.search_radius;

  log('Testing getLocationDetails()');
  const { getLocationDetails } = await import('./gmap.js');
  const locationData = await getLocationDetails(default_lat, default_lon);
  if (
    !locationData?.locationName ||
    locationData.locationName.toLowerCase().includes('unknown')
  ) {
    error('getLocationDetails returned invalid data');
    return false;
  }
  log('✅ getLocationDetails passed', locationData.locationName);

  log('Testing getLocationCoord()');
  const { getLocationCoord } = await import('./gmap.js');
  const coords = await getLocationCoord(default_location.name);
  if (!coords) {
    error('getLocationCoord returned invalid data');
    return false;
  }
  log('✅ getLocationCoord passed', coords.lat, coords.lon);

  log('Testing getLandmarksWithGPT()');
  const { getLandmarksWithGPT } = await import('./openai.js');
  const landmarkData = await getLandmarksWithGPT(
    locationData,
    default_lat,
    default_lon
  );
  if (
    !landmarkData ||
    !landmarkData.landmarks ||
    !Array.isArray(landmarkData.landmarks)
  ) {
    error('getLandmarksWithGPT returned invalid landmarks');
    return false;
  }
  log('✅ getLandmarksWithGPT passed', {
    count: landmarkData.landmarks.length,
  });

  log('Testing setCachedLandmarks()');
  const { setCachedLandmarks } = await import('./cache.js');
  setCachedLandmarks(default_lat, default_lon, default_radius, landmarkData);
  log('✅ setCachedLandmarks passed');

  log('Testing getCachedLandmarks()');
  const { getCachedLandmarks } = await import('./cache.js');
  const cachedData = getCachedLandmarks(
    default_lat,
    default_lon,
    default_radius
  );
  if (!cachedData || !cachedData.landmarks) {
    error('getCachedLandmarks failed to retrieve data');
    return false;
  }
  log('✅ getCachedLandmarks passed', {
    count: cachedData.landmarks.length,
  });

  log('Testing get_landmark_data()');
  const { landmarkService } = await import('./backend.js');
  const backendData = await landmarkService.get_landmark_data(
    default_lat,
    default_lon
  );
  if (!backendData || !backendData.landmarks) {
    error('get_landmark_data returned invalid data');
    return false;
  }
  log('✅ get_landmark_data passed', { count: backendData.landmarks.length });

  log('Testing getWikiImageURL()');
  const { getWikiImageURL } = await import('./services.js');
  const imageUrl = await getWikiImageURL(
    config?.test_mode?.test_landmarks[0].name
  );
  if (typeof imageUrl !== 'string') {
    error('getWikiImageURL returned invalid type');
    return false;
  }
  log('✅ getWikiImageURL passed', { hasUrl: imageUrl.length > 0 });

  log('Testing PlaceTextSearch()');
  const { PlaceTextSearch } = await import('./gmap.js');
  const searchResult = await PlaceTextSearch(default_location.name);
  if (!searchResult || !searchResult.landmarks) {
    error('PlaceTextSearch returned invalid data');
    return false;
  }
  log('✅ PlaceTextSearch passed', { count: searchResult.landmarks.length });

  log('Testing queryLocationWithGPT()');
  const { queryLocationWithGPT } = await import('./openai.js');
  const queryResult = await queryLocationWithGPT(default_location.name);
  if (!queryResult) {
    error('queryLocationWithGPT returned invalid data');
    return false;
  }
  log('✅ queryLocationWithGPT passed', { count: queryResult.landmarks });

  return true;
}

async function testRunner() {
  const { isTestMode } = await import('./interfaces.js');
  console.log(
    `🧪 Run test enabled - ${
      isTestMode() ? 'test mode (mock data)' : 'online (live API)'
    } on ${isBrowser ? 'Browser' : 'Node'}`
  );

  const success = await runAllTests();
  if (success) console.log('✅ PASS: All tests completed successfully');
  else console.error('❌ FAIL: Some tests failed! Check the logs for details');
}

// CLI argument parsing for Node.js
async function parseArgs() {
  if (!isNode) return;
  const { enableTestMode } = await import('./interfaces.js');
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg === '--online') {
      enableTestMode(false);
    } else if (arg === '--test-mode') {
      enableTestMode(true);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Standalone test script for minimal regression:
Usage: node src/test_runner.js [options]

Options:
  --test-mode Run in test mode with mock data (default)
  --online    Run in online mode with live API calls
  --help, -h  Show this help message
      `);
      process.exit(0);
    }
  }
}

async function parseURLParams() {
  if (!isBrowser) return;
  const { enableTestMode } = await import('./interfaces.js');
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('test')) {
    const param = urlParams.get('test');
    if (param === 'false' || param === '0') {
      console.log('Run test disabled - skipping client-side tests');
      return;
    }

    if (!urlParams.has('online')) enableTestMode(true);
    await testRunner();
    enableTestMode(false);
  }
}

export async function main() {
  if (isBrowser) {
    await parseURLParams();
  } else if (isNode) {
    function getFilename(filePathOrUrl) {
      const parts = filePathOrUrl.split(/[/\\]/);
      return parts[parts.length - 1];
    }

    const scriptFilename = getFilename(process.argv[1]);
    const metaFilename = getFilename(import.meta.url);
    // Node.js equivalent of if __name__ == "__main__":
    if (scriptFilename === metaFilename) {
      await parseArgs();
      await testRunner();
    }
  }
}

// Auto-run tests
main();
