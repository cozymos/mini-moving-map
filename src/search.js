/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
import { getLandmarkData, getWikiImageURL } from './services.js';
import { setLoading, handleError } from './main.js';
import { PlaceTextSearch, PlaceNearbySearch } from './gmap.js';

// DOM Elements
const searchLandmarksButton = document.getElementById('search-landmarks');
const searchSideBar = document.getElementById('search-bar-container');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const landmarkSidebar = document.getElementById('landmarks-sidebar');
const landmarksList = document.getElementById('landmarks-list');
const closeLandmarksButton = document.getElementById('close-landmarks');

const default_radius = 10000;
const default_zoom = 12;

// Map instance
let map;

// Track active landmark markers for cleanup
let markers = [];

export function initSearch() {
  // Get map instance from global scope (set in map.js)
  map = window.mapInstance;
  if (!map) {
    console.error('Map instance not found. Please initialize the map first.');
    return;
  }

  setupLandmarkSearch();
  setupTextSearch();
}

/**
 * Set up landmark search control
 */
function setupLandmarkSearch() {
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
    searchLandmarksButton
  );
  searchLandmarksButton.addEventListener('click', () => {
    // searchNearby();
    searchLandmark();
  });

  closeLandmarksButton.addEventListener('click', () => {
    landmarkSidebar.classList.add('hidden');
  });
}

/**
 * Set up text search functionality
 */
function setupTextSearch() {
  searchSideBar.classList.remove('hidden');

  // Add click event to search button
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      searchText(query);
    }
  });

  // Add event listener for Enter key in search input
  searchInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) {
        searchText(query);
      }
    }
  });

  searchInput.addEventListener('focus', () => {
    searchInput.value = '';
    landmarkSidebar.classList.add('hidden');
  });
}

async function searchText(query) {
  // Clear any existing landmarks and markers
  landmarksList.innerHTML = '';
  clearMarkers();

  // Show loading indicator
  setLoading(true);
  const places = await PlaceTextSearch(query);
  setLoading(false);

  if (places && places.length > 0) {
    // Display landmarks and show sidebar
    displayLandmarks(places);
  } else {
    handleError(`Location not found for "${query}"`);
  }
}

async function searchNearby() {
  // Clear any existing landmarks
  landmarksList.innerHTML = '';
  clearMarkers();

  // Show loading indicator
  setLoading(true);

  // Get current map center
  const center = map.getCenter();
  const position = {
    lat: center.lat(),
    lng: center.lng(),
  };

  // Calculate search radius based on zoom level (higher zoom = smaller radius)
  const zoomLevel = map.getZoom();
  const radius = Math.max(
    default_radius,
    default_radius * Math.pow(0.5, zoomLevel - default_zoom)
  );

  const places = await PlaceNearbySearch(position, radius);
  setLoading(false);

  if (places && places.length > 0) {
    // Display landmarks and show sidebar
    displayLandmarks(places);
  } else {
    handleError('No landmarks found in this area.');
  }
}

async function searchLandmark() {
  // Clear any existing landmarks
  landmarksList.innerHTML = '';
  clearMarkers();

  // Show loading indicator
  setLoading(true);

  // Get current map center
  const center = map.getCenter();
  const lat = center.lat();
  const lng = center.lng();

  // Get landmarks data
  const landmarksData = await getLandmarkData(lat, lng);
  setLoading(false);

  if (
    landmarksData &&
    landmarksData.landmarks &&
    landmarksData.landmarks.length > 0
  ) {
    const places = landmarksData.landmarks.map((landmark) => ({
      displayName: {
        text: landmark.name,
      },
      generativeSummary: {
        overview: {
          text: landmark.description || 'No description available.',
        },
      },
      primaryType: landmark.type || 'Point of Interest',
      location: {
        latitude: landmark.lat,
        longitude: landmark.lon || landmark.lng,
      },
    }));

    if (places && places.length > 0) {
      // Display landmarks and show sidebar
      displayLandmarks(places);
    }
  } else {
    handleError('No landmarks found in this area.');
  }
}

/**
 * Create a custom element for the advanced marker
 * @param {string} title - The title to display in the marker
 * @returns {HTMLElement} The marker element
 */
