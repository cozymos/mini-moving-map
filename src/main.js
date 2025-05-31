/* eslint-disable no-undef */
import { initAuth, isAuthEnabled } from './auth.js';
import { initSearch } from './search.js';

// DOM Elements
const mapElement = document.getElementById('map');
const myLocationButton = document.getElementById('my-location');
const searchSideBar = document.getElementById('search-bar-container');
const landmarkSidebar = document.getElementById('landmarks-sidebar');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error-message');

// Get the Google Maps API key from environment variables
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Default coordinates (San Francisco)
const defaultLocation = { lat: 37.7749, lng: -122.4194 };
const default_zoom = 12;

// Map instance
let map;

// Authentication state
let auth = {
  isAuthenticated: false,
  user: null,
};

// Map initialization function - called by Google Maps API once loaded
async function initMap() {
  const { ColorScheme } = await google.maps.importLibrary('core');

  // Create the map instance with a modern and clean style
  map = new google.maps.Map(mapElement, {
    center: defaultLocation,
    zoom: default_zoom,
    colorScheme: ColorScheme.FOLLOW_SYSTEM,
    // default mapTypeId: google.maps.MapTypeId.ROADMAP,

    // UI controls
    fullscreenControl: true,
    fullscreenControlOptions: {
      position: google.maps.ControlPosition.LEFT_BOTTOM,
    },
    zoomControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
      // default mapTypeIds: ["roadmap", "terrain", "satellite", "hybrid"],
    },
    cameraControl: false,
    streetViewControl: true,
    scaleControl: true,
    rotateControl: true,

    mapId: 'f61a40c10abb6e5a61bdfb74', // Adding a map ID for Advanced Markers
  });

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

  // Set up custom controls
  setupLocationControl();
  initSearch();

  // Hide loading indicator
  setLoading(false);
}

/**
 * Set up the location control to center the map on the user's location
 */
function setupLocationControl() {
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(myLocationButton);
  myLocationButton.addEventListener('click', () => {
    getUserLocation();
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

/**
 * Get the user's current location and toggle between user location and default center
 */
async function getUserLocation() {
  try {
    setLoading(true);

    // Step 1: Compute if at default center
    const currentCenter = map.getCenter();
    const isAtDefaultCenter =
      Math.abs(currentCenter.lat() - defaultLocation.lat) < 0.0001 &&
      Math.abs(currentCenter.lng() - defaultLocation.lng) < 0.0001;

    // Step 2: Get user location
    const userLocation = await getCurrentPosition();

    // Step 3: Check toggle condition and determine target
    let targetLocation;
    let shouldShowMarker = false;

    if (isAtDefaultCenter) {
      // At default center → go to user location and show marker
      targetLocation = userLocation;
      shouldShowMarker = true;
    } else {
      // Check if at user location
      const isAtUserLocation =
        Math.abs(currentCenter.lat() - userLocation.lat) < 0.0001 &&
        Math.abs(currentCenter.lng() - userLocation.lng) < 0.0001;

      if (isAtUserLocation) {
        // At user location → go to default center
        targetLocation = defaultLocation;
      } else {
        // At neither location → go to user location and show marker
        targetLocation = userLocation;
        shouldShowMarker = true;
      }
    }

    // Step 4: Pan to coordinate and show marker if needed
    map.panTo(targetLocation);
    map.setZoom(default_zoom);

    if (shouldShowMarker) {
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

    setLoading(false);
  } catch (error) {
    setLoading(false);
    handleError(`Error with location: ${error.message}`);
  }
}

/**
 * Promisified getCurrentPosition wrapper
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Set the loading state
 */
export function setLoading(isLoading) {
  if (isLoading) {
    loadingElement.classList.remove('hidden');
  } else {
    loadingElement.classList.add('hidden');
  }
}

/**
 * Show an error message
 */
function showError(message) {
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');

  // Hide after 5 seconds
  setTimeout(() => {
    hideError();
  }, 5000);
}

/**
 * Hide the error message
 */
function hideError() {
  errorElement.classList.add('hidden');
}

/**
 * Handle errors
 * @param {string} error - The error message
 */
export function handleError(error) {
  console.error(error);
  setLoading(false);
  showError(error);
}

// Load Google Maps API dynamically
function loadGoogleMapsAPI() {
  // Create script element
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMap&loading=async`;

  // Make initMap available globally for the callback
  window.initMap = initMap;

  // Add the script to the document
  document.head.appendChild(script);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log(`${import.meta.env.MODE} mode: Google Maps loading...`);

  if (!GOOGLE_MAPS_API_KEY) {
    console.error('Google Maps API key not found.');
    return;
  }

  // Initialize auth if needed
  if (isAuthEnabled()) {
    try {
      auth = await initAuth();
      console.log(
        'Auth status:',
        auth.isAuthenticated ? 'Authenticated' : 'Not authenticated'
      );
    } catch (error) {
      console.error('Auth initialization error:', error);
    }
  } else {
    console.log('Auth is disabled for local dev');
    auth.isAuthenticated = true; // Auto-authenticated in local development
  }

  // Load Google Maps API
  loadGoogleMapsAPI();
});
