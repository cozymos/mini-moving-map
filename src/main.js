import { getLandmarkData } from './services.js';
import { initAuth, isAuthEnabled } from "./auth.js";

// DOM Elements
const mapElement = document.getElementById("map");

// Get the Google Maps API key from environment variables
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
let map = null;
const default_radius = 10000;
const default_zoom = 12;

// Authentication state
let auth = {
  isAuthenticated: false,
  user: null,
};

// Track active landmark markers for cleanup
let activeMarkers = [];
let activeInfoWindows = [];

// Map initialization function - called by Google Maps API once loaded
async function initMap() {
  // Default coordinates (San Francisco)
  const defaultLocation = { lat: 37.7749, lng: -122.4194 };
  const { ColorScheme } = await google.maps.importLibrary("core");

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

    mapId: "f61a40c10abb6e5a61bdfb74", // Adding a map ID for Advanced Markers
  });

  // Set up custom controls
  addLocationControl();
  addLandmarksControl();
}

// Add the location control to the map
function addLocationControl() {
  if (navigator.geolocation) {
    const locationButton = document.createElement("button");
    locationButton.textContent = "📍";
    locationButton.classList.add("control-button");
    locationButton.title = "Find my location";
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(locationButton);

    locationButton.addEventListener("click", () => {
      // Try HTML5 geolocation
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          // Add a marker at user's location - using AdvancedMarkerElement if available
          const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
          new AdvancedMarkerElement({
            position: pos,
            map: map,
            title: "Your Location",
          });

          map.setCenter(pos);
          map.setZoom(default_zoom);
        },
        () => {
          console.log(
            "Geolocation permission denied or failed. Using default location."
          );
        }
      );
    });
  } else {
    console.log(
      "Geolocation is not supported by this browser. Using default location."
    );
  }
}

// Add landmarks search button
function addLandmarksControl() {
  const landmarksButton = document.createElement("button");
  landmarksButton.textContent = "🏛️";
  landmarksButton.classList.add("control-button");
  landmarksButton.title = "Find landmarks";
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(landmarksButton);

  landmarksButton.addEventListener("click", async () => {
    try {
      // Show loading indicator or disable button
      landmarksButton.disabled = true;
      landmarksButton.textContent = "⏳";
      
      const center = map.getCenter();
      const lat = center.lat();
      const lng = center.lng();
      
      // Get landmarks data
      const language = 'en'; // Default to English
      const landmarksData = await getLandmarkData(lat, lng, language);
      
      // Display landmarks on the map
      displayLandmarks(landmarksData);
      
      // Reset button
      landmarksButton.disabled = false;
      landmarksButton.textContent = "🏛️";
    } catch (error) {
      console.error("Error finding landmarks:", error);
      alert("Error finding landmarks. Please try again later.");
      
      // Reset button
      landmarksButton.disabled = false;
      landmarksButton.textContent = "🏛️";
    }
  });
}

