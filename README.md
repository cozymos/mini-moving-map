# Map Explorer

A minimalist Google Maps application with AI-powered landmark discovery and 3D exploration experience.

## Features

- **Landmark Discovery**: Google Places nearby search + OpenAI landmark query + Wikipedia images
- **Location Search**: Google Places text search + OpenAI location query + User Geolocation
- **Photorealistic 3D Maps**: Google Earth style 3D navigation + Cinematic flyover for each landmarks
- **World ready**: LLM content and auto-update UI translation follows browser language setting
- **Moving Map**: MSFS (Microsoft Flight Simulator) integration for aircraft marker tracking effect

### Technical Highlights

- **Frontend:** Map integration, landmark visualization, location navigation, browser-side caching and test runner
- **Backend:** Flask API connecting to MSFS via SimConnect proxy to fetch real-time aircraft telemetry
- **LLM:** OpenAI selects landmarks from Google Places search results, generates descriptions, look up Wiki images, and adapts language based on location's country.
- **Caching:** Proximity-based keys with coordinate rounding + location matching + search radius + TTL expiration
- **Multi-Sources:** Google Places API (nearby search) + Wikipedia API (images) + OpenAI API (landmark info)
- **User interaction:** location geocoding → multi-tier cache lookup → landmark discovery (Google Places + OpenAI) → multi-pass searches
- **Auto Translation:** Support JSON resource, string changes detection, local TM, secondary locale for multi-lingual users
- **Configuration:** Map defaults, test mode mock data on `config.json`, LLM prompt templates on `prompts.js`

### External Services

- **Google Maps API**: Core mapping functionality with 3D support
- **Google Places API**: Location search and nearby places discovery
- **OpenAI API**: LLM generated translations and landmark information
- **Wikipedia API**: Landmark and location images

### Vanilla JavaScript Frontend with Vite
```
src/
├── app.js          # Init Google Maps application
├── search.js       # Location and landmark search
├── landmark.js     # Landmark display, markers, and 3D overlays
├── gmap.js         # Google Maps API wrappers
├── openai.js       # OpenAI prompting
├── prompts.js      # LLM Prompt templates
├── lion.js         # i18n/L10n with auto-translations
├── cache.js        # On-browser localStorage caching
├── components.js   # reusable UI components
├── simconnect.js   # connect to MSFS via SimConnect
└── test_runner.js  # Client-side testing
```

## Get Started

1. **Install prerequisites**
   - Install Node.js (https://nodejs.org/).
   - Clone this repository and install dependencies (see `package.json`)

```bash
git clone <repository-url>
cd <my-project>
npm install
```

2. **Create environment file**

   Create your own `.env` file and add your API keys for local development. Vite exposes variables prefixed with `VITE_` to the browser app via `index.html`.

```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_OPENAI_API_KEY=your_openai_api_key
```

3. **Generate API keys**

   - **Google Maps API Key**
     1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
     2. Create or select a project.
     3. Enable “Maps JavaScript API” and “Places API (New)” in the API library.
     4. Create an API key under **APIs & Services → Credentials**.
     5. For local development restrict referrers to `localhost`.

   - **OpenAI API Key**
     1. Visit the [OpenAI dashboard](https://platform.openai.com/account/api-keys).
     2. Create a new secret key and copy it for later use; it won't be shown again.

4. **Start the development server**

```bash
npm run dev
```

5. **Enter API keys in the app**

   - Open `http://localhost:5173` in your browser.
   - Click the gear icon (**⚙️ Settings**) in the bottom‑left corner.
   - Fill in `GOOGLE_MAPS_API_KEY` and `OPENAI_API_KEY`, then close to save.
   - Settings are stored in `localStorage` under `APP_SETTINGS`; landmark caches use keys starting with `landmark_`.
   - In Chrome, view them under DevTools → Application → Local Storage.

6. **Start server proxy for MSFS "moving map**

```bash
python server.py
```

## Usage

- Pan and zoom the Google map. Use the **🔍 search box** to jump to a city or location.
- Click **🏛️ Landmarks** to fetch nearby points of interest around the map center.
- Select a landmark card to read the AI-generated description and see a photo.
- For 3D views, click **[3D]** in the card to explore a photorealistic flyover.
- Use **📍 My Location** to center the map on your current position.
- Open the gear icon (**⚙️ Settings**) to update API keys or clear stored values.
- Click **🌐 Locale** to toggle preferred locales per browser language setting.
- When connected to MSFS, click **aircraft ✈️** icon to sync aircraft position.

### Testing

- Frontend Test Runner - standalone test script running direct function testing
- Built-in test mode with mock data from config.json, skipping API calls
- Runnable on both browser console and Node.js CLI via `npm test`
- Append `?test=true` to the URL to run tests on-browser

### MIT License - see [LICENSE](LICENSE) for details.

Please respect Google Maps and OpenAI terms of service.
