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
  const language = 'en'; // Default to English
  const landmarksData = await getLandmarkData(lat, lng, language);
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

  // Create bounds to fit all landmarks
  const bounds = new google.maps.LatLngBounds();

  // Clear existing infoWindows array if not defined
  if (!window.infoWindows) {
    window.infoWindows = [];
  } else {
    // Close any open info windows
    window.infoWindows.forEach((iw) => iw.close());
    window.infoWindows = [];
  }

  // Process each landmark
  places.forEach((place, index) => {
    // Extract location coordinates
    const position = {
      lat: place.location.latitude,
      lng: place.location.longitude,
    };

    // Get place name from displayName
    const placeName = place.displayName?.text || 'Unnamed Place';

    // Add marker for the landmark using AdvancedMarkerElement
    const markerView = new AdvancedMarkerElement({
      position: position,
      map: map,
      title: placeName,
      content: createMarkerElement(placeName),
    });

    // Add index as data attribute for reference
    markerView.index = index;

    // Store marker for later cleanup
    markers.push(markerView);

    // Extend bounds to include this landmark
    bounds.extend(position);

    // Get AI-powered summary if available
    const summary = place.generativeSummary?.overview?.text || '';

    const placeTypes = place.primaryType
      ? `${place.primaryType}${
          place.types ? `: ${place.types.join(', ')}` : ''
        }`
      : '';
    console.log(
      `${index + 1}) ${placeName} ${
        placeTypes ? `(${placeTypes})` : ''
      } // ${summary.substring(0, 20)}`
    );

    // Get address if available
    const address = placeTypes || place.formattedAddress || '';

    // Create a placeholder for this landmark in the list
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

    // Create Google Maps link for place if available
    let placeUri = null;
    if (place.googleMapsLinks && place.googleMapsLinks.placeUri) {
      placeUri = place.googleMapsLinks.placeUri;
    }

    // Get the photo container for adding the image later
    const photoContainer = landmarkElement.querySelector(
      '.landmark-photo-container'
    );

    // Create info window with interactive content
    const infoWindowContent = document.createElement('div');
    infoWindowContent.style.maxWidth = '200px';

    const titleElement = document.createElement('h3');
    titleElement.style.marginTop = '0';
    titleElement.style.marginBottom = '8px';
    titleElement.style.fontSize = '16px';
    titleElement.style.fontWeight = 'bold';
    titleElement.textContent = placeName;

    // Make title clickable if place URI exists
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

    // Create the info window
    const infoWindow = new google.maps.InfoWindow({
      content: infoWindowContent,
    });

    // Store info window in global array
    window.infoWindows.push(infoWindow);

    // Fetch an image from Wikipedia for this landmark
    getWikiImageURL(placeName)
      .then((imageUrl) => {
        if (imageUrl) {
          // Create image element for the sidebar
          const photoElement = document.createElement('img');
          photoElement.src = imageUrl;
          photoElement.className = 'landmark-image';
          photoElement.alt = placeName;
          photoElement.style.cursor = 'pointer';

          // Add click event to photo to view in large size
          photoElement.addEventListener('click', (e) => {
            e.stopPropagation();

            // Create full-screen overlay for the image
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

            // Create the large image
            const largeImage = document.createElement('img');
            largeImage.src = imageUrl;
            largeImage.style.maxWidth = '90%';
            largeImage.style.maxHeight = '90%';
            largeImage.style.objectFit = 'contain';

            // Close on click
            overlay.addEventListener('click', () => {
              document.body.removeChild(overlay);
            });

            // Add image to overlay and overlay to body
            overlay.appendChild(largeImage);
            document.body.appendChild(overlay);
          });

          // Add to sidebar
          photoContainer.appendChild(photoElement);

          // Create image element for info window
          const imgElement = document.createElement('img');
          imgElement.src = imageUrl;
          imgElement.style.width = '100%';
          imgElement.style.marginTop = '8px';
          imgElement.style.borderRadius = '4px';
          imgElement.style.cursor = 'pointer';

          // Make image clickable to view in large size
          imgElement.addEventListener('click', () => {
            // Create full-screen overlay for the image
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

            // Create the large image
            const largeImage = document.createElement('img');
            largeImage.src = imageUrl;
            largeImage.style.maxWidth = '90%';
            largeImage.style.maxHeight = '90%';
            largeImage.style.objectFit = 'contain';

            // Close on click
            overlay.addEventListener('click', () => {
              document.body.removeChild(overlay);
            });

            // Add image to overlay and overlay to body
            overlay.appendChild(largeImage);
            document.body.appendChild(overlay);
          });

          // Add to info window
          infoWindowContent.appendChild(imgElement);
        }
      })
      .catch((error) => {
        console.error(`Error adding images for ${placeName}:`, error);
      });

    // Function to highlight marker and corresponding sidebar item
    function highlightMarkerAndSidebar(index) {
      // Remove active class from all markers and sidebar items
      markers.forEach((marker) => {
        const markerElement = marker.content.querySelector('.marker-element');
        if (markerElement) {
          markerElement.classList.remove('active-marker');
        }
      });

      document.querySelectorAll('.landmark-item').forEach((item) => {
        item.classList.remove('active-landmark');
      });

      // Add active class to current marker and sidebar item
      const markerElement =
        markers[index].content.querySelector('.marker-element');
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

    // Add click event to marker to show info window (using gmp-click for AdvancedMarkerElement)
    markerView.addListener('gmp-click', () => {
      // Close any open info windows
      window.infoWindows.forEach((iw) => iw.close());

      // Open this info window
      infoWindow.open({
        anchor: markerView,
        map: map,
      });

      // Highlight this marker and sidebar item
      highlightMarkerAndSidebar(index);

      // Center map on this marker
      map.panTo(position);
    });

    // Add click handler to the landmark name in sidebar
    const landmarkNameElement = landmarkElement.querySelector('.landmark-name');
    landmarkNameElement.addEventListener('click', () => {
      // Close any open info windows
      window.infoWindows.forEach((iw) => iw.close());

      // Open info window for this landmark
      infoWindow.open({
        anchor: markerView,
        map: map,
      });

      // Highlight this marker and sidebar item
      highlightMarkerAndSidebar(index);

      // Center map on this marker
      map.panTo(position);
    });
  });

  landmarkSidebar.classList.remove('hidden');

  // Center map on the first result
  if (places[0].location) {
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
 * Clear all markers from the map
 */
function clearMarkers() {
  markers.forEach((marker) => {
    marker.map = null;
  });
  markers = [];
}
