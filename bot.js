require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// =====================
// EMOJI RENNEN
// =====================

let raceActive = false;
let raceBets = [];
let raceTimeout = null;

const raceAnimals = {
    "vogel": { emoji: "🐦‍⬛", multiplier: 1 },
    "pferd": { emoji: "🐴", multiplier: 2 },
    "hase": { emoji: "🐇", multiplier: 3 },
    "schildkröte": { emoji: "🐢", multiplier: 5 },
    "spinne": { emoji: "🕷️", multiplier: 8 },
    "elefant": { emoji: "🐘", multiplier: 10 },
    "ameise": { emoji: "🐜", multiplier: 20 },
    "schnecke": { emoji: "🐌", multiplier: 50 }
};

// =====================
// COOLDOWN SYSTEM
// =====================

const spinCooldown = new Map();
const SPIN_COOLDOWN_TIME = 30 * 60 * 1000; // 30 Minuten in Millisekunden

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const db = new sqlite3.Database('./coins.db');

db.run(`
CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    coins INTEGER DEFAULT 0
)`);

// =====================
// COIN SYSTEM
// =====================

function getCoins(userId) {
    return new Promise(resolve => {
        db.get("SELECT coins FROM users WHERE userId = ?", [userId], (err, row) => {
            resolve(row ? row.coins : 0);
        });
    });
}

function addCoins(userId, amount) {
    db.run(`
        INSERT INTO users (userId, coins)
        VALUES (?, ?)
        ON CONFLICT(userId) DO UPDATE SET coins = coins + ?
    `, [userId, amount, amount]);
}

function removeCoins(userId, amount) {
    db.run("UPDATE users SET coins = coins - ? WHERE userId = ?", [amount, userId]);
}

// =====================
// GLÜCKSRAD
// =====================

const wheelPrizes = [
    { coins: 100, chance: 20 },
    { coins: 200, chance: 18 },
    { coins: 300, chance: 15 },
    { coins: 400, chance: 12 },
    { coins: 500, chance: 10 },
    { coins: 600, chance: 8 },
    { coins: 700, chance: 6 },
    { coins: 800, chance: 4 },
    { coins: 900, chance: 3 },
    { coins: 1000, chance: 2 },
    { coins: 5000, chance: 1 },
    { coins: 10000, chance: 0.5 },
    { coins: 50000, chance: 0.3 },
    { coins: 100000, chance: 0.15 },
    { coins: 500000, chance: 0.05 },
];

function spinWheel() {
    const total = wheelPrizes.reduce((a,b)=>a+b.chance,0);
    const rand = Math.random()*total;
    let sum = 0;
    for (const prize of wheelPrizes) {
        sum += prize.chance;
        if (rand <= sum) return prize.coins;
    }
}

// =====================
// SPECIAL GAMES
// =====================

const fixedGames = {
    "!losen": { cost: 50, chance: 0.4 },
    "!rakete": { cost: 50, chance: 0.35 },
    "!schatz": { cost: 100, chance: 0.5 },
    "!spookeee": { cost: 500, chance: 0.2 },
    "!jumpscare": { cost: 1000, chance: 0.15 },
    "!entwickeln": { cost: 200, chance: 0.4 },
    "!computer": { cost: 3000, chance: 0.25 }
};

// =====================
// TICKET SHOP
// =====================

const shop = {
    1000: "Thema-Ticket-Skinni",
    2000: "Spooky sagt - Helfer",
    4000: "Helferticket - Customs",
    5000: "Tagesmod - 1 Stream",
    8000: "Modusticket - Modus entscheiden",
    10000: "Standardbox",
    20000: "Testmod - 3 Streams",
    25000: "Ultra Box",
    50000: "Ultimative Daddy Box",
    100000: "Skin-Ticket - 800VB",
    200000: "Stream entscheiden - Ganzen Stream entscheiden",
    1000000: "Stream beenden - Stream sofort beenden"
};

// Box-Items: geben eine zufällige Coin-Menge zurück (50:50 mehr oder weniger)
const boxItems = new Set([10000, 25000, 50000]);

