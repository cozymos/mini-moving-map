"""
Connection to MSFS via SimConnect for real-time aircraft telemetry.
"""

import time
import threading

try:
    from SimConnect import SimConnect, AircraftRequests
except Exception as e:  # noqa: F841
    SimConnect = None
    AircraftRequests = None

# Global variables for aircraft data
aircraft_data = {
    "latitude": 0.0,
    "longitude": 0.0,
    "altitude": 0.0,  # in meters
    "heading": 0.0,  # in degrees
}

# SimConnect instance
sm = None
data_thread = None
data_lock = threading.Lock()


def connect_to_simconnect():
    """Initialize SimConnect connection to MSFS"""
    global sm, aircraft_data
    if SimConnect is None:
        print("SimConnect library not available")
        return None

    try:
        if sm is None:
            sm = SimConnect()

        # Request data definitions for aircraft position and orientation
        # AircraftRequests handles the data request setup automatically
        if AircraftRequests is None:
            print("SimConnect library not available")
            return None
        aq = AircraftRequests(sm, _time=100)  # Update every 100ms

        with data_lock:
            aircraft_data["connected"] = True
        return aq
    except Exception as e:
        print(f"✗ Failed to connect via SimConnect: {e}")
        return None


def update_aircraft_data():
    """Background thread to continuously update aircraft data"""
    global aircraft_data
    if aq := connect_to_simconnect():
        print("Starting SimConnect Proxy for MSFS Moving map...")
    else:
        center_lat = 37.6188  # e.g. SFO airport
        center_long = -122.3754
        radius = 0.01
        t = 0.0
        print("Starting Circular flight demo/test mode...")

    while True:
        try:
            if sm and aq:
                # Get current aircraft position and heading
                lat = aq.get("PLANE_LATITUDE")
                lon = aq.get("PLANE_LONGITUDE")
                alt_ft = aq.get("PLANE_ALTITUDE")
                heading = aq.get("MAGNETIC_COMPASS")
                with data_lock:
                    aircraft_data.update(
                        {
                            "latitude": lat if lat else 0.0,
                            "longitude": lon if lon else 0.0,
                            "altitude": alt_ft * 0.3048 if alt_ft else 0.0,
                            "heading": heading if heading else 0.0,
                            "connected": True,
                            "last_update": time.time(),
                        }
                    )
            else:
                import math

                aircraft_data.update(
                    {
                        "latitude": center_lat + radius * math.cos(t),
                        "longitude": center_long + radius * math.sin(t),
                        "altitude": 100,
                        "heading": 90 + math.degrees(t) % 360,
                    }
                )
                t += 0.05

        except Exception as err:
            print(f"Error reading aircraft data: {err}")
            with data_lock:
                aircraft_data["connected"] = False

        # Update at 1Hz
        time.sleep(1)


def start_simconnect_server(status):
    if status == "connect":
       return connect_to_simconnect()

    global data_thread
    if status == "track" and (data_thread is None or not data_thread.is_alive()):
        # Start background thread for data collection
        data_thread = threading.Thread(target=update_aircraft_data, daemon=True)
        data_thread.start()
