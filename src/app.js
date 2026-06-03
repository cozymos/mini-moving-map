/* eslint-disable no-undef */
import {
  initSearch,
  searchLandmarks,
  showUserLocation,
  searchAirport,
  openInternetRadio,
} from './search.js';
import {
  initLandmark,
  create3DMapOverlay,
  registerSimConnectFns,
} from './landmark.js';
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
import {
  initSimConnect,
  toggleAircraftTracking,
  getLastKnownPosition,
  fetchAircraftData,
} from './simconnect.js';
import { i18n, initi18n, updateTranslation, getGlobeEmoji } from './lion.js';

const translationMap = {
  // a few manual mapping DOM selectors to translation keys
  '.loading-text': { property: 'textContent', strkey: 'app.loading_text' },
  '.caching-text': { property: 'textContent', strkey: 'app.finding_text' },
  'input#search-input': {
    property: 'placeholder',
    strkey: 'app.search_placeholder',
  },
};

// DOM Elements
const searchLandmarksButton = document.getElementById('search-landmarks');
const aircraftTrackingButton = document.getElementById('aircraft-tracking');
const settingsButton = document.getElementById('settings-button');
const localeButton = document.getElementById('locale-button');
const searchSideBar = document.getElementById('search-sidebar');
const infoSidebar = document.getElementById('info-sidebar');
const infoTitleContent = document.getElementById('info-title-content');
const infoContent = document.getElementById('info-content');
const infoCloseButton = document.getElementById('info-close-button');
const moreWrapper = document.getElementById('more-wrapper');
const moreButton = document.getElementById('more-button');
const moreMenu = document.getElementById('more-menu');

// Default coordinates (San Francisco)
let defaultLocation = { lat: 37.7749, lng: -122.4194 };
let defaultZoom = 12;

// Map instance
let map;
let initialPosition;

const myMapId =
  import.meta.env?.VITE_GOOGLE_MAP_ID || 'f61a40c10abb6e5a61bdfb74';

/**
 * Main entry point called by Google Maps JS API callback
 */
async function initMap() {
  try {
    // 1. Explicitly import required libraries first to ensure 'google' is fully populated
    await Promise.all([
      google.maps.importLibrary('maps'),
      google.maps.importLibrary('core'),
      google.maps.importLibrary('marker'),
    ]);

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

    await loadMap();

    // Mark the initial state to prevent back button from exiting the app
    const currentState = window.history.state || {};
    if (!currentState.appStart) {
      window.history.replaceState({ ...currentState, appStart: true }, '');
    }

    // When user clicks back or forward button
    window.onpopstate = () => {
      if (!map) return;
      const panorama = map.getStreetView();
      if (panorama && panorama.getVisible()) {
        panorama.setVisible(false);
      }
      const urlParams = parseMapParamsFromURL();
      if (urlParams) {
        mapPanTo(urlParams.center.lat, urlParams.center.lng, urlParams.zoom);
      }
    };
  } catch (error) {
    console.error('Failed to initialize map:', error);
    handleError(i18n.t('errors.map_init_failed'));
  } finally {
    setLoading(false);
  }
}

async function loadMap() {
  const { Map } = await google.maps.importLibrary('maps');
  const { ColorScheme } = await google.maps.importLibrary('core');

  let currentCenter = initialPosition.center;
  let currentZoom = initialPosition.zoom;
  if (map) {
    // Preserve the current map view before clearing it
    currentCenter = map.getCenter();
    currentZoom = map.getZoom();
    // Clear the old control to prevent duplicates
    map = null;
    const oldDiv = document.getElementById('map');
    oldDiv.innerHTML = '';
  }

  const mapConfig = {
    center: currentCenter,
    zoom: currentZoom,
    colorScheme: ColorScheme.FOLLOW_SYSTEM,

    mapId: myMapId,
    gestureHandling: 'greedy', // Prevents page zoom on touch devices
    fullscreenControl: true,
    fullscreenControlOptions: {
      position: google.maps.ControlPosition.RIGHT_BOTTOM,
    },
    zoomControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
      //mapTypeIds: ['roadmap', 'satellite'],
    },
    cameraControl: false,
    streetViewControl: false,
    scaleControl: true,
    rotateControl: true, // for 3D rotation
  };

  // Make map instance globally available for other scripts
  const mapDiv = document.getElementById('map');
  map = new Map(mapDiv, mapConfig);
  window.mapInstance = map;

  mapInterface.setMapInterface({
    getMapCenter,
    mapPanTo,
  });
  registerSimConnectFns({
    getLastKnownPosition,
    fetchAircraftData,
  });
  initSearch();
  initLandmark();

  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
    searchLandmarksButton
  );
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(moreWrapper);
  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(settingsButton);
  if (i18n.lang.secondLocale) {
    map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(localeButton);
  }

  if (await initSimConnect(map)) {
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
      aircraftTrackingButton
    );
    aircraftTrackingButton.addEventListener('click', async () => {
      await toggleAircraftTracking();
    });
  }

  const panorama = map.getStreetView();
  panorama.addListener('visible_changed', () => {
    if (panorama.getVisible()) {
      searchSideBar.classList.add('hidden');
      infoSidebar.classList.add('hidden');
    } else {
      searchSideBar.classList.remove('hidden');
    }
  });
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
    if (moreMenu) moreMenu.classList.remove('show');
  });
  if (moreMenu) moreMenu.appendChild(item);
}