client.once('ready', () => {
    console.log(`✅ Online als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(" ");
    const cmd = args[0].toLowerCase();
    const bet = parseInt(args[1]);
    const balance = await getCoins(message.author.id);

    // =====================
    // TOPLISTE
    // =====================

    if (cmd === "!top") {

        db.all("SELECT userId, coins FROM users ORDER BY coins DESC LIMIT 10", [], async (err, rows) => {

            if (!rows || rows.length === 0)
                return message.reply("Noch keine Spieler vorhanden.");

            let text = "🏆 **Top 10 Spieler**\n\n";

            for (let i = 0; i < rows.length; i++) {
                const user = await client.users.fetch(rows[i].userId).catch(() => null);
                const name = user ? user.username : "Unbekannt";

                text += `#${i+1} - ${name} → ${rows[i].coins.toLocaleString()} Coins\n`;
            }

            message.reply(text);
        });
    }

    // =====================
    // COMMAND LISTE
    // =====================

    if (cmd === "!commands") {
        return message.reply(`
    📜 **Alle Commands**

    🎡 Economy:
    !coins
    !spin
    !shop
    !buy <Preis>

    🎰 Gambling:
    !gamble <Einsatz>
    !würfeln <Einsatz>
    !slots <Einsatz>
    !roulette <Einsatz>

    🚀 Spezialspiele:
    !losen
    !rakete
    !schatz
    !spookeee
    !jumpscare
    !entwickeln
    !computer

    🏁 Rennen:
    !start
    !er <Einsatz> <Tier>

    🛠 Admin (nur Terminal):
    give USERID COINS
    remove USERID COINS
    balance USERID
        `);
    }

// =====================
// RENNEN STARTEN
// =====================

if (cmd === "!start") {

    if (raceActive) return message.reply("❌ Ein Rennen läuft bereits!");

    raceActive = true;
    raceBets = [];

    message.channel.send(`
        🏁 **Willkommen in der Emoji-Rennen Arena!** 🏁

            30 Sekunden zum Wetten!
            Benutze: !er <Einsatz> <Tier>

            Tiere & Quoten:
            🐦‍⬛ Vogel - 1x
            🐴 Pferd - 2x
            🐇 Hase - 3x
            🐢 Schildkröte - 5x
            🕷️ Spinne - 8x
            🐘 Elefant - 10x
            🐜 Ameise - 20x
            🐌 Schnecke - 50x
    `);

    raceTimeout = setTimeout(async () => {

        if (raceBets.length === 0) {
            raceActive = false;
            return message.channel.send("❌ Keine Wetten abgegeben!");
        }

        const animals = Object.keys(raceAnimals);
        const winner = animals[Math.floor(Math.random() * animals.length)];

        message.channel.send(`🏁 Das Rennen startet...\n🏆 Gewinner: ${raceAnimals[winner].emoji} **${winner}**`);

        for (const bet of raceBets) {
            if (bet.animal === winner) {
                const winAmount = bet.amount * raceAnimals[winner].multiplier;
                addCoins(bet.userId, winAmount);
                message.channel.send(`<@${bet.userId}> gewinnt ${winAmount.toLocaleString()} Coins! 🎉`);
            }
        }

        raceActive = false;
        raceBets = [];

    }, 30000);
}

// =====================
// WETTEN
// =====================

if (cmd === "!er" && raceActive) {

    const amount = parseInt(args[1]);
    const animal = args[2]?.toLowerCase();

    if (!amount || !animal) {
        return message.reply("Nutzung: !er <Einsatz> <Tier>");
    }

    if (!raceAnimals[animal]) {
        return message.reply("❌ Dieses Tier gibt es nicht!");
    }

    const balance = await getCoins(message.author.id);
    if (balance < amount) {
        return message.reply("❌ Nicht genug Coins!");
    }

    removeCoins(message.author.id, amount);

    raceBets.push({
        userId: message.author.id,
        animal: animal,
        amount: amount
    });

    message.reply(`✅ Wette platziert: ${amount} Coins auf ${raceAnimals[animal].emoji} ${animal}`);
}

    // Coins anzeigen
    if (cmd === "!coins") {
        return message.reply(`💰 Du hast ${balance.toLocaleString()} Coins`);
    }

    // Glücksrad mit Cooldown
    if (cmd === "!spin") {

    const now = Date.now();
    const lastUsed = spinCooldown.get(message.author.id);

    if (lastUsed && now - lastUsed < SPIN_COOLDOWN_TIME) {
        const remaining = SPIN_COOLDOWN_TIME - (now - lastUsed);

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

            return message.reply(
                `⏳ Du kannst das Glücksrad erst wieder in ${minutes}m ${seconds}s benutzen!`
            );
        }

        spinCooldown.set(message.author.id, now);

        const win = spinWheel();
        addCoins(message.author.id, win);

        return message.reply(`🎡 Du hast **${win.toLocaleString()} Coins** gewonnen!`);
    }

    // Freispiele mit Einsatz
    if (fixedGames[cmd]) {
        const game = fixedGames[cmd];
        if (balance < game.cost) return message.reply("❌ Nicht genug Coins!");

        removeCoins(message.author.id, game.cost);

        if (Math.random() < game.chance) {
            const win = game.cost * 3;
            addCoins(message.author.id, win);
            return message.reply(`🎉 ${cmd} gewonnen! +${win}`);
        } else {
            return message.reply(`💀 ${cmd} verloren! -${game.cost}`);
        }
    }


    // Freispiele mit variablem Einsatz
    if (["!gamble","!würfeln","!slots","!roulette"].includes(cmd) && bet) {
        if (balance < bet) return message.reply("❌ Nicht genug Coins!");

        removeCoins(message.author.id, bet);

        if (cmd === "!würfeln") {
            const roll = Math.floor(Math.random()*6)+1;
            if (roll >= 4) {
                addCoins(message.author.id, bet*2);
                return message.reply(`🎲 ${roll} – Gewonnen! +${bet*2}`);
            }
            return message.reply(`🎲 ${roll} – Verloren!`);
        }

        if (cmd === "!gamble") {
            if (Math.random() < 0.5) {
                addCoins(message.author.id, bet*2);
                return message.reply(`🎉 Gewonnen! +${bet*2}`);
            }
            return message.reply("💀 Verloren!");
        }

        if (cmd === "!slots") {
            if (Math.random() < 0.3) {
                addCoins(message.author.id, bet*5);
                return message.reply(`🎰 JACKPOT! +${bet*5}`);
            }
            return message.reply("🎰 Verloren!");
        }

        if (cmd === "!roulette") {
            if (Math.random() < 0.48) {
                addCoins(message.author.id, bet*2);
                return message.reply(`🎯 Richtig! +${bet*2}`);
            }
            return message.reply("🎯 Falsch!");
        }
    }

    // Shop anzeigen
    if (cmd === "!shop") {
        let text = "🛒 **Ticket Shop**\n\n";
        for (const price in shop) {
            const isBox = boxItems.has(Number(price));
            const desc = isBox ? `${shop[price]} *(🎲 50:50 – Zufällige Coins zurück!)*` : shop[price];
            text += `${Number(price).toLocaleString()} Coins → ${desc}\n`;
        }
        return message.reply(text);
    }


