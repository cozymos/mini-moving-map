/* eslint-disable no-undef */
import { getWikiImageURL } from './services.js';
import { validateCoords } from './utils.js';
import { mapInterface } from './interfaces.js';

// DOM Elements
const landmarkSidebar = document.getElementById('landmarks-sidebar');
const landmarksList = document.getElementById('landmarks-list');
const closeLandmarksButton = document.getElementById('close-landmarks');

// Map instance
let map;
// Store markers for landmarks
const landMarkers = [];
const infoWindows = [];

export function initLandmark() {
  // Get map instance from global scope (set in map.js)
  map = window.mapInstance;
  if (!map) {
    console.error('Map instance not found. Please initialize the map first.');
    return;
  }

  // Add click event to close landmarks panel
  closeLandmarksButton.addEventListener('click', () => {
    landmarkSidebar.classList.add('hidden');
  });

  mapInterface.setMapInterface({
    displayLandmarks,
    clearLandMarkers,
  });
}

/**
 * Display landmarks on the map and in the sidebar
 */
export async function displayLandmarks(landmark_data) {
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  // Collect images that need to be cached
  const imagesToCache = [];

  // Clear existing info windows
  infoWindows.forEach((iw) => iw.close());

  // Process each landmark sequentially with proper async/await
  for (const landmark of landmark_data.landmarks) {
    const placeName = landmark.name;
    const lat = landmark.lat;
    const lon = landmark.lon;

    // Validate coordinates before creating marker
    if (!validateCoords(lat, lon)) {
      console.error('Invalid coordinates:', placeName, { lat, lon });
      continue; // Skip this landmark
    }

    const position = {
      lat: lat,
      lng: lon,
    };

    // Create marker
    const markerView = new AdvancedMarkerElement({
      position: position,
      map: map,
      title: placeName,
      content: createMarkerElement(placeName),
    });

    const index = landMarkers.length;
    markerView.index = index;
    markerView.desc = landmark.desc;
    landMarkers.push(markerView);

    // Create sidebar element
    const landmarkElement = createSidebarElement(landmark, index);
    const photoContainer = landmarkElement.querySelector(
      '.landmark-photo-container'
    );

    // Create info window
    const infoWindowContent = createInfoWindowContent(landmark, index);
    const infoWindow = new google.maps.InfoWindow({
      content: infoWindowContent,
    });
    infoWindows.push(infoWindow);

    // Get image asynchronously if available
    let imageUrl;
    if ('image_url' in landmark && landmark.image_url != null) {
      imageUrl = landmark.image_url;
      if (imageUrl) {
        if (!imageUrl.startsWith('http'))
          imageUrl = window.location.origin + imageUrl;
      } else console.debug(`${landmark.name}: skipped image`);
    } else {
      // first try with local name (as per gpt)
      imageUrl = await getWikiImageURL(landmark.local);
      if (imageUrl != null) {
        // If not found the 1st time, try again with title
        if (imageUrl == '') imageUrl = await getWikiImageURL(landmark.name);
        // If we got an image URL from Wikipedia, add it to cache list
        if (imageUrl != null) {
          imagesToCache.push({
            name: landmark.name,
            image_url: imageUrl,
          });
          landmark.image_url = imageUrl;
        }
      }
    }

    // Add images to both sidebar and info window
    if (imageUrl) {
      await createSidebarImage(
        imageUrl,
        placeName,
        photoContainer,
        position.lat,
        position.lng
      );
      await createInfoWindowImage(
        imageUrl,
        infoWindowContent,
        placeName,
        position.lat,
        position.lng
      );
      markerView.imageUrl = imageUrl;
    }

    // Setup interactions
    setupPlaceInteractions(
      markerView,
      infoWindow,
      landmarkElement,
      position,
      index
    );
  }

  // Show landmarks panel
  landmarkSidebar.classList.remove('hidden');

  // return collected images to backend for caching
  return imagesToCache;
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
 * Create 3D Map visualization overlay
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} placeName - Name of the place
 */
