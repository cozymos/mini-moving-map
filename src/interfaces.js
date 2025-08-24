export { landmarkService } from './backend.js';
import { getSettings } from './utils.js';

export function isTestMode() {
  if (!window.TEST_MODE)
    // vite --mode test
    window.TEST_MODE = import.meta.env && import.meta.env.MODE === 'test';
  return window.TEST_MODE;
}

export function enableTestMode(flag) {
  window.TEST_MODE = flag;
}

export function getGoogleMapsApiKey() {
  if (!window.APP_CONFIG?.GOOGLE_MAPS_API_KEY) {
    window.APP_CONFIG.GOOGLE_MAPS_API_KEY =
      getSettings()['GOOGLE_MAPS_API_KEY'];
  }

  return window.APP_CONFIG.GOOGLE_MAPS_API_KEY;
}

export function getOpenaiApiKey() {
  if (!window.APP_CONFIG?.OPENAI_API_KEY) {
    window.APP_CONFIG.OPENAI_API_KEY = getSettings()['OPENAI_API_KEY'];
  }

  return window.APP_CONFIG.OPENAI_API_KEY;
}

class MapInterface {
  constructor() {
    console.log(
      `${
        import.meta.env ? import.meta.env.MODE : 'server'
      } mode: Google Maps loading...`
    );
    this.mapFns = {
      getMapCenter: () => ({ lat: 0, lng: 0 }),
      mapPanTo: () => {},
      displayLandmarks: async () => {},
      clearLandMarkers: () => {},
    };
  }

  setMapInterface(functions) {
    this.mapFns = { ...this.mapFns, ...functions };
  }

  getMapCenter(...args) {
    return this.mapFns.getMapCenter(...args);
  }

  mapPanTo(...args) {
    return this.mapFns.mapPanTo(...args);
  }

  async displayLandmarks(...args) {
    return await this.mapFns.displayLandmarks(...args);
  }

  clearLandMarkers(...args) {
    return this.mapFns.clearLandMarkers(...args);
  }
}

export const mapInterface = new MapInterface();
