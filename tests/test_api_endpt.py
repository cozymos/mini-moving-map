#!/usr/bin/env python3
"""
Test script to verify the API endpoints
"""

import os
import sys
import requests
import traceback

# Add the project root directory to the Python path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
)

# Default test port
TEST_PORT = 5000


def start_test_server():
    """Start a test server on a dedicated port."""
    print(f"2do: start a test server (flask) on port {TEST_PORT}...")
    server_process = None
    # Give the server time to start
    # import time
    # time.sleep(2)
    print("Waiting for server to start...")

    return server_process


def stop_test_server(server_process):
    """Stop the test server."""
    print("Stopping test server...")
    # server_process.terminate()
    # server_process.wait(timeout=5)
    print("Server stopped.")


def test_map_config_endpoint():
    """Test the map configuration endpoint."""
    print("\nTesting /api/map/config endpoint...")

    response = requests.get(f"http://localhost:{TEST_PORT}/api/map/config")

    if response.status_code == 200:
        config = response.json()
        print(f"Map config received: {len(config)} items")
        print(
            f"Default Location: {config.get('defaults', 'Not found').get('default_location', 'Not found')}"
        )
        return True
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return False


def test_landmark_search_endpoint():
    """Test the landmark search endpoint."""
    print("\nTesting /api/landmark/search endpoint...")

    # Use the default test coordinates (San Francisco)
    lat = 37.7749
    lon = -122.4194

    response = requests.get(
        f"http://localhost:{TEST_PORT}/api/landmark/search",
        params={"lat": lat, "lon": lon},
    )

    if response.status_code == 200:
        data = response.json()
        print(f"Location: {data.get('location', 'Not found')}")
        landmarks = data.get("landmarks", [])
        print(f"Found {len(landmarks)} landmarks")

        if landmarks:
            for i, landmark in enumerate(landmarks[:], 1):
                print(f"  {i}. {landmark.get('name', 'Unnamed')}")

        return True
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return False


def test_landmark_image_endpoint():
    """Test the landmark image endpoint."""
    print("\nTesting /api/landmark/image endpoint...")

    # Test with a known landmark from test fixtures
    landmark_name = "Golden Gate Bridge"
    print(f"  Fetching image for landmark: {landmark_name}")

    response = requests.get(
        f"http://localhost:{TEST_PORT}/api/landmark/image/{landmark_name}"
    )

    if response.status_code == 200:
        content_type = response.headers.get("Content-Type", "")
        content_length = len(response.content)

        print(f"Image received: {content_type}, {content_length} bytes")
        return True
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return False


def test_geocode_endpoint():
    """Test the geocode endpoint for both forward and reverse geocoding."""
    print("\nTesting /api/landmark/geocode endpoint...")

    all_passed = True

    # Test forward geocoding (location name to coordinates)
    print("  Testing forward geocoding...")
    test_locations = ["San Francisco, CA", "New York, NY"]

    for location in test_locations:
        print(f"    Testing forward geocode for: {location}")

        response = requests.get(
            f"http://localhost:{TEST_PORT}/api/landmark/geocode",
            params={"location": location},
        )

        if response.status_code == 200:
            data = response.json()
            if data.get("type") == "forward":
                coordinates = data.get("coordinates", {})
                lat = coordinates.get("lat")
                lon = coordinates.get("lon")

                if lat is not None and lon is not None:
                    print(
                        f"    ✓ Forward geocoded '{location}' to: ({lat}, {lon})"
                    )
                else:
                    print(f"    ✗ No coordinates in response: {data}")
                    all_passed = False
            else:
                print(f"    ✗ Unexpected response type: {data}")
                all_passed = False
        else:
            print(f"    ✗ Error: {response.status_code} - {response.text}")
            all_passed = False

    # Test reverse geocoding (coordinates to location name)
    print("  Testing reverse geocoding...")
    test_coordinates = [
        {
            "lat": 37.7749,
            "lon": -122.4194,
            "expected_contains": "San Francisco",
        },
        {"lat": 40.7128, "lon": -74.0060, "expected_contains": "New York"},
    ]

    for coord_test in test_coordinates:
        lat, lon = coord_test["lat"], coord_test["lon"]
        expected_contains = coord_test["expected_contains"]
        print(f"    Testing reverse geocode for: ({lat}, {lon})")

        response = requests.get(
            f"http://localhost:{TEST_PORT}/api/landmark/geocode",
            params={"lat": lat, "lon": lon},
        )

        if response.status_code == 200:
            data = response.json()
            if data.get("type") == "reverse":
                location_name = data.get("location_name")
                country = data.get("country", "")
                country_code = data.get("country_code", "")

                if location_name:
                    print(
                        f"    ✓ Reverse geocoded ({lat}, {lon}) to: {location_name}"
                    )
                    if expected_contains.lower() in location_name.lower():
                        print(
                            f"    ✓ Location contains expected text: {expected_contains}"
                        )
                    else:
                        print(
                            f"    ⚠ Location doesn't contain expected text: {expected_contains}"
                        )

                    if country:
                        print(f"      Country: {country} ({country_code})")
                else:
                    print(f"    ✗ No location name in response: {data}")
                    all_passed = False
            else:
                print(f"    ✗ Unexpected response type: {data}")
                all_passed = False
        else:
            print(f"    ✗ Error: {response.status_code} - {response.text}")
            all_passed = False

    # Test error cases
    print("  Testing error cases...")

    # Test missing parameters
    response = requests.get(
        f"http://localhost:{TEST_PORT}/api/landmark/geocode"
    )
    if response.status_code == 400:
        print("    ✓ Missing parameters correctly rejected")
    else:
        print(
            f"    ✗ Missing parameters should return 400, got: {response.status_code}"
        )
        all_passed = False

    # Test conflicting parameters
    response = requests.get(
        f"http://localhost:{TEST_PORT}/api/landmark/geocode",
        params={"location": "San Francisco", "lat": 37.7749, "lon": -122.4194},
    )
    if response.status_code == 400:
        print("    ✓ Conflicting parameters correctly rejected")
    else:
        print(
            f"    ✗ Conflicting parameters should return 400, got: {response.status_code}"
        )
        all_passed = False

    # Test invalid coordinates
    response = requests.get(
        f"http://localhost:{TEST_PORT}/api/landmark/geocode",
        params={"lat": 91, "lon": -122.4194},  # Invalid latitude > 90
    )
    if response.status_code == 400:
        print("    ✓ Invalid coordinates correctly rejected")
    else:
        print(
            f"    ✗ Invalid coordinates should return 400, got: {response.status_code}"
        )
        all_passed = False

    return all_passed


