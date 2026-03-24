# Vietnam Gold Prices Telegram Bot 📈🇻🇳💎

A robust Cloudflare Worker that monitors gold prices specifically for the **Vietnam market** from multiple sources and sends professional, data-rich updates to Telegram.

## 🚀 Getting Started (Setup from Scratch)

Follow these steps to get your own version of the bot running in minutes.

### 1. Prerequisites
- **Node.js**: Install the latest LTS version.
- **Cloudflare Account**: [Sign up here](https://dash.cloudflare.com/).
- **Telegram Bot**: Create one via [@BotFather](https://t.me/botfather) and save the `TOKEN`.
- **Telegram Chat ID**: Get your ID (or a group's ID).

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone <your-repo-url>
cd gold-prices-bot
npm install
```

### 3. Cloudflare Setup (KV & Secrets)
The bot requires a KV Namespace and secure secrets to function.

**Step A: Create KV Namespace**
Run this command to create the database:
```bash
npx wrangler kv:namespace create GOLD_KV
```
Copy the `id` from the output and paste it into `wrangler.jsonc` under the `kv_namespaces` section.

**Step B: Provision Secrets (Production)**
Upload your credentials securely to Cloudflare. Run these commands and paste the values when prompted:
```bash
npx wrangler secret put TOKEN
npx wrangler secret put CHAT_ID
```

### 4. Local Development
To test locally, you must provide variables in a `.dev.vars` file (which is ignored by git):
1.  **Copy Template**: `cp .dev.vars.example .dev.vars`
2.  **Edit Values**: Open `.dev.vars` and fill in your real credentials.
3.  **Run Server**: `npm run dev`

---

## ⚙️ Configuration Reference

| Variable | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `TOKEN` | Secret | Your Telegram Bot Token from @BotFather. | *Required* |
| `CHAT_ID` | Secret | The ID of the chat where notifications are sent. | *Required* |
| `THRESHOLD` | Setting | Min price change (VND) to trigger an alert. | `50000` |
| `HISTORY_DAYS` | Setting | Number of days to track/draw on the chart. | `3` |
| `CRON_SCHEDULE` | Trigger | How often to check (Set in `wrangler.jsonc`). | `*/5 * * * *` |

---

### 5. Deployment
Deploy the worker and the cron trigger to the Cloudflare Edge:
```bash
npm run deploy
```

## 🛠️ Management Commands

| Command | Description |
| :--- | :--- |
| `npx wrangler tail` | View live execution logs from production. |
| `curl <worker-url>` | Manually trigger a price check and notification. |
| `npx wrangler kv:key delete last_prices --binding GOLD_KV --remote` | Reset the price cache to force a full update. |

## 🧠 Features & Architecture

- **Multi-Source**: Tracks **GiaVang** and **Mi Hồng** (mandated priority).
- **72h History**: Maintains a sliding 3-day window of prices in KV.
- **Visual Analytics**: Sends professional **QuickChart** trend lines.
- **Smart Alerts**: Only notifies when prices move by > 50,000 VND (Cron).
- **Manual Reports**: Web triggers always provide a full summary.
- **Units**: All data is standardized to **"per chỉ"** (1/10th lượng).

## ☁️ Cloudflare Free Tier Note

This bot is designed to run comfortably within the **Cloudflare Workers Free Tier**. Key limits to keep in mind:
- **Requests**: 100,000 requests per day (running every 5 mins uses ~300 requests/day).
- **KV Storage**: 1GB total (perfect for history tracking).
- **KV Ops**: 1,000 Write/Delete operations per day (the bot uses ~150-300 writes/day depending on changes).
- **CPU Time**: 10ms per request (the script is very efficient and well within this).

---
*Created with ❤️ for smart gold tracking.*
