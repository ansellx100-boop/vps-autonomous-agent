#!/bin/bash
# Установка systemd-юнита для автозапуска агента на VPS.
# Запуск: sudo ./scripts/install-systemd.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER="${SUDO_USER:-$USER}"
NODE_PATH="$(command -v node || echo '/usr/bin/node')"

UNIT_FILE="/etc/systemd/system/vps-autonomous-agent.service"

cat > "$UNIT_FILE" << EOF
[Unit]
Description=VPS Autonomous Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=$NODE_PATH $PROJECT_DIR/src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "Created $UNIT_FILE"
echo "Run: sudo systemctl daemon-reload && sudo systemctl enable vps-autonomous-agent && sudo systemctl start vps-autonomous-agent"
