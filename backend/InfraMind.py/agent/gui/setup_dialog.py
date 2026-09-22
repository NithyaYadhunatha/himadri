"""
Device Connect Dialog — shown once at startup, before authentication.

The agent never registers assets itself (security: an unauthenticated
script should not be able to mint station assets on the backend). An asset
is created from the HIMADRI frontend's "Connect New Device" action, which
hands back an Asset ID + API Key. This dialog only ever connects the agent
to an *existing* asset using that pair — either freshly pasted, or reopened
from this machine's local cache of previously-used assets.
"""

from __future__ import annotations

from typing import Any

from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
)

from core import device_store

NEW_CONNECTION_SENTINEL = "__new__"

DARK_BG = "#0d1117"
BORDER_COLOR = "#30363d"
ACCENT_BLUE = "#58a6ff"
TEXT_PRIMARY = "#e6edf3"
TEXT_SECONDARY = "#8b949e"
RED = "#f85149"

DIALOG_STYLE = f"""
QDialog {{
    background-color: {DARK_BG};
    color: {TEXT_PRIMARY};
    font-family: 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px;
}}
QLabel {{ color: {TEXT_PRIMARY}; }}
QLineEdit, QComboBox {{
    background-color: #21262d;
    border: 1px solid {BORDER_COLOR};
    border-radius: 6px;
    padding: 6px 8px;
    color: {TEXT_PRIMARY};
}}
QLineEdit:focus, QComboBox:focus {{ border-color: {ACCENT_BLUE}; }}
QPushButton {{
    background-color: #21262d;
    border: 1px solid {BORDER_COLOR};
    border-radius: 6px;
    padding: 6px 16px;
    color: {TEXT_PRIMARY};
}}
QPushButton:hover {{ border-color: {ACCENT_BLUE}; }}
QPushButton[text="OK"] {{
    background-color: {ACCENT_BLUE};
    color: {DARK_BG};
    font-weight: 600;
    border: none;
}}
"""


class DeviceSetupDialog(QDialog):
    """Collects an Asset ID + API Key before the agent connects to that asset."""

    def __init__(self, defaults: dict[str, Any], parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("HIMADRI Station Device Agent — Connect")
        self.setMinimumWidth(460)
        self.setStyleSheet(DIALOG_STYLE)

        self._cached_devices = device_store.list_entries()
        self._result: dict[str, Any] | None = None

        root = QVBoxLayout(self)

        intro = QLabel(
            "Paste the Asset ID and API Key shown when this device was connected "
            "on the HIMADRI dashboard (Digital Twin -> Connect New Device). "
            "This agent cannot create assets itself."
        )
        intro.setWordWrap(True)
        intro.setStyleSheet(f"color: {TEXT_SECONDARY}; font-size: 12px;")
        root.addWidget(intro)

        form = QFormLayout()
        form.setSpacing(8)

        self._existing_combo = QComboBox()
        self._existing_combo.addItem("- Enter Asset ID / API Key -", NEW_CONNECTION_SENTINEL)
        for entry in self._cached_devices:
            short_id = entry["asset_id"][:24]
            label = f"{entry.get('asset_name', 'Unnamed')} ({entry.get('category', '?')}) - {short_id}"
            self._existing_combo.addItem(label, entry["asset_id"])
        self._existing_combo.currentIndexChanged.connect(self._on_existing_selected)
        form.addRow("Reopen Saved Device:", self._existing_combo)

        self._asset_id_edit = QLineEdit()
        self._asset_id_edit.setPlaceholderText("Asset ID from the dashboard, e.g. maitri-power-generator-01")
        form.addRow("Asset ID:", self._asset_id_edit)

        self._api_key_edit = QLineEdit()
        self._api_key_edit.setPlaceholderText("API Key from the dashboard")
        self._api_key_edit.setEchoMode(QLineEdit.Password)
        form.addRow("API Key:", self._api_key_edit)

        self._backend_edit = QLineEdit(defaults.get("backend_url", "http://localhost:8000"))
        form.addRow("Backend URL:", self._backend_edit)

        root.addLayout(form)

        self._error_label = QLabel("")
        self._error_label.setStyleSheet(f"color: {RED}; font-size: 11px;")
        self._error_label.setWordWrap(True)
        self._error_label.hide()
        root.addWidget(self._error_label)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)
        root.addWidget(buttons)

    # ─── Behavior ─────────────────────────────────────────────────────────────

    def _on_existing_selected(self, index: int) -> None:
        asset_id = self._existing_combo.itemData(index)
        if asset_id == NEW_CONNECTION_SENTINEL:
            self._asset_id_edit.clear()
            self._api_key_edit.clear()
            return

        entry = device_store.get_entry(asset_id)
        if entry is None:
            return
        self._asset_id_edit.setText(entry["asset_id"])
        self._api_key_edit.setText(entry["api_key"])
        self._backend_edit.setText(entry.get("backend_url", self._backend_edit.text()))

    def _on_accept(self) -> None:
        asset_id = self._asset_id_edit.text().strip()
        api_key = self._api_key_edit.text().strip()
        backend_url = self._backend_edit.text().strip() or "http://localhost:8000"

        if not asset_id or not api_key:
            self._show_error("Both Asset ID and API Key are required.")
            return

        self._result = {
            "asset_id": asset_id,
            "api_key": api_key,
            "backend_url": backend_url,
        }
        self.accept()

    def _show_error(self, message: str) -> None:
        self._error_label.setText(message)
        self._error_label.show()

    def result_data(self) -> dict[str, Any] | None:
        return self._result