// Display landmarks on the map
async function displayLandmarks(landmarksData) {
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

  // Clear existing markers
  clearExistingMarkers();
  
  // Get the map center for placing landmarks if they don't have precise coordinates
  const center = map.getCenter();
  const mapCenter = {
    lat: center.lat(),
    lng: center.lng()
  };
    
  // Check if we have landmarks data in the expected format
  if (landmarksData && landmarksData.landmarks && Array.isArray(landmarksData.landmarks)) {
    // Place landmarks around the center point in a circle if coordinates are missing
    landmarksData.landmarks.forEach((landmark, index) => {
      // Create an info window for the landmark
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="max-width: 250px;">
            <h3>${landmark.name}</h3>
            <p><strong>Type:</strong> ${landmark.type || 'Point of Interest'}</p>
            <p>${landmark.description || 'No description available.'}</p>
          </div>
        `,
      });
      
      // Keep track of info windows
      activeInfoWindows.push(infoWindow);
      
      // Use available coordinates or create position around center
      let position;
      
      if (landmark.lat !== undefined && (landmark.lon !== undefined || landmark.lng !== undefined)) {
        position = {
          lat: landmark.lat,
          lng: landmark.lon || landmark.lng
        };
      } else {
        // Place in a circle around the center
        const angle = (index / landmarksData.landmarks.length) * Math.PI * 2;
        const radius = 0.01; // Approximately 1km
        position = {
          lat: mapCenter.lat + Math.cos(angle) * radius,
          lng: mapCenter.lng + Math.sin(angle) * radius
        };
      }
      
      console.log(`Placing landmark "${landmark.name}" at position:`, position);
      
      let marker;
      // Use AdvancedMarkerElement if available
      if (AdvancedMarkerElement) {
        const markerContent = document.createElement('div');
        markerContent.innerHTML = '🏛️';
        markerContent.style.fontSize = '24px';
        
        marker = new AdvancedMarkerElement({
          position: position,
          map: map,
          title: landmark.name,
          content: markerContent
        });
        
        // Add click listener to open info window
        marker.addListener("click", () => {
          // Close any open info windows
          activeInfoWindows.forEach(window => window.close());
          infoWindow.open({
            anchor: marker,
            map: map
          });
        });
      } else {
        // Fallback to standard marker
        marker = new google.maps.Marker({
          position: position,
          map: map,
          title: landmark.name,
          animation: google.maps.Animation.DROP,
          icon: {
            url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
          }
        });
        
        // Add click listener to open info window
        marker.addListener("click", () => {
          // Close any open info windows
          activeInfoWindows.forEach(window => window.close());
          infoWindow.open(map, marker);
        });
      }
      
      // Open first landmark info window by default
      if (index === 0) {
        setTimeout(() => {
          infoWindow.open({
            anchor: marker,
            map: map
          });
        }, 1000);
      }
      
      // Keep track of markers
      activeMarkers.push(marker);
    });
  } else {
    console.error('Invalid landmarks data format:', landmarksData);
    // Create a fallback marker at the center to show something happened
    const noResultsMarker = document.createElement('div');
    noResultsMarker.innerHTML = '❓';
    noResultsMarker.style.fontSize = '24px';
    
    const marker = AdvancedMarkerElement ? 
      new AdvancedMarkerElement({
        position: mapCenter,
        map: map,
        title: 'No landmarks found',
        content: noResultsMarker
      }) : 
      new google.maps.Marker({
        position: mapCenter,
        map: map,
        title: 'No landmarks found',
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
        }
      });
    
    activeMarkers.push(marker);
    
    // Create an info window to explain no results
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="max-width: 250px;">
          <h3>No landmarks found</h3>
          <p>Could not find landmark information for this location.</p>
        </div>
      `,
    });
    
    infoWindow.open(map, marker);
    activeInfoWindows.push(infoWindow);
  }
}

// Clear existing markers and info windows
function clearExistingMarkers() {
  // Clear markers
  activeMarkers.forEach(marker => {
    marker.map = null;
  });
  activeMarkers = [];
  
  // Close and clear info windows
  activeInfoWindows.forEach(window => {
    window.close();
  });
  activeInfoWindows = [];
}
// Load Google Maps API dynamically
function loadGoogleMapsAPI() {
  // Create script element
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMap&loading=async`;

  // Make initMap available globally for the callback
  window.initMap = initMap;

  // Add the script to the document
  document.head.appendChild(script);
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Google Maps Viewer loading...");

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Google Maps API key not found.");
    return;
  }

  // Initialize auth if needed
  if (isAuthEnabled()) {
    try {
      auth = await initAuth();
      console.log(
        "Auth status:",
        auth.isAuthenticated ? "Authenticated" : "Not authenticated"
      );
    } catch (error) {
      console.error("Auth initialization error:", error);
    }
  } else {
    console.log("Auth is disabled for local development");
    auth.isAuthenticated = true; // Auto-authenticated in local development
  }

  // Load Google Maps API
  loadGoogleMapsAPI();
});
