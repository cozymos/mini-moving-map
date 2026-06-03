import json
import os
import sys
from typing import Dict, Any
from dataclasses import dataclass
import platform
import logging

logger = logging.getLogger("cfg")

# Default log level
DEFAULT_LOG_LEVEL = logging.INFO

# Global state to track if test mode is enabled
_LOGGING_CONFIGURED = False
_TEST_MODE = False
_DEBUG_MODE = False
_CONFIG_CACHE = {}

# Hardcoded pathnames
CONFIG_FILE = "public/config.json"
CACHE_DIR = os.path.join("cache")
IMAGE_DIR = os.path.join(CACHE_DIR, "images")
LANDMARK_CACHE_FILE = os.path.join(CACHE_DIR, "landmarks_cache.json")
LANDMARK_INFO_CACHE_FILE = os.path.join(CACHE_DIR, "landmark_info_cache.json")

USER_AGENT = f"code_agent@replit.com PythonRequests/{platform.python_version()}"


@dataclass
class Metrics:
    radius: int = 0
    cache: int = 0
    info: int = 0
    pass1: int = 0
    pass2: int = 0
    tier1: int = 0
    tier2: int = 0
    gpt: int = 0


CACHE_STATS = Metrics()


def update_cache_stats(
    cache: int = 0,
    info: int = 0,
    pass1: int = 0,
    pass2: int = 0,
    tier1: int = 0,
    tier2: int = 0,
    gpt: int = 0,
):
    if cache:
        CACHE_STATS.cache = int(cache)
    if info:
        CACHE_STATS.info = int(info)

    CACHE_STATS.pass1 += pass1
    CACHE_STATS.pass2 += pass2
    CACHE_STATS.tier1 += tier1
    CACHE_STATS.tier2 += tier2
    CACHE_STATS.gpt += gpt


def setup_logging():
    """
    Configure application logging with custom formatters and handlers.
    Filters out noisy loggers like watchdog and urllib3 at DEBUG level.
    """
    global _LOGGING_CONFIGURED, _TEST_MODE, _DEBUG_MODE

    # Don't configure logging if it's already been set up
    if _LOGGING_CONFIGURED:
        return

    # Check for TEST_MODE environment variable at module load time
    if os.environ.get("TEST_MODE"):
        _TEST_MODE = True
    if os.environ.get("DEBUG"):
        _DEBUG_MODE = True

    # Check for command line argument at module load time
    if "--test-mode" in sys.argv:
        _TEST_MODE = True
    elif "--online" in sys.argv:
        _TEST_MODE = False
    if "--debug" in sys.argv:
        _DEBUG_MODE = True

    # Set specific levels for application loggers
    app_loggers = [
        "main",
        "map",
        "side",
        "land",
        "llm",
        "loc",
        "cache",
        "cfg",
        "utils",
        "services",
        "components",
        "api",
        "img",
    ]

    # List of loggers to filter at DEBUG level
    noisy_loggers = [
        "watchdog",
        "fsevents",
        "urllib3",
        "PIL",
        "openai",
        "httpcore",
        "werkzeug",
    ]

    # log_level: use for application loggers (does not affect third-party loggers)
    log_level = logging.DEBUG if _DEBUG_MODE else DEFAULT_LOG_LEVEL

    # Root logger should follow the requested app log level.
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear any existing handlers
    if root_logger.handlers:
        for handler in root_logger.handlers:
            root_logger.removeHandler(handler)

    # Console handler should follow the requested app log level.
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    # Create formatter
    formatter = logging.Formatter(
        # "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        "%(name)s:%(levelname)s: %(message)s"
    )

    # Attach formatter to handler
    console_handler.setFormatter(formatter)

    # Create a filter to exclude noisy loggers' debug messages
    class NoiseFilter(logging.Filter):
        def filter(self, record):
            # Filter out DEBUG messages from noisy loggers
            if record.levelno == logging.DEBUG:
                for logger_name in noisy_loggers:
                    if record.name.startswith(logger_name):
                        return False

            """
            # Filter out specific StreamlitAPI warnings
            if (
                record.levelno == logging.WARNING
                and record.name.startswith("streamlit")
            ):
                return False
            """
            return True

    # Add filter to console handler
    console_handler.addFilter(NoiseFilter())
    root_logger.addHandler(console_handler)

    for logger_name in app_loggers:
        app_logger = logging.getLogger(logger_name)
        app_logger.setLevel(log_level)

    # Set noisy loggers to WARNING level
    for logger_name in noisy_loggers:
        logging.getLogger(logger_name).setLevel(logging.WARNING)

    # Mark as configured
    _LOGGING_CONFIGURED = True

    if _TEST_MODE:
        logger.info("TEST MODE ENABLED")

    # Return the configured root logger
    return root_logger


def configure_logging(log_level=logging.INFO):
    global DEFAULT_LOG_LEVEL
    DEFAULT_LOG_LEVEL = log_level
    setup_logging()


def is_test_mode_enabled() -> bool:
    """
    Check if the application is running in test mode.

    Returns:
        bool: True if test mode is enabled, False otherwise
    """
    global _TEST_MODE
    # No need to re-check what we already know
    return _TEST_MODE


def enable_test_mode():
    """
    Explicitly enable test mode.
    """
    global _TEST_MODE
    _TEST_MODE = True

    # Also set environment variable to ensure child processes see it
    os.environ["TEST_MODE"] = "1"


def load_config(config_path=CONFIG_FILE, force_reload=False) -> Dict[str, Any]:
    """
    Load configuration from the specified JSON file.

    Args:
        config_path (str): Path to the configuration file.
        force_reload (bool): Force reloading the config even if cached.

    Returns:
        dict: Configuration data from the file.
    """
    global _TEST_MODE, _CONFIG_CACHE

    # Use cached config if available and not forcing reload
    if _CONFIG_CACHE and not force_reload:
        return _CONFIG_CACHE

    try:
        # Fallback to hardcoded defaults if config file cannot be loaded
        _CONFIG_CACHE = {
            "defaults": {
                "default_location": {
                    "lat": 37.7749,
                    "lon": -122.4194,
                    "name": "San Francisco",
                    "country": "United States",
                    "country_code": "US",
                },
                "search_radius": 15,
                "zoom_level": 12,
            }
        }

        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                _CONFIG_CACHE = json.load(f)
                logger.info(f"Loaded {config_path}")
                return _CONFIG_CACHE
        else:
            logger.warning(
                f"Config file {config_path} not found, using defaults"
            )
    except Exception as e:
        logger.error(f"Error loading config: {str(e)}")
    return _CONFIG_CACHE


def get_default_location() -> Dict[str, Any]:
    return load_config().get("defaults", {}).get("default_location", {})
