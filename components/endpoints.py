"""
Component for handling landmark-related routes and functionality.
"""

from flask import Blueprint, request, jsonify, current_app, send_file
from services.landmark_service import LandmarkService
from services.location_service import LocationService
from components.cache_manager import cache_manager
from utils.coord_utils import validate_coords
from utils.config_utils import is_test_mode_enabled, CACHE_STATS
import time
import traceback
import logging

# Get logger for this module
logger = logging.getLogger("api")

# Create blueprint for landmark routes
landmark_routes = Blueprint(
    "landmark_routes", __name__, url_prefix="/api/landmark"
)
landmark_service = LandmarkService()


@landmark_routes.route("/search", methods=["GET", "POST"])
def search_landmarks():
    """
    Search for landmarks near specified coordinates.

    For GET requests:
        Query parameters:
            lat (float): Latitude of the center point
            lon (float): Longitude of the center point
            radius (int, optional): Search radius in kilometers

    For POST requests:
        JSON body:
            lat (float): Latitude of the center point
            lon (float): Longitude of the center point
            radius (int, optional): Search radius in kilometers
            last_result (list, optional): Previous result to avoid duplicates

    Returns:
        JSON response with landmark data or error message.
    """

    def parse_search_parameters():
        """
        Helper function to parse search parameters from either GET or POST request.

        Returns:
            tuple: (lat, lon, radius_km, last_result, locale, request_id)
        """
        request_id = id(request)
        if request.method == "GET":
            # Get query parameters
            lat = request.args.get("lat", type=float)
            lon = request.args.get("lon", type=float)
            radius_km = request.args.get("radius", default=15, type=int)
            locale = request.args.get("locale")
            last_result = []  # GET requests don't have last_result
        else:  # POST
            # Get JSON data from POST body
            data = request.get_json() or {}
            lat = data.get("lat")
            lon = data.get("lon")
            radius_km = data.get("radius", 15)
            locale = data.get("locale")
            last_result = data.get("last_result", [])

            # Convert to appropriate types
            if lat is not None:
                lat = float(lat)
            if lon is not None:
                lon = float(lon)
            if radius_km is not None:
                radius_km = int(radius_km)

            # Also check query parameters as fallback
            if lat is None:
                lat = request.args.get("lat", type=float)
            if lon is None:
                lon = request.args.get("lon", type=float)
            if radius_km is None:
                radius_km = request.args.get("radius", default=15, type=int)
            if locale is None:
                locale = request.args.get("locale")

        return lat, lon, radius_km, last_result, locale, request_id

    start_time = time.time()
    try:
        lat, lon, radius_km, last_result, locale, request_id = parse_search_parameters()
        logger.info(
            f"[{request_id}] Landmark search: {request.method} lat={lat}, lon={lon}, radius={radius_km}, locale={locale}, last_result={len(last_result)}"
        )

        # Validate parameters
        if lat is None:
            logger.warning(f"[{request_id}] Missing required parameter: lat")
            return jsonify({"error": "Missing required parameter: lat"}), 400

        if lon is None:
            logger.warning(f"[{request_id}] Missing required parameter: lon")
            return jsonify({"error": "Missing required parameter: lon"}), 400

        # Validate coordinates
        if not validate_coords(lat, lon):
            logger.warning(
                f"[{request_id}] Invalid coordinates: lat={lat}, lon={lon}"
            )
            return jsonify(
                {
                    "error": "Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180"
                }
            ), 400

        # Validate radius
        if radius_km <= 0:
            logger.warning(f"[{request_id}] Invalid radius: {radius_km}")
            return jsonify(
                {"error": "Invalid radius. Must be greater than 0"}
            ), 400

        if radius_km > 50:  # Set a reasonable upper limit
            logger.warning(f"[{request_id}] Radius too large: {radius_km}")
            return jsonify(
                {"error": "Radius too large. Must be less than 50 km"}
            ), 400

        # 4 decimal places: ≈ 11.1 meters (Can locate a building, as typical consumer-grade GPS).
        rounded_lat = round(lat, 4)
        rounded_lon = round(lon, 4)

        # Get landmark data
        result = landmark_service.get_landmark_data(
            rounded_lat, rounded_lon, radius_km, last_result, locale
        )

        # Check for error in result
        if "error" in result:
            logger.warning(
                f"[{request_id}] Landmark service returned error: {result['error']}"
            )
            return jsonify({"error": result["error"]}), 400

        duration = (time.time() - start_time) * 1000  # in ms
        logger.debug(
            f"[{request_id}] Returning {len(result['landmarks'])} landmarks around [{rounded_lat}, {rounded_lon}] within {radius_km}km took {duration:.2f} ms"
        )

        return jsonify(result)

    except Exception as e:
        error_message = str(e)
        logger.error(
            f"[{request_id}] Error in search_landmarks: {error_message}"
        )
        logger.debug(f"[{request_id}] Error details: {traceback.format_exc()}")

        # Return a user-friendly error message
        return jsonify(
            {
                "error": "An unexpected error occurred while searching for landmarks",
                "details": error_message if current_app.debug else None,
            }
        ), 500