function create3DMapOverlay(lat, lng, placeName) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';

  // 3D Map container
  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = `
    flex: 1;
    width: 100%;
    height: 100%;
    position: relative;
  `;

  // In-map overlay for title and close button
  const infoOverlay = document.createElement('div');
  infoOverlay.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    z-index: 1100;
  `;

  const titleEl = document.createElement('h3');
  titleEl.textContent = placeName;
  titleEl.style.margin = '0';
  titleEl.style.fontSize = '16px';

  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    margin-left: 8px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeButton.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  infoOverlay.appendChild(titleEl);
  infoOverlay.appendChild(closeButton);
  mapContainer.appendChild(infoOverlay);
  
  // Initialize photorealistic 3D map with Map mode support
  setTimeout(async () => {
    try {
      console.log(`3D Map for ${placeName} at (${lat}, ${lng})`);

      // Import required classes for 3D Maps with mode support
      const { Map3DElement, MapMode } = await google.maps.importLibrary(
        'maps3d'
      );

      // Clear container and ensure proper dimensions first
      // mapContainer.innerHTML = '';
      mapContainer.style.width = '100%';
      mapContainer.style.height = '100%';
      mapContainer.style.minHeight = '400px';

      // Create Map3DElement with optimized configuration to reduce performance warnings
      const map3DElement = new Map3DElement({
        center: { lat: lat, lng: lng, altitude: 500 },
        tilt: 67.5,
        range: 5000,
        heading: 0,
        mode: MapMode.HYBRID, // Start in HYBRID mode (with labels)
      });

      map3DElement.style.width = '100%';
      map3DElement.style.height = '100%';
      map3DElement.style.display = 'block';

      // Add performance optimization attributes
      map3DElement.style.willChange = 'transform';
      map3DElement.style.transform = 'translateZ(0)'; // Force hardware acceleration
      mapContainer.appendChild(map3DElement);
      mapContainer.insertBefore(infoOverlay, map3DElement); // Ensure overlay is on top

      // Create map mode toggle button
      const modeToggleButton = document.createElement('button');
      modeToggleButton.className = 'control-button';
      modeToggleButton.innerHTML = '🏷️';
      modeToggleButton.title = 'Hide labels';
      modeToggleButton.style.position = 'absolute';
      modeToggleButton.style.top = '10px';
      modeToggleButton.style.right = '0px';
      modeToggleButton.style.zIndex = '1000';

      // Track current mode
      let currentMode = MapMode.HYBRID;

      // Add click handler for mode toggle
      modeToggleButton.addEventListener('click', () => {
        if (currentMode === MapMode.SATELLITE) {
          // Switch to HYBRID (labels on)
          map3DElement.mode = MapMode.HYBRID;
          currentMode = MapMode.HYBRID;
          modeToggleButton.title = 'Hide labels';
        } else {
          // Switch to SATELLITE (labels off)
          map3DElement.mode = MapMode.SATELLITE;
          currentMode = MapMode.SATELLITE;
          modeToggleButton.title = 'Show labels';
        }
      });

      // Create animation control button
      const animationButton = document.createElement('button');
      animationButton.className = 'control-button';
      animationButton.innerHTML = '🎬';
      animationButton.title = 'Replay Animation';
      animationButton.style.position = 'absolute';
      animationButton.style.top = '60px';
      animationButton.style.right = '0px';
      animationButton.style.zIndex = '1000';

      // Function for replay button (includes fly-to + fly-around)
      const replayFullAnimation = () => {
        const flyToCamera = {
          center: { lat: lat, lng: lng, altitude: 300 },
          tilt: 65,
          range: 600,
          heading: 30,
        };

        // Step 1: Start fly-to animation
        map3DElement.flyCameraTo({
          endCamera: flyToCamera,
          durationMillis: 5000,
        });

        // Step 2: Poll for animation completion, then start fly-around
        setTimeout(() => {
          map3DElement.flyCameraAround({
            camera: flyToCamera,
            durationMillis: 12000,
            rounds: 1,
          });
        }, 5100); // 5000ms fly-to + 100ms buffer
      };

      // Add click handler for animation replay (full animation with fly-to)
      animationButton.addEventListener('click', replayFullAnimation);
      mapContainer.appendChild(modeToggleButton);
      mapContainer.appendChild(animationButton);

      // Function to start auto fly-around animation
      const startAutoAnimation = () => {
        try {
          map3DElement.flyCameraAround({
            camera: {
              center: { lat: lat, lng: lng, altitude: 300 },
              tilt: 65,
              range: 600,
              heading: 30,
            },
            durationMillis: 12000,
            rounds: 1,
          });
        } catch (error) {
          console.error('Auto fly-around failed:', error);
        }
      };

      // 1. gmp-load event never received (doesn't work)
      map3DElement.addEventListener('gmp-load', () => {
        // map is ready
        console.debug('3D Map gmp-load event for:', placeName);

        // Remove loading indicator
        if (loadingDiv && loadingDiv.parentElement) {
          loadingDiv.remove();
        }

        // startAutoAnimation();
        // setTimeout(add3DMarkersAndPopovers, 500);
      });

      // 2. Backup method: Poll for map readiness and start animation
      let pollAttempts = 0;
      const maxPollAttempts = 20;

      const pollForMapReady = () => {
        pollAttempts++;
        if (pollAttempts > maxPollAttempts) {
          return;
        }

        // Check if map has animation methods available
        if (typeof map3DElement.flyCameraAround === 'function') {
          console.debug('3D Map ready for animation:', placeName);

          // Remove loading indicator
          if (loadingDiv && loadingDiv.parentElement) {
            loadingDiv.remove();
          }

          // Start auto animation
          startAutoAnimation();
          setTimeout(add3DMarkersAndPopovers, 500);
        } else {
          // Continue polling
          setTimeout(pollForMapReady, 500);
        }
      };

      // Start polling after a short delay
      setTimeout(pollForMapReady, 1000);

      // Add 3D markers and popovers for existing landmarks
      const add3DMarkersAndPopovers = async () => {
        try {
          const { Marker3DInteractiveElement, PopoverElement, AltitudeMode } =
            await google.maps.importLibrary('maps3d');

          // Add 3D markers for each landmark in landMarkers array
          landMarkers.forEach((markerView) => {
            if (markerView && markerView.position) {
              const lat = markerView.position.lat;
              const lng = markerView.position.lng;

              // Create 3D interactive marker
              const marker3D = new Marker3DInteractiveElement({
                altitudeMode: AltitudeMode.ABSOLUTE,
                extruded: true,
                position: { lat: lat, lng: lng, altitude: 300 },
              });

              // Create popover with landmark content
              const popover = new PopoverElement({
                open: false,
                positionAnchor: marker3D,
              });

              // Create header with landmark name
              const header = document.createElement('div');
              header.style.fontWeight = 'bold';
              header.style.fontSize = '16px';
              header.style.marginBottom = '8px';
              header.slot = 'header';
              header.textContent = markerView.title;

              // Create content with image and description
              const content = document.createElement('div');
              content.style.cssText = `
                max-width: 300px;
              `;

              if (markerView.imageUrl) {
                const img = document.createElement('img');
                img.src = markerView.imageUrl;
                img.style.cssText = `
                  width: 100%;
                  height: 150px;
                  object-fit: cover;
                  border-radius: 6px;
                  margin-bottom: 8px;
                `;
                content.appendChild(img);
              }

              if (markerView.desc) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                  font-size: 14px;
                  line-height: 1.4;
                  color: #333;
                `;
                desc.textContent = markerView.desc;
                content.appendChild(desc);
              }

              // Add click handler to toggle popover
              marker3D.addEventListener('gmp-click', () => {
                popover.open = !popover.open;
              });

              // Append header and content to popover
              popover.appendChild(header);
              popover.appendChild(content);

              // Add marker and popover to map
              map3DElement.appendChild(marker3D);
              map3DElement.appendChild(popover);
            }
          });
        } catch (error) {
          console.error('Failed to add 3D markers and popovers:', error);
        }
      };

      map3DElement.addEventListener('gmp-error', (event) => {
        console.error('3D Map error:', event.detail);
        throw new Error('Map3DElement failed to load');
      });

      // Add loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.innerHTML = `
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          z-index: 1000;
        ">
          <div style="font-size: 12px; opacity: 0.7;">${placeName}</div>
        </div>
      `;
      mapContainer.appendChild(loadingDiv);
    } catch (error) {
      console.error('Failed to create 3D Map:', error);

      // Show clear error message without fallback
      mapContainer.innerHTML = `
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(220, 53, 69, 0.9);
          color: white;
          padding: 30px;
          border-radius: 8px;
          text-align: center;
          z-index: 1000;
          max-width: 350px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          <div style="margin-bottom: 15px; font-weight: bold; font-size: 16px;">3D Map Failed to Load</div>
          <div style="font-size: 14px; margin-bottom: 10px; opacity: 0.9; line-height: 1.4;">
            ${
              error.message ||
              'The photorealistic 3D view could not be initialized.'
            }
          </div>
          <div style="font-size: 12px; margin-bottom: 20px; opacity: 0.7; line-height: 1.3;">
            This may be due to browser compatibility, network issues, or Google Maps 3D beta access limitations.
          </div>
          <button onclick="this.parentElement.parentElement.querySelector('.close-button').click()" style="
            background: white;
            color: #dc3545;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
          ">Close 3D View</button>
        </div>
      `;
    }
  }, 300);

  // Close overlay function
  const closeOverlay = () => {
    document.body.removeChild(overlay);
  };

  closeButton.addEventListener('click', closeOverlay);

  // Allow closing by clicking outside the map (on the map container)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  overlay.appendChild(mapContainer);
  document.body.appendChild(overlay);
}

/**
 * Create 3D icon overlay for images
 * @param {HTMLElement} imageContainer - Container element for the image
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} placeName - Name of the place
 */
function create3DIconOverlay(imageContainer, lat, lng, placeName) {
  const iconOverlay = document.createElement('div');
  iconOverlay.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    font-size: 12px;
    font-weight: bold;
    transition: background-color 0.2s;
    z-index: 10;
  `;
  iconOverlay.textContent = '3D';
  iconOverlay.title = 'View in 3D';

  iconOverlay.addEventListener('mouseover', () => {
    iconOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  });
  iconOverlay.addEventListener('mouseout', () => {
    iconOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  });

  iconOverlay.addEventListener('click', (e) => {
    e.stopPropagation();
    create3DMapOverlay(lat, lng, placeName);
  });

  imageContainer.appendChild(iconOverlay);
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
async function createSidebarImage(
  imageUrl,
  placeName,
  photoContainer,
  lat,
  lng
) {
  // Create container for image and 3D icon
  const imageWrapper = document.createElement('div');
  imageWrapper.style.position = 'relative';
  imageWrapper.style.display = 'inline-block';
  imageWrapper.style.width = '100%';

  const photoElement = document.createElement('img');
  photoElement.src = imageUrl;
  photoElement.className = 'landmark-image';
  photoElement.alt = placeName;
  photoElement.style.cursor = 'pointer';
  photoElement.style.width = '100%';
  photoElement.style.display = 'block';

  photoElement.addEventListener('click', (e) => {
    e.stopPropagation();
    createImageOverlay(imageUrl);
  });

  imageWrapper.appendChild(photoElement);
  if (lat !== undefined && lng !== undefined) {
    create3DIconOverlay(imageWrapper, lat, lng, placeName);
  }
  photoContainer.appendChild(imageWrapper);
}

