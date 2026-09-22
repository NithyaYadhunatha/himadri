"""
HIMADRI Station Device Agent — PySide6 Main Window

Layout:
  LEFT PANEL  — Connection info, asset info, live synthetic readings,
                active alerts
  RIGHT PANEL — Asset category selector (demo) + fault-injection controls
"""

from __future__ import annotations

import datetime
import threading
import time
from typing import Any

from PySide6.QtCore import Qt, QTimer, QUrl, Signal, QObject
from PySide6.QtGui import (
    QColor,
    QDesktopServices,
    QFont,
    QIcon,
    QPainter,
    QPixmap,
)
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

# ─── Constants ────────────────────────────────────────────────────────────────

ASSET_CATEGORIES = [
    ("Power", "power"),
    ("Heating", "heating"),
    ("Water", "water"),
    ("Waste", "waste"),
    ("Vehicle", "vehicle"),
    ("Instrument", "instrument"),
    ("Storage", "storage"),
    ("Medical", "medical"),
    ("Comms", "comms"),
    ("Structure", "structure"),
]

FAULT_BUTTONS = [
    ("Generator Fault", "generator_fault", "#e74c3c"),
    ("Freezer Warming", "freezer_warming", "#e67e22"),
    ("Fuel Leak", "fuel_leak", "#f39c12"),
    ("Instrument Dropout", "instrument_dropout", "#8e44ad"),
    ("PistenBully Coolant Fault", "pb_coolant_fault", "#c0392b"),
]

DARK_BG = "#0d1117"
PANEL_BG = "#161b22"
BORDER_COLOR = "#30363d"
ACCENT_BLUE = "#58a6ff"
TEXT_PRIMARY = "#e6edf3"
TEXT_SECONDARY = "#8b949e"
GREEN = "#3fb950"
YELLOW = "#d29922"
RED = "#f85149"
ORANGE = "#db6d28"
PURPLE = "#bc8cff"
TEAL = "#39c5cf"

# connection_state -> (label text, color)
_CONNECTION_META = {
    "connected": ("Connected", GREEN),
    "unreachable": ("Backend Unreachable", RED),
    "timeout": ("Request Timeout", RED),
}


def _connection_label(state: str) -> tuple[str, str]:
    if state in _CONNECTION_META:
        text, color = _CONNECTION_META[state]
        return (f"● {text}", color)
    if state.startswith("http_"):
        code = state.split("_", 1)[1]
        return (f"● HTTP {code} Error", RED)
    return ("● Connecting...", YELLOW)


def _format_reading_value(key: str, value: Any, unit: str) -> str:
    if isinstance(value, (int, float)):
        text = f"{value:,.2f}" if abs(value) < 1000 else f"{value:,.1f}"
        return f"{text} {unit}".strip()
    return f"{value} {unit}".strip()


def build_icon() -> QIcon:
    """Programmatically draw a simple monogram icon — no external asset needed."""
    pixmap = QPixmap(64, 64)
    pixmap.fill(Qt.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.Antialiasing)
    painter.setBrush(QColor(ACCENT_BLUE))
    painter.setPen(Qt.NoPen)
    painter.drawRoundedRect(2, 2, 60, 60, 16, 16)
    painter.setPen(QColor(DARK_BG))
    font = QFont("Segoe UI", 20, QFont.Bold)
    painter.setFont(font)
    painter.drawText(pixmap.rect(), Qt.AlignCenter, "HM")
    painter.end()
    return QIcon(pixmap)


# ─── Style helpers ────────────────────────────────────────────────────────────

