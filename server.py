"""
Flask server for Microsoft Flight Simulator SimConnect integration.
"""

from flask import Flask, jsonify
from server import simconnect

app = Flask(__name__)


# API route for MSFS Moving map
@app.route("/api/simconnect/<status>", methods=["GET"])
def get_aircraft_data(status):
    simconnect.start_simconnect_server(status)

    """SimConnect endpoint returning current aircraft telemetry"""
    return jsonify(simconnect.aircraft_data)


if __name__ == "__main__":
    # Start Flask server on port 5000
    print("SimConnect API endpoint: http://localhost:5000/api/simconnect")
    app.run(host="0.0.0.0", port=5000, debug=False)
