#!/bin/bash
# Запуск с вашего ПК: копирует проект на VPS и запускает развёртывание.
#
# Использование:
#   export VPS_HOST=root@IP_ВАШЕГО_VPS   # или user@vpswala.example.com
#   ./scripts/deploy-from-local.sh
#
# Или одной строкой:
#   VPS_HOST=root@1.2.3.4 ./scripts/deploy-from-local.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -z "$VPS_HOST" ]]; then
  echo "Укажите хост VPS:"
  echo "  export VPS_HOST=root@IP_АДРЕС"
  echo "  ./scripts/deploy-from-local.sh"
  echo ""
  echo "Или: VPS_HOST=root@1.2.3.4 ./scripts/deploy-from-local.sh"
  exit 1
fi

echo "Копирование проекта на $VPS_HOST..."
rsync -avz --exclude node_modules --exclude .env --exclude tasks/pending --exclude tasks/done \
  "$PROJECT_DIR/" "$VPS_HOST:/opt/vps-autonomous-agent/"

echo ""
echo "Запуск развёртывания на VPS..."
ssh "$VPS_HOST" 'cd /opt/vps-autonomous-agent && bash scripts/deploy-vpswala.sh'

echo ""
echo "Если .env не был на сервере — создайте его и перезапустите:"
echo "  ssh $VPS_HOST"
echo "  nano /opt/vps-autonomous-agent/.env   # добавьте OPENAI_API_KEY=..."
echo "  sudo systemctl restart vps-autonomous-agent"
