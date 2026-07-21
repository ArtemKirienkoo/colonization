# Deployment Guide - Cloud Multiplayer Server

Цей документ описує, як задеплоїти сервер для онлайн мультиплеєру.

## Варіант 1: Railway.app (рекомендовано)

### Крок 1: Підготовка

1. Створи акаунт на [Railway.app](https://railway.app)
2. Встанови Railway CLI:
```bash
npm i -g @railway/cli
```

### Крок 2: Деплой

1. У корені проекту виконай:
```bash
railway login
railway init
```

2. Коли запитає проект, вибери "New Project"
3. Виконай деплой:
```bash
railway up
```

4. Отримаєш URL типу: `https://colonization-server.up.railway.app`

### Крок 3: Оновлення клієнта

Відкрий `src/ui/splash.html` і заміни рядок 684:
```javascript
return 'https://colonization-server-production.up.railway.app';
```

На свій URL від Railway.

### Крок 4: Збірка додатка

```bash
npm run build
```

## Варіант 2: Render.com (повністю безкоштовно)

### Крок 1: Підготовка

1. Створи акаунт на [Render.com](https://render.com)
2. Завантаж проект на GitHub

### Крок 2: Деплой

1. На Render натисни "New +" → "Web Service"
2. Підключи GitHub репозиторій
3. Налаштування:
   - **Name**: colonization-server
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/main/server-cloud.js`
   - **Plan**: Free

4. Натисни "Create Web Service"

### Крок 3: Отримаєш URL

Render дасть URL типу: `https://colonization-server.onrender.com`

### Крок 4: Оновлення клієнта

Заміни в `src/ui/splash.html` URL на свій з Render.

## Варіант 3: Fly.io (глобальний)

```bash
# Встанови Fly CLI
curl -L https://fly.io/install.sh | sh

# Логінися
fly auth login

# Ініціалізуй проект
fly launch

# Деплой
fly deploy
```

Отримаєш URL: `https://colonization.fly.dev`

## Налаштування файлів

### package.json для серверу

Створи `package-server.json`:
```json
{
  "name": "colonization-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/main/server-cloud.js"
  },
  "dependencies": {
    "express": "^4.22.2",
    "socket.io": "^4.8.3"
  }
}
```

### render.yaml для Render

Створи `render.yaml`:
```yaml
services:
  - type: web
    name: colonization-server
    env: node
    plan: free
    buildCommand: npm install
    startCommand: node src/main/server-cloud.js
    envVars:
      - key: NODE_ENV
        value: production
```

### railway.toml для Railway

Створи `railway.toml`:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node src/main/server-cloud.js"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

## Тестування

1. Задеплой сервер
2. Відкрий додаток на двох комп'ютерах
3. Обидва оберіть "Хмарний (онлайн)"
4. Гравець 1 створює кімнату, отримує код
5. Гравець 2 вводить код або натискає на кімнату в списку
6. Гра починається!

## Важливо

- **Безкоштовні тарифи**:
  - Railway: $5 кредитів на старт, потім $5/міс (але є free tier)
  - Render: повністю безкоштовно (з обмеженнями)
  - Fly.io: безкоштовно для невеликих проектів

- **Обмеження free tier**:
  - Сервер "засинає" після 15 хвилин неактивності (Render)
  - Обмеження на кількість годин роботи на місяць
  - Для постійної гри краще платний тариф ($5-7/міс)

- **Рекомендація**: Для тестування використовуй Render (повністю безкоштовно), для продакшену - Railway або Fly.io

## Troubleshooting

### Сервер не підключається
- Перевір, що сервер запущений (перейди на URL в браузері)
- Перевір консоль браузера (F12) на помилки CORS
- Перевір, що використовуєш `https://` а не `http://`

### Кімнати не з'являються
- Перевір, що обидва гравці підключені до того ж серверу
- Перевір консоль серверу на наявність підключень

### Гра лагає
- Це нормально для WebSocket через інтернет
- Для кращого результату використовуй сервер ближче до себе