import os
import requests
import json
from typing import List, Dict, Any, Optional
from utils import config_utils, lion
from utils.coord_utils import (
    validate_coords,
    standardize_coord_dict,
    Coordinates,
)
import traceback
import logging

logger = logging.getLogger("loc")
_session = requests.Session()

# Location name cache to reduce API calls
_location_cache = {}


class LocationService:
    """
    Service for handling location-related operations such as
    geocoding and reverse geocoding.
    """

    @staticmethod
    def get_location_details(lat: float, lon: float) -> Dict[str, Any]:
        """
        Get location details from coordinates using Geocoding API with caching.

        Args:
            lat: Latitude
            lon: Longitude

        Returns:
            Dict containing location_name, country and country_code
        """
        # Validate coordinates
        if not validate_coords(lat, lon):
            logger.warning(f"Invalid coordinates: lat={lat}, lon={lon}")
            return {"location_name": "", "country": "", "country_code": None}

        if config_utils.is_test_mode_enabled():
            logger.info("Using test location (test mode enabled)")
            default_loc = config_utils.get_default_location()
            return {
                "location_name": default_loc["name"],
                "country": default_loc.get("country", "Unknown"),
                "country_code": default_loc.get("country_code"),
            }

        # 1 decimal place: ≈ 11.1 km (Can locate a large city or district).
        # 2 decimal places: ≈ 1.11 km (Can locate a town or village).
        rounded_lat = round(lat, 1)
        rounded_lon = round(lon, 1)

        # Check if we have this location in cache
        cache_key = f"{rounded_lat},{rounded_lon}"
        if cache_key in _location_cache:
            cached = _location_cache[cache_key]
            # logger.debug(f"({cache_key}): {cached}")
            return cached

        google_api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not google_api_key:
            logger.warning(
                "Unknown Location: GOOGLE_MAPS_API_KEY not available"
            )
            return {}

        try:
            url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lon}&key={google_api_key}"
            response = _session.get(url, timeout=3)
            if response.status_code != 200:
                logger.error(
                    f"Unknown Location: Google Reverse Geocoding API error: {response.status_code}"
                )
                return {
                    "location_name": "Unknown Location",
                    "country": "Unknown",
                    "country_code": None,
                }

            data = response.json()
            if data["status"] == "OK" and data["results"]:
                # Extract location components
                result = data["results"][0]
                address_components = result.get("address_components", [])

                # Try to find locality (city), administrative_area_level_1 (state/province), country
                locality = ""
                admin_area = ""
                country = ""
                country_code = None
                for component in address_components:
                    types = component.get("types", [])

                    if "locality" in types:
                        locality = component.get("long_name", "")
                    elif "administrative_area_level_1" in types:
                        admin_area = component.get("long_name", "")
                    elif "country" in types:
                        country = component.get("long_name", "")
                        country_code = component.get("short_name")

                # Format location name based on available components
                location_parts = []
                if locality:
                    location_parts.append(locality)
                if admin_area and admin_area != locality:
                    location_parts.append(admin_area)
                if country and country not in [locality, admin_area]:
                    location_parts.append(country)

                location_name = (
                    ", ".join(location_parts)
                    if location_parts
                    else "Unknown Location"
                )
                logger.debug(
                    f"Where is ({cache_key}): {location_name} ({country_code})"
                )
                result_dict = {
                    "location_name": location_name,
                    "country": country or "Unknown",
                    "country_code": country_code,
                }
                _location_cache[cache_key] = result_dict
                return result_dict

        except Exception as e:
            logger.error(f"Error getting location details: {str(e)}")
            logger.debug(f"Error details: {traceback.format_exc()}")

        return {"location_name": "", "country": "", "country_code": None}

    @staticmethod
    def get_location_coord(location: str) -> Optional[Coordinates]:
        """
        Get coordinates from a location name.
        """
        if config_utils.is_test_mode_enabled():
            logger.info("Using test coordinates (test mode enabled)")
            default_loc = config_utils.get_default_location()
            return Coordinates(default_loc["lat"], default_loc["lon"])

        google_api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not google_api_key:
            logger.error("Google Maps API key not configured")
            return None

        try:
            url = f"https://maps.googleapis.com/maps/api/geocode/json?address={location}&key={google_api_key}"
            response = _session.get(url)
            if response.status_code == 200:
                data = response.json()
                if data["status"] == "OK" and data["results"]:
                    # Get coordinates from first result and normalize them
                    coords = data["results"][0]["geometry"]["location"]
                    standardized_coords = standardize_coord_dict(coords)
                    lat = float(standardized_coords["lat"])
                    lon = float(standardized_coords["lon"])
                    if not validate_coords(lat, lon):
                        raise ValueError(
                            f"Invalid coordinates: lat={lat}, lon={lon}"
                        )
                    return Coordinates(lat, lon)
        except Exception as e:
            logger.error(f"{location} Error: {str(e)}")

        logger.error(f"Location not found: {location} ")
        return None

    @staticmethod
    def search_nearby_places(
        lat: float,
        lon: float,
        radius_km: int = 15,
        maxResultCount: int = 10,
        locale: str = "zh-HK",
    ) -> List[Dict[str, Any]]:
        """
        Discovers top landmarks around a given geo-coordinate using Google Places API (New) Nearby Search.

        Args:
            lat (float): The latitude of the center point for the search.
            lon (float): The longitude of the center point for the search.
            radius_km (int): The search radius in kilometers. Maximum for Nearby Search is 50km.
            maxResultCount (int): The maximum number of top results to return. API limit is 20.

        Returns:
            list: A list of discovered landmark.
        """
        if config_utils.is_test_mode_enabled():
            logger.info("Using test places (test mode enabled)")

            # Get test landmarks from config
            test_landmarks = config_utils.load_config()["test_mode"][
                "test_landmarks"
            ]
            return test_landmarks

        google_api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not google_api_key:
            logger.warning("GOOGLE_MAPS_API_KEY not available")
            return []

        # Google Places API (New) Nearby Search endpoint
        url = "https://places.googleapis.com/v1/places:searchNearby"

        # Headers required for the API request.
        # X-Goog-Api-Key: Your API key.
        # X-Goog-FieldMask: Specifies which fields of the Place object to return.
        fieldmask = (
            "places.displayName,places.location,places.primaryTypeDisplayName"
        )
        # fieldmask += ",places.id,places.googleMapsLinks.placeUri"  # Place Details Pro $
        # fieldmask += ",places.generativeSummary"  # Place Details Enterprise $$
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": google_api_key,
            "X-Goog-FieldMask": fieldmask,
        }

        # Request body for the Nearby Search.
        # locationRestriction: Defines the circular area for the search.
        # rankPreference: "RELEVANCE" ensures results are ordered by relevance, which helps
        #                 in getting important places first.
        # includedTypes: Filters results to specific types that align with "landmarks"
        #                and "must-visit destinations". These are common types for such places.
        # excludedTypes: Filters out types that are generally considered "small parks, stores,
        #                eateries and generic tourist attractions" as per the requirements.
        # maxResultCount: Limits the number of results returned by the API.
        request_body = {
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lon},
                    "radius": radius_km * 1000,
                }
            },
            "rankPreference": "POPULARITY",
            "includedTypes": [
                "historical_landmark",
                "tourist_attraction",
                "historical_place",
            ],
            "excludedTypes": [
                "park",
                "store",
                "shopping_mall",
                "restaurant",
                "bar",
                "stadium",
            ],
            "languageCode": locale,
            "maxResultCount": maxResultCount,
        }

        try:
            # Make the POST request to the Places API
            request_data = json.dumps(request_body)
            logger.info(f"Nearby search: {request_data}")
            response = requests.post(url, headers=headers, data=request_data)
            response.raise_for_status()  # Raise an HTTPError for bad responses (4xx or 5xx)
            response_data = response.json()

            landmarks = []
            # The API returns results in a 'places' array within the response.
            if "places" in response_data:
                for i, place in enumerate(response_data["places"]):
                    # Extract with a safe access chaining pattern if name is available
                    if (
                        "displayName" in place
                        and "text" in place["displayName"]
                    ):
                        landmark = {
                            "name": place["displayName"]["text"],
                            # "desc": place.get("generativeSummary", {})
                            # .get("overview", {})
                            # .get("text")
                            # or "No description available",
                            "lat": place["location"]["latitude"],
                            "lon": place["location"]["longitude"],
                            "type": place.get("primaryTypeDisplayName", {}).get(
                                "text"
                            ),
                        }
                        landmarks.append(landmark)
                        logger.debug(
                            f"Nearby {i}: {landmark['name']} ({landmark['lat']}, {landmark['lon']})"
                        )
            return landmarks

        except requests.exceptions.HTTPError as e:
            logger.error(
                f"HTTP Error occurred: {e.response.status_code} - {e.response.text}"
            )
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"An error occurred during the request: {e}")
            return []
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response from the API.")
            return []
        except Exception as e:
            logger.error(f"An unexpected error occurred: {e}")
            return []

    @staticmethod
    def text_search_places(
        query: str, language_code: Optional[str] = None, maxresultcount: int = 2
    ) -> List[Dict[str, Any]]:
        """
        Search for places using Google Places API (New) Text Search.

        Args:
            query (str): The search query text
            language_code (str, optional): Language code for the API request
            maxresultcount (int): Maximum number of results to return

        Returns:
            List[Dict[str, Any]]: List of place dictionaries
        """
        if config_utils.is_test_mode_enabled():
            logger.info("Using test place (test mode enabled)")

            # Get test landmarks from config
            test_landmarks = config_utils.load_config()["test_mode"][
                "test_landmarks"
            ]
            return test_landmarks[:1]

        google_api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not google_api_key:
            logger.warning("GOOGLE_MAPS_API_KEY not available")
            return []

        # URL for the Text Search (New) API endpoint
        url = "https://places.googleapis.com/v1/places:searchText"

        # Headers including proper field mask
        fieldmask = "places.displayName,places.location,places.primaryTypeDisplayName,places.formattedAddress"
        # fieldmask += ",places.id,places.googleMapsLinks.placeUri"  # Place Details Pro $
        # fieldmask += ",places.generativeSummary"  # AI-powered summaries - Place Details Enterprise $$
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": google_api_key,
            "X-Goog-FieldMask": fieldmask,
        }

        # Create request body for Text Search (New)
        request_body = {"textQuery": query, "maxResultCount": maxresultcount}

        # Add languageCode to request if provided
        if language_code:
            request_body["languageCode"] = language_code

        logger.debug(f"Text Search: {json.dumps(request_body)}")

        try:
            response = requests.post(url, headers=headers, json=request_body)
            response.raise_for_status()
            response_data = response.json()

            places = []
            if (
                response_data.get("places", [])
                and len(response_data["places"]) > 0
            ):
                place = response_data["places"][0]
                # Check if we need to make a new request with a different language code
                if place.get("formattedAddress") and not language_code:
                    current_language_code = place["displayName"].get(
                        "languageCode", language_code
                    )
                    formatted_address = place["formattedAddress"]
                    address_parts = formatted_address.split(", ")
                    country = address_parts[-1] if address_parts else ""

                    # Determine correct language code based on country
                    correct_language_code = lion.get_country_language(
                        country, locale=current_language_code
                    )

                    if (
                        correct_language_code
                        and current_language_code != correct_language_code
                        and not language_code
                    ):
                        logger.debug(
                            f"Which country: {country} > Search again in: {correct_language_code}"
                        )
                        return LocationService.text_search_places(
                            query, correct_language_code, maxresultcount
                        )

                for place in response_data["places"]:
                    if (
                        "displayName" in place
                        and "text" in place["displayName"]
                    ):
                        place_data = {
                            "name": place["displayName"]["text"],
                            "lat": place["location"]["latitude"],
                            "lon": place["location"]["longitude"],
                            "loc": place.get("formattedAddress", ""),
                            "type": place.get("primaryTypeDisplayName", {}).get(
                                "text"
                            ),
                        }
                        places.append(place_data)
            return places

        except requests.exceptions.HTTPError as e:
            logger.error(
                f"HTTP Error in text search: {e.response.status_code} - {e.response.text}"
            )
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error in text search: {e}")
            return []
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response from Text Search API")
            return []
        except Exception as e:
            logger.error(f"Unexpected error in text search: {e}")
            return []
