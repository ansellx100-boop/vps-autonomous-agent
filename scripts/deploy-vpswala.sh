#!/bin/bash
# Развёртывание агента на VPS (VPSWala и др.).
# Запускать на VPS: bash deploy-vpswala.sh
# Или с локального ПК: ssh root@ВАШ_IP 'bash -s' < scripts/deploy-vpswala.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== VPS Autonomous Agent — развёртывание ==="
echo "Каталог: $PROJECT_DIR"
echo ""

# 1. Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js не найден. Установка Node.js 20..."
  if command -v curl &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "Установите Node.js 18+ вручную: https://nodejs.org/"
    exit 1
  fi
fi
echo "Node.js: $(node -v)"

# 2. Зависимости
echo ""
echo "Установка зависимостей..."
npm install --omit=dev

# 3. .env
if [[ ! -f .env ]]; then
  echo ""
  echo "Файл .env не найден. Копирую из .env.example..."
  cp .env.example .env
  echo "Отредактируйте .env и укажите OPENAI_API_KEY:"
  echo "  nano $PROJECT_DIR/.env"
  echo "Затем снова запустите этот скрипт или выполните:"
  echo "  sudo ./scripts/install-systemd.sh"
  echo "  sudo systemctl daemon-reload && sudo systemctl enable --now vps-autonomous-agent"
  exit 0
fi

# 4. Systemd
echo ""
echo "Установка systemd-юнита..."
sudo "$SCRIPT_DIR/install-systemd.sh"

# 5. Запуск
echo ""
echo "Включение и запуск сервиса..."
sudo systemctl daemon-reload
sudo systemctl enable vps-autonomous-agent
sudo systemctl start vps-autonomous-agent

echo ""
echo "=== Готово ==="
echo "Статус: sudo systemctl status vps-autonomous-agent"
echo "Логи:   journalctl -u vps-autonomous-agent -f"
echo "Webhook (если MODE=webhook): curl -X POST -H 'X-Webhook-Secret: YOUR_SECRET' -H 'Content-Type: application/json' -d '{\"prompt\":\"test\"}' http://localhost:3030/task"