GLOBAL_STYLE = f"""
QMainWindow, QWidget {{
    background-color: {DARK_BG};
    color: {TEXT_PRIMARY};
    font-family: 'Segoe UI', 'Inter', 'SF Pro Display', sans-serif;
    font-size: 13px;
}}

QFrame.card {{
    background-color: {PANEL_BG};
    border: 1px solid {BORDER_COLOR};
    border-radius: 8px;
    padding: 12px;
}}

QComboBox {{
    background-color: #21262d;
    border: 1px solid {BORDER_COLOR};
    border-radius: 6px;
    padding: 6px 10px;
    color: {TEXT_PRIMARY};
    font-size: 13px;
}}

QComboBox::drop-down {{
    border: none;
    width: 20px;
}}

QLabel.section-title {{
    font-size: 11px;
    font-weight: 600;
    color: {TEXT_SECONDARY};
    text-transform: uppercase;
    letter-spacing: 1px;
}}

QScrollArea {{
    border: none;
    background-color: transparent;
}}

QMenuBar {{
    background-color: {PANEL_BG};
    color: {TEXT_PRIMARY};
    border-bottom: 1px solid {BORDER_COLOR};
    padding: 2px;
}}
QMenuBar::item {{
    padding: 4px 10px;
    background: transparent;
}}
QMenuBar::item:selected {{
    background-color: {BORDER_COLOR};
    border-radius: 4px;
}}
QMenu {{
    background-color: {PANEL_BG};
    color: {TEXT_PRIMARY};
    border: 1px solid {BORDER_COLOR};
}}
QMenu::item {{
    padding: 5px 20px;
}}
QMenu::item:selected {{
    background-color: {BORDER_COLOR};
}}

QMessageBox {{
    background-color: {PANEL_BG};
}}
"""


class StatusDot(QLabel):
    """Colored dot indicating asset status."""

    _STATUS_COLORS = {
        "ok": GREEN,
        "offline": RED,
        "degraded": YELLOW,
        "fault": ORANGE,
        "simulating": ORANGE,
    }

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("●", parent)
        self.set_status("offline")

    def set_status(self, status: str) -> None:
        color = self._STATUS_COLORS.get(status, TEXT_SECONDARY)
        self.setStyleSheet(f"color: {color}; font-size: 18px;")


# ─── Signals bridge (thread-safe GUI updates) ─────────────────────────────────

class SignalBridge(QObject):
    reading_received = Signal(dict)
    alerts_received = Signal(list)
    reconnect_success = Signal(dict)
    reconnect_failed = Signal(str)


# ─── Main Window ─────────────────────────────────────────────────────────────

