import { i18n } from './lion.js';

class LandmarkService {
  constructor() {
    this.lastCacheStat = null;
  }

  async get_landmark_data(lat, lon, radius_km, last_result) {
    const backend_url = `/api/landmark/search`;
    const requestData = {
      lat: lat,
      lon: lon,
      radius: radius_km,
      locale: i18n.userLocale,
    };

    if (last_result?.landmarks) {
      requestData.last_result = last_result.landmarks;
    }
    console.debug(`Fetching ${backend_url}:`, requestData);

    // Make API request to backend with POST method
    const response = await fetch(`${backend_url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    return await response.json();
  }

  async cacheImages(imagesToCache) {
    if (imagesToCache.length > 0) {
      try {
        const response = await fetch('/api/landmark/cache-images', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(imagesToCache),
        });

        if (response.ok) {
          const result = await response.json();
          console.log(
            `Cached ${result.cached_count} images, ${result.failed_count} failed`
          );
        } else {
          console.warn('Failed to cache images:', response.status);
        }
      } catch (error) {
        console.error('Error caching images:', error);
      }
    }
  }

  async updateStatus() {
    const response = await fetch(`/api/landmark/status`);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }
    const statusData = await response.json();
    if (statusData?.cache_stat) {
      console.debug('Status update:', statusData);
      if (this.lastCacheStat === null) {
        this.lastCacheStat = statusData.cache_stat;
      } else if (
        // Check if processing is complete
        statusData.cache_stat?.cache > this.lastCacheStat?.cache ||
        statusData.cache_stat?.gpt > this.lastCacheStat?.gpt
      ) {
        this.lastCacheStat = null;
        return true;
      }
    }
    return false;
  }

  async queryLocation(query, lat, lon, use_gpt = false) {
    if (!query || !query.trim())
      return {
        location: '',
        landmarks: [],
        error: i18n.t('errors.invalid_search_query'),
      };

    let backend_url = `/api/landmark/location?query=${encodeURIComponent(
      query
    )}&use_gpt=${use_gpt}`;
    if (lat && lon) backend_url += `&lat=${lat}&lon=${lon}`;
    backend_url += `&locale=${i18n.userLocale}`;
    console.debug(`loc-query: ${backend_url}`);
    const response = await fetch(`${backend_url}`);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    return await response.json();
  }
}

export const landmarkService = new LandmarkService();
