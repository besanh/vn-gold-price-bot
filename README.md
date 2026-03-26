# Gold Price Dashboard (Svelte 5 & Cloudflare)

A high-performance, boutique dashboard for tracking real-time gold prices from **Mi Hong** and **SJC**. Built with **Svelte 5** and optimized for **Cloudflare Workers**.

## ✨ Key Features
- **Real-time Monitoring**: Integrated with Mi Hong and GiaVang APIs.
- **Smart Notifications**: Telegram alerts triggered only on significant price changes (configurable threshold).
- **Interactive Trends**: High-precision stepped charts using Chart.js with 1-minute bucketizing for crisp visuals.
- **Seamless UX**: No-reload language (EN/VN) and theme switching using Svelte 5 Runes.
- **Boutique Design**: Fully responsive, glassmorphic UI with optimized mobile views.

## 🛠️ Tech Stack
- **Framework**: SvelteKit 5 (Runes)
- **Deployment**: Cloudflare Workers & KV Storage
- **Charts**: Chart.js 4+
- **Notifications**: Telegram Bot API

## 🚀 Quick Start

### 1. Requirements
- Node.js & npm
- Cloudflare Account (Wrangler CLI)

### 2. Environment Setup
Create a `.dev.vars` file (for local) and set the following in Cloudflare:
- `TOKEN`: Telegram Bot Token
- `CHAT_ID`: Telegram Chat ID
- `THRESHOLD`: Price change threshold (e.g., `50000`)
- `HISTORY_DAYS`: Days of history to keep (e.g., `3`)

### 3. Development
```bash
npm install
npm run dev
```

### 4. Deployment
```bash
npm run deploy  # Rebuilds and deploys to Cloudflare
```

## 🤖 Automation
The worker includes a Cron trigger (`*/5 * * * *`) that automatically:
1. Fetches latest prices.
2. Deduplicates and stores history in KV.
3. Detects price shifts > THRESHOLD.
4. Sends Telegram alerts with trend charts.

## 📝 SEO
The dashboard is optimized for search engines with dynamic meta tags, targeted Vietnamese keywords, and Open Graph support.

---
© 2026 Anh Le. Built with Svelte.
