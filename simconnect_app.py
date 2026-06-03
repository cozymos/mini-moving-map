#!/usr/bin/env python3
"""
Tiny Flask entrypoint exposing only the SimConnect API.
"""

import argparse

from flask import Flask

from components.simconnect_api import simconnect_api
from utils.config_utils import setup_logging

setup_logging()
app = Flask(__name__)
app.register_blueprint(simconnect_api)


def main():
    parser = argparse.ArgumentParser(
        description="Launch SimConnect-only API server"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5000,
        help="Port to run SimConnect-only server on (default: 5000)",
    )
    args = parser.parse_args()

    print(f"SimConnect API endpoint: http://localhost:{args.port}/api/simconnect")
    app.run(host="0.0.0.0", port=args.port, debug=False)


if __name__ == "__main__":
    main()
