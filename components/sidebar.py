import logging

import streamlit as st

from services.landmark_service import LandmarkService
from services.location_service import LocationService
from utils import config_utils
from utils.coord_utils import parse_coordinates
from utils.lion import I18n
from utils.st_utils import set_url_params

logger = logging.getLogger("side")


def render_sidebar(i18n: I18n) -> None:
    """
    Render the Streamlit sidebar controls for search, navigation, and settings.
    """
    if st.session_state.get("test_mode"):
        st.sidebar.warning(i18n.t("streamlit.status.test_mode_enabled"))

    col1, col2 = st.sidebar.columns([3, 1])
    with col1:
        location_input = st.text_input(
            i18n.t("streamlit.sidebar.search_location_label"),
            label_visibility="collapsed",
            placeholder=i18n.t("streamlit.sidebar.search_location_placeholder"),
            key="location_input",
        )
    with col2:
        if st.button("🔍", help=i18n.t("tooltips.search_location")):
            coords = LocationService.get_location_coord(location_input)
            if coords:
                set_url_params(
                    {
                        "lat": str(coords.lat),
                        "lon": str(coords.lon),
                        "zoom": str(st.session_state.zoom_level),
                    }
                )
                st.rerun()
            else:
                st.session_state.update_landmarks = True

    col1, col2 = st.sidebar.columns([3, 1])
    with col1:
        coord_input = st.text_input(
            i18n.t("streamlit.sidebar.custom_location_label"),
            label_visibility="collapsed",
            placeholder=i18n.t("streamlit.sidebar.coordinates_placeholder"),
            key="coord_input",
            help=i18n.t("streamlit.sidebar.coordinates_help"),
        )
    with col2:
        if st.button("📍", help=i18n.t("app.user_location")):
            coords = parse_coordinates(coord_input)
            if coords:
                set_url_params(
                    {
                        "lat": str(coords.lat),
                        "lon": str(coords.lon),
                        "zoom": str(st.session_state.zoom_level),
                    }
                )
                st.rerun()
            elif not coord_input.strip():
                _toggle_default_location()
            else:
                st.sidebar.error(
                    i18n.t("streamlit.errors.invalid_coordinates")
                )

    col1, col2 = st.sidebar.columns([3, 1])
    with col1:
        with st.expander(
            i18n.t("streamlit.sidebar.settings_expander_title"), expanded=False
        ):
            if not config_utils.is_test_mode_enabled():
                st.session_state.test_mode = st.toggle(
                    i18n.t("streamlit.sidebar.enable_test_mode")
                )
                if st.session_state.test_mode:
                    config_utils.enable_test_mode()
                    st.rerun()
    with col2:
        if st.button("🌐", help=i18n.t("streamlit.sidebar.locale_toggle_help")):
            primary = st.session_state.get("primary_locale", "en")
            secondary = st.session_state.get("second_locale", "zh-HK")
            st.session_state.user_locale = (
                secondary
                if st.session_state.get("user_locale", primary) == primary
                else primary
            )
            st.rerun()

    landmarks = st.session_state.get("landmarks", [])
    if landmarks:
        with st.sidebar.expander(
            i18n.t("streamlit.sidebar.view_landmarks", {"count": len(landmarks)}),
            expanded=True,
        ):
            for index, landmark in enumerate(landmarks):
                if image_url := LandmarkService.get_landmark_image(
                    landmark["name"]
                ):
                    st.image(image_url, width='stretch')
                if (
                    st.button(landmark["name"], key=f"view_map_{index}")
                    and "lat" in landmark
                    and "lon" in landmark
                ):
                    set_url_params(
                        {
                            "lat": str(landmark["lat"]),
                            "lon": str(landmark["lon"]),
                            "zoom": "13",
                        }
                    )
                    st.rerun()


def _toggle_default_location() -> None:
    default_location = config_utils.get_default_location()
    default_center = [default_location["lat"], default_location["lon"]]

    if "last_center" not in st.session_state:
        st.session_state.last_center = None

    is_at_default = (
        abs(st.session_state.cur_center[0] - default_center[0]) < 0.1
        and abs(st.session_state.cur_center[1] - default_center[1]) < 0.1
    )

    target_center = (
        st.session_state.last_center
        if is_at_default and st.session_state.last_center
        else default_center
    )
    st.session_state.last_center = st.session_state.cur_center

    if target_center:
        set_url_params(
            {
                "lat": str(target_center[0]),
                "lon": str(target_center[1]),
                "zoom": str(st.session_state.zoom_level),
            }
        )
        st.rerun()


def render_debug_panel() -> None:
    """
    Render the cache/debug summary underneath the Streamlit map.
    """
    if config_utils.CACHE_STATS:
        config_utils.CACHE_STATS.radius = st.session_state.search_radius
        debug_str(config_utils.CACHE_STATS)
    st.markdown(st.session_state.debug_str)


def debug_str(value) -> None:
    st.session_state.debug_str = value
