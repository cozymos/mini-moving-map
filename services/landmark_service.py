from typing import Dict, Any, Optional
from components.cache_manager import cache_manager
from services.llm_service import LLMService
from services.location_service import LocationService
from services.image_service import ImageService
from utils import coord_utils, config_utils, lion
import threading
import traceback
import logging

logger = logging.getLogger("land")


class LandmarkService:
    """
    Service for providing information about landmarks near a specified location.
    """

    def __init__(self):
        self._running = threading.Event()

    def get_landmark_data(
        self,
        lat: float,
        lon: float,
        radius_km: int = 15,
        last_result: list = [],
        locale: Optional[str] = None,
    ) -> Dict[str, Any]:
        def same_landmarks(new_landmarks, last_landmarks, limit=None):
            """
            Checks overlap count between new_landmarks and last_landmarks.
            If limit is None, returns True if all new_landmarks exist in last_landmarks.
            If limit is set, returns True if number of matches > limit.
            """
            if not new_landmarks or not last_landmarks:
                return False
            count = 0
            for new_item in new_landmarks:
                found = any(
                    new_item["name"] == last_item["name"]
                    for last_item in last_landmarks
                )
                if found:
                    count += 1
            if limit is None:
                return count == len(new_landmarks)  # all must match
            return count > limit

        if not coord_utils.validate_coords(lat, lon):
            err_msg = f"Invalid coordinates: lat={lat}, lon={lon}"
            logger.warning(err_msg)
            return {
                "location": "Unknown Location",
                "landmarks": [],
                "error": err_msg,
            }

        if config_utils.is_test_mode_enabled():
            logger.info("Using test landmarks (test mode enabled)")

            # Get test landmarks from config
            test_landmarks = config_utils.load_config()["test_mode"][
                "test_landmarks"
            ]
            return {
                "location": config_utils.get_default_location(),
                "coordinates": [lat, lon],
                "landmarks": test_landmarks,
                "cache_type": "test_mode",
            }

        try:
            self.lat = lat
            self.lon = lon
            self.radius_km = radius_km
            self.places = []
            self.location_data = LocationService.get_location_details(lat, lon)
            location_name = self.location_data.get("location_name", "").strip()
            if not location_name or "unknown" in location_name.lower():
                logger.warning(
                    f"Could not resolve location name for ({lat}, {lon})"
                )
                return {
                    "location": "Unknown Location",
                    "coordinates": [lat, lon],
                    "landmarks": [],
                }

            self.locale = lion.get_country_language(
                {
                    "name": self.location_data.get("country"),
                    "code": self.location_data.get("country_code"),
                },
                locale=locale or "en",
            )

            logger.info(
                f"Getting landmark data at [{lat}, {lon}] within {radius_km} km"
            )

            # First try proximity-based coordinate cache
            by_proximity = cache_manager.get_cached_landmarks(
                "", lat, lon, radius_km
            )
            if by_proximity and not same_landmarks(by_proximity, last_result):
                return {
                    "location": location_name,
                    "coordinates": [lat, lon],
                    "landmarks": by_proximity,
                    "cache_type": "by_proximity",
                }

            # Next try exact location matches
            by_location = cache_manager.find_by_location(
                location_name, lat, lon, radius_km
            )
            if by_location and not same_landmarks(by_location, last_result):
                return {
                    "location": location_name,
                    "coordinates": [lat, lon],
                    "landmarks": by_location,
                    "cache_type": "by_location",
                }

            # then by multi-tier landmark lookup
            by_lookup = cache_manager.lookup_landmark(
                location_name, lat, lon, radius_km
            )
            if (
                by_lookup
                and not same_landmarks(by_lookup, last_result)
                and len(by_lookup) >= 3
            ):
                logger.info(
                    f"Looked up {len(by_lookup)} landmarks for: {location_name} within {radius_km} km"
                )
                cache_manager.cache_landmarks(
                    location_name, lat, lon, radius_km, by_lookup
                )
                return {
                    "location": location_name,
                    "coordinates": [lat, lon],
                    "landmarks": by_lookup,
                    "cache_type": "by_lookup",
                }

            logger.debug(
                f"Which country: {self.location_data.get('country')} > locale: {self.locale}"
            )

            cache_type = "nearby_places"
            self.places = LocationService.search_nearby_places(
                lat, lon, radius_km, 10, self.locale
            )
            if (
                not self.places
                or len(self.places) < 3
                or same_landmarks(self.places, last_result, 4)
            ):
                landmarks = LLMService.get_landmarks_with_gpt(
                    self.location_data, lat, lon, radius_km, self.locale
                )
                cache_manager.cache_landmarks(
                    location_name, lat, lon, radius_km, landmarks
                )
                config_utils.update_cache_stats(gpt=len(landmarks))
                cache_type = "with_gpt"
            else:
                if self._running.is_set():
                    logger.warning(
                        "Skipping selection Thread (already running)"
                    )
                else:
                    self._running.set()
                    thread = threading.Thread(
                        target=self.landmark_selection_thread
                    )
                    thread.daemon = True
                    thread.start()

                landmarks = self.places[:5]

            return {
                "location": location_name,
                "coordinates": [lat, lon],
                "landmarks": landmarks,
                "cache_type": cache_type,
                "cache_stat": config_utils.CACHE_STATS,
            }

        except Exception as e:
            logger.error(f"Error getting landmark data: {str(e)}")
            logger.debug(f"Error details: {traceback.format_exc()}")

            # Return a graceful failure response
            return {
                "location": "Error occurred",
                "coordinates": [lat, lon],
                "landmarks": [],
                "error": f"An unexpected error occurred: {str(e)}",
            }

    def landmark_selection_thread(self):
        try:
            landmarks = LLMService.select_landmarks_with_gpt(
                self.location_data,
                self.places,
                self.lat,
                self.lon,
                self.radius_km,
                self.locale,
            )
            cache_manager.cache_landmarks(
                self.location_data["location_name"],
                self.lat,
                self.lon,
                self.radius_km,
                landmarks,
                force_cache=True,
            )
            config_utils.update_cache_stats(gpt=len(landmarks))
        finally:
            self._running.clear()

    def search_location(
        self,
        query: str,
        lat: Optional[float],
        lon: Optional[float],
        locale: Optional[str],
        use_gpt: bool = False,
    ) -> Dict[str, Any]:
        """
        Search for a location using text search or query a LLM

        Args:
            query (str): The search query text
            locale (str, optional): Language code for the API request
            use_gpt (bool, optional): Whether to use GPT for location query

        Returns:
            Dict[str, Any]: Dictionary containing location and landmark data
        """
        if not query or not query.strip():
            return {
                "location": "",
                "landmarks": [],
                "error": "Please enter a valid search query",
            }

        if not locale:
            locale = "en"

        try:
            if use_gpt:
                if lat is not None and lon is not None:
                    location_data = LocationService.get_location_details(
                        lat, lon
                    )
                    locale = lion.get_country_language(
                        {
                            "name": location_data.get("country"),
                            "code": location_data.get("country_code"),
                        },
                        locale=locale,
                    )

                loc_data = LLMService.query_location_with_gpt(query, locale)
                if loc_data:
                    return {
                        "location": loc_data.get("name", query),
                        "coordinates": [
                            loc_data.get("lat", 0),
                            loc_data.get("lon", 0),
                        ],
                        "landmarks": [loc_data],
                    }
            else:
                places = LocationService.text_search_places(query)
                if places:
                    return {
                        "location": places[0]["name"],
                        "coordinates": [places[0]["lat"], places[0]["lon"]],
                        "landmarks": places,
                    }

            # Common error response for both paths
            return {
                "location": query,
                "landmarks": [],
                "error": f'Location not found for "{query}"',
            }

        except Exception as e:
            logger.error(f"Error in search_location: {str(e)}")
            logger.debug(f"Error details: {traceback.format_exc()}")
            return {
                "location": query,
                "landmarks": [],
                "error": f'Error searching for "{query}": {str(e)}',
            }

    @staticmethod
    def get_landmark_image(landmark_name: str) -> Optional[str]:
        """Get an image URL for a landmark, using cache when possible."""
        image_url = cache_manager.get_cached_image(landmark_name)
        if image_url is None:
            image_url = ImageService.get_wiki_imageurl(landmark_name)
            if image_url is not None:
                cache_manager.cache_image(landmark_name, image_url)
        return image_url