// when clicking elsewhere on the document
document.addEventListener('click', (ev) => {
  if (moreMenu && !moreMenu.contains(ev.target)) {
    moreMenu.classList.remove('show');
  }
});

export function getMapCenter(map) {
  const center = map.getCenter();
  return {
    lat: center.lat(),
    lng: normalizeLng(center.lng()),
  };
}

export function mapPanTo(lat, lng, zoom = null) {
  if (!map || !validateCoords(lat, lng)) return;
  map.panTo({ lat, lng });
  if (zoom) map.setZoom(zoom);
}

// Load Google Maps API dynamically via a script element
function loadGoogleMapsAPI() {
  const key = getGoogleMapsApiKey();
  if (!key) {
    handleError('Google Maps API key is not configured');
    return;
  }

  window.initMap = initMap;
  console.log(
    `${import.meta.env?.MODE || 'server'} mode: Google Maps loading...`
  );
  const script = document.createElement('script');
  // Use a protocol-relative URL and ensure async/defer
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap&loading=async&libraries=places,geometry,marker,maps3d&v=beta`;
  script.async = true;
  script.defer = true;
  script.onerror = () => handleError('Could not load Google Maps');

  document.head.appendChild(script);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  await initi18n();
  await settingDialog.require(['GOOGLE_MAPS_API_KEY']);

  loadGoogleMapsAPI();

  // Build the "More" menu options once on startup.
  if (moreMenu) {
    addMoreOption('app.airport_menu', async () => {
      await searchAirport();
    });

    addMoreOption('app.radio_menu', async () => {
      await openInternetRadio();
    });

    addMoreOption('app.show_street_view', () => {
      if (!map) return;
      const panorama = map.getStreetView();
      panorama.setPosition(map.getCenter());
      panorama.setVisible(true);
      window.history.pushState({ overlay: 'street-view' }, '');
    });

    addMoreOption('app.show_3d_aerial', () => {
      if (!map) return;
      const center = map.getCenter();
      let placeName = i18n.t('landmark.aerial_view');
      create3DMapOverlay(center.lat(), center.lng(), placeName);
      /// 2add: push state to enable back button to close the 3D overlay
      window.history.pushState({ overlay: '3d-aerial' }, '');
    });

    addMoreOption('app.user_location', async () => {
      try {
        const targetLocation = await showUserLocation();
        if (targetLocation && map) {
          const { AdvancedMarkerElement } =
            await google.maps.importLibrary('marker');
          const markerDiv = document.createElement('div');
          markerDiv.className = 'marker-element';
          markerDiv.style.backgroundColor = '#F66A5B';

          new AdvancedMarkerElement({
            position: targetLocation,
            map,
            title: i18n.t('tooltips.user_location_marker'),
            content: markerDiv,
          });
        }
      } catch (error) {
        console.error(`Error with Geolocation: ${error.message}`);
      }
    });
  }

  infoCloseButton.addEventListener('click', () => {
    infoSidebar.classList.add('hidden');
  });

  infoTitleContent.addEventListener('click', () => {
    const isHidden = infoContent.classList.toggle('hidden');
    infoTitleContent.classList.toggle('collapsed', isHidden);
  });

  moreButton.addEventListener('click', (ev) => {
    ev.stopPropagation(); // Prevent click bubbling
    moreMenu.classList.toggle('show');
  });

  searchLandmarksButton.addEventListener('click', async () => {
    await searchLandmarks();
  });

  settingsButton.addEventListener('click', async () => {
    await settingDialog.show();
  });

  if (i18n.lang.secondLocale) {
    localeButton.addEventListener('click', async () => {
      i18n.userLocale =
        i18n.userLocale === i18n.lang.preferLocale
          ? i18n.lang.secondLocale
          : i18n.lang.preferLocale;
      localeButton.textContent = getGlobeEmoji(i18n.userLocale);
      await applyTranslations();
    });
  }

  // Hotkeys
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      const activeTag = document.activeElement.tagName;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(
        activeTag
      );
      if (!isInput) {
        event.preventDefault();
        searchLandmarksButton.click();
      }
    }
  });

  // Skip auto-translation if no resource bundles are loaded
  if (Object.keys(i18n.translations).length > 0) {
    // async transation update while loading map
    await updateTranslation();
    await applyTranslations();
  }
});

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
    el.textContent = i18n.t(strkey);
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const strkey = el.getAttribute('data-i18n-title');
    el.title = i18n.t(strkey); // Set title for tooltips
  });
}
