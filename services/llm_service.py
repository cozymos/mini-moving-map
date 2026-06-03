from openai import OpenAI
import json
import os
from typing import Optional, List, Dict, Any, Tuple
from utils import coord_utils
from utils import config_utils
from utils.prompt_utils import get_prompt, get_system_message
from services.location_service import LocationService
import traceback
import logging

logger = logging.getLogger("llm")


def get_model_config() -> Tuple[str, float]:
    config = config_utils.load_config().get("defaults", {})
    model = config.get("openai_model", "gpt-4.1-nano")
    temperature = config.get("openai_temperature", 0.1)
    return model, temperature


class LLMService:
    """
    Service for handling Large Language Model (LLM)
    """

    @staticmethod
    def translate_json_resource(
        source_json: Dict[str, Any] | str,
        source_locale: str = "en",
        target_locale: str = "zh-HK",
    ) -> Optional[Dict[str, Any]]:
        """
        Translate a nested JSON resource bundle while preserving shape and placeholders.
        """
        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning(
                "No OpenAI API key found in env, skipping JSON resource translation"
            )
            return None

        source_strings = (
            source_json
            if isinstance(source_json, str)
            else json.dumps(source_json, ensure_ascii=False, indent=2)
        )

        try:
            prompt = get_prompt(
                "translations.json_resource",
                source_lang=source_locale,
                target_lang=target_locale,
                source_strings=source_strings,
            )
            system_message = get_system_message("translator")
            if not prompt or not system_message:
                logger.error("Failed to load translation prompt templates")
                return None

            model, temperature = get_model_config()
            logger.info(
                "Translating JSON resource from %s to %s with %s (t=%s)",
                source_locale,
                target_locale,
                model,
                temperature,
            )

            response = OpenAI().chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            if not content:
                logger.warning("No translation content returned from %s", model)
                return None

            translated = json.loads(content)
            return translated if isinstance(translated, dict) else None

        except Exception as e:
            logger.error("Error translating JSON resource: %s", str(e))
            logger.debug("Error details: %s", traceback.format_exc())
            return None

    # Implement a hydrid '3-3-3' Multi-Source Aggregation Cache:
    # 1. show [first 3] from 10x list {places_a}, which is popularity-based
    # 2. prompt LLM to pick [top 3] from places_a
    # 3. prompt LLM to generate [additional 3] outside of places_a
    # 4. cache 6x LLM responses
    @staticmethod
    def select_landmarks_with_gpt(
        location_data: Dict[str, Any],
        place_list: List[Dict[str, Any]],
        lat: float,
        lon: float,
        radius_km: int,
        locale: str,
    ) -> List[Dict[str, Any]]:
        """
        Select landmark data using OpenAI's API

        Args:
            lat: Latitude
            lon: Longitude
            radius_km: Search radius in kilometers

        Returns:
            List of landmark dictionaries
        """
        # Check if OpenAI API key is available
        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning(
                "No OpenAI API key found in env, skipping landmark discovery with GPT"
            )
            return []

        if not location_data or not place_list or len(place_list) == 0:
            logger.error("No landmarks found (no input data)")
            return []

        try:
            # convert list of places into a lookup table keyed by name
            place_names = {place["name"]: place for place in place_list}

            # Get prompt from template
            prompt = get_prompt(
                "landmarks.selector",
                places_a="\n".join(place_names.keys()),
                locale=locale,
            )

            # Get system message from template
            system_message = get_system_message("landmark_specialist")

            # Check if prompts loaded successfully
            if not prompt or not system_message:
                logger.error("Failed to load prompt templates")
                return []

            # Initialize OpenAI client and request completion
            client = OpenAI()
            model, temperature = get_model_config()
            logger.info(
                f"Selecting from {len(place_list)} places nearby {location_data['location_name']} by {model} (t={temperature}) in {locale}"
            )

            response = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )

            # Extract and parse JSON from response
            content = response.choices[0].message.content
            if not content:
                logger.warning(f"No response content returned from {model}")
                return []

            json_data = json.loads(content)
            landmarks_json = json_data.get("landmarks", [])
            if not landmarks_json:
                logger.warning(
                    f"No landmarks found or invalid JSON response from {model}"
                )
                return []

            # Process the landmarks
            landmarks = []
            for i, item in enumerate(landmarks_json):
                if not isinstance(item, dict) or not (
                    landmark_name := item.get("name", "").strip()
                ):
                    continue

                landmark_lat = item.get("lat", lat)
                landmark_lon = item.get("lon", lon)
                if same_place := place_names.get(landmark_name):
                    landmark_lat = same_place["lat"]
                    landmark_lon = same_place["lon"]
                else:
                    query = f"{landmark_name}, {location_data['country']}"
                    if not _check_landmark_coord(
                        query, landmark_lat, landmark_lon, lat, lon, radius_km
                    ):
                        continue

                landmark = {
                    "name": landmark_name,
                    "local": item.get("local", ""),
                    "desc": item.get("desc", ""),
                    "lat": float(landmark_lat),
                    "lon": float(landmark_lon),
                    "loc": item.get("loc", location_data["location_name"]),
                    "type": item.get(
                        "type", same_place["type"] if same_place else model
                    ),
                }
                landmarks.append(landmark)
                logger.debug(f"Pick {i}: {landmark_name} . {landmark['local']}")

            return landmarks

        except Exception as e:
            logger.error(f"Error selecting landmarks with GPT: {str(e)}")
            logger.debug(f"Error details: {traceback.format_exc()}")

        # If we reach here, there was an error getting landmarks
        return []

    @staticmethod
    def get_landmarks_with_gpt(
        location_data: Dict[str, Any],
        lat: float,
        lon: float,
        radius_km: int,
        locale: str = "en-US",
    ) -> List[Dict[str, Any]]:
        """
        Get landmarks near location using OpenAI API

        Args:
            lat: Latitude
            lon: Longitude
            radius_km: Search radius in kilometers

        Returns:
            List of landmark dictionaries
        """
        if config_utils.is_test_mode_enabled():
            logger.info("Using test landmarks (test mode enabled)")

            # Get test landmarks from config
            test_landmarks = config_utils.load_config()["test_mode"][
                "test_landmarks"
            ]
            return test_landmarks

        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning("No OpenAI API key found in env")
            return []

        if not location_data or not location_data.get("location_name"):
            logger.error("No input location")
            return []

        try:
            location_name = location_data["location_name"]
            prompt = get_prompt(
                "landmarks.discovery",
                location_name=location_name,
                lat=lat,
                lon=lon,
                radius=int(radius_km),
                locale=locale,
            )

            system_message = get_system_message("travel_agent")
            if not prompt or not system_message:
                logger.error("Failed to load prompt templates")
                return []

            client = OpenAI()
            model, temperature = get_model_config()
            logger.info(
                f"Getting landmarks in {locale} from {model} near {location_name} within {radius_km}km"
            )

            response = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            if not content:
                logger.warning(f"No response content returned from {model}")
                return []

            json_data = json.loads(content)
            landmarks_json = json_data.get("landmarks", [])
            if not landmarks_json:
                logger.warning(
                    f"No landmarks found or invalid JSON response from {model}"
                )
                return []

            landmarks = []
            for i, item in enumerate(landmarks_json):
                if not isinstance(item, dict) or not (
                    landmark_name := item.get("name", "").strip()
                ):
                    continue

                landmark_lat = item.get("lat", lat)
                landmark_lon = item.get("lon", lon)
                query = f"{landmark_name}, {location_data['country']}"
                if not _check_landmark_coord(
                    query, landmark_lat, landmark_lon, lat, lon, radius_km
                ):
                    continue

                landmark = {
                    "name": landmark_name,
                    "local": item.get("local", ""),
                    "desc": item.get("desc", ""),
                    "lat": float(landmark_lat),
                    "lon": float(landmark_lon),
                    "loc": item.get("loc", location_name),
                    "type": item.get("type", model),
                }
                landmarks.append(landmark)
                logger.debug(
                    f"Got {i}: {landmark_name}, {landmark['loc']} ({landmark_lat}, {landmark_lon})"
                )

            return landmarks

        except Exception as e:
            logger.error(f"Error getting landmarks with GPT: {str(e)}")
            logger.debug(f"Error details: {traceback.format_exc()}")

        return []

    @staticmethod
    def query_location_with_gpt(
        query: str, locale: str = "en"
    ) -> Optional[Dict[str, Any]]:
        """
        Discover the most relevant location name from a natural language query

        Args:
            query: Natural language query about a location (e.g., "Where is the Eiffel Tower?")
        """
        if config_utils.is_test_mode_enabled():
            logger.info("Using test location (test mode enabled)")
            return config_utils.get_default_location()

        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning(
                "No OpenAI API key found in env, skipping location discovery with GPT"
            )
            return None

        try:
            if (
                prompt := get_prompt(
                    "locations.discovery", query=query, locale=locale
                )
            ) and (system_message := get_system_message("location_finder")):
                model, temperature = get_model_config()
                logger.info(
                    f"Location query in {locale} by {model} (t={temperature}): {query}"
                )
                response = OpenAI().chat.completions.create(
                    model=model,
                    temperature=temperature,
                    messages=[
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                )
                if content := response.choices[0].message.content:
                    return json.loads(content)

        except Exception as e:
            logger.error(f"Error identifying location with GPT: {str(e)}")
            logger.debug(f"Error details: {traceback.format_exc()}")

        return None


# Try to verify coordinate accuracy by geocoding the landmark (to reduce hallucination)
def _check_landmark_coord(
    query: str,
    landmark_lat: float,
    landmark_lon: float,
    lat: float,
    lon: float,
    radius_km: int,
) -> bool:
    # Check if rough distance check is already outside radius
    if (
        int(landmark_lat) != int(lat)
        and int(landmark_lon) != int(lon)
        and coord_utils.distance_km(
            lat, lon, float(landmark_lat), float(landmark_lon)
        )
        > radius_km
    ):
        try:
            coords = LocationService.get_location_coord(query)
            if not coords:
                return False
            else:
                logger.debug(
                    f"Geocode {query}: ({coords.lat}, {coords.lon}) vs GPT ({landmark_lat}, {landmark_lon})"
                )
                if int(landmark_lat) != int(coords.lat) and int(
                    landmark_lon
                ) != int(coords.lon):
                    return False
        except Exception as e:
            logger.warning(f"Error geocoding {query}: {str(e)}")
    return True
