#!/usr/bin/env python3
"""
Unified launch script for the Landmark Explorer application:
1. Flask development server (app.py with JavaScript frontends)
2. SimConnect-only Flask API server for local Vite runtime
3. Streamlit development server (main.py)
4. Production deployment (gunicorn with app.py)

Usage:
    python run.py --dev                     # Built-in development server
    python run.py --simconnect-only         # SimConnect-only API server
    python run.py --streamlit               # Streamlit development server
    python run.py --flask --debug           # Flask development server
    python run.py --flask --test            # Flask test mode with mock data
    python run.py --production --port 8000  # Production gunicorn server
"""

import os
import sys
import argparse
import subprocess
import psutil

# Add project root to Python path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)


def main():
    parser = argparse.ArgumentParser(
        description="Launch Landmark Explorer application"
    )

    # Mode selection (mutually exclusive and required)
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument(
        "--dev", action="store_true", help="Run development server (Flask)"
    )
    mode_group.add_argument(
        "--flask", action="store_true", help="Run built-in Flask server"
    )
    mode_group.add_argument(
        "--streamlit",
        action="store_true",
        help="Run Streamlit development server",
    )
    mode_group.add_argument(
        "--simconnect-only",
        action="store_true",
        help="Run SimConnect-only API server",
    )
    mode_group.add_argument(
        "--production",
        action="store_true",
        help="Run production gunicorn server",
    )

    # Options
    parser.add_argument(
        "--debug", action="store_true", help="Enable debug logging"
    )
    parser.add_argument(
        "--test", action="store_true", help="Enable test mode with mock data"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5000,
        help="Port to run server on (default: 5000)",
    )

    args = parser.parse_args()

    # Set environment variables
    if args.debug:
        os.environ["DEBUG"] = "1"
    if args.test:
        os.environ["TEST_MODE"] = "1"

    # Kill any existing processes before starting
    kill_processes_on_port(args.port)

    # Determine which mode to run
    if args.flask:
        run_flask(args)
    elif args.simconnect_only:
        run_simconnect_only(args)
    elif args.streamlit:
        run_streamlit(args)
    elif args.production:
        run_production(args)
    elif args.dev:
        from app import app

        app.run(
            host="0.0.0.0",
            port=args.port,
            debug=True,
            use_debugger=False,
            use_reloader=False,
        )


def kill_processes_on_port(port):
    """Kill any processes using the specified port"""
    try:
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                connections = proc.net_connections()
                for conn in connections:
                    if conn.laddr.port == port:
                        print(
                            f"Killing process {proc.info['pid']} ({proc.info['name']}) using port {port}"
                        )
                        proc.terminate()
                        proc.wait(timeout=3)
                        break
            except (
                psutil.NoSuchProcess,
                psutil.AccessDenied,
                psutil.TimeoutExpired,
            ):
                continue
    except Exception as e:
        print(f"Warning: Could not clean up port {port}: {e}")


def run_flask(args):
    """Run Flask development server"""
    print("Starting Flask development server...")
    print(f"  Debug logging: {'ENABLED' if args.debug else 'DISABLED'}")
    print(f"  Test mode: {'ENABLED' if args.test else 'DISABLED'}")
    print(f"  Port: {args.port}")
    print("  Frontend: JavaScript/HTML in src/ directory")
    print("=" * 50)

    # Set Flask environment
    os.environ["FLASK_ENV"] = "development"
    os.environ["FLASK_DEBUG"] = "1" if args.debug else "0"
    os.environ["PORT"] = str(args.port)

    # Run Flask app
    cmd = [sys.executable, "app.py"]
    subprocess.run(cmd)


def run_simconnect_only(args):
    """Run the tiny SimConnect-only Flask API server"""
    print("Starting SimConnect-only API server...")
    print(f"  Port: {args.port}")
    print("  Intended pairing: Vite dev server on 5001 proxied to /api")
    print("=" * 50)

    cmd = [sys.executable, "simconnect_app.py", "--port", str(args.port)]
    subprocess.run(cmd)


def run_streamlit(args):
    """Run Streamlit development server"""
    print("Starting Streamlit development server...")
    print(f"  Debug logging: {'ENABLED' if args.debug else 'DISABLED'}")
    print(f"  Test mode: {'ENABLED' if args.test else 'DISABLED'}")
    print(f"  Port: {args.port}")
    print("  Frontend: Streamlit UI")
    print("=" * 50)

    # Build Streamlit command
    cmd = [
        "streamlit",
        "run",
        "main.py",
        "--server.port",
        str(args.port),
        "--server.address",
        "0.0.0.0",
    ]

    # Add flags for the Python application
    extra_args = []
    if args.debug:
        extra_args.append("--debug")
    if args.test:
        extra_args.append("--test-mode")

    if extra_args:
        cmd.extend(["--"] + extra_args)

    subprocess.run(cmd)


def run_production(args):
    """Run production gunicorn server"""
    print("Starting production gunicorn server...")
    print(f"  Debug logging: {'ENABLED' if args.debug else 'DISABLED'}")
    print(f"  Test mode: {'ENABLED' if args.test else 'DISABLED'}")
    print(f"  Port: {args.port}")
    print("  Server: Gunicorn WSGI")
    print("Notes: Gunicorn is not supported on Windows.  Please run inside WSL")
    print("=" * 50)

    # Set production environment
    os.environ["FLASK_ENV"] = "production"

    # Build gunicorn command
    cmd = [
        "gunicorn",
        "--bind",
        f"0.0.0.0:{args.port}",
        "--workers",
        "4",
        "--timeout",
        "120",
        "app:app",
    ]

    if args.debug:
        cmd.extend(["--log-level", "debug"])

    subprocess.run(cmd)


if __name__ == "__main__":
    main()
