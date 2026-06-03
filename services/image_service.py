import os
import hashlib
import urllib.parse
import requests
from typing import Dict, Any, Optional
from utils import config_utils
import traceback
import logging

logger = logging.getLogger("image")
_session = requests.Session()
_session.headers.update({"User-Agent": config_utils.USER_AGENT})


class ImageService:
    """Service for fetching and caching landmark images."""

    @staticmethod
    def generate_image_filename(image_url: str, landmark_name: str) -> str:
        """Generate a consistent filename for caching an image."""
        url_hash = hashlib.md5(image_url.encode()).hexdigest()[:10]
        clean_name = "".join(
            c if c.isalnum() else "_" for c in landmark_name
        ).lower()
        clean_name = clean_name[:30]
        extension = os.path.splitext(urllib.parse.urlparse(image_url).path)[1]
        if not extension or len(extension) > 5:
            extension = ".jpg"
        return f"{clean_name}_{url_hash}{extension}"

    @staticmethod
    def get_local_image_path(
        landmark_name: str, image_url: str
    ) -> Optional[str]:
        """Get or download the image and return the local file path."""
        if not image_url or not landmark_name:
            return None
        try:
            filename = ImageService.generate_image_filename(
                image_url, landmark_name
            )
            local_path = os.path.join(config_utils.IMAGE_DIR, filename)
            if os.path.exists(local_path):
                logger.debug(f"Image for {landmark_name} found at {local_path}")
                return local_path
            if config_utils.is_test_mode_enabled():
                logger.debug(
                    f"Skipping download for {landmark_name} (test mode enabled)"
                )
                return None
            headers = {"User-Agent": config_utils.USER_AGENT}
            logger.info(
                f"Downloading image for {landmark_name} from {image_url}"
            )
            response = requests.get(
                image_url, stream=True, timeout=7, headers=headers
            )
            response.raise_for_status()
            with open(local_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            logger.debug(f"Saved image at {local_path}")
            return local_path
        except Exception as e:
            logger.error(f"Error with image for {landmark_name}: {str(e)}")
            return None

    @staticmethod
    def get_wiki_imageurl(landmark_name: str) -> Optional[str]:

        def _wiki_api_request(
            params: Dict[str, Any], timeout: int = 5
        ) -> Dict[str, Any]:
            """Internal helper for Wikipedia API requests."""
            wikipedia_api = "https://en.wikipedia.org/w/api.php"
            response = _session.get(wikipedia_api, params=params, timeout=timeout)
            response.raise_for_status()
            return response.json()
        
        """Fetch a landmark image URL from the Wikipedia API."""
        if not landmark_name or not isinstance(landmark_name, str):
            logger.error(f"Invalid landmark name: {landmark_name}")
            return None
        if config_utils.is_test_mode_enabled():
            logger.debug(
                f"Skipping Wiki for {landmark_name} (test mode enabled)"
            )
            return None
        try:
            search_params = {
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": landmark_name,
                "srlimit": 1,
            }
            search_results = (
                _wiki_api_request(search_params)
                .get("query", {})
                .get("search", [])
            )
            if not search_results:
                logger.warning(f"No Wiki page found for {landmark_name}")
                return ""
            page_id = search_results[0]["pageid"]

            images_params = {
                "action": "query",
                "format": "json",
                "prop": "images|pageimages",
                "pageids": page_id,
                "imlimit": 10,
                "pithumbsize": 500,
            }
            page_data = (
                _wiki_api_request(images_params)
                .get("query", {})
                .get("pages", {})
                .get(str(page_id), {})
            )
            thumbnail = page_data.get("thumbnail", {})
            if thumbnail and "source" in thumbnail:
                image_url = thumbnail["source"]
                if not image_url.endswith(".svg"):
                    logger.debug(f"Found Wiki thumbnail for {landmark_name}")
                    return image_url

            logger.warning(f"No good Wiki image for {landmark_name}")
            return ""
        except Exception as e:
            logger.error(
                f"Error fetching Wiki image for {landmark_name}: {str(e)}"
            )
            logger.debug(f"Error details: {traceback.format_exc()}")
            return None
