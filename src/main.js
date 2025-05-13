import './style.css'

// Get the Google Maps API key from environment variables
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Map initialization function - called by Google Maps API once loaded
async function initMap() {
  // Default coordinates (San Francisco)
  const defaultLocation = { lat: 37.7749, lng: -122.4194 }
  
  // Create the map instance with a modern and clean style
  const map = new google.maps.Map(document.getElementById('map'), {
    center: defaultLocation,
    zoom: 13,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    
    // UI controls
    fullscreenControl: true,
    mapTypeControl: true,
    streetViewControl: true,
    zoomControl: true,
    
    // Style the map with a clean, minimal look
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      },
      {
        featureType: 'transit',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ]
  })
  
  // Try to get user's location if they allow geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }
        
        // Center the map on user's location
        map.setCenter(userLocation)
        
        // Add a marker at user's location
        new google.maps.Marker({
          position: userLocation,
          map: map,
          title: 'Your Location'
        })
      },
      // If user denies geolocation or it fails, keep default location
      () => {
        console.log('Geolocation permission denied or failed. Using default location.')
      }
    )
  } else {
    console.log('Geolocation is not supported by this browser. Using default location.')
  }
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
document.addEventListener('DOMContentLoaded', () => {
  console.log('Google Maps Viewer loading...');
  loadGoogleMapsAPI();
})
