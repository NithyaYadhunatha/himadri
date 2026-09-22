"""
HIMADRI Station Device Agent — Entry Point.

Usage:
    pip install -r requirements.txt
    python agent.py

The agent will:
  1. Ask for an Asset ID + API Key (created beforehand on the HIMADRI
     dashboard's "Connect New Device" flow — the agent never registers
     assets itself)
  2. Authenticate that pair against the backend server (GET /agent/whoami)
  3. Start the heartbeat background thread, reporting synthetic Antarctic
     instrument/equipment telemetry for that asset's category/subtype
  4. Launch the PySide6 GUI
"""

from __future__ import annotations

import sys

# pyrefly: ignore [missing-import]
import structlog

# ── Configure structlog early ─────────────────────────────────────────────────
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO level
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="%H:%M:%S"),
        structlog.dev.ConsoleRenderer(),
    ],
)

logger = structlog.get_logger(__name__)


def main() -> None:
    # ── Late imports (after structlog is configured) ───────────────────────────
    # pyrefly: ignore [missing-import]
    from PySide6.QtWidgets import QApplication, QMessageBox

    from core.registration import authenticate, load_defaults, RegistrationError
    from core.heartbeat import HeartbeatThread
    from gui.main_window import MainWindow, build_icon
    from gui.setup_dialog import DeviceSetupDialog

    app = QApplication(sys.argv)
    app.setApplicationName("HIMADRI Station Device Agent")
    app.setOrganizationName("HIMADRI")
    app.setWindowIcon(build_icon())

    logger.info("agent.starting")
    print("\n" + "=" * 60)
    print("  HIMADRI Station Device Agent")
    print("  PS 26060 - Maitri & Bharati Digital Twin (ISRO / NCPOR)")
    print("  Smart India Hackathon 2026")
    print("=" * 60)

    # ── Step 0/1: Ask for Asset ID + API Key and authenticate ─────────────────
    # The agent never registers an asset itself — only connects to one
    # already created on the HIMADRI dashboard. Loop so a bad key can be
    # retried without relaunching the whole process.
    reg: dict | None = None
    defaults = load_defaults()
    while reg is None:
        dialog = DeviceSetupDialog(defaults)
        if dialog.exec() != DeviceSetupDialog.Accepted:
            print("\n[..] Connection cancelled. Exiting.")
            sys.exit(0)
        setup = dialog.result_data()
        defaults["backend_url"] = setup["backend_url"]

        try:
            print(f"\n[...] Connecting to asset {setup['asset_id'][:16]}...")
            reg = authenticate(setup["asset_id"], setup["api_key"], setup["backend_url"])
            print(f"[OK] Connected as: {reg['asset_name']} ({reg['category']}/{reg['subtype'] or 'generic'})")
            print(f"   Asset ID : {reg['asset_id']}")
            print(f"   Station  : {reg['station_id']}")
            print(f"   Backend  : {reg['backend_url']}")
            print(f"   Interval : {reg['interval']}s")
        except RegistrationError as e:
            logger.error("agent.authentication_failed", error=str(e))
            print(f"\n[ERR] Connection failed: {e}")
            QMessageBox.critical(None, "Connection Failed", str(e))

    # ── Step 2: Start heartbeat thread ────────────────────────────────────────
    heartbeat = HeartbeatThread(
        asset_id=reg["asset_id"],
        api_key=reg["api_key"],
        backend_url=reg["backend_url"],
        category=reg["category"],
        subtype=reg["subtype"],
        interval=reg["interval"],
    )
    heartbeat.start()
    logger.info("agent.heartbeat_started", interval=reg["interval"])

    # ── Step 3: Launch GUI ────────────────────────────────────────────────────
    window = MainWindow(
        asset_name=reg["asset_name"],
        category=reg["category"],
        subtype=reg["subtype"],
        station_id=reg["station_id"],
        backend_url=reg["backend_url"],
        heartbeat_thread=heartbeat,
        registration_info=reg,
    )
    window.show()

    print("\n[GUI] Launched. Use the fault-injection buttons for the demo.")
    print("   Press Ctrl+C or close the window to stop.\n")

    exit_code = app.exec()
    heartbeat.stop()
    heartbeat.join(timeout=5)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
