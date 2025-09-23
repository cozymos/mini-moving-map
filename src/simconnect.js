/* eslint-disable no-undef */
/**
 * SimConnect module for Microsoft Flight Simulator integration
 * moving aircraft marker on Google Maps with real-time telemetry
 */

import { mapInterface } from './interfaces.js';
import { validateCoords, handleError } from './utils.js';
import { i18n, setTooltip } from './lion.js';

// Module state
let map = null;
let aircraftMarker = null;
let tracking = false;
let updateInterval = null;
let lastKnownPosition = null;

const aircraftTrackingButton = document.getElementById('aircraft-tracking');
const UPDATE_FREQUENCY = 1000; // 1 second (1Hz)

/**
 * Initialize SimConnect module
 * @param {google.maps.Map} mapInstance - Google Maps instance
 */
export async function initSimConnect(mapInstance) {
  map = mapInstance;
  setTooltip(aircraftTrackingButton, 'tooltips.aircraft_tracking_start');
  return serverAvailable();
}

/**
 * Create marker with airplane icon using AdvancedMarkerElement
 * @param {Object} position - {lat, lng} coordinates
 * @param {number} heading - Aircraft heading in degrees
 * @returns {google.maps.marker.AdvancedMarkerElement} Aircraft marker
 */
async function createAircraftMarker(position, heading) {
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  // Create a custom HTML element for the aircraft icon
  const aircraftIcon = document.createElement('div');
  aircraftIcon.innerHTML = `
    <div style="
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${heading}deg);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
      font-size: 24px;
      cursor: pointer;
    ">
      ✈️
    </div>
  `;

  const marker = new AdvancedMarkerElement({
    map: map,
    position: position,
    content: aircraftIcon,
    title: i18n.t('tooltips.aircraft_marker'),
    zIndex: 1000, // Ensure aircraft appears above other markers
  });

  // Add click listener to open 3D view
  marker.addListener('click', async () => {
    try {
      // Import landmark module for 3D overlay functionality
      const landmarkModule = await import('./landmark.js');

      // Use the existing create3DMapOverlay function
      if (landmarkModule.create3DMapOverlay) {
        landmarkModule.create3DMapOverlay(
          position.lat,
          position.lng,
          `${position.lat.toFixed(3)}, ${position.lng.toFixed(3)}`
        );
      } else {
        console.error('create3DMapOverlay not found in landmark module');
      }
    } catch (err) {
      console.error('Failed to open 3D view:', err);
    }
  });

  return marker;
}

/**
 * Update aircraft marker position and rotation
 * @param {Object} aircraftData - Telemetry data from SimConnect
 */
async function updateAircraftMarker(aircraftData) {
  const position = {
    lat: aircraftData.latitude,
    lng: aircraftData.longitude,
  };

  // Skip update if out of bounds
  if (map.getBounds().contains(position)) {
    if (!aircraftMarker) {
      aircraftMarker = await createAircraftMarker(
        position,
        aircraftData.heading
      );
    } else {
      const currentCenter = mapInterface.getMapCenter(map);
      if (
        Math.abs(currentCenter.lat - position.lat) < 0.01 &&
        Math.abs(currentCenter.lng - position.lng) < 0.01
      ) {
        mapInterface.mapPanTo(position.lat, position.lng, 0);
      }

      // Update existing marker position
      aircraftMarker.position = position;

      // Update rotation by modifying the content element
      const iconDiv = aircraftMarker.content.querySelector('div');
      if (iconDiv) {
        iconDiv.style.transform = `rotate(${aircraftData.heading}deg)`;
      }
    }
  }

  // Store last known position for debugging
  lastKnownPosition = {
    ...position,
    heading: aircraftData.heading,
    altitude: aircraftData.altitude,
    timestamp: Date.now(),
  };
}

/**
 * Fetch aircraft data from SimConnect server
 * @returns {Object|null} Aircraft telemetry data or null if unavailable
 */
export async function fetchAircraftData() {
  try {
    const response = await fetch(
      `/api/simconnect/${tracking ? 'track' : 'connect'}`
    );
    if (!response.ok)
      throw new Error(`No SimConnect server: ${response.status}`);

    const data = await response.json();
    return validateCoords(data.latitude, data.longitude) ? data : null;
  } catch (err) {
    console.warn('Failed to fetch aircraft data:', err.message);
    return null;
  }
}

/**
 * Start real-time aircraft tracking
 */
function startAircraftTracking() {
  if (updateInterval) {
    return; // Already running
  }

  updateInterval = setInterval(async () => {
    const aircraftData = await fetchAircraftData();
    if (aircraftData && aircraftData.connected !== false) {
      if (aircraftData.latitude && aircraftData.longitude) {
        aircraftData.heading -= 40; // emoji heading adjustment (diff fonts are slightly different)
        await updateAircraftMarker(aircraftData);
      }
    } else stopAircraftTracking();
  }, UPDATE_FREQUENCY);

  tracking = true;
  console.log('✈️ Aircraft tracking started');
  updateTrackingButton();
}

/**
 * Stop aircraft tracking and remove marker
 */
function stopAircraftTracking() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  if (aircraftMarker) {
    aircraftMarker.map = null;
    aircraftMarker = null;
  }

  tracking = false;
  console.log('Aircraft tracking stopped');
  updateTrackingButton();
}

function updateTrackingButton() {
  // Update button appearance based on state
  aircraftTrackingButton.style.backgroundColor = tracking ? '#4CAF50' : 'white';
  aircraftTrackingButton.style.color = tracking ? 'white' : 'black';
  const tooltipKey = tracking
    ? 'tooltips.aircraft_tracking_stop'
    : 'tooltips.aircraft_tracking_start';
  setTooltip(aircraftTrackingButton, tooltipKey);
}

/**
 * Toggle aircraft tracking on/off
 * @returns {boolean} New enabled state
 */
export async function toggleAircraftTracking() {
  if (tracking && lastKnownPosition) {
    const currentCenter = mapInterface.getMapCenter(map);
    if (
      Math.abs(currentCenter.lat - lastKnownPosition.lat) > 0.01 ||
      Math.abs(currentCenter.lng - lastKnownPosition.lng) > 0.01
    ) {
      mapInterface.mapPanTo(lastKnownPosition.lat, lastKnownPosition.lng, 0);
      return true;
    }
  }

  if (!tracking) {
    if (await serverAvailable()) {
      if (lastKnownPosition)
        mapInterface.mapPanTo(lastKnownPosition.lat, lastKnownPosition.lng, 0);
      startAircraftTracking();
    } else {
      handleError(i18n.t('errors.moving_map_server_unavailable'));
    }
  } else stopAircraftTracking();
  return tracking;
}

async function serverAvailable() {
  const flag = window.APP_CONFIG?.SimConnectServerAvailable;
  if (flag || (flag !== false && import.meta.env?.DEV)) {
    const aircraftData = await fetchAircraftData();
    return aircraftData && aircraftData.connected !== false;
  }

  return false;
}

/**
 * Get last known aircraft position for debugging
 * @returns {Object|null} Last known position data
 */
export function getLastKnownPosition() {
  return tracking ? lastKnownPosition : null;
}