@landmark_routes.route("/image/<landmark_name>", methods=["GET"])
def api_landmark_image(landmark_name):
    """
    Get an image for a specified landmark.

    Args:
        landmark_name (str): Name of the landmark to get an image for

    Returns:
        Image file or JSON error response
    """
    request_id = id(request)
    logger.debug(f"[{request_id}] Image request for landmark: {landmark_name}")
    try:
        if not landmark_name:
            logger.warning(f"[{request_id}] Missing landmark name")
            return jsonify({"error": "Missing landmark name"}), 400

        local_path = None
        image_url = landmark_service.get_landmark_image(landmark_name)
        if image_url:
            # Fetch the image for the landmark
            local_path = cache_manager.get_cached_image(
                landmark_name, get_local_path=True
            )

        if not local_path:
            logger.warning(
                f"[{request_id}] No cached image for: {landmark_name}"
            )
            return jsonify(
                {"error": f"No cached image for landmark: {landmark_name}"}
            ), 404

        # Return the image file
        logger.debug(f"[{request_id}] Sending image cache: {local_path}")
        return send_file(local_path, mimetype="image/jpeg")

    except Exception as e:
        error_message = str(e)
        logger.error(
            f"[{request_id}] Error getting landmark image: {error_message}"
        )
        logger.debug(f"[{request_id}] Error details: {traceback.format_exc()}")

        # Return a user-friendly error message
        return jsonify(
            {
                "error": "An unexpected error occurred while retrieving the landmark image",
                "details": error_message if current_app.debug else None,
            }
        ), 500


@landmark_routes.route("/geocode", methods=["GET"])
def geocode_location():
    """
    Convert a location name to coordinates using Forward Geocoding API or
    convert coordinates to location name using Reverse Geocoding API.

    Query parameters:
        For forward geocoding:
            location (str): Name of the location to geocode
        For reverse geocoding:
            lat (float): Latitude
            lon (float): Longitude

    Returns:
        JSON response with coordinates/location data or error message.
    """
    request_id = id(request)
    try:
        logger.debug(f"[{request_id}] Geocode request: {dict(request.args)}")

        # Get query parameters
        location = request.args.get("location")
        lat = request.args.get("lat", type=float)
        lon = request.args.get("lon", type=float)

        # Initialize location service
        location_service = LocationService()

        # Determine if this is forward or reverse geocoding
        if location:
            # Forward geocoding: location name to coordinates
            if lat is not None or lon is not None:
                logger.warning(
                    f"[{request_id}] Conflicting parameters: both location and coordinates provided"
                )
                return jsonify(
                    {
                        "error": "Provide either 'location' for forward geocoding or 'lat'/'lon' for reverse geocoding, not both"
                    }
                ), 400

            # Get coordinates
            coords = location_service.get_location_coord(location)
            if not coords:
                logger.warning(
                    f"[{request_id}] Failed to geocode location: {location}"
                )
                return jsonify(
                    {"error": f"Failed to geocode location: {location}"}
                ), 404

            # Log success
            logger.debug(
                f"[{request_id}] Forward geocoded '{location}' to: {coords}"
            )

            return jsonify(
                {
                    "type": "forward",
                    "location": location,
                    "coordinates": {"lat": coords.lat, "lon": coords.lon},
                }
            )

        elif lat is not None and lon is not None:
            # Reverse geocoding: coordinates to location name
            if not validate_coords(lat, lon):
                logger.warning(
                    f"[{request_id}] Invalid coordinates: lat={lat}, lon={lon}"
                )
                return jsonify(
                    {
                        "error": "Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180"
                    }
                ), 400

            # Get location details
            location_details = location_service.get_location_details(lat, lon)
            if not location_details or not location_details.get(
                "location_name"
            ):
                logger.warning(
                    f"[{request_id}] Failed to reverse geocode coordinates: {lat}, {lon}"
                )
                return jsonify(
                    {
                        "error": f"Failed to reverse geocode coordinates: {lat}, {lon}"
                    }
                ), 404

            # Log success
            logger.debug(
                f"[{request_id}] Reverse geocoded ({lat}, {lon}) to: {location_details['location_name']}"
            )

            return jsonify(
                {
                    "type": "reverse",
                    "coordinates": {"lat": lat, "lon": lon},
                    "location_name": location_details["location_name"],
                    "country": location_details.get("country", ""),
                    "country_code": location_details.get("country_code", ""),
                }
            )

        else:
            # Neither location nor coordinates provided
            logger.warning(f"[{request_id}] Missing required parameters")
            return jsonify(
                {
                    "error": "Missing required parameters. Provide either 'location' for forward geocoding or 'lat'/'lon' for reverse geocoding"
                }
            ), 400

    except Exception as e:
        error_message = str(e)
        logger.error(
            f"[{request_id}] Error in geocode_location: {error_message}"
        )
        logger.debug(f"[{request_id}] Error details: {traceback.format_exc()}")

        # Return a user-friendly error message
        return jsonify(
            {
                "error": "An unexpected error occurred while processing the geocoding request",
                "details": error_message if current_app.debug else None,
            }
        ), 500


