import './style.css'

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
        
        // Add a marker at user's location - using classic marker as fallback
        // if AdvancedMarkerElement is not available
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
          new google.maps.marker.AdvancedMarkerElement({
            position: userLocation,
            map: map,
            title: 'Your Location'
          })
        } else {
          // Fallback to standard marker
          new google.maps.Marker({
            position: userLocation,
            map: map,
            title: 'Your Location'
          })
        }
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

// Make initMap available globally for the callback
window.initMap = initMap;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Google Maps Viewer loading...')
})
