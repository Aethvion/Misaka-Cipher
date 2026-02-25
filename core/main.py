"""
Misaka Cipher - Main Entry Point
M.I.S.A.K.A.: Multitask Intelligence & Strategic Analysis Kernel Architecture

Interactive CLI Interface (default)
Use --test flag to run verification tests
"""

import os
import sys
from pathlib import Path
import time
import webbrowser
import threading
from dotenv import load_dotenv

# Load environment variables from project root
ROOT = Path(__file__).parent.parent
env_path = ROOT / '.env'
if env_path.exists():
    load_dotenv(env_path)

from core.utils import get_logger

logger = get_logger(__name__)


def run_cli():
    """Launch interactive CLI."""
    from core import cli
    cli.main()


def open_browser():
    """Wait for server to start and then open browser."""
    time.sleep(0.5)
    logger.info("Automatically opening dashboard at http://localhost:8000")
    webbrowser.open("http://localhost:8000")


def run_web_server():
    """Launch web dashboard with orchestrator."""
    print("\n" + "=" * 70)
    print("MISAKA CIPHER - NEXUS PORTAL (WEB)")
    print("=" * 70 + "\n")
    print("Launching web server...")
    print("Dashboard will be available at: http://localhost:8000")
    print("API documentation at: http://localhost:8000/docs\n")
    print("Press CTRL+C to stop the server\n")

    # Auto-open browser if enabled in settings
    try:
        from core.workspace.preferences_manager import get_preferences_manager
        prefs = get_preferences_manager()
        if prefs.get('system.open_browser_on_startup', True):
            threading.Thread(target=open_browser, daemon=True).start()
    except Exception as e:
        logger.debug(f"Could not auto-start browser: {e}")

    try:
        import uvicorn
        from core.interfaces.dashboard.server import app

        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
    except Exception as e:
        logger.error(f"Web server failed: {str(e)}")
        import traceback
        traceback.print_exc()


def run_verification_tests():
    """Run verification tests."""
    from core.nexus_core import NexusCore, Request

    print("\n" + "=" * 70)
    print("MISAKA CIPHER - VERIFICATION TEST")
    print("=" * 70 + "\n")

    nexus = NexusCore()
    nexus.initialize()

    print("\n" + "-" * 70)
    print("SYSTEM STATUS")
    print("-" * 70)

    status = nexus.get_status()
    print(f"Initialized: {status['initialized']}")
    print(f"Active Traces: {status['active_traces']}")
    print(f"\nFirewall Status:")
    for key, value in status['firewall'].items():
        print(f"  {key}: {value}")

    print(f"\nProvider Status:")
    for provider_name, provider_info in status['providers']['providers'].items():
        print(f"  {provider_name}:")
        print(f"    Status: {provider_info['status']}")
        print(f"    Model: {provider_info['model']}")
        print(f"    Healthy: {provider_info['is_healthy']}")

    print("\n" + "-" * 70)
    print("TEST 1: Clean Request")
    print("-" * 70 + "\n")

    request = Request(
        prompt="Hello! This is a test of the Misaka Cipher system. Please respond with a brief greeting.",
        request_type="generation"
    )
    response = nexus.route_request(request)

    print(f"Trace ID: {response.trace_id}")
    print(f"Provider: {response.provider}")
    print(f"Success: {response.success}")
    print(f"Firewall Status: {response.firewall_status}")
    print(f"Routing Decision: {response.routing_decision}")

    if response.success:
        print(f"\nResponse Content:")
        print(response.content[:200] + "..." if len(response.content) > 200 else response.content)
    else:
        print(f"\nError: {response.error}")

    print("\n" + "=" * 70)
    print("VERIFICATION: COMPLETE")
    print("=" * 70 + "\n")


def main():
    try:
        if "--test" in sys.argv:
            run_verification_tests()
        elif "--cli" in sys.argv:
            run_cli()
        else:
            run_web_server()
    except Exception as e:
        logger.error(f"Application failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
