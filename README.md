# Автономный агент на VPS (в т.ч. VPSWala)

Агент работает 24/7 на VPS, даже когда ваш ПК выключен. Задачи можно ставить через Telegram, webhook, очередь или по расписанию.

## Варианты архитектуры

| Вариант | Плюсы | Минимум ресурсов | Сложность |
|--------|--------|-------------------|-----------|
| **1. OpenClaw** | Готовый AI-агент, Telegram, много интеграций | 2 vCPU, 2–4 GB RAM | Средняя |
| **2. Этот репозиторий (лёгкий агент)** | Минимум зависимостей, подходит для free-tier VPS | 1 vCPU, 512 MB RAM | Низкая |
| **3. n8n на VPS** | Визуальные воркфлоу, уже знакомый стек | 1 vCPU, 1 GB RAM | Низкая |

### Где разместить агента

| Вариант | Тип | Условия | Подходит для агента |
|--------|-----|---------|----------------------|
| **Oracle Cloud Free Tier** | VPS | Бесплатно навсегда: до 4 ARM VM (4 OCPU, 24 GB RAM) или 2× AMD 1 GB. Нужна карта (списание только при апгрейде). | ✅ Да, один из лучших free VPS. |
| **Railway** | PaaS | $5 бесплатного кредита в месяц, без «засыпания». Деплой из GitHub. | ✅ Да, если хватает $5 на трафик/часы. |
| **Hetzner Cloud** | VPS | От ~€3.49/мес (2 vCPU, 4 GB RAM, 40 GB SSD). Платно. | ✅ Да, дёшево и стабильно. |
| **Fly.io** | PaaS | 3 shared-cpu VM бесплатно. Деплой через Docker. | ✅ Да, лёгкий агент поместится. |
| **Render** | PaaS | Free tier «засыпает» после 15 мин без запросов — не 24/7. Платный от $7/мес — всегда включён. | ⚠️ Free — только для тестов. |
| **GratisVPS / AlaVPS** | VPS | Бесплатно, без карты (разные лимиты). Проверяйте отзывы и доступность. | ✅ Возможно, для лёгкого агента. |
| **VPSWala** | VPS | Free: 1 vCPU, 2 GB RAM. Платно от $4/мес. | ✅ Да, если сервис доступен в вашем регионе. |

**Кратко:** для бесплатного 24/7 лучше всего **Oracle Cloud Free Tier** (нужна карта) или **Railway** ($5/мес кредит). Без карты — **Fly.io** или бесплатные VPS вроде GratisVPS. Из платных и недорогих — **Hetzner**.

---

## Развёртывание на VPS (Oracle, Hetzner, Fly.io и др.)

Подойдёт любой VPS с Ubuntu/Debian и SSH (Oracle Cloud, Hetzner, Fly.io с обычной VM и т.д.).

### Вариант A: с вашего ПК одной командой

Если есть SSH-доступ к серверу и установлен `rsync`:

```bash
cd /Users/Vladimir/vps-autonomous-agent
export VPS_HOST=root@IP_ВАШЕГО_VPS   # или ubuntu@IP для Oracle/других
./scripts/deploy-from-local.sh
```

Скрипт скопирует проект в `/opt/vps-autonomous-agent` на VPS и запустит развёртывание. Если на VPS ещё нет `.env`, после первого запуска зайдите по SSH, создайте `.env` с `OPENAI_API_KEY` и выполните: `sudo systemctl restart vps-autonomous-agent`.

### Вариант B: вручную на VPS

1. **Создайте VPS** у любого провайдера (Oracle Cloud Free Tier, Hetzner, Fly.io и т.д.). ОС: Ubuntu 22.04 или Debian 12.
2. **Подключитесь по SSH:** `ssh root@ваш-ip` (или `ubuntu@...` / пользователь из панели).
3. **Скопируйте проект на сервер** (с ПК в другой консоли):  
   `scp -r /Users/Vladimir/vps-autonomous-agent root@ваш-ip:/opt/vps-autonomous-agent`
4. **На VPS выполните развёртывание:**  
   `cd /opt/vps-autonomous-agent && bash scripts/deploy-vpswala.sh`  
   При отсутствии `.env` скрипт создаст его из `.env.example` и подскажет указать `OPENAI_API_KEY` и при необходимости снова запустить скрипт или:  
   `sudo ./scripts/install-systemd.sh && sudo systemctl daemon-reload && sudo systemctl enable --now vps-autonomous-agent`
5. **Проверка:**  
   `sudo systemctl status vps-autonomous-agent`  
   Логи: `journalctl -u vps-autonomous-agent -f`  
   В режиме webhook: `curl -X POST -H "X-Webhook-Secret: your-random-secret" -H "Content-Type: application/json" -d '{"prompt":"Привет"}' http://ваш-ip:3030/task`

### Развёртывание на Railway (PaaS, без своего VPS)

Подробно: **[RAILWAY.md](RAILWAY.md)**.

Кратко:
1. Залить проект в GitHub.
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub → выбрать репозиторий.
3. В **Variables** задать: `OPENAI_API_KEY`, `MODE=webhook`, `WEBHOOK_SECRET` (по желанию). `PORT` задаёт Railway сам.
4. В **Settings** → **Networking** → **Generate Domain** — получить URL.
5. Отправлять задачи на `POST https://ваш-домен.up.railway.app/task` (заголовок `X-Webhook-Secret` при заданном `WEBHOOK_SECRET`).

---

## Быстрый старт (лёгкий агент в этом репо)

1. **Клонируйте/скопируйте проект на VPS** (Ubuntu/Debian):

```bash
# На VPS
git clone <ваш-репо> vps-agent && cd vps-agent
# или scp папку с ПК
```

