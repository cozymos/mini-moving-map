import "./style.css";

// Get the Google Maps API key from environment variables
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const default_radius = 10000;
const default_zoom = 12;

// Map initialization function - called by Google Maps API once loaded
async function initMap() {
  // Default coordinates (San Francisco)
  const defaultLocation = { lat: 37.7749, lng: -122.4194 };
  const {ColorScheme} = await google.maps.importLibrary("core")


  // Create the map instance with a modern and clean style
  const map = new google.maps.Map(document.getElementById("map"), {
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
      //style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
      // default mapTypeIds: ["roadmap", "terrain", "satellite", "hybrid"],
    },
    cameraControl: false,
    streetViewControl: true,
    scaleControl: true,
    rotateControl: true,

    // Style the map with a clean, minimal look
    styles: [
      {
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
      },
      {
        featureType: "transit",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
      },
    ],
  });

  // Try to get user's location if they allow geolocation
  if (navigator.geolocation) {
    const locationButton = document.createElement("button");
    locationButton.textContent = "📍";
    locationButton.classList.add("control-button");
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(locationButton);

    locationButton.addEventListener("click", () => {
      // Try HTML5 geolocation
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          // Add a marker at user's location - using classic marker as fallback
          // if AdvancedMarkerElement is not available
          if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
            new google.maps.marker.AdvancedMarkerElement({
              position: userLocation,
              map: map,
              title: "Your Location",
            });
          } else {
            // Fallback to standard marker
            new google.maps.Marker({
              position: pos,
              map: map,
              title: "Your Location",
            });

            map.setCenter(pos);
          }
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
document.addEventListener("DOMContentLoaded", () => {
  console.log("Google Maps Viewer loading...");
  loadGoogleMapsAPI();
});
