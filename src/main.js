import './style.css'

// Map initialization function
function initMap() {
  // Default coordinates (San Francisco)
  const defaultLocation = { lat: 37.7749, lng: -122.4194 }
  
  // Create the map instance
  const map = new google.maps.Map(document.getElementById('map'), {
    center: defaultLocation,
    zoom: 12,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    fullscreenControl: true,
    mapTypeControl: true,
    streetViewControl: true,
    zoomControl: true
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
        new google.maps.marker.AdvancedMarkerElement({
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

// Make initMap available globally for the callback
window.initMap = initMap;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Google Maps Viewer loading...')
})