function createMarkerElement(title) {
  // Create a container for the marker
  const container = document.createElement('div');
  container.className = 'marker-container';
  container.style.position = 'relative';

  const makerColor = '#6aa8f7';
  const highlightMaker = '#4285F4';

  // Create dot element
  const element = document.createElement('div');
  element.className = 'marker-element';
  element.style.backgroundColor = makerColor;
  element.dataset.title = title; // Store title for later use

  // Add marker title that shows on hover
  const titleElement = document.createElement('div');
  titleElement.textContent = title;
  titleElement.style.position = 'absolute';
  titleElement.style.bottom = '100%';
  titleElement.style.left = '50%';
  titleElement.style.transform = 'translateX(-50%)';
  titleElement.style.backgroundColor = 'white';
  titleElement.style.padding = '4px 8px';
  titleElement.style.borderRadius = '4px';
  titleElement.style.fontWeight = 'bold';
  titleElement.style.fontSize = '14px';
  titleElement.style.whiteSpace = 'nowrap';
  titleElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  titleElement.style.marginBottom = '5px';
  titleElement.style.display = 'none';
  titleElement.style.zIndex = '1';

  // Add event listeners for hover
  element.addEventListener('mouseover', () => {
    titleElement.style.display = 'block';
    element.style.backgroundColor = highlightMaker;
  });

  element.addEventListener('mouseout', () => {
    titleElement.style.display = 'none';
    element.style.backgroundColor = makerColor;
  });

  // Append to container
  container.appendChild(element);
  container.appendChild(titleElement);

  return container;
}

/**
 * Display landmarks on the map and in the sidebar
 */
async function displayLandmarks(places) {
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  const bounds = new google.maps.LatLngBounds();

  // Clear existing info windows
  if (!window.infoWindows) {
    window.infoWindows = [];
  } else {
    window.infoWindows.forEach((iw) => iw.close());
    window.infoWindows = [];
  }

  // Process each place sequentially with proper async/await
  for (let index = 0; index < places.length; index++) {
    const place = places[index];
    const position = {
      lat: place.location.latitude,
      lng: place.location.longitude,
    };

    const placeName = place.displayName?.text || 'Unnamed Place';
    const summary = place.generativeSummary?.overview?.text || '';
    const placeTypes = place.primaryType
      ? `${place.primaryType}${
          place.types ? `: ${place.types.join(', ')}` : ''
        }`
      : '';
    const address = placeTypes || place.formattedAddress || '';
    const placeUri = place.googleMapsLinks?.placeUri || null;

    console.log(
      `${index + 1}) ${placeName} ${
        placeTypes ? `(${placeTypes})` : ''
      } // ${summary.substring(0, 20)}`
    );

    // Create marker
    const markerView = new AdvancedMarkerElement({
      position: position,
      map: map,
      title: placeName,
      content: createMarkerElement(placeName),
    });

    markerView.index = index;
    markers.push(markerView);
    bounds.extend(position);

    // Create sidebar element
    const landmarkElement = createSidebarElement(
      placeName,
      address,
      summary,
      index
    );
    const photoContainer = landmarkElement.querySelector(
      '.landmark-photo-container'
    );

    // Create info window
    const infoWindowContent = createInfoWindowContent(
      placeName,
      summary,
      placeUri
    );
    const infoWindow = new google.maps.InfoWindow({
      content: infoWindowContent,
    });

    window.infoWindows.push(infoWindow);

    // Add images asynchronously
    await addImageToPlace(placeName, photoContainer, infoWindowContent);

    // Setup interactions
    setupPlaceInteractions(
      markerView,
      infoWindow,
      landmarkElement,
      position,
      index
    );
  }

  landmarkSidebar.classList.remove('hidden');

  // Center map on the first result
  if (places[0]?.location) {
    const firstLocation = {
      lat: places[0].location.latitude,
      lng: places[0].location.longitude,
    };
    map.setCenter(firstLocation);
  }

  // Adjust map to show all landmarks
  map.fitBounds(bounds);
  map.setZoom(default_zoom);
}

/**
 * Create full-screen overlay for image viewing
 */
function createImageOverlay(imageUrl) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';

  const largeImage = document.createElement('img');
  largeImage.src = imageUrl;
  largeImage.style.maxWidth = '90%';
  largeImage.style.maxHeight = '90%';
  largeImage.style.objectFit = 'contain';

  overlay.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  overlay.appendChild(largeImage);
  document.body.appendChild(overlay);
}

/**
 * Create clickable image element for sidebar
 */
function createSidebarImage(imageUrl, placeName, photoContainer) {
  const photoElement = document.createElement('img');
  photoElement.src = imageUrl;
  photoElement.className = 'landmark-image';
  photoElement.alt = placeName;
  photoElement.style.cursor = 'pointer';

  photoElement.addEventListener('click', (e) => {
    e.stopPropagation();
    createImageOverlay(imageUrl);
  });

  photoContainer.appendChild(photoElement);
}

