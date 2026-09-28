#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Run this installer with sudo." >&2
    exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER_DIR=$(dirname -- "$SCRIPT_DIR")
SERVICE_USER=${POLARTWIN_USER:-${SUDO_USER:-}}

if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    echo "Set POLARTWIN_USER to the normal Raspberry Pi user." >&2
    exit 1
fi

if [ -x "$SERVER_DIR/venv/bin/python" ]; then
    PYTHON_PATH="$SERVER_DIR/venv/bin/python"
elif [ -x "$SERVER_DIR/.venv/bin/python" ]; then
    PYTHON_PATH="$SERVER_DIR/.venv/bin/python"
else
    PYTHON_PATH=$(command -v python3)
fi

TEMP_SERVICE=$(mktemp)
trap 'rm -f "$TEMP_SERVICE"' EXIT HUP INT TERM

sed \
    -e "s|@POLARTWIN_USER@|$SERVICE_USER|g" \
    -e "s|@POLARTWIN_SERVER_DIR@|$SERVER_DIR|g" \
    -e "s|@POLARTWIN_PYTHON@|$PYTHON_PATH|g" \
    "$SCRIPT_DIR/polartwin-oled.service.in" > "$TEMP_SERVICE"

install -m 0644 "$TEMP_SERVICE" /etc/systemd/system/polartwin-oled.service
echo "Installed /etc/systemd/system/polartwin-oled.service for $SERVICE_USER"
echo "Python: $PYTHON_PATH"
