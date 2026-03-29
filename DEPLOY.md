# Deploy-Anleitung

## 1. .env ergänzen

```
TOKEN=dein_bot_token
API_PORT=3001
API_ORIGIN=https://spooky-minigames.at
FEED_CHANNEL_ID=DEINE_DISCORD_CHANNEL_ID  # Channel für Kauf-Benachrichtigungen
```

`FEED_CHANNEL_ID` = Rechtsklick auf deinen `#bot-feed` Channel in Discord → "ID kopieren"

---

## 2. Bot hosten (kostenlos: Railway)

1. Gehe zu [railway.app](https://railway.app) → Login mit GitHub
2. **New Project → Deploy from GitHub repo** → dein Bot-Repo auswählen
3. Unter **Variables** alle `.env` Werte eintragen
4. Railway gibt dir eine öffentliche URL, z.B. `https://dein-bot.railway.app`

---

## 3. Website konfigurieren

Auf [spooky-minigames.at/einstellungen.html](https://spooky-minigames.at/einstellungen.html):

- **BOT API URL** → `https://dein-bot.railway.app` eintragen
- **BOT CLIENT ID** → deine Discord Application ID

---

## 4. Verfügbare API-Endpoints

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/coins/:discordId` | Coin-Balance abrufen |
| POST | `/scores` | Score speichern |
| GET | `/leaderboard/:gameId?period=daily\|weekly\|yearly\|alltime` | Leaderboard |
| GET | `/shop/items` | Shop-Items auflisten |
| POST | `/shop/buy` | Item kaufen `{ discordId, price }` |

---

## 5. Port freigeben (nur wenn selbst gehostet)

Falls du den Bot auf einem eigenen Server (VPS) hostest:
```bash
# Firewall Port 3001 öffnen
ufw allow 3001

# Bot dauerhaft laufen lassen
npm install -g pm2
pm2 start bot.js
pm2 save
pm2 startup
```