/**
 * Create clickable image element for info window
 */
async function createInfoWindowImage(
  imageUrl,
  infoWindowContent,
  placeName,
  lat,
  lng
) {
  // Create container for image and 3D icon
  const imageWrapper = document.createElement('div');
  imageWrapper.style.position = 'relative';
  imageWrapper.style.display = 'inline-block';
  imageWrapper.style.width = '100%';
  imageWrapper.style.marginTop = '8px';

  const imgElement = document.createElement('img');
  imgElement.src = imageUrl;
  imgElement.style.width = '100%';
  imgElement.style.borderRadius = '4px';
  imgElement.style.cursor = 'pointer';
  imgElement.style.display = 'block';

  imgElement.addEventListener('click', () => {
    createImageOverlay(imageUrl);
  });

  imageWrapper.appendChild(imgElement);
  if (lat !== undefined && lng !== undefined) {
    create3DIconOverlay(imageWrapper, lat, lng, placeName);
  }
  infoWindowContent.appendChild(imageWrapper);
}

/**
 * Create info window content for a place
 */
function createInfoWindowContent(landmark, index) {
  const infoWindowContent = document.createElement('div');
  infoWindowContent.style.maxWidth = '200px';

  const titleElement = document.createElement('h3');
  titleElement.style.marginTop = '0';
  titleElement.style.marginBottom = '8px';
  titleElement.style.fontSize = '16px';
  titleElement.style.fontWeight = 'bold';
  titleElement.textContent = landmark.name;
  titleElement.style.cursor = 'pointer';
  titleElement.addEventListener('click', () => {
    highlightMarkerAndSidebar(index);
  });
  infoWindowContent.appendChild(titleElement);
  return infoWindowContent;
}

