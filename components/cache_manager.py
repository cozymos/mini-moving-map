import os
import json
import hashlib
from typing import Dict, Any, List, Optional
from utils import coord_utils
from utils import config_utils
from services.image_service import ImageService
import logging

# Set up logging
logger = logging.getLogger("cache")

# 3 decimal places: ≈ 111 meters (Can locate a neighborhood or street).
ROUND_DECIMAL_CACHE = 3


class CacheManager:
    """
    Manages caching of landmark data and images.

    Features:
    - Stores landmark data as JSON files (not persisted across deployment)
    - Uses cache keys based on proximity geo-coordinate within a search radius
    - Multi-tier cache lookup with exact location matching, and fuzzy search
    - No expiration for server-side cached data, flushed every N operations or X seconds
    """

    def __init__(self):
        """Initialize the cache manager and ensure the cache directory exists"""
        self._proximity_cache = {}
        self._landmark_info_cache = {}

        # Single dirty flag for production cache optimization
        self._cache_dirty = False
        self._operation_count = 0
        self._flush_every_n_operations = 22
        self._timer = None
        self._start_flush_timer()

        # Ensure cache directory exists
        os.makedirs(config_utils.CACHE_DIR, exist_ok=True)
        os.makedirs(config_utils.IMAGE_DIR, exist_ok=True)

        # In-memory caches (to avoid reading from disk on every request)
        self._proximity_cache = self._load_cache(
            config_utils.LANDMARK_CACHE_FILE
        )
        config_utils.update_cache_stats(cache=len(self._proximity_cache))

        self._landmark_info_cache = self._load_cache(
            config_utils.LANDMARK_INFO_CACHE_FILE
        )
        config_utils.update_cache_stats(info=len(self._landmark_info_cache))

        # Additional lookup tables for fast index-based access
        self._loc_proximity_index: Dict[str, List[str]] = {}
        self._loc_landmark_index: Dict[str, List[str]] = {}
        self._landmark_coord_index: Dict[str, List[str]] = {}
        self._build_location_indices()

    def _load_cache(self, cache_path: str) -> Dict[str, Any]:
        """
        Load cache data from the specified JSON file.

        Args:
            cache_path (str): Path to the cache file

        Returns:
            Dict[str, Any]: Cache data, or empty dict if file doesn't exist
        """
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.error(f"Error loading cache file {cache_path}: {str(e)}")
                return {}
        else:
            logger.debug(
                f"Cache file {cache_path} does not exist, creating new cache"
            )
            return {}

    def _start_flush_timer(self):
        """Start the 5-minute timer for cache flushing"""
        if self._timer:
            self._timer.cancel()

        # Timer-based cache flushing (every 5 minutes)
        import threading

        self._timer = threading.Timer(300.0, self._timer_flush_callback)
        self._timer.daemon = True
        self._timer.start()

    def _timer_flush_callback(self):
        """Timer callback to flush cache every 5 minutes"""
        self._flush_dirty_caches()
        # Restart the timer for next 5 minutes
        self._start_flush_timer()

    def _flush_dirty_caches(self):
        """Flush both caches to disk if they have been modified"""
        try:
            if self._cache_dirty:
                # Save proximity cache
                result1 = self._save_cache_immediate(
                    self._proximity_cache, config_utils.LANDMARK_CACHE_FILE
                )
                # Save landmark info cache
                result2 = self._save_cache_immediate(
                    self._landmark_info_cache,
                    config_utils.LANDMARK_INFO_CACHE_FILE,
                )
                if result1 and result2:
                    logger.debug("Flushed dirty caches to disk")

                self._cache_dirty = False
                self._operation_count = 0  # Reset operation counter after flush

        except Exception as e:
            logger.error(f"Error flushing dirty caches: {e}")

    def _save_cache(self, cache_data: Dict[str, Any], cache_path: str) -> int:
        """
        Save cache data to the specified JSON file.
        In production, uses dirty flag and periodic flushing to reduce disk I/O.

        Args:
            cache_data (Dict[str, Any]): Cache data to save
            cache_path (str): Path to the cache file

        Returns:
            int: Number of items cached, or 0 if not saved
        """
        # Check if running in production with gunicorn
        try:
            from app import is_production_environment

            if is_production_environment():
                # In production, set dirty flag and check for periodic flush
                self._cache_dirty = True
                self._operation_count += 1

                # Flush every N operations for safety
                if self._operation_count >= self._flush_every_n_operations:
                    self._flush_dirty_caches()
                    self._operation_count = 0

                return len(cache_data)
        except ImportError:
            # If we can't import the function, proceed with immediate saving
            pass

        # Development mode: immediate save
        if self._save_cache_immediate(cache_data, cache_path):
            return len(cache_data)
        return 0

    def _save_cache_immediate(
        self, cache_data: Dict[str, Any], cache_path: str
    ) -> bool:
        """Immediately save cache data to disk without dirty flag checks"""
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                cache_data = dict(sorted(cache_data.items()))
                json.dump(cache_data, f, indent=2, ensure_ascii=False)
            return True
        except IOError as e:
            logger.error(f"Error saving cache file {cache_path}: {str(e)}")
            return False

    def _generate_proximity_key(
        self, lat: float, lon: float, radius_km: int
    ) -> str:
        """
        Generate a cache key for landmark data based on coordinates and radius.

        Args:
            lat (float): Latitude
            lon (float): Longitude
            radius (int): Search radius in kilometers

        Returns:
            str: Cache key
        """
        # Round coordinates to fewer decimal places based on radius
        # Larger radius = less precision needed
        rounded = coord_utils.round_coordinates_by_radius(lat, lon, radius_km)
        key_str = f"{rounded[0]}_{rounded[1]}_{int(radius_km)}"

        if config_utils.is_test_mode_enabled():
            key_str = "ztest_" + key_str

        return key_str

    def _generate_landmark_key(self, landmark_name: str) -> str:
        """
        Generate a cache key for a landmark name.

        Args:
            landmark_name (str): Name of the landmark

        Returns:
            str: Cache key
        """
        landmark_name = landmark_name.lower().strip()
        landmark_hash = hashlib.md5(landmark_name.encode()).hexdigest()[:10]

        # Clean the landmark name to use as part of the filename
        clean_name = "".join(c if c.isalnum() else "_" for c in landmark_name)
        clean_name = clean_name[:30]  # Limit length
        key_str = f"{clean_name}_{landmark_hash}"
        return key_str

    def _generate_location_key(self, location_name: str) -> str:
        return location_name.lower().strip()

    # in-memory indices to lookup cache keys, replacing for-loops
    def _build_location_indices(self) -> None:
        self._loc_proximity_index.clear()
        for p_key, data in self._proximity_cache.items():
            if loc := data.get("loc"):
                l_key = self._generate_location_key(loc)
                self._loc_proximity_index.setdefault(l_key, []).append(p_key)

        self._loc_landmark_index.clear()
        for lm_key, info in self._landmark_info_cache.items():
            if loc := info.get("loc"):
                l_key = self._generate_location_key(loc)
                self._loc_landmark_index.setdefault(l_key, []).append(lm_key)

        # integer-based coordinate index for fast geographic lookup
        self._landmark_coord_index.clear()
        for lm_key, info in self._landmark_info_cache.items():
            if "lat" in info and "lon" in info:
                coord_key = f"{int(info['lat'])}_{int(info['lon'])}"
                self._landmark_coord_index.setdefault(coord_key, []).append(
                    lm_key
                )

    def find_by_location(
        self, location_name: str, lat: float, lon: float, radius_km: int
    ) -> List[Dict[str, Any]]:
        def within_radius(cache_info) -> bool:
            """Check if landmark is within the specified radius."""
            if "lat" not in cache_info or "lon" not in cache_info:
                return False
            dist = coord_utils.distance_km(
                lat, lon, float(cache_info["lat"]), float(cache_info["lon"])
            )
            return dist <= radius_km

        loc_key = self._generate_location_key(location_name)
        for cache_key in self._loc_proximity_index.get(loc_key, []):
            cache_info = self._proximity_cache.get(cache_key)
            if cache_info and within_radius(cache_info):
                logger.debug(
                    f"Pass 2: Exact match location name: {location_name}"
                )
                config_utils.update_cache_stats(pass2=1)
                return self.get_landmark_refs(cache_key)

        return []

    def get_landmark_refs(self, cache_key: str) -> List[Dict[str, Any]]:
        # Get the cache entry which contains landmark references
        landmark_refs = self._proximity_cache[cache_key].get(
            "landmark_refs", []
        )

        # Retrieve full landmark data for each reference
        landmarks = []
        for landmark_key in landmark_refs:
            if landmark_key in self._landmark_info_cache:
                landmarks.append(self._landmark_info_cache[landmark_key])
            else:
                logger.warning(
                    f"Missing landmark data for reference: {landmark_key}"
                )
        return landmarks

    def get_cached_landmarks(
        self, location_name: str, lat: float, lon: float, radius_km: int = 15
    ) -> List[Dict[str, Any]]:
        """
        Get landmarks from cache if available. Uses landmarks_cache.json to find
        references and retrieves full landmark data from landmark_info_cache.json.

        Returns:
            List of landmark dictionaries or None if not found in cache
        """
        proximity_key = self._generate_proximity_key(lat, lon, radius_km)
        if proximity_key in self._proximity_cache:
            # Pass 1: Exact match of proximity key
            logger.debug(
                f"Pass 1: <{proximity_key}> Proximity cache hit at ({lat:.4f}, {lon:.4f})"
            )
            config_utils.update_cache_stats(pass1=1)
            return self.get_landmark_refs(proximity_key)

        if location_name:
            # Pass 2: Exact match of location name
            return self.find_by_location(location_name, lat, lon, radius_km)

        return []

    def cache_landmarks(
        self,
        location_name: str,
        lat: float,
        lon: float,
        radius_km: int,
        landmarks: List[Dict[str, Any]],
        force_cache: bool = False,
    ) -> bool:
        """
        Cache landmark data for future use. Stores landmark references in landmarks_cache.json
        and full landmark data in landmark_info_cache.json.

        Args:
            location_name: Name of the location
            lat: Latitude
            lon: Longitude
            radius_km: Search radius in km
            landmarks: List of landmark dictionaries to cache
        """
        loc_updated = 0
        landmark_keys = []
        for landmark in landmarks:
            if landmark.get("name"):
                landmark_key = self._generate_landmark_key(landmark["name"])
                if (
                    landmark_key not in self._landmark_info_cache
                    or self._landmark_info_cache[landmark_key].get("loc")
                    != landmark.get("loc")
                ):
                    # Cache landmark data in landmark_info_cache
                    if self.cache_landmark_info(landmark):
                        loc_updated += 1

                if landmark_key in self._landmark_info_cache:
                    # Add reference to the landmark
                    landmark_keys.append(landmark_key)

        if loc_updated > 0:
            logger.info(
                f"Caching {loc_updated} updated info as a set of {len(landmark_keys)} proximity landmarks"
            )
            # Save to disk
            self.update_location_cache()

        if radius_km > 20 and not force_cache:
            if loc_updated:
                self._build_location_indices()
            return False

        # Store only the references in landmarks_cache
        proximity_key = self._generate_proximity_key(lat, lon, radius_km)
        self._proximity_cache[proximity_key] = {
            "loc": location_name,
            "lat": round(lat, ROUND_DECIMAL_CACHE),
            "lon": round(lon, ROUND_DECIMAL_CACHE),
            "landmark_refs": landmark_keys,
        }

        # Save to disk and update lookup tables
        self.update_proximity_cache()
        self._build_location_indices()
        return True

    def get_cached_image(
        self, landmark_name: str, get_local_path: bool = False
    ) -> Optional[str]:
        """
        Get image URL or local path from cache if available.

        Args:
            landmark_name: Name of the landmark
            get_local_path: If True, returns the local file path instead of URL

        Returns:
            Image URL, local path, or None if not found in cache
        """
        landmark_key = self._generate_landmark_key(landmark_name)
        if landmark_key not in self._landmark_info_cache:
            return None

        landmark_info = self._landmark_info_cache[landmark_key]
        if "image_url" in landmark_info:
            image_url = landmark_info["image_url"]
            # If we just need the URL, return it directly
            if not get_local_path or not image_url:
                # logger.debug(f"Returning image URL: {image_url}")
                return image_url

            # Otherwise, get or create the local path
            local_path = ImageService.get_local_image_path(
                landmark_name, image_url
            )
            return local_path

    def cache_image(self, landmark_name: str, image_url: str) -> bool:
        """
        Cache image URL for future use.

        Args:
            landmark_name: Name of the landmark
            image_url: URL of the image to cache
        """
        landmark_info = self.get_cached_landmark_info(landmark_name)
        if landmark_info and image_url is not None:
            landmark_info["image_url"] = image_url
            return self.cache_landmark_info(landmark_info)
        return False

    def get_cached_landmark_info(
        self, landmark_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get landmark information from cache if available

        Args:
            landmark_name: Name of the landmark

        Returns:
            Dictionary with landmark info or None if not found in cache
        """
        cache_key = self._generate_landmark_key(landmark_name)
        if cache_key in self._landmark_info_cache:
            return self._landmark_info_cache[cache_key]

    def cache_landmark_info(self, landmark: Dict[str, Any]) -> bool:
        """
        Cache landmark information for future use
        """
        if not (landmark_name := landmark.get("name")):
            return False
        cache_key = self._generate_landmark_key(landmark_name)

        # Prepare landmark data
        info_data = {
            "name": landmark_name,
            "loc": landmark.get("loc"),
            "desc": landmark.get("desc"),
            "type": landmark.get("type"),
            "local": landmark.get("local"),
        }

        lat, lon = landmark.get("lat"), landmark.get("lon")
        if not lat or not lon or not coord_utils.validate_coords(lat, lon):
            logger.warning("Invalid landmark info: coordinates out of range")
            return False

        info_data["lat"] = round(float(lat), ROUND_DECIMAL_CACHE)
        info_data["lon"] = round(float(lon), ROUND_DECIMAL_CACHE)

        if "image_url" in landmark:
            info_data["image_url"] = landmark["image_url"]

        # Store or update in cache
        if cache_key not in self._landmark_info_cache:
            # Create a new entry
            self._landmark_info_cache[cache_key] = info_data
            logger.debug(
                f"Caching new landmark info: {landmark_name}, {info_data['loc']}"
            )
        else:
            existing = self._landmark_info_cache[cache_key]
            for key, value in info_data.items():
                if value is not None:
                    existing[key] = value
        return True

    def lookup_landmark(
        self,
        location_name: str,
        lat: float,
        lon: float,
        radius_km: int,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Lookup cached landmarks using multi-tier matching strategy for higher cache hits."""
        results = []
        seen_names = set()  # Avoid duplicates
        if radius_km > 20:
            limit *= 2  # Increase limit for larger radius

        def within_radius(landmark_info) -> bool:
            """Check if landmark is within the specified radius."""
            if "lat" not in landmark_info or "lon" not in landmark_info:
                return False
            dist = coord_utils.distance_km(
                lat,
                lon,
                float(landmark_info["lat"]),
                float(landmark_info["lon"]),
            )
            return dist <= radius_km

        # Tier 1: Exact location name match
        loc_key = self._generate_location_key(location_name)
        for lm_key in self._loc_landmark_index.get(loc_key, []):
            if len(results) >= limit:
                break
            landmark_info = self._landmark_info_cache.get(lm_key)
            if (
                landmark_info
                and landmark_info.get("image_url")
                and within_radius(landmark_info)
            ):
                results.append(landmark_info.copy())
                seen_names.add(landmark_info["name"])
                logger.debug(
                    f"Tier 1: {landmark_info['name']} found in {landmark_info['loc']}"
                )
                config_utils.update_cache_stats(tier1=1)

        # Tier 2: Pure geographic (match any landmarks within radius)
        coord_key = f"{int(lat)}_{int(lon)}"
        for lm_key in self._landmark_coord_index.get(coord_key, []):
            if len(results) >= limit:
                break
            landmark_info = self._landmark_info_cache.get(lm_key)
            if (
                landmark_info
                and landmark_info.get("image_url")
                and landmark_info["name"] not in seen_names
                and within_radius(landmark_info)
            ):
                results.append(landmark_info.copy())
                seen_names.add(landmark_info["name"])
                logger.debug(
                    f"Tier 2: {landmark_info['name']} ({landmark_info['lat']}, {landmark_info['lon']}) within {radius_km}km"
                )
            config_utils.update_cache_stats(tier2=1)

        return results

    def update_proximity_cache(self) -> int:
        num_cache = self._save_cache(
            self._proximity_cache, config_utils.LANDMARK_CACHE_FILE
        )
        config_utils.update_cache_stats(cache=num_cache)
        return num_cache

    def update_location_cache(self) -> int:
        num_info = self._save_cache(
            self._landmark_info_cache, config_utils.LANDMARK_INFO_CACHE_FILE
        )
        config_utils.update_cache_stats(info=num_info)
        return num_info

    def clear_cache(self) -> bool:
        """
        Clear caches and delete cache JSON files

        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Clear in-memory caches
            self._proximity_cache = {}
            self._landmark_info_cache = {}
            self._loc_proximity_index = {}
            self._loc_landmark_index = {}
            self._landmark_coord_index = {}

            # Remove cache files
            for cache_file in [
                config_utils.LANDMARK_CACHE_FILE,
                config_utils.LANDMARK_INFO_CACHE_FILE,
            ]:
                if os.path.exists(cache_file):
                    os.remove(cache_file)
                    logger.info(f"Removed cache file: {cache_file}")

            # Save empty caches to files
            return (
                self.update_proximity_cache() == 0
                and self.update_location_cache() == 0
            )

        except Exception as e:
            logger.error(f"Error clearing cache: {str(e)}")
            return False


# Keep as a singleton instance to ensure consistent usage across the application.
cache_manager = CacheManager()
