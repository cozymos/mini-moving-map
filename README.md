# Google Maps Viewer

A minimalist full-screen Google Maps application built with vanilla JavaScript and Vite.

## Features

- Full-screen Google Maps integration
- Geolocation detection (finds and centers on user's location)
- Landmark discovery powered by OpenAI's GPT-4o-mini model
- Modern UI with clean styling
- Responsive design that works on all devices
- No frameworks or libraries - pure vanilla JavaScript
- Fast development server with Hot Module Replacement (HMR)

## Technologies Used

- **Vanilla JavaScript** - No frameworks or libraries
- **Google Maps JavaScript API** - For mapping functionality
- **Google Geocoding API** - For reverse geocoding coordinates to location names
- **OpenAI API** - For intelligent landmark discovery
- **Vite** - For development server and build optimization
- **HTML5 Geolocation API** - For user location detection

## Getting Started

### Prerequisites

- Node.js installed on your machine
- A Google Maps API key with Maps JavaScript API and Geocoding API enabled
- An OpenAI API key

### Installation

```bash
# Clone the repository
git clone <repository-url>

# Navigate to the project directory
cd google-maps-viewer

# Install dependencies
npm install

# Start the development server
npm run dev
```

## Environment Variables

The application requires the following environment variables:

- `VITE_GOOGLE_MAPS_API_KEY` - Your Google Maps API key (with Geocoding API enabled)
- `VITE_OPENAI_API_KEY` - Your OpenAI API key

## Usage

- The map will center on your current location if you allow location permissions
- If location access is denied, it defaults to San Francisco
- Navigate the map using standard Google Maps controls
- Click the "📍" button to center the map on your current location
- Click the "🏛️" button to discover the top 3 landmarks near the current map location

## Build for Production

```bash
# Generate production build
npm run build

# Preview production build
npm run preview
```
