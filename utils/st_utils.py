import logging
import re
from typing import Dict

import streamlit as st

logger = logging.getLogger(__name__)

URL_MODE = "latlon"
ROUND_DECIMAL_URL = 4


def get_url_params() -> Dict[str, str]:
    """
    Read query parameters and normalize them into lat/lon/zoom fields.
    """
    global URL_MODE

    try:
        raw_params = st.query_params.to_dict()
        params: Dict[str, str] = {}
        for key, value in raw_params.items():
            if isinstance(value, list) and value:
                params[key] = str(value[0])
            elif value is not None:
                params[key] = str(value)

        if any(key.startswith("@") for key in params):
            for key in list(params.keys()):
                if not key.startswith("@"):
                    continue
                google_match = re.match(
                    r"@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+)z?", key
                )
                if google_match:
                    lat, lon, zoom = google_match.groups()
                    params["lat"] = str(
                        round(float(lat), ROUND_DECIMAL_URL)
                    )
                    params["lon"] = str(
                        round(float(lon), ROUND_DECIMAL_URL)
                    )
                    params["zoom"] = str(zoom)
                    params.pop(key, None)
                    URL_MODE = "google"
                    break
        elif "center" in params and URL_MODE != "center":
            URL_MODE = "center"

        if "center" in params and "lat" not in params and "lon" not in params:
            center_value = params["center"]
            if "," in center_value:
                lat, lon = center_value.split(",", 1)
                params["lat"] = str(
                    round(float(lat.strip()), ROUND_DECIMAL_URL)
                )
                params["lon"] = str(
                    round(float(lon.strip()), ROUND_DECIMAL_URL)
                )

        return params
    except Exception as exc:
        logger.error(f"Error getting URL params: {exc}")
        return {}


def set_url_params(params: Dict[str, str]) -> None:
    """
    Write query parameters using the current URL format mode.
    """
    global URL_MODE

    try:
        params_copy = params.copy()
        lat = None
        lon = None
        if "lat" in params_copy and "lon" in params_copy:
            lat = params_copy["lat"] = str(
                round(float(params_copy["lat"]), ROUND_DECIMAL_URL)
            )
            lon = params_copy["lon"] = str(
                round(float(params_copy["lon"]), ROUND_DECIMAL_URL)
            )

        if URL_MODE == "center" and lat and lon:
            params_copy["center"] = f"{lat},{lon}"
            params_copy.pop("lat", None)
            params_copy.pop("lon", None)
        elif URL_MODE == "google" and lat and lon:
            zoom = params_copy.get("zoom", "12")
            google_value = f"@{lat},{lon},{zoom}z"
            st.query_params.clear()
            st.query_params[google_value] = ""
            return

        st.query_params.clear()
        for key, value in params_copy.items():
            st.query_params[key] = value
    except Exception as exc:
        logger.error(f"Error setting URL params: {exc}")


def clear_url_params() -> None:
    """
    Clear all query parameters.
    """
    try:
        st.query_params.clear()
    except Exception as exc:
        logger.error(f"Error clearing URL params: {exc}")
