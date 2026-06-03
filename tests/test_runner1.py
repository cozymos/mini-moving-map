#!/usr/bin/env python3
"""
Standalone test script, running direct function testing to verify core
functionalities independently and sequentially as minimal regression.
• Built-in test mode with mock data from config.json
• Online mode returns live API calls from external services

# Test mode enabled: --test-mode (default)
# Test mode enabled: os.environ["TEST_MODE"] = "1"
# Disable Test mode: --online

# Set DEBUG for more detailed output
# Debug log enabled: --debug
# Debug log enabled: os.environ["DEBUG"] = "1"
"""

import os
import sys

# Add the project root directory to the Python path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
)

from utils import config_utils
from services.landmark_service import LandmarkService
from services.location_service import LocationService
from services.llm_service import LLMService
from utils import coord_utils
from components.cache_manager import cache_manager
import logging

logger = logging.getLogger("tester1")


def main():
    config_utils.enable_test_mode()
    config_utils.setup_logging()
    logger.info(f"TEST_MODE: {config_utils.is_test_mode_enabled()} ✅")

    # Initialize services and test them
    location_service = LocationService()
    llm_service = LLMService()
    landmark_service = LandmarkService()

    # Load configuration with test fixtures
    config = config_utils.load_config(force_reload=True)
    if not config or "defaults" not in config or "test_mode" not in config:
        logger.error("Failed to load configuration ❌")
        return False

    # Check if test fixtures are present
    test_fixtures = config.get("test_mode", {}).get("test_landmarks", [])
    if len(test_fixtures) == 0:
        logger.error("No test fixtures found in config.json ❌")
        return False
    logger.info("Test fixtures loaded successfully ✅")

    # Check default location
    default_location = config_utils.get_default_location()
    default_lat, default_lon = default_location["lat"], default_location["lon"]
    logger.info(f"🌍 Default location: ({default_lat}, {default_lon}) ✅")
    default_radius = config["defaults"]["search_radius"]

    """
    result = cache_manager.clear_cache()
    if not result:
        logger.error("clear_cache ❌")
        return False
    logger.info("clear_cache ✅")
    """

    # Test location service
    location_data = location_service.get_location_details(
        default_lat, default_lon
    )
    location_name = location_data.get("location_name")
    if not location_name or "unknown" in location_name.lower():
        logger.error("Location service failed to return a location name ❌")
        return False
    logger.info(f"Location service returned: {location_name} ✅")

    coords = location_service.get_location_coord(default_location["name"])
    if not coords or not coord_utils.validate_coords(coords.lat, coords.lon):
        logger.error("Location service failed to return valid coordinates ❌")
        return False
    logger.info(f"Location service returned: {coords.lat}, {coords.lon} ✅")

    # Test LLM service with default location
    landmarks = llm_service.get_landmarks_with_gpt(
        location_data, default_lat, default_lon, default_radius
    )
    if not landmarks:
        logger.error("LLM service failed to return landmarks ❌")
        return False
    logger.info(f"🏛️  LLM service returned {len(landmarks)} landmarks ✅")

    # Run cache manager tests
    cached_ok = cache_manager.cache_landmarks(
        location_name, default_lat, default_lon, default_radius, landmarks
    )
    if not cached_ok:
        logger.error("cache_landmarks failed ❌")
        return False
    logger.info(f"Cached {len(landmarks)} landmarks ✅")
    cached_landmarks = cache_manager.get_cached_landmarks(
        location_name, default_lat, default_lon, default_radius
    )
    if not cached_landmarks or len(cached_landmarks) == 0:
        print("No cached landmarks retrieved ❌")
        return False
    logger.info(f"🔄 Retrieved {len(cached_landmarks)} cached landmarks ✅")

    # Test landmark service
    landmark_data = landmark_service.get_landmark_data(default_lat, default_lon)
    if not landmark_data or not landmark_data.get("landmarks"):
        logger.error("Landmark service failed to return landmark data ❌")
        return False
    logger.info(
        f"📍 Landmark service returned {len(landmark_data.get('landmarks', []))} landmarks"
        + f" for {landmark_data.get('location', 'Unknown')} ✅"
    )

    image_url = landmark_service.get_landmark_image(
        landmark_data["landmarks"][0]["name"]
    )
    if not image_url:
        logger.error("Landmark service failed to return an image URL ❌")
        return False
    logger.info(f"Got image URL: {image_url} ✅")

    loc_data = location_service.text_search_places(default_location["name"])
    if not loc_data:
        logger.error("Text search failed to return location ❌")
        return False
    logger.info(f"🔍 Text search returned location: {loc_data} ✅")

    loc_data = llm_service.query_location_with_gpt(default_location["name"])
    if not loc_data:
        logger.error("LLM service failed to return location ❌")
        return False
    logger.info(f"LLM service returned location: {loc_data} ✅")

    return True


if __name__ == "__main__":
    success = main()
    if not success:
        print("❌ FAIL: Some tests failed! Check the logs for details")
        exit(1)
    else:
        print("✅ PASS: All tests completed successfully")
