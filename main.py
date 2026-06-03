from pathlib import Path
import logging
import time

import streamlit as st

from components.map_viewer import render_map
from components.sidebar import render_debug_panel, render_sidebar
from services.landmark_service import LandmarkService
from utils import config_utils
from utils.coord_utils import ensure_coord_format, validate_coords
from utils.lion import CUSTOM_SECOND_LOCALE, FALLBACK_LANGUAGE, init_i18n
from utils.st_utils import get_url_params, set_url_params

config_utils.configure_logging(config_utils.DEFAULT_LOG_LEVEL)
logger = logging.getLogger("main")
logger.debug("*** RERUN ***")


def initialize_locale_state() -> None:
    if "primary_locale" not in st.session_state:
        st.session_state.primary_locale = FALLBACK_LANGUAGE
    if "second_locale" not in st.session_state:
        st.session_state.second_locale = CUSTOM_SECOND_LOCALE
    if "user_locale" not in st.session_state:
        st.session_state.user_locale = st.session_state.primary_locale


initialize_locale_state()
I18N = init_i18n(
    user_locale=st.session_state.user_locale,
    second_locale=st.session_state.second_locale,
)

st.set_page_config(
    page_title="Landmark Explorer",
    page_icon="🗺️",
    layout="wide",
    initial_sidebar_state="expanded",
)

styles_path = Path(__file__).resolve().parent / "components" / "st-styles.css"
st.markdown(f"<style>{styles_path.read_text()}</style>", unsafe_allow_html=True)

landmark_service = LandmarkService()


def calculate_search_radius(
    zoom_level: int, default_zoom: int, default_radius: int, max_radius: int = 50
) -> int:
    """
    Scale the search radius as users zoom the map in or out.
    """
    zoom_diff = zoom_level - default_zoom
    scaled_radius = default_radius * (0.5 ** zoom_diff)
    return int(min(max(default_radius, scaled_radius), max_radius))


def initialize_session_state(default_zoom: int, default_radius: int) -> None:
    default_location = config_utils.get_default_location()
    if "map_center" not in st.session_state:
        st.session_state.map_center = [
            default_location["lat"],
            default_location["lon"],
        ]
    if "zoom_level" not in st.session_state:
        st.session_state.zoom_level = default_zoom
    if "cur_center" not in st.session_state:
        st.session_state.cur_center = st.session_state.map_center
    if "cur_zoom" not in st.session_state:
        st.session_state.cur_zoom = st.session_state.zoom_level
    if "search_radius" not in st.session_state:
        st.session_state.search_radius = calculate_search_radius(
            st.session_state.zoom_level, default_zoom, default_radius
        )
    if "landmarks" not in st.session_state:
        st.session_state.landmarks = []
    if "update_landmarks" not in st.session_state:
        st.session_state.update_landmarks = False
    if "debug_str" not in st.session_state:
        st.session_state.debug_str = ""
    if "test_mode" not in st.session_state:
        st.session_state.test_mode = config_utils.is_test_mode_enabled()


def apply_url_state() -> None:
    params = get_url_params()
    if not {"lat", "lon", "zoom"}.issubset(params):
        return

    try:
        lat = float(params["lat"])
        lon = float(params["lon"])
        zoom = int(params["zoom"])
    except (ValueError, TypeError) as exc:
        logger.error(f"Invalid URL params: {exc}")
        return

    if validate_coords(lat, lon) and 1 <= zoom <= 18:
        st.session_state.map_center = [lat, lon]
        st.session_state.zoom_level = zoom
    else:
        logger.warning(
            f"Invalid coordinates in URL params: lat={lat}, lon={lon}, zoom={zoom}"
        )


def refresh_landmarks(default_zoom: int, default_radius: int) -> None:
    lat, lon = st.session_state.cur_center[0], st.session_state.cur_center[1]
    st.session_state.map_center = [lat, lon]
    st.session_state.zoom_level = st.session_state.cur_zoom
    set_url_params(
        {
            "lat": str(lat),
            "lon": str(lon),
            "zoom": str(st.session_state.zoom_level),
        }
    )

    rounded_lat = round(lat, 3)
    rounded_lon = round(lon, 3)
    st.session_state.search_radius = calculate_search_radius(
        st.session_state.zoom_level, default_zoom, default_radius
    )
    logger.debug(
        "Searching landmarks near [%s, %s] within %skm at zoom %s",
        rounded_lat,
        rounded_lon,
        st.session_state.search_radius,
        st.session_state.zoom_level,
    )

    result = landmark_service.get_landmark_data(
        rounded_lat,
        rounded_lon,
        st.session_state.search_radius,
        st.session_state.landmarks,
        st.session_state.get("user_locale"),
    )
    st.session_state.landmarks = result.get("landmarks", [])


def main() -> None:
    config = config_utils.load_config()
    default_zoom = config["defaults"]["zoom_level"]
    default_radius = config["defaults"]["search_radius"]

    initialize_session_state(default_zoom, default_radius)
    apply_url_state()
    render_sidebar(I18N)

    start_time = None
    if st.session_state.update_landmarks:
        start_time = time.time()
        try:
            refresh_landmarks(default_zoom, default_radius)
        except Exception as exc:
            logger.error(f"Error fetching landmarks: {exc}")
            st.error(I18N.t("streamlit.errors.fetch_landmarks", {"error": exc}))
            st.session_state.landmarks = []
        st.session_state.update_landmarks = False

    map_data = render_map(
        center=st.session_state.map_center,
        zoom=st.session_state.zoom_level,
        i18n=I18N,
    )

    if start_time is not None:
        duration_ms = (time.time() - start_time) * 1000
        logger.debug(
            "Marked %s landmarks around %s within %skm in %.2f ms",
            len(st.session_state.landmarks),
            st.session_state.map_center,
            st.session_state.search_radius,
            duration_ms,
        )

    render_debug_panel()

    if map_data and "center" in map_data and "zoom" in map_data:
        st.session_state.cur_center = ensure_coord_format(map_data["center"])
        st.session_state.cur_zoom = map_data["zoom"]


if __name__ == "__main__":
    main()
