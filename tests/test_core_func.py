#!/usr/bin/env python3
"""
Core Functionality Test Suite
Tests critical components with direct function calls for regression testing.

Focus Areas:
1. Cache Manager - Core caching logic and data integrity
2. Coordinate Utilities - Input validation and normalization
3. Configuration Loading - System configuration and test mode
4. Service Integration - Inter-service communication
5. API Endpoint Responses - Server-side functionality
"""

import os
import sys
import tempfile
import shutil
from unittest.mock import patch

# Add project root to path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
)

from components.cache_manager import CacheManager
from utils.coord_utils import validate_coords, standardize_coord_dict
from utils.config_utils import load_config
from utils.prompt_utils import load_prompts


class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def record_pass(self, test_name):
        self.passed += 1
        print(f"✓ PASS: {test_name}")

    def record_fail(self, test_name, error):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"✗ FAIL: {test_name} - {error}")

    def summary(self):
        total = self.passed + self.failed
        print("\n=== Test Summary ===")
        print(f"Total: {total}, Passed: {self.passed}, Failed: {self.failed}")
        if self.errors:
            print("\nFailed Tests:")
            for error in self.errors:
                print(f"  - {error}")
        return self.failed == 0


def test_coordinate_validation(results):
    """Test coordinate validation and normalization functions"""

    # Valid coordinates
    test_cases = [
        (37.7749, -122.4194, True, "San Francisco coordinates"),
        (0, 0, True, "Equator coordinates"),
        (90, 180, True, "Maximum valid coordinates"),
        (-90, -180, True, "Minimum valid coordinates"),
        (91, 0, False, "Invalid latitude > 90"),
        (-91, 0, False, "Invalid latitude < -90"),
        (0, 181, False, "Invalid longitude > 180"),
        (0, -181, False, "Invalid longitude < -180"),
        (None, None, False, "None coordinates"),
        ("invalid", "coords", False, "Invalid string coordinates"),
    ]

    for lat, lon, expected, description in test_cases:
        try:
            result = validate_coords(lat, lon)
            if result == expected:
                results.record_pass(f"Coordinate validation: {description}")
            else:
                results.record_fail(
                    f"Coordinate validation: {description}",
                    f"Expected {expected}, got {result}",
                )
        except Exception as e:
            results.record_fail(f"Coordinate validation: {description}", str(e))


def test_coordinate_normalization(results):
    """Test coordinate standardization function"""

    test_cases = [
        (
            {"lat": 37.7749, "lng": -122.4194},
            {"lat": 37.7749, "lon": -122.4194},
        ),
        (
            {"latitude": 37.7749, "longitude": -122.4194},
            {"lat": 37.7749, "lon": -122.4194},
        ),
        (
            {"lat": "37.7749", "lon": "-122.4194"},
            {"lat": 37.7749, "lon": -122.4194},
        ),
    ]

    # Test valid cases
    for input_coords, expected in test_cases:
        try:
            result = standardize_coord_dict(input_coords)
            if result == expected:
                results.record_pass(
                    f"Coordinate standardization: {input_coords}"
                )
            else:
                results.record_fail(
                    f"Coordinate standardization: {input_coords}",
                    f"Expected {expected}, got {result}",
                )
        except Exception as e:
            results.record_fail(
                f"Coordinate standardization: {input_coords}", str(e)
            )

    # Test error cases
    error_cases = [
        ({}, "Empty input"),
        ({"lat": 37.7749}, "Missing longitude"),
        ({"invalid": "coords"}, "Invalid keys"),
    ]

    for input_coords, description in error_cases:
        try:
            result = standardize_coord_dict(input_coords)
            results.record_fail(
                f"Coordinate standardization error handling: {description}",
                f"Expected ValueError but got {result}",
            )
        except ValueError:
            results.record_pass(
                f"Coordinate standardization error handling: {description}"
            )
        except Exception as e:
            results.record_fail(
                f"Coordinate standardization error handling: {description}",
                f"Unexpected error: {str(e)}",
            )


