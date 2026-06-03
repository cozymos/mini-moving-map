"""
Blueprint for SimConnect-related API routes.
"""

from flask import Blueprint, jsonify
from services import simconnect_service

simconnect_api = Blueprint("simconnect_api", __name__)


# API route for MSFS Moving map
@simconnect_api.route("/api/simconnect/<status>", methods=["GET"])
def get_aircraft_data(status):
    """SimConnect endpoint returning current aircraft telemetry"""
    simconnect_service.start_simconnect_server(status)
    return jsonify(simconnect_service.aircraft_data)