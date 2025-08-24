/* eslint-disable no-undef */
import { initSearch, searchLandmarks, getUserLocation } from './search.js';
import { initLandmark } from './landmark.js';
import {
  getConfig,
  parseMapParamsFromURL,
  setLoading,
  handleError,
  normalizeLng,
  validateCoords,
} from './utils.js';
import {
  mapInterface,
  getGoogleMapsApiKey,
} from './interfaces.js';
import { settingDialog } from './components.js';

// DOM Elements
const mapElement = document.getElementById('map');
const myLocationButton = document.getElementById('my-location');
const searchLandmarksButton = document.getElementById('search-landmarks');
const settingsButton = document.getElementById('settings-button');
const searchSideBar = document.getElementById('search-bar-container');
const landmarkSidebar = document.getElementById('landmarks-sidebar');

// Default coordinates (San Francisco)
let defaultLocation = { lat: 37.7749, lng: -122.4194 };
let defaultZoom = 12;

// Map instance
let map;

// Map initialization function - called by Google Maps API once loaded
async function initMap() {
  const { ColorScheme } = await google.maps.importLibrary('core');

  // Import 3D map library for photorealistic rendering
  try {
    await google.maps.importLibrary('maps3d');
  } catch (error) {
    console.warn('3D Maps library failed to load:', error);
  }

  // Check if URL has coordinates and zoom parameters
  let initialPosition;
  const urlParams = parseMapParamsFromURL();
  if (urlParams) {
    initialPosition = {
      center: urlParams.center,
      zoom: urlParams.zoom !== null ? urlParams.zoom : defaultZoom,
    };
    console.log('URL params:', initialPosition);
  } else {
    const config = await getConfig();
    if (config?.defaults?.default_location) {
      defaultLocation = {
        lat: config.defaults.default_location.lat,
        lng: config.defaults.default_location.lon,
      };
      if (config?.defaults?.zoom_level)
        defaultZoom = config.defaults.zoom_level;
    }

    initialPosition = {
      center: defaultLocation,
      zoom: defaultZoom,
    };
  }

  // Create the map instance with standard 2D view (3D will be in overlays only)
  const mapConfig = {
    center: initialPosition.center,
    zoom: initialPosition.zoom !== null ? initialPosition.zoom : defaultZoom,
    colorScheme: ColorScheme.FOLLOW_SYSTEM,

    // Adding map ID for advanced markers
    mapId: window.APP_CONFIG?.GOOGLE_MAP_ID,

    // UI controls optimized for 3D viewing
    fullscreenControl: true,
    fullscreenControlOptions: {
      position: google.maps.ControlPosition.LEFT_BOTTOM,
    },
    // zoomControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
    },
    cameraControl: true, // Enable camera controls for 3D navigation
    streetViewControl: true,
    scaleControl: true,
    rotateControl: true, // Essential for 3D map rotation
  };

  map = new google.maps.Map(mapElement, mapConfig);
  /*
  console.debug('Creating 3D map with config:', {
    mapId: mapConfig.mapId,
    tilt: mapConfig.tilt,
    zoom: mapConfig.zoom,
    cameraControl: mapConfig.cameraControl,
  });

  console.debug('Standard 2D map initialized:', {
    zoom: map.getZoom(),
    mapId: mapConfig.mapId,
  });
  */

  let panorama = map.getStreetView();
  // Add listener for Street View visibility changes
  panorama.addListener('visible_changed', function () {
    if (panorama.getVisible()) {
      searchSideBar.classList.add('hidden');
      landmarkSidebar.classList.add('hidden');
    } else {
      searchSideBar.classList.remove('hidden');
    }
  });

  // Make map instance globally available for other scripts
  window.mapInstance = map;

  setupCustomControl();
  mapInterface.setMapInterface({
    getMapCenter,
    mapPanTo,
  });
  initSearch();
  initLandmark();

  // Hide loading indicator
  setLoading(false);
}

/**
 * Set up custom controls
 */
function setupCustomControl() {
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(myLocationButton);
  myLocationButton.addEventListener('click', async () => {
    await markUserLocation();
  });

  // Add click event to search landmarks button
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
    searchLandmarksButton
  );
  searchLandmarksButton.addEventListener('click', async () => {
    await searchLandmarks();
  });

  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(settingsButton);
  settingsButton.addEventListener('click', async () => {
    await settingDialog.show();
  });
}

/**
 * Create a custom element for user location marker
 * @returns {HTMLElement} The user location marker element
 */
function createUserLocationMarker() {
  const element = document.createElement('div');
  element.className = 'marker-element';
  element.style.backgroundColor = '#F66A5B';
  return element;
}

async function markUserLocation() {
  try {
    const targetLocation = await getUserLocation();
    if (targetLocation) {
      const { AdvancedMarkerElement } = await google.maps.importLibrary(
        'marker'
      );
      new AdvancedMarkerElement({
        position: targetLocation,
        map: map,
        title: 'Your Location',
        content: createUserLocationMarker(),
      });
    }
  } catch (error) {
    handleError(`Error with location: ${error.message}`);
  }
}

export function getMapCenter(map) {
  const center = map.getCenter();
  return {
    lat: center.lat(),
    lng: normalizeLng(center.lng()),
  };
}

export function mapPanTo(lat, lng, zoom = defaultZoom) {
  if (!validateCoords(lat, lng)) {
    console.error('Invalid coordinates to mapPanTo:', { lat, lng });
    return;
  }

  map.panTo({ lat: lat, lng: lng });
  map.setZoom(zoom);
}

// Load Google Maps API dynamically
function loadGoogleMapsAPI() {
  // Create script element
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${getGoogleMapsApiKey()}&callback=initMap&loading=async&libraries=places,geometry,marker,maps3d&v=beta`;

  // Make initMap available globally for the callback
  window.initMap = initMap;

  // Add the script to the document
  document.head.appendChild(script);

  // When user clicks back or forward button
  window.onpopstate = () => {
    const urlParams = parseMapParamsFromURL();
    if (urlParams) {
      mapPanTo(urlParams.center.lat, urlParams.center.lng, urlParams.zoom);
    }
  };
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  await settingDialog.require();
  if (!getGoogleMapsApiKey()) {
    console.error('Google Maps API key not found.');
    return;
  }

  // Load Google Maps API
  loadGoogleMapsAPI();
});