2. **Настройте переменные окружения:**

```bash
cp .env.example .env
# В .env укажите: OPENAI_API_KEY (или ANTHROPIC_API_KEY), при необходимости TELEGRAM_BOT_TOKEN
```

3. **Запуск через systemd (постоянная работа):**

```bash
sudo ./scripts/install-systemd.sh
sudo systemctl enable vps-autonomous-agent
sudo systemctl start vps-autonomous-agent
```

4. **Или через Docker:**

```bash
docker build -t vps-agent .
docker run -d --env-file .env --restart unless-stopped --name vps-agent vps-agent
```

---

## Как управлять агентом

На Railway/VPS агент в режиме **webhook** управляется только через HTTP. Других панелей нет.

### Отправить задачу

**curl** (подставьте свой URL и, если задавали, `WEBHOOK_SECRET`):

```bash
curl -X POST https://ВАШ-ДОМЕН.up.railway.app/task \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: ваш_секрет" \
  -d '{"prompt": "Кратко объясни, что такое API"}'
```

Ответ: `{"ok":true,"taskId":"abc123"}` — задача в очереди, агент обработает её в фоне (обычно за несколько секунд).

Тело запроса может быть:
- `{"prompt": "текст запроса"}` — один вопрос к LLM;
- любой свой JSON — он попадёт в `payload` задачи (в агенте можно обрабатывать по-разному).

### Проверить, что агент жив

```bash
curl https://ВАШ-ДОМЕН.up.railway.app/health
# {"ok":true,"service":"vps-autonomous-agent","mode":"webhook"}
```

### Посмотреть очередь

Сколько задач в ожидании и сколько уже выполнено (если задан `WEBHOOK_SECRET`, добавьте заголовок):

```bash
curl -H "X-Webhook-Secret: ваш_секрет" https://ВАШ-ДОМЕН.up.railway.app/status
# {"ok":true,"queue":{"pending":2,"done":10}}
```

### Где смотреть ответы агента

Сейчас агент **не отдаёт ответ в HTTP** — он только ставит задачу в очередь и обрабатывает её. Результат пишется в логи сервиса:

- **Railway:** Deployments → выберите деплой → **View Logs**. Ищите строки `[done] taskId` и текст ответа.
- **VPS (systemd):** `journalctl -u vps-autonomous-agent -f`.

Чтобы получать ответы в другое место (Telegram, email, свой webhook), нужно доработать `src/agent.js` — после `runTask()` вызывать ваш callback или API.

### Управление из Cursor

Да — можно управлять агентом прямо из Cursor.

1. **Настройте локальный .env** в папке проекта:
   - `AGENT_URL=https://ваш-домен.up.railway.app` (URL задеплоенного агента)
   - `WEBHOOK_SECRET=ваш_секрет` — тот же, что в Railway Variables

2. **Из терминала Cursor** отправьте задачу:
   ```bash
   npm run send-task "Кратко объясни, что такое REST API"
   ```
   В ответ придёт `Задача отправлена: <taskId>`.

3. **Через чат Cursor** можно попросить: *«Отправь агенту задачу: …»* — ассистент выполнит `npm run send-task "…"` за вас.

Результат выполнения задачи смотрите в логах Railway (Deployments → View Logs) или в `/status` (сколько задач в очереди и выполнено).

### Управление через n8n

В n8n создайте воркфлоу:
1. Триггер: **Webhook**, **Schedule** или **Telegram**.
2. Узел **HTTP Request**: Method POST, URL `https://ВАШ-ДОМЕН.up.railway.app/task`, Body `{"prompt": "{{ $json.message }}"}` (или свой JSON), Headers — `X-Webhook-Secret: ваш_секрет`.

Так вы сможете запускать агента по расписанию, из Telegram или из других воркфлоу.

---

## Как агент получает задачи

- **Режим очереди (по умолчанию):** раз в N минут опрашивает источник задач (файл, Redis, API).
- **Webhook:** один endpoint принимает POST — тело запроса = одна задача.
- **Telegram:** опционально бот принимает сообщения и ставит их в очередь (см. `src/telegram.js`).
- **Cron:** через systemd timer или crontab можно запускать агента по расписанию для пакетной обработки.

Подробнее — в разделах выше и в коде в `src/`.

---

## OpenClaw (альтернатива — полноценный AI-агент)

Если нужен готовый агент с Telegram и богатыми возможностями:

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

Требования: 2 vCPU, 2–4 GB RAM, Node.js ≥22. На free-tier VPSWala может быть тесно; лучше взять платный план или другой VPS (Hetzner, Oracle Free Tier и т.д.).

---

## n8n на VPS

У вас уже есть n8n локально. Чтобы он работал без ПК:

1. Разверните n8n на VPS (Docker или npm).
2. Настройте воркфлоу с триггерами: Webhook, Schedule, Telegram.
3. В нодах вызывайте AI (OpenAI/Anthropic) и нужные API.

Так вы получите автономные сценарии без написания кода агента.

---

## Безопасность

- Храните API-ключи только в `.env`, не коммитьте их.
- На VPS откройте только нужные порты (например 80/443 для webhook).
- Для webhook используйте секретный токен в заголовке и проверяйте его в коде.

---

## Структура проекта (лёгкий агент)

```
vps-autonomous-agent/
├── README.md           # этот файл
├── .env.example
├── package.json
├── Dockerfile
├── src/
│   ├── index.js        # точка входа, цикл опроса / webhook
│   ├── agent.js        # вызов LLM и выполнение шагов
│   ├── tasks.js        # очередь/источник задач
│   └── telegram.js     # опционально: Telegram-бот
├── scripts/
│   └── install-systemd.sh
└── tasks/              # примеры задач (файловая очередь)
```
