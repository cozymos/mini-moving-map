import json
import os
from pathlib import Path
from flask import Flask, Response, jsonify, send_from_directory
from components import endpoints
from components.simconnect_api import simconnect_api
from utils.config_utils import setup_logging, load_config
import logging

# Configure logging before importing app, including debug/test-mode
setup_logging()
PRODUCTION_DEPLOYMENT = None

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"
DIST_ASSETS_DIR = DIST_DIR / "assets"
PUBLIC_DIR = BASE_DIR / "public"
SRC_DIR = BASE_DIR / "src"

# Serve public files directly from the root URL.
app = Flask(__name__, static_folder="public", static_url_path="")

# Configure Flask debugging settings
# app.config["DEBUG"] = True
# app.config["JSON_SORT_KEYS"] = False
# app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True

# Register blueprints
app.register_blueprint(endpoints.landmark_routes)
app.register_blueprint(simconnect_api)


def is_production_environment():
    """
    Check if the application is running in a production environment

    Returns:
        bool: True if running in production with gunicorn, False otherwise
    """
    global PRODUCTION_DEPLOYMENT
    if PRODUCTION_DEPLOYMENT is not None:
        return PRODUCTION_DEPLOYMENT
    else:
        PRODUCTION_DEPLOYMENT = True

    # Check common production environment indicators
    if os.environ.get("FLASK_ENV") == "production":
        return True

    if os.getenv("REPLIT_DEPLOYMENT") == "1":
        return True

    # Check for gunicorn-specific environment variables
    if "gunicorn" in os.environ.get("SERVER_SOFTWARE", "").lower():
        return True

    # Check if gunicorn is in the process name/command line
    try:
        import psutil

        current_process = psutil.Process()
        cmdline = " ".join(current_process.cmdline()).lower()
        if "gunicorn" in cmdline:
            return True
    except (ImportError, Exception):
        pass

    # Check if running under a WSGI server (gunicorn sets this)
    if (
        hasattr(app, "wsgi_app")
        and "gunicorn" in str(type(app.wsgi_app)).lower()
    ):
        return True

    PRODUCTION_DEPLOYMENT = False
    logging.info("Production environment not detected")
    return False


# (1) Route for main entry point index.html
@app.route("/")
def index():
    """
    Serve the application shell.
    """
    logging.debug("Rendering main index page")
    if (DIST_DIR / "index.html").exists():
        return send_from_directory(str(DIST_DIR), "index.html")
    return send_from_directory(str(BASE_DIR), "index.html")


@app.route("/assets/<path:filename>")
def dist_assets(filename):
    """
    Serve built frontend assets when a Vite build is present.
    """
    return send_from_directory(str(DIST_ASSETS_DIR), filename)


@app.route("/favicon.ico")
def favicon():
    """
    Serve a distinct favicon for backend-assisted remote mode.
    """
    remote_favicon = PUBLIC_DIR / "favicon-remote.ico"
    if remote_favicon.exists():
        return send_from_directory(str(PUBLIC_DIR), "favicon-remote.ico")
    return send_from_directory(str(PUBLIC_DIR), "favicon.ico")


@app.route("/app-config.js")
def app_config():
    """
    Serve runtime configuration for the backend-assisted app mode.
    """
    config = {
        "runtime_mode": "remote",
        "jsonConfig_url": "/api/map/config",
        "CACHE_TTL_HOURS": 48,
        "GOOGLE_MAPS_API_KEY": os.environ.get("GOOGLE_MAPS_API_KEY"),
        "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY"),
        "GEMINI_API_KEY": os.environ.get("GEMINI_API_KEY"),
    }
    js = "window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, " + json.dumps(
        config
    ) + ");\n"
    return Response(js, mimetype="application/javascript")


# (2) Route for leaflet map component/library
@app.route("/map")
def leaflet():
    """
    Render the leaflet map.
    """
    logging.debug("Rendering leaflet map")
    return send_from_directory(str(SRC_DIR), "map.html")


# (3) Custom route to serve from 'src' directory (mimic Vite's default)
# This makes files in 'src' available under the '/src/' URL prefix
@app.route("/src/<path:filename>")
def src_files(filename):
    return send_from_directory(str(SRC_DIR), filename)


# API routes (your backend logic)
@app.route("/api/map/config", methods=["GET"])
def api_get_config():
    """
    Get the app configuration settings.

    Returns:
        JSON response with app configuration including test data.
    """
    try:
        config = load_config()
        return jsonify(config)
    except Exception as e:
        logging.error(f"Error retrieving map config: {str(e)}")
        return jsonify(
            {"error": "Could not retrieve map config", "message": str(e)}
        ), 500

# Secret key used by Flask to sign cookies
app.secret_key = os.environ.get("SESSION_SECRET", "map_secret_key")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=True,  # set False for production
        use_debugger=False,  # Optional: disables debugger auto-inject
        use_reloader=True,  # auto reloads, but without watchdog
        reloader_type="stat",  # use 'stat' for compatibility with Windows
    )
