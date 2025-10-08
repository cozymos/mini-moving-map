/* eslint-disable no-undef */
import {
  initSearch,
  searchLandmarks,
  getUserLocation,
  searchAirport,
  openInternetRadio,
} from './search.js';
import { initLandmark } from './landmark.js';
import {
  getConfig,
  parseMapParamsFromURL,
  setLoading,
  handleError,
  normalizeLng,
  validateCoords,
} from './utils.js';
import { mapInterface, getGoogleMapsApiKey } from './interfaces.js';
import { settingDialog } from './components.js';
import { initSimConnect, toggleAircraftTracking } from './simconnect.js';
import { i18n, initi18n, updateTranslation } from './lion.js';

const translationMap = {
  // mapping DOM selectors to translation keys
  '.loading-text': { property: 'textContent', strkey: 'app.loading_text' },
  '.caching-text': { property: 'textContent', strkey: 'app.caching_text' },
  'input#search-input': {
    property: 'placeholder',
    strkey: 'app.search_placeholder',
  },
};

// DOM Elements
const mapElement = document.getElementById('map');
const myLocationButton = document.getElementById('my-location');
const searchLandmarksButton = document.getElementById('search-landmarks');
const aircraftTrackingButton = document.getElementById('aircraft-tracking');
const settingsButton = document.getElementById('settings-button');
const localeButton = document.getElementById('locale-button');
const searchSideBar = document.getElementById('search-bar-container');
const landmarkSidebar = document.getElementById('landmarks-sidebar');
const moreWrapper = document.getElementById('more-wrapper');
const moreButton = document.getElementById('more-button');
const moreMenu = document.getElementById('more-menu');

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
    console.debug('URL params:', initialPosition);
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
    mapId: import.meta.env?.VITE_GOOGLE_MAP_ID || 'f61a40c10abb6e5a61bdfb74',

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
  mapInterface.setMapInterface({
    getMapCenter,
    mapPanTo,
  });
  initSearch();
  initLandmark();
  setupCustomControl();

  // Hide loading indicator
  setLoading(false);
}

/**
 * Adds a new option to More-menu dropdown.
 * @param {string} strkey - The translation key for this label.
 * @param {Function} handler - Function called when the option is clicked.
 */
export function addMoreOption(strkey, handler) {
  const item = document.createElement('div');
  item.className = 'dropdown-item';
  item.setAttribute('data-i18n-text', strkey);
  item.addEventListener('click', (ev) => {
    handler(ev);
    moreMenu.classList.remove('show'); // hide after selection
  });
  moreMenu.appendChild(item);
}

// when clicking elsewhere on the document
document.addEventListener('click', () => {
  moreMenu.classList.remove('show');
});

/**
 * Set up custom controls
 */
async function setupCustomControl() {
  // add each button into gmap DOM structure, attaching click listeners
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(myLocationButton);
  myLocationButton.addEventListener('click', async () => {
    await markUserLocation();
  });

  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(moreWrapper);
  moreButton.addEventListener('click', (ev) => {
    ev.stopPropagation(); // Prevent click bubbling
    moreMenu.classList.toggle('show');
  });

  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
    searchLandmarksButton
  );
  searchLandmarksButton.addEventListener('click', async () => {
    await searchLandmarks();
  });

  if (await initSimConnect(map)) {
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
      aircraftTrackingButton
    );
    aircraftTrackingButton.addEventListener('click', async () => {
      await toggleAircraftTracking();
    });
  }

  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(settingsButton);
  settingsButton.addEventListener('click', async () => {
    await settingDialog.show();
  });

  if (i18n.lang.secondLocale) {
    map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(localeButton);
    localeButton.addEventListener('click', async () => {
      if (i18n.userLocale === i18n.lang.preferLocale) {
        i18n.userLocale = i18n.lang.secondLocale;
        localeButton.textContent = '🌏';
      } else {
        i18n.userLocale = i18n.lang.preferLocale;
        localeButton.textContent = '🌎';
      }
      // await updateTranslation();
      await applyTranslations();
    });
  }
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
        title: i18n.t('tooltips.user_location_marker'),
        content: createUserLocationMarker(),
      });
    }
  } catch (error) {
    console.error(`Error with Geolocation: ${error.message}`);
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
  map.setZoom(zoom ? zoom : map.getZoom());
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

async function applyTranslations() {
  Object.entries(translationMap).forEach(([selector, { property, strkey }]) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (property in el || property === 'textContent') {
        el[property] = i18n.t(strkey);
      }
    });
  });

  document.querySelectorAll('[data-i18n-text]').forEach((el) => {
    const strkey = el.getAttribute('data-i18n-text');
    const str_value = i18n.t(strkey);
    el.textContent = str_value === strkey ? '' : str_value;
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const strkey = el.getAttribute('data-i18n-title');
    el.title = i18n.t(strkey); // Set title for tooltips
  });
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  await initi18n();
  await settingDialog.require();
  if (!getGoogleMapsApiKey()) {
    handleError('Google Maps API key is not configured');
    return;
  }

  // Load Google Maps API
  loadGoogleMapsAPI();

  addMoreOption('app.airport_menu', async () => {
    await searchAirport();
  });

  addMoreOption('app.radio_menu', async () => {
    await openInternetRadio();
  });

  // Skip auto-translation if no resource bundles are loaded
  if (Object.keys(i18n.translations).length > 0) {
    await updateTranslation();
    await applyTranslations();
  }
});