/**
 * Create clickable image element for info window
 */
function createInfoWindowImage(imageUrl, infoWindowContent) {
  const imgElement = document.createElement('img');
  imgElement.src = imageUrl;
  imgElement.style.width = '100%';
  imgElement.style.marginTop = '8px';
  imgElement.style.borderRadius = '4px';
  imgElement.style.cursor = 'pointer';

  imgElement.addEventListener('click', () => {
    createImageOverlay(imageUrl);
  });

  infoWindowContent.appendChild(imgElement);
}

/**
 * Add image to both sidebar and info window
 */
async function addImageToPlace(placeName, photoContainer, infoWindowContent) {
  try {
    const imageUrl = await getWikiImageURL(placeName);
    if (imageUrl) {
      createSidebarImage(imageUrl, placeName, photoContainer);
      createInfoWindowImage(imageUrl, infoWindowContent);
    }
  } catch (error) {
    console.error(`Error adding images for ${placeName}:`, error);
  }
}

/**
 * Create info window content for a place
 */
function createInfoWindowContent(placeName, summary, placeUri) {
  const infoWindowContent = document.createElement('div');
  infoWindowContent.style.maxWidth = '200px';

  const titleElement = document.createElement('h3');
  titleElement.style.marginTop = '0';
  titleElement.style.marginBottom = '8px';
  titleElement.style.fontSize = '16px';
  titleElement.style.fontWeight = 'bold';
  titleElement.textContent = placeName;

  if (placeUri) {
    titleElement.style.cursor = 'pointer';
    titleElement.style.color = '#4285F4';
    titleElement.addEventListener('click', () => {
      window.open(placeUri, '_blank');
    });
  }

  const summaryElement = document.createElement('p');
  summaryElement.textContent = summary;
  summaryElement.style.fontSize = '14px';
  summaryElement.style.marginBottom = '8px';

  infoWindowContent.appendChild(titleElement);
  infoWindowContent.appendChild(summaryElement);

  return infoWindowContent;
}

/**
 * Create sidebar element for a landmark
 */
function createSidebarElement(placeName, address, summary, index) {
  const landmarkElement = document.createElement('div');
  landmarkElement.className = 'landmark-item';
  landmarkElement.dataset.index = index;
  landmarkElement.innerHTML = `
    <div class="landmark-name">${placeName}</div>
    ${address ? `<div class="landmark-address">${address}</div>` : ''}
    ${summary ? `<div class="landmark-summary">${summary}</div>` : ''}
    <div class="landmark-photo-container"></div>
  `;
  landmarksList.appendChild(landmarkElement);
  return landmarkElement;
}

/**
 * Highlight marker and corresponding sidebar item
 */
function highlightMarkerAndSidebar(index) {
  // Remove active class from all markers and sidebar items
  for (const marker of markers) {
    const markerElement = marker.content.querySelector('.marker-element');
    if (markerElement) {
      markerElement.classList.remove('active-marker');
    }
  }

  document.querySelectorAll('.landmark-item').forEach((item) => {
    item.classList.remove('active-landmark');
  });

  // Add active class to current marker and sidebar item
  const markerElement = markers[index].content.querySelector('.marker-element');
  if (markerElement) {
    markerElement.classList.add('active-marker');
  }

  const sidebarItem = document.querySelector(
    `.landmark-item[data-index="${index}"]`
  );
  if (sidebarItem) {
    sidebarItem.classList.add('active-landmark');
    sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Setup click handlers for marker and sidebar interaction
 */
function setupPlaceInteractions(
  markerView,
  infoWindow,
  landmarkElement,
  position,
  index
) {
  // Marker click handler
  markerView.addListener('gmp-click', () => {
    window.infoWindows.forEach((iw) => iw.close());
    infoWindow.open({
      anchor: markerView,
      map: map,
    });
    highlightMarkerAndSidebar(index);
    map.panTo(position);
  });

  // Sidebar click handler
  const landmarkNameElement = landmarkElement.querySelector('.landmark-name');
  landmarkNameElement.addEventListener('click', () => {
    window.infoWindows.forEach((iw) => iw.close());
    infoWindow.open({
      anchor: markerView,
      map: map,
    });
    highlightMarkerAndSidebar(index);
    map.panTo(position);
  });
}

/**
 * Clear all markers from the map
 */
function clearMarkers() {
  markers.forEach((marker) => {
    marker.map = null;
  });
  markers = [];
}