def test_cache_images_endpoint():
    """Test the cache images endpoint."""
    print("\nTesting /api/landmark/cache-images endpoint...")

    # Test data with landmark name and image URL pairs
    test_images = [
        {"name": "Twin Peaks", "image_url": ""},
        {
            "name": "Alcatraz Island",
            "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Alcatraz_Island_aerial_view.jpg/1920px-Alcatraz_Island_aerial_view.jpg",
        },
    ]

    # Perform a POST request to cache images
    response = requests.post(
        f"http://localhost:{TEST_PORT}/api/landmark/cache-images",
        json=test_images,
        headers={"Content-Type": "application/json"},
    )

    if response.status_code == 200:
        data = response.json()
        status = data.get("status")
        cached_count = data.get("cached_count", 0)
        failed_count = data.get("failed_count", 0)

        if status == "success":
            print(
                f"  ✓ Images cached: {cached_count} successful, {failed_count} failed"
            )
            return True
        else:
            print(f"  ✗ Unexpected response status: {status}")
            return False
    else:
        print(f"  ✗ Error: {response.status_code} - {response.text}")
        return False


def test_clear_cache_endpoint():
    """Test the clear cache endpoint."""
    print("\nTesting /api/landmark/clear-cache endpoint...")

    # Perform a POST request to clear the cache
    response = requests.post(
        f"http://localhost:{TEST_PORT}/api/landmark/clear-cache"
    )

    if response.status_code == 200:
        data = response.json()
        status = data.get("status")
        message = data.get("message")

        if status == "success":
            print(f"  ✓ Cache cleared successfully: {message}")
            return True
        else:
            print(f"  ✗ Unexpected response status: {status}")
            return False
    else:
        print(f"  ✗ Error: {response.status_code} - {response.text}")
        return False


def main():
    """Main function to run the tests."""
    # Parse command line arguments
    if len(sys.argv) > 1:
        global TEST_PORT
        try:
            TEST_PORT = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
            sys.exit(1)

    # Start the test server
    server_process = start_test_server()

    try:
        # Run the tests
        test_results = {
            "Map Config": test_map_config_endpoint(),
            # "Clear Cache": test_clear_cache_endpoint(),
            "Landmark Search": test_landmark_search_endpoint(),
            # "Landmark Image": test_landmark_image_endpoint(),
            "Cache Images": test_cache_images_endpoint(),
            # "Geocode": test_geocode_endpoint(),
        }

        # Print test summary
        print("\n=== 📝 Test Summary ===")
        all_passed = True
        for test_name, result in test_results.items():
            status = "✓ PASS" if result else "✗ FAIL"
            print(f"{test_name}: {status}")
            if not result:
                all_passed = False

        # Set exit code based on test results
        if all_passed:
            print("\n🏁 All tests passed!")
            return 0
        else:
            print("\n⏹️ Some tests failed!")
            return 1

    except requests.exceptions.HTTPError as e:
        print(
            f"HTTP Error occurred: {e.response.status_code} - {e.response.text}"
        )
    except requests.exceptions.RequestException as e:
        print(f"An error occurred during the request: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        print(f"Error details: {traceback.format_exc()}")
    finally:
        # Always stop the test server
        stop_test_server(server_process)


if __name__ == "__main__":
    sys.exit(main())