@landmark_routes.route("/cache-images", methods=["POST"])
def cache_images():
    """
    Cache a list of landmark images.

    Request body:
        JSON array of objects with 'name' and 'image_url' fields

    Returns:
        JSON response with success count or error message.
    """
    request_id = id(request)
    logger.debug(f"[{request_id}] Cache images request received")

    try:
        # Get the JSON data from request
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400

        image_data = request.get_json()
        if not isinstance(image_data, list):
            return jsonify({"error": "Request body must be an array"}), 400

        success_count = 0
        failed_count = 0
        errors = []

        # Process each landmark image pair
        for item in image_data:
            if not isinstance(item, dict):
                failed_count += 1
                errors.append("Invalid item format - must be object")
                continue

            landmark_name = item.get("name")
            image_url = item.get("image_url")

            if not landmark_name or image_url is None:
                failed_count += 1
                errors.append(f"Missing name or image_url for item: {item}")
                continue

            # Cache the image using CacheManager
            try:
                result = cache_manager.cache_image(landmark_name, image_url)
                if result:
                    success_count += 1
                    # logger.debug(f"[{request_id}] Cached image for {landmark_name}")
                else:
                    failed_count += 1
                    errors.append(f"Failed to cache image for {landmark_name}")
            except Exception as e:
                failed_count += 1
                errors.append(f"Error caching {landmark_name}: {str(e)}")

        # Log success
        logger.debug(
            f"[{request_id}] Cached {success_count} images, {failed_count} failed"
        )

        response_data = {
            "status": "success",
            "cached_count": success_count,
            "failed_count": failed_count,
        }

        if errors:
            response_data["errors"] = errors

        return jsonify(response_data)

    except Exception as e:
        error_message = str(e)
        logger.error(f"[{request_id}] Error caching images: {error_message}")
        logger.debug(f"[{request_id}] Error details: {traceback.format_exc()}")

        # Return a user-friendly error message
        return jsonify(
            {
                "error": "An unexpected error occurred while caching images",
                "details": error_message if current_app.debug else None,
            }
        ), 500


@landmark_routes.route("/status", methods=["GET"])
def api_landmark_status():
    """
    Check the processing status of landmarks for a given location.

    Returns:
        JSON response with processing status and landmark count.
    """
    try:
        request_id = id(request)
        return jsonify({"cache_stat": CACHE_STATS}), 200

    except Exception as e:
        logger.error(f"[{request_id}] Error checking landmark status: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@landmark_routes.route("/clear-cache", methods=["POST"])
def api_clear_cache():
    """
    Clear the cache directory to remove cached landmarks and images.
    This is useful for testing and development.

    Returns:
        JSON response with success or error message.
    """
    request_id = id(request)
    logger.debug(f"[{request_id}] Cache clear request received")

    try:
        if not is_test_mode_enabled():
            return jsonify({"status": "Not Test mode"})

        result = cache_manager.clear_cache()
        if not result:
            logger.warning(f"[{request_id}] Error clearing cache")
            return jsonify({"error": "Error clearing cache"}), 500

        # Log success
        logger.debug(f"[{request_id}] Cache cleared successfully")

        return jsonify(
            {"status": "success", "message": "Cache cleared successfully"}
        )

    except Exception as e:
        error_message = str(e)
        logger.error(f"[{request_id}] Error clearing cache: {error_message}")
        logger.debug(f"[{request_id}] Error details: {traceback.format_exc()}")

        # Return a user-friendly error message
        return jsonify(
            {
                "error": "An unexpected error occurred while clearing the cache",
                "details": error_message if current_app.debug else None,
            }
        ), 500


@landmark_routes.route("/location", methods=["GET"])
def api_query_location():
    """
    Query location information using LandmarkService's search_location.

    Query parameters:
        query (str): The location query.
        lat (float): Latitude for this query (optional)
        lon (float): Longitude for this query (optional)
        locale (str, optional): Language code for the API request
        use_gpt (bool, optional): Whether to use GPT for location query

    Returns:
        JSON response with search_location result or error message.
    """
    request_id = id(request)
    logger.debug(f"[{request_id}] Location query: {dict(request.args)}")

    try:
        query = request.args.get("query")
        if not query:
            return jsonify({"error": "Missing 'query' parameter"}), 400

        lat = request.args.get("lat", type=float)
        lon = request.args.get("lon", type=float)
        locale = request.args.get("locale")
        use_gpt = request.args.get("use_gpt", "false").lower() == "true"
        result = LandmarkService().search_location(
            query, lat, lon, locale, use_gpt
        )
        return jsonify(result), 200

    except Exception as e:
        error_message = str(e)
        logger.error(
            f"[{request_id}] Error in api_query_location: {error_message}"
        )
        logger.debug(f"[{request_id}] Error details: {traceback.format_exc()}")

        return jsonify(
            {
                "error": "An unexpected error occurred while querying location",
                "details": error_message if current_app.debug else None,
            }
        ), 500