class MainWindow(QMainWindow):
    def __init__(
        self,
        asset_name: str,
        category: str,
        subtype: str | None,
        station_id: str,
        backend_url: str,
        heartbeat_thread,
        registration_info: dict[str, Any],
    ) -> None:
        super().__init__()
        self._heartbeat = heartbeat_thread
        self._registration = registration_info
        self._asset_name = asset_name
        self._category = category
        self._subtype = subtype
        self._station_id = station_id
        self._backend_url = backend_url
        self._last_sync_time: float = 0.0
        self._active_fault: str | None = None
        self._reading_rows: dict[str, QLabel] = {}

        self.setWindowTitle(f"HIMADRI Station Device Agent — {asset_name}")
        self.setWindowIcon(build_icon())
        self.setMinimumSize(900, 640)
        self.resize(1040, 720)

        self.setStyleSheet(GLOBAL_STYLE)

        self._signals = SignalBridge()
        self._signals.reading_received.connect(self._on_reading)
        self._signals.alerts_received.connect(self._on_alerts)
        self._signals.reconnect_success.connect(self._on_reconnect_success)
        self._signals.reconnect_failed.connect(self._on_reconnect_failed)

        self._build_menu_bar()
        self._build_ui()
        self._set_active_fault_button(None)

        # Wire heartbeat callbacks
        self._heartbeat.on_reading = lambda m: self._signals.reading_received.emit(m)
        self._heartbeat.on_alerts = lambda a: self._signals.alerts_received.emit(a)

        # Periodic "last sync" freshness refresh
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._refresh_last_sync)
        self._timer.start(1000)

    # ─── Menu bar ─────────────────────────────────────────────────────────────

    def _build_menu_bar(self) -> None:
        menu_bar = self.menuBar()

        agent_menu = menu_bar.addMenu("&Agent")
        reconnect_action = agent_menu.addAction("⟳ Reconnect to Backend")
        reconnect_action.triggered.connect(self._reconnect)
        docs_action = agent_menu.addAction("Open API Docs")
        docs_action.triggered.connect(self._open_api_docs)
        agent_menu.addSeparator()
        exit_action = agent_menu.addAction("Exit")
        exit_action.triggered.connect(self.close)

        copy_menu = menu_bar.addMenu("&Copy")
        copy_asset_action = copy_menu.addAction("Copy Asset ID")
        copy_asset_action.triggered.connect(
            lambda: QApplication.clipboard().setText(
                self._asset_id_value.property("full_value") or ""
            )
        )
        copy_key_action = copy_menu.addAction("Copy API Key")
        copy_key_action.triggered.connect(
            lambda: QApplication.clipboard().setText(
                self._api_key_value.property("full_value") or ""
            )
        )

        help_menu = menu_bar.addMenu("&Help")
        about_action = help_menu.addAction("About HIMADRI Device Agent")
        about_action.triggered.connect(self._show_about)

    # ─── UI construction ──────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(16, 16, 16, 16)
        root_layout.setSpacing(12)

        left_scroll = QScrollArea()
        left_scroll.setWidgetResizable(True)
        left_scroll.setWidget(self._build_left_panel())
        left_scroll.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        root_layout.addWidget(left_scroll, stretch=3)

        right_scroll = QScrollArea()
        right_scroll.setWidgetResizable(True)
        right_scroll.setWidget(self._build_right_panel())
        right_scroll.setFixedWidth(300)
        root_layout.addWidget(right_scroll, stretch=0)

    def _card(self) -> QFrame:
        frame = QFrame()
        frame.setObjectName("card")
        frame.setProperty("class", "card")
        frame.setStyleSheet(
            f"QFrame {{ background-color: {PANEL_BG}; border: 1px solid {BORDER_COLOR}; border-radius: 8px; }}"
        )
        return frame

    def _section_label(self, text: str) -> QLabel:
        lbl = QLabel(text.upper())
        lbl.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 10px; font-weight: 700; letter-spacing: 1px;")
        return lbl

    def _build_left_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 4)
        layout.setSpacing(10)

        # ── Asset header ─────────────────────────────────────────────────────
        header_card = self._card()
        header_layout = QHBoxLayout(header_card)
        header_layout.setContentsMargins(16, 12, 16, 12)

        self._status_dot = StatusDot()
        header_layout.addWidget(self._status_dot)

        name_col = QVBoxLayout()
        self._asset_name_label = QLabel(self._asset_name)
        self._asset_name_label.setStyleSheet(
            f"color: {TEXT_PRIMARY}; font-size: 18px; font-weight: 700;"
        )
        self._asset_type_label = QLabel(self._format_type())
        self._asset_type_label.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
        name_col.addWidget(self._asset_name_label)
        name_col.addWidget(self._asset_type_label)
        header_layout.addLayout(name_col)
        header_layout.addStretch()

        self._backend_status_label = QLabel("● Connecting...")
        self._backend_status_label.setStyleSheet(f"color: {YELLOW}; font-size: 12px; font-weight: 600;")
        header_layout.addWidget(self._backend_status_label)

        layout.addWidget(header_card)

        # ── Connection card ───────────────────────────────────────────────────
        layout.addWidget(self._build_connection_card())

        # ── Asset info card ───────────────────────────────────────────────────
        info_card = self._card()
        info_layout = QVBoxLayout(info_card)
        info_layout.setContentsMargins(16, 12, 16, 12)
        info_layout.setSpacing(8)
        info_layout.addWidget(self._section_label("Asset"))

        self._station_label = self._stat_pair(info_layout, "Station", self._station_id)
        self._last_sync_label = self._stat_pair(info_layout, "Last Sync", "Never")

        layout.addWidget(info_card)

        # ── Readings card ─────────────────────────────────────────────────────
        readings_card = self._card()
        readings_layout = QVBoxLayout(readings_card)
        readings_layout.setContentsMargins(16, 12, 16, 12)
        readings_layout.setSpacing(6)
        readings_layout.addWidget(self._section_label("Live Readings"))

        self._readings_container = QVBoxLayout()
        self._readings_container.setSpacing(6)
        self._no_readings_label = QLabel("Waiting for first heartbeat...")
        self._no_readings_label.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px; padding: 4px 0;")
        self._readings_container.addWidget(self._no_readings_label)
        readings_layout.addLayout(self._readings_container)

        layout.addWidget(readings_card)

        # ── Alerts card ───────────────────────────────────────────────────────
        alerts_card = self._card()
        alerts_layout = QVBoxLayout(alerts_card)
        alerts_layout.setContentsMargins(16, 12, 16, 12)
        alerts_layout.setSpacing(4)
        alerts_layout.addWidget(self._section_label("Active Alerts"))

        self._alerts_container = QVBoxLayout()
        self._no_alerts_label = QLabel("No active alerts")
        self._no_alerts_label.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px; padding: 4px 0;")
        self._alerts_container.addWidget(self._no_alerts_label)
        alerts_layout.addLayout(self._alerts_container)

        layout.addWidget(alerts_card)
        layout.addStretch()

        return panel

    def _format_type(self) -> str:
        parts = [self._category.replace("_", " ").title()]
        if self._subtype:
            parts.append(self._subtype.replace("_", " ").title())
        return " / ".join(parts)

    def _build_connection_card(self) -> QFrame:
        card = self._card()
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(8)

        top_row = QHBoxLayout()
        top_row.addWidget(self._section_label("Connection"))
        top_row.addStretch()

        self._reconnect_btn = QPushButton("⟳ Reconnect")
        self._reconnect_btn.setCursor(Qt.PointingHandCursor)
        self._reconnect_btn.setStyleSheet(
            f"QPushButton {{ background-color: transparent; border: 1px solid {BORDER_COLOR}; "
            f"border-radius: 5px; padding: 3px 10px; font-size: 11px; color: {ACCENT_BLUE}; }}"
            f"QPushButton:hover {{ border-color: {ACCENT_BLUE}; }}"
            f"QPushButton:disabled {{ color: {TEXT_SECONDARY}; border-color: {BORDER_COLOR}; }}"
        )
        self._reconnect_btn.setToolTip("Re-authenticate with the backend (use if the connection dropped)")
        self._reconnect_btn.clicked.connect(self._reconnect)
        top_row.addWidget(self._reconnect_btn)
        layout.addLayout(top_row)

        self._backend_url_value = self._copyable_row(
            layout, "Backend URL", self._backend_url, self._backend_url
        )

        asset_id_full = self._registration.get("asset_id", "—")
        self._asset_id_value = self._copyable_row(
            layout, "Asset ID", self._short_id(asset_id_full), asset_id_full
        )

        api_key_full = self._registration.get("api_key", "")
        self._api_key_value = self._copyable_row(
            layout, "API Key", self._mask_key(api_key_full), api_key_full
        )

        return card

    def _copyable_row(self, parent_layout: QVBoxLayout, label: str, display_value: str, full_value: str) -> QLabel:
        row = QHBoxLayout()
        lbl = QLabel(label)
        lbl.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
        val = QLabel(display_value)
        val.setStyleSheet(
            f"color: {TEXT_PRIMARY}; font-size: 11px; font-family: Consolas, 'Cascadia Mono', monospace;"
        )
        val.setProperty("full_value", full_value)
        val.setToolTip(full_value)

        copy_btn = QPushButton("Copy")
        copy_btn.setCursor(Qt.PointingHandCursor)
        copy_btn.setFixedWidth(44)
        copy_btn.setStyleSheet(
            f"QPushButton {{ background-color: #21262d; border: 1px solid {BORDER_COLOR}; "
            f"border-radius: 4px; padding: 2px 6px; font-size: 10px; color: {TEXT_SECONDARY}; }}"
            f"QPushButton:hover {{ color: {ACCENT_BLUE}; border-color: {ACCENT_BLUE}; }}"
        )
        copy_btn.clicked.connect(lambda: self._copy_value(val, copy_btn))

        row.addWidget(lbl)
        row.addStretch()
        row.addWidget(val)
        row.addWidget(copy_btn)
        parent_layout.addLayout(row)
        return val

    def _copy_value(self, source_label: QLabel, btn: QPushButton) -> None:
        value = source_label.property("full_value") or source_label.text()
        QApplication.clipboard().setText(value)
        original = btn.text()
        btn.setText("✓")
        QTimer.singleShot(1000, lambda: btn.setText(original))

    @staticmethod
    def _update_credential_display(label: QLabel, display: str, full: str) -> None:
        label.setText(display)
        label.setProperty("full_value", full)
        label.setToolTip(full)

    @staticmethod
    def _short_id(value: str) -> str:
        if not value or len(value) <= 28:
            return value or "—"
        return f"{value[:20]}…{value[-6:]}"

    @staticmethod
    def _mask_key(value: str) -> str:
        if not value:
            return "— (not registered)"
        if len(value) <= 8:
            return "•" * len(value)
        return f"{value[:4]}••••{value[-4:]}"

    def _stat_pair(self, parent_layout: QVBoxLayout, label: str, value: str) -> QLabel:
        row = QHBoxLayout()
        lbl = QLabel(label)
        lbl.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
        val = QLabel(value)
        val.setStyleSheet(f"color: {TEXT_PRIMARY}; font-size: 12px; font-weight: 500;")
        val.setAlignment(Qt.AlignRight)
        row.addWidget(lbl)
        row.addStretch()
        row.addWidget(val)
        parent_layout.addLayout(row)
        return val

    def _build_right_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 4)
        layout.setSpacing(10)

        # ── Category selector (demo) ──────────────────────────────────────────
        role_card = self._card()
        role_layout = QVBoxLayout(role_card)
        role_layout.setContentsMargins(16, 12, 16, 12)
        role_layout.setSpacing(8)
        role_layout.addWidget(self._section_label("Asset Category (Demo)"))

        self._category_combo = QComboBox()
        self._category_combo.setToolTip(
            "Changes which synthetic instrument profile THIS agent reports\n"
            "locally. The asset's real category is fixed on the backend at\n"
            "registration — this is a local demo convenience only."
        )
        for display_name, key in ASSET_CATEGORIES:
            self._category_combo.addItem(display_name, key)
        for i, (_, key) in enumerate(ASSET_CATEGORIES):
            if key == self._category:
                self._category_combo.setCurrentIndex(i)
                break
        self._category_combo.currentIndexChanged.connect(self._on_category_changed)
        role_layout.addWidget(self._category_combo)

        layout.addWidget(role_card)

        # ── Fault injection buttons ───────────────────────────────────────────
        sim_card = self._card()
        sim_layout = QVBoxLayout(sim_card)
        sim_layout.setContentsMargins(16, 12, 16, 12)
        sim_layout.setSpacing(6)
        sim_layout.addWidget(self._section_label("Fault Injection"))

        self._fault_buttons: dict[str, QPushButton] = {}
        for label, fault_type, color in FAULT_BUTTONS:
            btn = QPushButton(label)
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(lambda checked, ft=fault_type: self._start_fault(ft))
            sim_layout.addWidget(btn)
            self._fault_buttons[fault_type] = btn

        self._stop_btn = QPushButton("⏹ Stop Fault Injection")
        self._stop_btn.setCursor(Qt.PointingHandCursor)
        self._stop_btn.setStyleSheet(
            f"QPushButton {{ background-color: #21262d; border: 1px solid {BORDER_COLOR}; "
            f"border-radius: 6px; padding: 9px 12px; font-size: 13px; color: {TEXT_SECONDARY}; }}"
            f"QPushButton:hover {{ border-color: {GREEN}; color: {GREEN}; }}"
            f"QPushButton:disabled {{ color: #3a4148; border-color: {BORDER_COLOR}; }}"
        )
        self._stop_btn.clicked.connect(self._stop_fault)
        sim_layout.addWidget(self._stop_btn)

        layout.addWidget(sim_card)

        # ── Fault status ──────────────────────────────────────────────────────
        self._fault_status_card = self._card()
        fault_status_layout = QVBoxLayout(self._fault_status_card)
        fault_status_layout.setContentsMargins(16, 10, 16, 10)
        self._fault_status_label = QLabel("No fault injected")
        self._fault_status_label.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
        self._fault_status_label.setWordWrap(True)
        fault_status_layout.addWidget(self._fault_status_label)
        layout.addWidget(self._fault_status_card)

        layout.addStretch()
        return panel

    def _set_active_fault_button(self, active_type: str | None) -> None:
        """Highlight the running fault, disable the rest, and toggle Stop."""
        for label, fault_type, color in FAULT_BUTTONS:
            btn = self._fault_buttons[fault_type]
            is_active = fault_type == active_type
            btn.setEnabled(active_type is None or is_active)
            if is_active:
                btn.setStyleSheet(
                    f"QPushButton {{ background-color: {color}; border: 2px solid {color}; "
                    f"border-radius: 6px; padding: 8px 11px; font-size: 13px; font-weight: 700; "
                    f"color: #ffffff; text-align: left; }}"
                )
            else:
                btn.setStyleSheet(
                    f"QPushButton {{ background-color: {color}22; border: 1px solid {color}55; "
                    f"border-radius: 6px; padding: 9px 12px; font-size: 13px; "
                    f"color: {TEXT_PRIMARY}; text-align: left; }}"
                    f"QPushButton:hover {{ background-color: {color}44; border-color: {color}; }}"
                    f"QPushButton:pressed {{ background-color: {color}66; }}"
                    f"QPushButton:disabled {{ background-color: #21262d55; border-color: {BORDER_COLOR}; "
                    f"color: {TEXT_SECONDARY}; }}"
                )
        self._stop_btn.setEnabled(active_type is not None)

    # ─── Callbacks ────────────────────────────────────────────────────────────

    def _on_reading(self, reading: dict[str, Any]) -> None:
        """Update all UI elements with the latest reported reading. Called on
        the Qt main thread via the SignalBridge."""
        state = reading.get("connection_state", "connected")
        text, color = _connection_label(state)
        self._backend_status_label.setText(text)
        self._backend_status_label.setStyleSheet(f"color: {color}; font-size: 12px; font-weight: 600;")

        sim_active = reading.get("simulation_active", False)
        if state == "connected":
            self._status_dot.set_status("fault" if sim_active else "ok")
        else:
            self._status_dot.set_status("degraded")

        # The heartbeat is the single source of truth for whether a fault is
        # actually active — reconcile the button highlight/status label
        # against it here too, not just in _start_fault/_stop_fault. Those
        # two only fire when *this* window's own buttons are clicked; a
        # remote stop (heartbeat.py calling simulator.simulation_state.stop()
        # when the backend relays a queued stop-simulation command) changes
        # simulation_active without ever calling _stop_fault(), so without
        # this the button would stay highlighted forever even though the
        # fault genuinely stopped.
        if not sim_active and self._active_fault is not None:
            self._active_fault = None
            self._fault_status_label.setText("No fault injected")
            self._fault_status_label.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
            self._set_active_fault_button(None)

        self._update_readings(reading)

        if state == "connected":
            self._last_sync_time = time.time()
            self._last_sync_label.setText(datetime.datetime.now().strftime("%H:%M:%S"))
            self._last_sync_label.setStyleSheet(f"color: {TEXT_PRIMARY}; font-size: 12px; font-weight: 500;")
        else:
            self._last_sync_label.setStyleSheet(f"color: {RED}; font-size: 12px; font-weight: 500;")

    def _update_readings(self, reading: dict[str, Any]) -> None:
        units = reading.get("units", {}) or {}
        meta_keys = {"units", "simulation_active", "simulation_type", "connection_state"}
        series_keys = [k for k in reading.keys() if k not in meta_keys]

        if not series_keys:
            return

        if not self._no_readings_label.isHidden():
            self._no_readings_label.hide()

        for key in series_keys:
            value = reading[key]
            unit = units.get(key, "")
            if key not in self._reading_rows:
                row = QHBoxLayout()
                name_lbl = QLabel(key)
                name_lbl.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
                value_lbl = QLabel("—")
                value_lbl.setStyleSheet(f"color: {TEXT_PRIMARY}; font-size: 12px; font-weight: 600;")
                value_lbl.setAlignment(Qt.AlignRight)
                row.addWidget(name_lbl)
                row.addStretch()
                row.addWidget(value_lbl)
                self._readings_container.addLayout(row)
                self._reading_rows[key] = value_lbl
            self._reading_rows[key].setText(_format_reading_value(key, value, unit))

    def _on_alerts(self, alerts: list) -> None:
        """Refresh the alerts panel."""
        while self._alerts_container.count():
            item = self._alerts_container.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        if not alerts:
            lbl = QLabel("No active alerts")
            lbl.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px; padding: 4px 0;")
            self._alerts_container.addWidget(lbl)
            return

        severity_order = {"emergency": 0, "critical": 1, "warning": 2, "info": 3}
        sorted_alerts = sorted(alerts, key=lambda a: severity_order.get((a.get("severity") or "").lower(), 4))

        severity_colors = {"emergency": RED, "critical": RED, "warning": YELLOW, "info": ACCENT_BLUE}
        severity_bg = {"emergency": f"{RED}22", "critical": f"{RED}22", "warning": f"{YELLOW}22", "info": f"{ACCENT_BLUE}22"}

        for alert in sorted_alerts[:6]:  # Show max 6 alerts
            severity = (alert.get("severity") or "info").lower()
            color = severity_colors.get(severity, TEXT_SECONDARY)
            bg = severity_bg.get(severity, "#21262d")
            msg = alert.get("message", "")
            lbl = QLabel(f"[{severity.upper()}] {msg}")
            lbl.setStyleSheet(
                f"color: {color}; background-color: {bg}; border: 1px solid {color}44; "
                f"padding: 5px 8px; border-radius: 4px; font-size: 11px;"
            )
            lbl.setWordWrap(True)
            self._alerts_container.addWidget(lbl)

    def _on_category_changed(self, index: int) -> None:
        new_category = self._category_combo.itemData(index)
        self._category = new_category
        self._subtype = None
        self._asset_type_label.setText(self._format_type())
        self._heartbeat.set_role(new_category, None)

    def _start_fault(self, fault_type: str) -> None:
        from core import simulator
        last = self._heartbeat.get_last_snapshot()
        simulator.simulation_state.start(fault_type, last)
        self._active_fault = fault_type
        display_name = next(
            (lbl for lbl, t, _ in FAULT_BUTTONS if t == fault_type), fault_type
        )
        self._fault_status_label.setText(
            f"Active: {display_name}\n"
            f"Synthetic reading override active. Real system unaffected."
        )
        self._fault_status_label.setStyleSheet(f"color: {ORANGE}; font-size: 12px; font-weight: 600;")
        self._set_active_fault_button(fault_type)

    def _stop_fault(self) -> None:
        from core import simulator
        simulator.simulation_state.stop()
        self._active_fault = None
        self._fault_status_label.setText("No fault injected")
        self._fault_status_label.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
        self._status_dot.set_status("ok")
        self._set_active_fault_button(None)

    # ─── Reconnect ────────────────────────────────────────────────────────────

    def _reconnect(self) -> None:
        self._reconnect_btn.setEnabled(False)
        self._reconnect_btn.setText("Reconnecting...")
        self._backend_status_label.setText("● Reconnecting...")
        self._backend_status_label.setStyleSheet(f"color: {YELLOW}; font-size: 12px; font-weight: 600;")

        def worker() -> None:
            from core.registration import authenticate, RegistrationError
            try:
                result = authenticate(
                    self._registration["asset_id"],
                    self._registration["api_key"],
                    self._backend_url,
                    max_retries=3,
                )
                self._signals.reconnect_success.emit(result)
            except RegistrationError as e:
                self._signals.reconnect_failed.emit(str(e))

        threading.Thread(target=worker, daemon=True, name="ReconnectThread").start()

    def _on_reconnect_success(self, result: dict[str, Any]) -> None:
        self._registration = result
        self._backend_url = result["backend_url"]

        self._update_credential_display(
            self._backend_url_value, self._backend_url, self._backend_url
        )
        self._update_credential_display(
            self._asset_id_value, self._short_id(result["asset_id"]), result["asset_id"]
        )
        self._update_credential_display(
            self._api_key_value, self._mask_key(result["api_key"]), result["api_key"]
        )

        self._reconnect_btn.setEnabled(True)
        self._reconnect_btn.setText("⟳ Reconnect")
        self._backend_status_label.setText("● Reconnected")
        self._backend_status_label.setStyleSheet(f"color: {GREEN}; font-size: 12px; font-weight: 600;")

    def _on_reconnect_failed(self, error: str) -> None:
        self._reconnect_btn.setEnabled(True)
        self._reconnect_btn.setText("⟳ Reconnect")
        self._backend_status_label.setText("● Reconnect Failed")
        self._backend_status_label.setStyleSheet(f"color: {RED}; font-size: 12px; font-weight: 600;")
        self._backend_status_label.setToolTip(error)

    # ─── Menu actions ─────────────────────────────────────────────────────────

    def _open_api_docs(self) -> None:
        QDesktopServices.openUrl(QUrl(f"{self._backend_url}/docs"))

    def _show_about(self) -> None:
        QMessageBox.about(
            self,
            "About HIMADRI Device Agent",
            "<h3>HIMADRI Station Device Agent</h3>"
            "<p>Reports synthetic Antarctic instrument/equipment telemetry to the "
            "HIMADRI digital twin backend for Maitri and Bharati research stations.</p>"
            "<p><b>PS 26060</b> · ISRO / NCPOR<br>"
            "<b>Smart India Hackathon 2026</b></p>"
            "<p style='color:#8b949e;'>Version 2.0.0</p>",
        )

    # ─── Periodic refresh ─────────────────────────────────────────────────────

    def _refresh_last_sync(self) -> None:
        """Called by a 1-second timer — currently a no-op hook kept for
        future freshness indicators (e.g. graying out the Last Sync label
        after several missed heartbeat intervals)."""
        return

    def closeEvent(self, event) -> None:  # noqa: N802 (Qt override)
        self._heartbeat.stop()
        self._timer.stop()
        event.accept()
