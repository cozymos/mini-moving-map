import re
from typing import Tuple, Optional
from dataclasses import dataclass
import math


@dataclass
class Coordinates:
    lat: float
    lon: float


def round_coordinates_by_radius(
    lat: float, lon: float, radius_km: int = 11
) -> Tuple[float, float]:
    """
    Round geo-coordinates (latitude, longitude) to a precision that corresponds
    to the given radius in kilometers.

    Args:
        lat (float): The latitude in decimal degrees
        lon (float): The longitude in decimal degrees
        radius_km (float): The desired radius in kilometers

    Returns:
        tuple: (rounded_latitude, rounded_longitude) in decimal degrees
    """
    # Validate the coordinates are in proper range
    if not validate_coords(lat, lon):
        raise ValueError("Invalid coordinates")

    # Make sure radius is a positive number
    radius = abs(float(radius_km))
    if radius <= 0:
        radius = 11

    # Earth's radius in kilometers
    # EARTH_RADIUS_KM = 6371.0

    # Calculate appropriate decimal precision
    # 0 decimal places: ≈ 111 km (Can locate a country or large region).
    # 1 decimal place: ≈ 11.1 km (Can locate a large city or district).
    # 2 decimal places: ≈ 1.11 km (Can locate a town or village).
    # 3 decimal places: ≈ 111 meters (Can locate a neighborhood or street).
    # 4 decimal places: ≈ 11.1 meters (Can locate a building, as typical consumer-grade GPS).

    '''
    # For latitude: determine decimal places needed for the given radius
    # 1 degree of latitude is approximately 111 km
    # The formula approximates the number of decimal places needed
    lat_precision = max(0, math.ceil(-math.log10(radius / 111.0)))
    lat_precision = min(3, lat_precision)

    # For longitude: need to account for the convergence of meridians
    # 1 degree of longitude varies with latitude (gets smaller as you move away from equator)
    # The distance between longitude lines decreases as you move away from the equator
    # At the equator, 1 degree of longitude is about 111 km
    # At latitude φ, 1 degree of longitude is about 111 * cos(φ) km
    longitude_km_per_degree = 111.0 * math.cos(math.radians(abs(lat)))
    lon_precision = max(
        0, math.ceil(-math.log10(radius / longitude_km_per_degree))
    )
    lon_precision = min(3, lon_precision)
    '''

    # fixing precision as 1 for this app, by comment out full algo above
    lat_precision = lon_precision = 1

    # Round the coordinates to the calculated precision
    rounded_latitude = round(lat, lat_precision)
    rounded_longitude = round(lon, lon_precision)

    return rounded_latitude, rounded_longitude


def parse_dms(dms: str) -> Optional[float]:
    """Parse a DMS (degrees, minutes, seconds) string into decimal degrees"""
    # Pattern for DMS: optional direction + degrees°minutes′seconds″direction
    # Handles both standard quotes ('/) and prime characters (′/″)
    pattern = r"^([NSEW])?\s*(\d+)\s*°\s*(\d+)\s*[\'′]\s*([\d.]+)\s*[\"″]\s*([NSEW])?$"
    match = re.match(pattern, dms.strip())

    if not match:
        return None

    prefix_dir, degrees, minutes, seconds, suffix_dir = match.groups()
    direction = prefix_dir or suffix_dir  # Use whichever direction was provided

    if not direction:
        return None

    degrees = float(degrees)
    minutes = float(minutes)
    seconds = float(seconds)

    # Convert to decimal degrees
    decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)

    # Make negative for South or West
    if direction in ["S", "W"]:
        decimal = -decimal

    return decimal


def parse_dd(dd: str) -> Optional[float]:
    """Parse a decimal degrees string"""
    try:
        return float(dd.strip())
    except ValueError:
        return None


def parse_coordinates(coord_str: str) -> Optional[Coordinates]:
    """Parse coordinates in either DD or DMS format"""
    # Remove any whitespace
    coord_str = coord_str.strip()

    # Split into lat/lon components
    parts = [p.strip() for p in coord_str.split(",")]
    if len(parts) != 2:
        return None

    lat_str, lon_str = parts

    # Try DMS format first
    if "°" in lat_str and "°" in lon_str:
        lat = parse_dms(lat_str)
        lon = parse_dms(lon_str)
    else:
        # Try DD format
        lat = parse_dd(lat_str)
        lon = parse_dd(lon_str)

    if lat is not None and lon is not None:
        if validate_coords(lat, lon):
            return Coordinates(lat, lon)

    return None


def format_dms(decimal: float, is_latitude: bool) -> str:
    """Convert decimal degrees to DMS format"""
    direction = (
        "N"
        if decimal >= 0 and is_latitude
        else "S"
        if is_latitude
        else "E"
        if decimal >= 0
        else "W"
    )
    decimal = abs(decimal)

    degrees = int(decimal)
    minutes = int((decimal - degrees) * 60)
    seconds = round(((decimal - degrees) * 60 - minutes) * 60, 2)

    return f"{degrees}° {minutes}' {seconds}\"{direction}"


def validate_coords(lat: float, lon: float) -> bool:
    """Validate that coordinates are within proper ranges."""
    try:
        if not isinstance(lat, (int, float)) or not isinstance(
            lon, (int, float)
        ):
            return False

        lat_float = float(lat)
        lon_float = float(lon)

        if not (-90 <= lat_float <= 90):
            return False
        if not (-180 <= lon_float <= 180):
            return False

        return True
    except Exception:
        return False


def standardize_coord_dict(coord_dict: dict) -> dict:
    """Return a new dict with `lat` and `lon` keys as floats."""
    if not isinstance(coord_dict, dict):
        raise ValueError(f"Expected dictionary but received {type(coord_dict)}")

    lat = coord_dict.get("lat") or coord_dict.get("latitude")
    lon = (
        coord_dict.get("lon")
        or coord_dict.get("lng")
        or coord_dict.get("longitude")
        or coord_dict.get("long")
    )

    if lat is None or lon is None:
        raise ValueError("Coordinate dictionary missing lat/lon values")

    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        raise ValueError("Coordinates must be numeric")

    if not validate_coords(lat_f, lon_f):
        raise ValueError("Invalid coordinate ranges")

    return {"lat": lat_f, "lon": lon_f}


def ensure_coord_format(coords) -> list:
    """
    Ensure coordinates are in standard [lat, lon] list format

    Args:
        coords: Coordinates in various formats (list, dict, Coordinates object)

    Returns:
        Standardized [lat, lon] list
    """
    if isinstance(coords, Coordinates):
        lat, lon = coords.lat, coords.lon
    elif isinstance(coords, dict):
        data = standardize_coord_dict(coords)
        lat, lon = data["lat"], data["lon"]
    elif isinstance(coords, (list, tuple)) and len(coords) >= 2:
        lat, lon = coords[0], coords[1]
    else:
        raise ValueError(
            f"Could not convert to standard coordinate format: {coords}"
        )

    if not validate_coords(lat, lon):
        raise ValueError(f"Invalid coordinate ranges: lat={lat}, lon={lon}")

    return [float(lat), float(lon)]


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points in kilometers.
    
    This function uses the Haversine formula for calculating distances between coordinates,
    as it's more accurate for latitude/longitude than simple Euclidean distance.
    """
    # Validate coordinates before calculating
    for lat, lon in [(lat1, lon1), (lat2, lon2)]:
        if not validate_coords(lat, lon):
            raise ValueError("Invalid coordinates")

    # Haversine formula
    EARTH_RADIUS_KM = 6371.0  # Earth radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c
