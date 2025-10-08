"""
Connection to MSFS via SimConnect for real-time aircraft telemetry.
"""

import threading
import time

try:
    from SimConnect import SimConnect, AircraftRequests
except Exception as e:  # noqa: F841
    SimConnect = None

aircraft_data = {
    "latitude": 0.0,
    "longitude": 0.0,
    "altitude": 0.0,  # in meters
    "heading": 0.0,  # in degrees
}
sm_aq = None
data_thread = None


def connect_to_simconnect():
    if SimConnect is None:
        print("SimConnect connectivity not available")
        return None
    try:
        global sm_aq
        if sm_aq is None:
            sm_aq = AircraftRequests(
                SimConnect(), _time=100
            )  # Update every 100ms
            aircraft_data["connected"] = True
        return sm_aq
    except Exception as e:
        print(f"✗ Failed to connect via SimConnect: {e}")
        return None


def update_aircraft_data(stop_event):
    """Background thread to continuously update aircraft data"""
    if connect_to_simconnect():
        print("Starting SimConnect Proxy for MSFS Moving map...")
    else:
        center_lat = 37.6188  # e.g. SFO airport
        center_long = -122.3754
        radius = 0.01
        t = 0.0
        print("Starting Circular flight demo/test mode...")

    global sm_aq
    while not stop_event.is_set():
        try:
            if sm_aq:
                # Get current aircraft position and heading
                lat = sm_aq.get("PLANE_LATITUDE")
                lon = sm_aq.get("PLANE_LONGITUDE")
                alt_ft = sm_aq.get("PLANE_ALTITUDE")
                heading = sm_aq.get("MAGNETIC_COMPASS")
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
            stop_event.set()
            sm_aq = None
            print(f"Error reading aircraft data: {err}")
            aircraft_data["connected"] = False

        # Update at 1Hz
        time.sleep(1)


def start_simconnect_server(status):
    if status == "connect":
        return connect_to_simconnect()

    global data_thread
    if status == "track" and (
        data_thread is None or not data_thread.is_alive()
    ):
        # Start background thread for data updates
        stop_event = threading.Event()
        data_thread = threading.Thread(
            target=update_aircraft_data, args=(stop_event,), daemon=True
        )
        data_thread.start()