/**
 * Create sidebar element for a landmark
 */
function createSidebarElement(landmark, index) {
  const landmarkElement = document.createElement('div');
  landmarkElement.className = 'landmark-item';
  landmarkElement.dataset.index = index;
  landmarkElement.innerHTML = `
    <div class="landmark-header">
      <div class="landmark-name">${landmark.name}</div>
      ${
        landmark.type ? `<div class="landmark-type">${landmark.type}</div>` : ''
      }
    </div>
    ${landmark.loc ? `<div class="landmark-address">${landmark.loc}</div>` : ''}
    ${
      landmark.desc
        ? `<div class="landmark-summary">${landmark.desc}</div>`
        : ''
    }
    <div class="landmark-photo-container"></div>
    ${
      landmark.name2
        ? `<div class="landmark-address">${landmark.name2}</div>`
        : ''
    }
  `;
  landmarksList.appendChild(landmarkElement);
  return landmarkElement;
}

/**
 * Highlight marker and corresponding sidebar item
 */
function highlightMarkerAndSidebar(index) {
  // Remove active class from all markers and sidebar items
  for (const marker of landMarkers) {
    const markerElement = marker.content.querySelector('.marker-element');
    if (markerElement) {
      markerElement.classList.remove('active-marker');
    }
  }

  document.querySelectorAll('.landmark-item').forEach((item) => {
    item.classList.remove('active-landmark');
  });

  // Add active class to current marker and sidebar item
  const markerElement =
    landMarkers[index].content.querySelector('.marker-element');
  if (markerElement) {
    markerElement.classList.add('active-marker');
  }

  landmarkSidebar.classList.remove('hidden');
  const sidebarItem = document.querySelector(
    `.landmark-item[data-index="${index}"]`
  );
  if (sidebarItem) {
    sidebarItem.classList.add('active-landmark');
    sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

const screenWidthThreshold = 500; // The screen width below which is narrow
const isNarrowScreen = window.innerWidth < screenWidthThreshold;

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
    infoWindows.forEach((iw) => iw.close());
    infoWindow.open({
      anchor: markerView,
      map: map,
    });
    map.panTo(position);

    if (isNarrowScreen) {
      landmarkSidebar.classList.add('hidden');
    }

    if (!landmarkSidebar.classList.contains('hidden')) {
      highlightMarkerAndSidebar(index);
    }
  });

  // Sidebar click handler
  const landmarkNameElement = landmarkElement.querySelector('.landmark-name');
  landmarkNameElement.addEventListener('click', () => {
    infoWindows.forEach((iw) => iw.close());
    if (!isNarrowScreen) {
      infoWindow.open({
        anchor: markerView,
        map: map,
      });
    }
    highlightMarkerAndSidebar(index);

    // Pans the map accounting for the sidebar width on narrow screens.
    map.panTo(position);
    if (isNarrowScreen) {
      map.panBy((landmarkSidebar.offsetWidth - window.innerWidth) / 2, 0);
    }
  });
}

/**
 * Clear all markers from the map
 */
export function clearLandMarkers() {
  landMarkers.forEach((marker) => {
    marker.map = null;
  });
  landMarkers.length = 0;
}
