# Деплой на Railway

Пошаговая инструкция: агент работает 24/7 без своего сервера.

## 1. Репозиторий на GitHub

Если проекта ещё нет в GitHub:

```bash
cd /Users/Vladimir/vps-autonomous-agent
git init
git add .
git commit -m "Initial: autonomous agent for Railway"
```

Создайте репозиторий на [github.com/new](https://github.com/new) (например `vps-autonomous-agent`), затем:

```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/vps-autonomous-agent.git
git branch -M main
git push -u origin main
```

## 2. Railway

1. Зайдите на [railway.app](https://railway.app) и войдите через GitHub.
2. **New Project** → **Deploy from GitHub repo**.
3. Выберите репозиторий `vps-autonomous-agent` (при необходимости дайте Railway доступ к нему).
4. Railway сам определит Node.js и начнёт сборку. Дождитесь статуса **Success**.

## 3. Переменные окружения

В проекте Railway откройте ваш сервис → вкладка **Variables** и добавьте:

| Variable           | Value                    | Обязательно |
|--------------------|--------------------------|-------------|
| `OPENAI_API_KEY`   | `sk-...` (ваш ключ OpenAI) | Да          |
| `MODE`             | `webhook`                | Да (для работы по URL) |
| `WEBHOOK_SECRET`   | любая длинная случайная строка | Рекомендуется |
| `TELEGRAM_BOT_TOKEN` | токен от @BotFather     | Для отправки отчётов в Telegram |
| `TELEGRAM_REPORT_CHAT_IDS` | ID чата (или несколько через запятую) | Куда слать ежедневный PDF-отчёт |
| `TELEGRAM_ALLOWED_CHAT_IDS` | ID чатов через запятую | Кто может писать боту /report (если не задано — берётся из REPORT_CHAT_IDS) |

Пример: `WEBHOOK_SECRET=mySecret123Abc`.  

**Подробная настройка Telegram с нуля:** [docs/telegram-bot-setup.md](docs/telegram-bot-setup.md) — создание бота в @BotFather, получение Chat ID, переменные в Railway, проверка.

Сохраните. Railway перезапустит сервис с новыми переменными.

## 4. Volume для сохранения БД (SQLite)

Чтобы база `data/agent.db` не пропадала при перезапуске и новом деплое:

1. Откройте ваш **сервис** в Railway.
2. Вкладка **Settings** (или **Resources**) → раздел **Volumes**.
3. Нажмите **Add Volume** (или **Create Volume**).
4. Укажите **Mount Path**: `/app/data`  
   (приложение пишет БД в эту директорию; Railway подставит её в `RAILWAY_VOLUME_MOUNT_PATH`).
5. Сохраните. После следующего деплоя SQLite будет использовать смонтированный диск, данные сохранятся между деплоями.

Переменную `RAILWAY_VOLUME_MOUNT_PATH` задавать вручную не нужно — Railway выставляет её сам при подключённом volume.

## 5. Публичный URL

1. Вкладка **Settings** → **Networking** → **Generate Domain**.
2. Скопируйте URL вида `https://vps-autonomous-agent-production-xxxx.up.railway.app`.

Endpoint для задач: **`https://ваш-домен.up.railway.app/task`**

## 6. Проверка

**Проверка здоровья сервиса:**
```bash
curl https://ваш-домен.up.railway.app/health
# Ответ: {"ok":true,"service":"vps-autonomous-agent","mode":"webhook"}
```

**Отправка задачи (подставьте свой WEBHOOK_SECRET и URL):**
```bash
curl -X POST https://ваш-домен.up.railway.app/task \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: mySecret123Abc" \
  -d '{"prompt": "Напиши короткое приветствие"}'
# Ответ: {"ok":true,"taskId":"..."}
```

**Очередь (сколько задач в работе и выполнено):**
```bash
curl -H "X-Webhook-Secret: mySecret123Abc" https://ваш-домен.up.railway.app/status
# {"ok":true,"queue":{"pending":2,"done":10}}
```

Агент обработает задачу в фоне (в течение нескольких секунд). Результаты и логи — во вкладке **Deployments** → выберите деплой → **View Logs**.

## Лимиты Railway

- Бесплатно даётся кредит (например $5 в месяц); расход идёт на время работы и трафик.
- Сервис не «засыпает», пока хватает кредита.
- Следите за использованием в **Account** → **Usage**.

## Если репозиторий приватный

Railway умеет деплоить и приватные репозитории — при выборе репо выдаст запрос на доступ к GitHub.
