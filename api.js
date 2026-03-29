require('dotenv').config();
const express = require('express');

const ALLOWED_ORIGIN = process.env.API_ORIGIN || 'https://spooky-minigames.at';
const API_PORT       = process.env.API_PORT || 3001;
const FEED_CHANNEL   = process.env.FEED_CHANNEL_ID || '';  // Discord channel ID für Kauf-Benachrichtigungen

let _discordClient = null;

// Shop-Items (gleich wie im Bot)
const SHOP = {
    1000:    "Thema-Ticket-Skinni",
    2000:    "Spooky sagt - Helfer",
    4000:    "Helferticket - Customs",
    5000:    "Tagesmod - 1 Stream",
    8000:    "Modusticket - Modus entscheiden",
    10000:   "Standardbox",
    20000:   "Testmod - 3 Streams",
    25000:   "Ultra Box",
    50000:   "Ultimative Daddy Box",
    100000:  "Skin-Ticket - 800VB",
    200000:  "Stream entscheiden - Ganzen Stream entscheiden",
    1000000: "Stream beenden - Stream sofort beenden"
};
const BOX_ITEMS = new Set([10000, 25000, 50000]);

module.exports = function startApi(db, discordClient) {
    _discordClient = discordClient;

    // Scores-Tabelle anlegen falls nicht vorhanden
    db.run(`CREATE TABLE IF NOT EXISTS scores (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId    TEXT    NOT NULL,
        discordId TEXT    NOT NULL,
        username  TEXT,
        avatar    TEXT,
        score     INTEGER NOT NULL,
        ts        INTEGER NOT NULL
    )`);

    const app = express();
    app.use(express.json());

    // CORS – nur Website darf anfragen
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    // ── GET /coins/:discordId ─────────────────────────────────────────────────
    app.get('/coins/:discordId', (req, res) => {
        db.get('SELECT coins FROM users WHERE userId = ?', [req.params.discordId], (err, row) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json({ coins: row ? row.coins : 0 });
        });
    });

    // ── POST /scores ──────────────────────────────────────────────────────────
    app.post('/scores', (req, res) => {
        const { gameId, discordId, username, avatar, score } = req.body;
        if (!gameId || !discordId || score == null)
            return res.status(400).json({ error: 'Fehlende Felder' });

        db.run(
            'INSERT INTO scores (gameId, discordId, username, avatar, score, ts) VALUES (?, ?, ?, ?, ?, ?)',
            [gameId, discordId, username || '', avatar || '', score, Date.now()],
            err => {
                if (err) return res.status(500).json({ error: 'DB error' });
                res.json({ ok: true });
            }
        );
    });

    // ── GET /leaderboard/:gameId?period=daily|weekly|yearly|alltime ───────────
    app.get('/leaderboard/:gameId', (req, res) => {
        const { gameId } = req.params;
        const period = req.query.period || 'alltime';
        const MS = { daily: 864e5, weekly: 6048e5, yearly: 31536e6 };
        const cutoff = period === 'alltime' ? 0 : Date.now() - (MS[period] || 0);

        db.all(`
            SELECT discordId, username, avatar, MAX(score) AS score
            FROM scores
            WHERE gameId = ? AND ts >= ?
            GROUP BY discordId
            ORDER BY score DESC
            LIMIT 10
        `, [gameId, cutoff], (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json(rows || []);
        });
    });

    // ── GET /shop/items ───────────────────────────────────────────────────────
    app.get('/shop/items', (req, res) => {
        const items = Object.entries(SHOP).map(([price, name]) => ({
            price: Number(price),
            name,
            isBox: BOX_ITEMS.has(Number(price))
        }));
        res.json(items);
    });

    // ── POST /shop/buy ────────────────────────────────────────────────────────
    app.post('/shop/buy', (req, res) => {
        const { discordId, price } = req.body;
        if (!discordId || !price)
            return res.status(400).json({ error: 'Fehlende Felder' });

        const numPrice = Number(price);
        if (!SHOP[numPrice])
            return res.status(400).json({ error: 'Item nicht gefunden' });

        db.get('SELECT coins FROM users WHERE userId = ?', [discordId], (err, row) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            const balance = row ? row.coins : 0;
            if (balance < numPrice)
                return res.status(400).json({ error: 'Nicht genug Coins' });

            db.run('UPDATE users SET coins = coins - ? WHERE userId = ?', [numPrice, discordId], err2 => {
                if (err2) return res.status(500).json({ error: 'DB error' });

                function notifyDiscord(msg) {
                    if (!_discordClient || !FEED_CHANNEL) return;
                    const ch = _discordClient.channels.cache.get(FEED_CHANNEL);
                    if (ch) ch.send(msg).catch(() => {});
                }

                if (BOX_ITEMS.has(numPrice)) {
                    const payout = Math.floor(Math.random() * numPrice * 2);
                    db.run('UPDATE users SET coins = coins + ? WHERE userId = ?', [payout, discordId], () => {
                        const won = payout > numPrice;
                        notifyDiscord(`🌐 **Website-Kauf!**\n👤 <@${discordId}>\n📦 Box: ${SHOP[numPrice]}\n💰 Einsatz: ${numPrice.toLocaleString()} Coins\n${won ? '📈' : '📉'} Ergebnis: ${payout.toLocaleString()} Coins`);
                        res.json({ ok: true, item: SHOP[numPrice], isBox: true, payout });
                    });
                } else {
                    notifyDiscord(`🌐 **Website-Kauf!**\n👤 <@${discordId}>\n🎟️ Item: ${SHOP[numPrice]}\n💰 Preis: ${numPrice.toLocaleString()} Coins`);
                    res.json({ ok: true, item: SHOP[numPrice], isBox: false });
                }
            });
        });
    });

    app.listen(API_PORT, () => {
        console.log(`🌐 API läuft auf Port ${API_PORT}`);
    });
};