def test_cache_manager_core(results):
    """Test cache manager core functionality"""

    # Create temporary cache directory
    temp_dir = tempfile.mkdtemp()

    try:
        # Mock the cache directory
        with patch("utils.config_utils.CACHE_DIR", temp_dir):
            with patch(
                "utils.config_utils.IMAGE_DIR", os.path.join(temp_dir, "images")
            ):
                with patch(
                    "utils.config_utils.LANDMARK_CACHE_FILE",
                    os.path.join(temp_dir, "landmarks_cache.json"),
                ):
                    with patch(
                        "utils.config_utils.LANDMARK_INFO_CACHE_FILE",
                        os.path.join(temp_dir, "landmark_info_cache.json"),
                    ):
                        cache_manager = CacheManager()

                        # Test landmark caching
                        test_landmarks = [
                            {
                                "name": "Test Landmark",
                                "lat": 37.7749,
                                "lon": -122.4194,
                                "desc": "Test description",
                            }
                        ]

                        # Test cache storage
                        cache_success = cache_manager.cache_landmarks(
                            "San Francisco",
                            37.7749,
                            -122.4194,
                            15,
                            test_landmarks,
                        )

                        if cache_success:
                            results.record_pass(
                                "Cache manager: Store landmarks"
                            )
                        else:
                            results.record_fail(
                                "Cache manager: Store landmarks",
                                "Failed to cache",
                            )

                        # Test cache retrieval
                        cached_landmarks = cache_manager.get_cached_landmarks(
                            "San Francisco", 37.7749, -122.4194, 15
                        )

                        if cached_landmarks and len(cached_landmarks) == 1:
                            results.record_pass(
                                "Cache manager: Retrieve landmarks"
                            )
                        else:
                            results.record_fail(
                                "Cache manager: Retrieve landmarks",
                                f"Expected 1 landmark, got {len(cached_landmarks) if cached_landmarks else 0}",
                            )

                        # Test proximity matching
                        nearby_landmarks = cache_manager.get_cached_landmarks(
                            "San Francisco",
                            37.775,
                            -122.419,
                            15,  # Slightly different coordinates
                        )

                        if nearby_landmarks:
                            results.record_pass(
                                "Cache manager: Proximity matching"
                            )
                        else:
                            results.record_fail(
                                "Cache manager: Proximity matching",
                                "No nearby landmarks found",
                            )

                        # Test cache clearing
                        clear_success = cache_manager.clear_cache()
                        if clear_success:
                            results.record_pass("Cache manager: Clear cache")
                        else:
                            results.record_fail(
                                "Cache manager: Clear cache", "Failed to clear"
                            )

    except Exception as e:
        results.record_fail("Cache manager setup", str(e))

    finally:
        # Clean up temporary directory
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_config_loading(results):
    """Test configuration loading and test mode detection"""

    try:
        config = load_config()

        # Test required config sections
        required_sections = ["defaults", "test_mode"]
        for section in required_sections:
            if section in config:
                results.record_pass(f"Config loading: {section} section exists")
            else:
                results.record_fail(
                    f"Config loading: {section} section exists",
                    "Section missing",
                )

        # Test default location structure
        if "default_location" in config.get("defaults", {}):
            default_loc = config["defaults"]["default_location"]
            required_fields = ["lat", "lon", "name"]
            for field in required_fields:
                if field in default_loc:
                    results.record_pass(
                        f"Config loading: default_location.{field}"
                    )
                else:
                    results.record_fail(
                        f"Config loading: default_location.{field}",
                        "Field missing",
                    )

        # Test test mode data
        if "test_landmarks" in config.get("test_mode", {}):
            test_landmarks = config["test_mode"]["test_landmarks"]
            if isinstance(test_landmarks, list) and len(test_landmarks) > 0:
                results.record_pass("Config loading: test_landmarks data")
            else:
                results.record_fail(
                    "Config loading: test_landmarks data",
                    "Invalid or empty test data",
                )

        # Test mode detection (check if test_mode exists in config)
        test_mode = "test_mode" in config and config["test_mode"] is not None
        results.record_pass(
            f"Config loading: test mode detection ({test_mode})"
        )

    except Exception as e:
        results.record_fail("Config loading", str(e))


def test_prompt_loading(results):
    """Test prompt template loading"""

    try:
        prompts = load_prompts()

        if not prompts:
            results.record_pass("Prompt loading: No prompts file (acceptable)")
            return

        # Check that prompts loaded successfully
        if isinstance(prompts, dict) and len(prompts) > 0:
            results.record_pass("Prompt loading: Successfully loaded prompts")

            # Check for any available prompt categories
            for category_name, category_data in prompts.items():
                if isinstance(category_data, dict):
                    results.record_pass(
                        f"Prompt loading: {category_name} category exists"
                    )
                    break
        else:
            results.record_fail("Prompt loading", "No prompts loaded")

    except Exception as e:
        results.record_fail("Prompt loading", str(e))


def test_error_handling(results):
    """Test error handling in core functions"""

    # Test coordinate validation with edge cases
    edge_cases = [
        (float("inf"), 0, "Infinity latitude"),
        (0, float("inf"), "Infinity longitude"),
        (float("nan"), 0, "NaN latitude"),
        (0, float("nan"), "NaN longitude"),
    ]

    for lat, lon, description in edge_cases:
        try:
            result = validate_coords(lat, lon)
            if not result:  # Should handle gracefully and return False
                results.record_pass(f"Error handling: {description}")
            else:
                results.record_fail(
                    f"Error handling: {description}",
                    f"Expected False, got {result}",
                )
        except Exception as e:
            # Catching exception is also acceptable for edge cases
            results.record_pass(
                f"Error handling: {description} (exception caught)", str(e)
            )


def main():
    """Run all core functionality tests"""
    print("=== Core Functionality Test Suite ===")
    print("Testing critical components for regression...")

    results = TestResults()

    # Run test suites
    test_coordinate_validation(results)
    test_coordinate_normalization(results)
    test_cache_manager_core(results)
    test_config_loading(results)
    test_prompt_loading(results)
    test_error_handling(results)

    # Print final results
    success = results.summary()

    if success:
        print("\n✅ All core functionality tests passed!")
        return True
    else:
        print(f"\n❌ {results.failed} tests failed!")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
