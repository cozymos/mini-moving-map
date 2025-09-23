import {
  selectLandmarksWithGPT,
  getLandmarksWithGPT,
  queryLocationWithGPT,
} from './openai.js';
import {
  getLocationDetails,
  PlaceNearbySearch,
  PlaceTextSearch,
} from './gmap.js';
import { setCachedLandmarks, findByLocation } from './cache.js';
import { same_landmarks } from './utils.js';
import { getCountryLanguage } from './lion.js';

class LandmarkService {
  constructor() {
    this.running = false;
  }

  async get_landmark_data(lat, lon, radius_km, last_result) {
    // Get country information from coordinates of current location
    const locationData = await getLocationDetails(lat, lon);
    const locale = getCountryLanguage(
      locationData.country,
      locationData.countryCode
    );
    console.debug(
      `Which country: ${locationData.country} > userLocale: ${locale}`
    );

    let landmarkData = findByLocation(
      locationData.locationName,
      lat,
      lon,
      radius_km,
      last_result
    );
    if (landmarkData?.landmarks?.length > 0) return landmarkData;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('gmp')) {
      landmarkData = await PlaceNearbySearch(lat, lon, radius_km, 10, locale);
    } else if (urlParams.has('gpt')) {
      landmarkData = await getLandmarksWithGPT(
        locationData,
        lat,
        lon,
        radius_km,
        locale
      );
    }
    if (landmarkData?.landmarks?.length > 0) return landmarkData;

    landmarkData = await PlaceNearbySearch(lat, lon, radius_km, 10, locale);
    if (
      landmarkData?.landmarks?.length < 3 ||
      same_landmarks(landmarkData?.landmarks, last_result?.landmarks, 4)
    ) {
      landmarkData = await getLandmarksWithGPT(
        locationData,
        lat,
        lon,
        radius_km,
        locale
      );
    } else {
      this.locationData = locationData;
      this.places = landmarkData?.landmarks;
      this.lat = lat;
      this.lon = lon;
      this.radius_km = radius_km;
      this.locale = locale;
    }

    return landmarkData;
  }

  async cacheImages() {}

  async updateStatus() {
    if (this.running) return false; // avoid concurrent runs

    this.running = true;
    const landmarkData = await selectLandmarksWithGPT(
      this.locationData,
      this.places,
      this.lat,
      this.lon,
      this.radius_km,
      this.locale
    );
    setCachedLandmarks(this.lat, this.lon, this.radius_km, landmarkData);
    this.running = false;
    return true;
  }

  async queryLocation(query, lat, lon, use_gpt = false) {
    if (!query || !query.trim())
      return {
        location: '',
        landmarks: [],
        error: 'Please enter a valid search query',
      };

    // Get location details from coordinates
    const locationData = await getLocationDetails(lat, lon);
    const locale = getCountryLanguage(
      locationData.country,
      locationData.countryCode
    );
    console.debug(
      `Which country: ${locationData.country} > userLocale: ${locale}`
    );

    let locData = null;
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('gmp') && (use_gpt || urlParams.has('gpt'))) {
      locData = await queryLocationWithGPT(query, locale);
    } else {
      locData = await PlaceTextSearch(query, locale);
    }

    return locData;
  }
}

export const landmarkService = new LandmarkService();
