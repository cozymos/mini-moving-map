# Overview

Map Explorer is a minimalist Google Maps application that combines AI-powered landmark discovery with 3D exploration features. The application allows users to search for locations, discover nearby landmarks using OpenAI's GPT models, and explore them in photorealistic 3D maps. It features intelligent caching, multi-source data aggregation from Google Places API and Wikipedia, and localized content based on geographic location.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The application uses a vanilla JavaScript architecture with Vite as the build tool. The codebase is organized into modular components:

- **Main Application (`app.js`)**: Initializes Google Maps and coordinates between components
- **Search Module (`search.js`)**: Handles location searches and landmark discovery
- **Landmark Module (`landmark.js`)**: Manages landmark display, markers, and 3D overlays
- **Backend Service (`backend.js`)**: Orchestrates data retrieval from multiple sources
- **Caching System (`cache.js`)**: Browser-based localStorage caching with proximity keys
- **Components (`components.js`)**: Reusable UI components and notifications

## Map Integration
The application integrates with Google Maps JavaScript API including the 3D Maps library for photorealistic rendering. Map functionality is abstracted through a `mapInterface` that provides:
- Map initialization and control
- Marker placement and management
- 3D view transitions
- Location-based operations

## AI Integration Pattern
The system implements a "3-3-3" Multi-Source Aggregation approach:
1. Display first 3 landmarks from popularity-based Google Places results
2. Use OpenAI to select top 3 landmarks from the full Places results
3. Generate 3 additional landmarks outside the Places results using AI
4. Cache all 6 AI-enhanced responses

## Caching Strategy
The caching system uses proximity-based keys with coordinate rounding to optimize performance:
- **Key Generation**: Coordinates rounded to 1 decimal place with search radius
- **TTL Management**: 48-hour expiration with automatic cleanup
- **Location Matching**: Finds cached results within geographic proximity
- **Cache Validation**: Checks for similar landmark sets to avoid redundant requests

## Data Flow Architecture
1. **Location Input**: User geolocation, search queries, or URL parameters
2. **Cache Lookup**: Check for existing data using proximity-based keys
3. **API Orchestration**: Coordinate calls to Google Places, OpenAI, and Wikipedia
4. **Data Enhancement**: AI selects and describes landmarks with localized content
5. **Display Rendering**: Show results on map with markers and sidebar information

## Localization System
The application includes intelligent language detection based on geographic location:
- **Country Detection**: Uses Google Geocoding to identify country from coordinates
- **Language Mapping**: Maps countries to appropriate language codes (supports Chinese variants)
- **Content Adaptation**: AI responses and landmark descriptions adapt to local language

## State Management
The application manages state through:
- **Map State**: Current center, zoom level, and active landmarks
- **Search State**: Last search results and location history
- **Cache State**: Stored landmark data with proximity indexing
- **UI State**: Sidebar visibility, loading states, and active markers

# External Dependencies

## Google Maps Platform
- **Google Maps JavaScript API**: Core mapping functionality and 3D photorealistic rendering
- **Google Places API**: Location search and nearby places discovery for landmark identification
- **Google Geocoding API**: Reverse geocoding for location details and country identification

## AI Services
- **OpenAI API**: GPT models for landmark selection, description generation, and intelligent filtering of search results

## Wikipedia Integration
- **Wikipedia API**: Retrieves landmark images and additional information to enhance visual presentation

## Development Tools
- **Vite**: Build tool and development server with hot reload capabilities
- **ESLint**: Code linting and quality enforcement
- **Node.js**: Development environment and package management

## Browser APIs
- **Geolocation API**: User location detection for location-based searches
- **localStorage**: Client-side caching for landmark data and user preferences
- **Fetch API**: HTTP requests to external services and APIs

## Configuration Management
The application uses JSON-based configuration files for:
- **Default Settings**: Map center, zoom levels, and search parameters
- **Test Data**: Mock landmarks for development and testing
- **API Endpoints**: Service URLs and request parameters
- **Prompt Templates**: AI prompt templates for different use cases