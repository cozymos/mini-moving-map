import base64
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import folium
import streamlit as st
from folium import plugins
from streamlit_folium import st_folium

from components.cache_manager import cache_manager
from utils.coord_utils import ensure_coord_format, validate_coords
from utils.lion import I18n

logger = logging.getLogger("map")


@st.cache_data(ttl=600, show_spinner=False)
def create_base_map(center: List[float], zoom: int) -> folium.Map:
    """
    Create a base folium map with multiple tile layers and sane defaults.
    """
    folium_map = folium.Map(
        location=center,
        zoom_start=zoom,
        tiles=None,
        attr=None,
        control_scale=True,
        prefer_canvas=True,
        zoom_control=True,
    )

    folium.TileLayer(
        tiles="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attr="&copy; OpenStreetMap",
        name="OpenStreetMap",
        max_zoom=19,
        overlay=False,
        control=True,
        show=True,
    ).add_to(folium_map)

    folium.TileLayer(
        tiles="https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        attr="&copy; Google Maps",
        name="Google Maps",
        max_zoom=20,
        overlay=False,
        control=True,
        show=False,
    ).add_to(folium_map)

    folium.TileLayer(
        tiles="https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        attr="&copy; Google Maps",
        name="Google Satellite",
        max_zoom=20,
        overlay=False,
        control=True,
        show=False,
    ).add_to(folium_map)

    return folium_map


def render_map(
    center: List[float], zoom: int, i18n: I18n
) -> Optional[Dict[str, Any]]:
    """
    Render the interactive folium map and return center/zoom updates.
    """
    try:
        if len(center) != 2 or not validate_coords(center[0], center[1]):
            logger.error(f"Invalid map center coordinates: {center}")
            return None

        folium_map = create_base_map(center, zoom)

        if st.session_state.get("landmarks"):
            add_landmarks_to_map(
                folium_map, center, st.session_state["landmarks"], i18n
            )
            draw_distance_circle(
                folium_map, center, st.session_state["search_radius"], i18n
            )

        folium.LayerControl(position="topright").add_to(folium_map)

        optimal_height = 550
        if "vh" in st.query_params:
            optimal_height = int(st.query_params["vh"])

        return st_folium(
            folium_map,
            use_container_width=True,
            height=optimal_height,
            returned_objects=["center", "zoom"],
            key="interactive_map",
        )
    except Exception as exc:
        logger.error(f"Error rendering map: {exc}")
        return None


def local_file_to_url(file_path: str) -> str:
    """
    Convert a local image path to a data URL so it renders inside Streamlit.
    """
    if not file_path:
        return ""

    if file_path.startswith(("http://", "https://")):
        return file_path

    if file_path.startswith("file://"):
        file_path = file_path[7:]

    try:
        abs_path = Path(file_path).resolve()
        image_bytes = abs_path.read_bytes()
        image_data = base64.b64encode(image_bytes).decode("utf-8")
        return f"data:image/jpeg;base64,{image_data}"
    except Exception as exc:
        logger.error(f"Error reading image file {file_path}: {exc}")
        return ""


def add_landmarks_to_map(
    folium_map: folium.Map,
    center: List[float],
    landmarks: List[Dict[str, Any]],
    i18n: I18n,
) -> None:
    """
    Add landmark markers to the map with clustering.
    """
    if not landmarks:
        return

    try:
        marker_cluster = plugins.MarkerCluster(
            name=i18n.t("streamlit.map.layers.landmarks"),
            overlay=True,
            control=True,
            options={"maxClusterRadius": 100, "disableClusteringAtZoom": 12},
        ).add_to(folium_map)

        for landmark in landmarks:
            coords = ensure_coord_format([landmark["lat"], landmark["lon"]])
            image_url = landmark.get("image_url", "")
            if image_url:
                local_path = cache_manager.get_cached_image(
                    landmark["name"], get_local_path=(coords == center)
                )
                if local_path:
                    image_url = local_file_to_url(local_path)

            popup_html = f"""
            <div style="width:200px">
                <h5>{landmark.get("name", i18n.t("streamlit.map.popup.unnamed_landmark"))}</h5>
                <img src="{image_url}" width="200px">
                <p>{landmark.get("desc", i18n.t("streamlit.map.popup.no_description"))}</p>
                <p><small>{coords[0]:.5f}, {coords[1]:.5f}</small></p>
            </div>
            """

            folium.Marker(
                location=coords,
                popup=folium.Popup(popup_html, max_width=300),
                icon=folium.Icon(
                    color="blue" if coords == center else "lightgray"
                ),
                tooltip=landmark.get(
                    "name", i18n.t("streamlit.map.popup.landmark_tooltip")
                ),
            ).add_to(marker_cluster)
    except (ValueError, TypeError) as exc:
        landmark_name = landmark.get("name", "unknown")
        logger.error(f"Error marking landmark {landmark_name}: {exc}")


def draw_distance_circle(
    folium_map: folium.Map, center: List[float], radius_km: float, i18n: I18n
) -> None:
    """
    Draw a radius circle around the active map center.
    """
    location = ensure_coord_format(center)
    folium.Circle(
        location=location,
        radius=radius_km * 1000,
        color="green",
        fill=True,
        fill_opacity=0.1,
        popup=i18n.t("streamlit.map.popup.radius", {"radius_km": radius_km}),
    ).add_to(folium_map)