// =====================
// ITEM KAUFEN
// =====================

if (cmd === "!buy" && bet) {

    if (!shop[bet]) return message.reply("❌ Item existiert nicht!");

    const balance = await getCoins(message.author.id);
    if (balance < bet) return message.reply("❌ Nicht genug Coins!");

    removeCoins(message.author.id, bet);

    // Box-Items: zufällige Coins zurückgeben (50:50 mehr oder weniger)
    if (boxItems.has(bet)) {
        const payout = Math.floor(Math.random() * bet * 2);
        addCoins(message.author.id, payout);

        const won = payout > bet;
        const diff = Math.abs(payout - bet);
        const resultText = won
            ? `📈 Mehr! Du bekommst **${payout.toLocaleString()} Coins** zurück! (+${diff.toLocaleString()})`
            : `📉 Weniger... Du bekommst nur **${payout.toLocaleString()} Coins** zurück. (-${diff.toLocaleString()})`;

        message.reply(`🎲 **${shop[bet]}** geöffnet!\n${resultText}`);

        const feedChannel = message.guild.channels.cache.find(c => c.name === "bot-feed");
        if (feedChannel) {
            feedChannel.send(`
📢 **Box geöffnet!**
👤 User: <@${message.author.id}>
📦 Box: ${shop[bet]}
💰 Einsatz: ${bet.toLocaleString()} Coins
${won ? "📈" : "📉"} Ergebnis: ${payout.toLocaleString()} Coins
            `);
        }
        return;
    }

    message.reply(`✅ Du hast gekauft: **${shop[bet]}**`);

    // Bot-Feed Channel suchen
    const feedChannel = message.guild.channels.cache.find(
        channel => channel.name === "bot-feed"
    );

    if (feedChannel) {
        feedChannel.send(`
📢 **Neuer Kauf!**
👤 User: <@${message.author.id}>
🎟️ Item: ${shop[bet]}
💰 Preis: ${bet.toLocaleString()} Coins
        `);
    }
}
});


client.login(process.env.TOKEN);



// =====================
// TERMINAL ADMIN SYSTEM
// =====================

const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("🛠 Terminal Admin System aktiviert.");
console.log("Benutze: give USER_ID COINS");

rl.on('line', async (input) => {
    const args = input.split(" ");
    const command = args[0];

    if (command === "give") {

        const userId = args[1];
        const amount = parseInt(args[2]);

        if (!userId || isNaN(amount)) {
            return console.log("❌ Nutzung: give USER_ID COINS");
        }

        addCoins(userId, amount);

        console.log(`✅ ${amount} Coins wurden an ${userId} vergeben.`);
    }

    if (command === "remove") {

        const userId = args[1];
        const amount = parseInt(args[2]);

        if (!userId || isNaN(amount)) {
            return console.log("❌ Nutzung: remove USER_ID COINS");
        }

        removeCoins(userId, amount);

        console.log(`⚠️ ${amount} Coins wurden von ${userId} entfernt.`);
    }

    if (command === "balance") {

        const userId = args[1];

        if (!userId) {
            return console.log("❌ Nutzung: balance USER_ID");
        }

        const coins = await getCoins(userId);
        console.log(`💰 ${userId} hat ${coins} Coins.`);
    }
});