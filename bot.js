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

const shop = [
    { price: 5000,    name: "Thema-Ticket-Skinni",                  isBox: false },
    { price: 6000,    name: "Spooky sagt - Helfer",                  isBox: false },
    { price: 8000,    name: "Helferticket - Customs",                 isBox: false },
    { price: 12000,   name: "Tagesmod - 1 Stream",                   isBox: false },
    { price: 10000,   name: "Modusticket - Modus entscheiden",        isBox: false },
    { price: 10000,   name: "Standardbox",                            isBox: true  },
    { price: 20000,   name: "Testmod - 3 Streams",                   isBox: false },
    { price: 25000,   name: "Ultra Box",                              isBox: true  },
    { price: 50000,   name: "Ultimative Daddy Box",                   isBox: true  },
    { price: 500000,  name: "Skin-Ticket - 800VB",                   isBox: false },
    { price: 1000000, name: "Stream beenden - Stream sofort beenden", isBox: false },
];

client.once('ready', () => {
    console.log(`✅ Online als ${client.user.tag}`);
});

client.on('error', (err) => {
    console.error('❌ Discord Client Fehler:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
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
    !buy <Nummer>

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

    🛡 Moderation:
    !ban @User [Grund]
    !kick @User [Grund]
    !mute @User [Minuten] [Grund]
    !unmute @User [Grund]

    🛠 Admin (nur Terminal):
    give USERID COINS
    remove USERID COINS
    balance USERID
        `);
    }

    // =====================
    // MODERATION
    // =====================

    const MOD_ROLES = ["mod", "moderator", "admin", "administrator"];

    function hasModerationPermission(member) {
        return member.permissions.has("ModerateMembers") ||
               member.roles.cache.some(r => MOD_ROLES.includes(r.name.toLowerCase()));
    }

    if (cmd === "!ban") {
        if (!hasModerationPermission(message.member))
            return message.reply("❌ Du hast keine Berechtigung für diesen Command.");

        const target = message.mentions.members.first();
        if (!target) return message.reply("❌ Nutzung: `!ban @User [Grund]`");

        const reason = args.slice(2).join(" ") || "Kein Grund angegeben";

        if (!target.bannable)
            return message.reply("❌ Ich kann diesen User nicht bannen.");

        await target.ban({ reason });
        return message.reply(`🔨 **${target.user.tag}** wurde gebannt.\n📋 Grund: ${reason}`);
    }

    if (cmd === "!ban_role") {
        if (!hasModerationPermission(message.member))
            return message.reply("❌ Du hast keine Berechtigung für diesen Command.");

        const roleName = args.slice(1).join(" ");
        if (!roleName) return message.reply("❌ Nutzung: `!ban_role <Rollenname>`");

        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
        if (!role) return message.reply(`❌ Rolle **${roleName}** nicht gefunden.`);

        const members = await message.guild.members.fetch();
        const targets = members.filter(m => m.roles.cache.has(role.id) && m.bannable);

        if (targets.size === 0)
            return message.reply(`❌ Keine bannbaren User mit der Rolle **${role.name}** gefunden.`);

        const statusMsg = await message.reply(`⏳ Banne ${targets.size} User mit Rolle **${role.name}**...`);

        let success = 0;
        let failed = 0;
        for (const [, member] of targets) {
            try {
                await member.ban({ reason: `!ban_role: Rolle ${role.name} — ausgeführt von ${message.author.tag}` });
                success++;
            } catch {
                failed++;
            }
        }

        return statusMsg.edit(`✅ Fertig! **${success}** User gebannt, **${failed}** fehlgeschlagen.\n🎭 Rolle: **${role.name}**`);
    }

    if (cmd === "!kick") {
        if (!hasModerationPermission(message.member))
            return message.reply("❌ Du hast keine Berechtigung für diesen Command.");

        const target = message.mentions.members.first();
        if (!target) return message.reply("❌ Nutzung: `!kick @User [Grund]`");

        const reason = args.slice(2).join(" ") || "Kein Grund angegeben";

        if (!target.kickable)
            return message.reply("❌ Ich kann diesen User nicht kicken.");

        await target.kick(reason);
        return message.reply(`👢 **${target.user.tag}** wurde gekickt.\n📋 Grund: ${reason}`);
    }

    if (cmd === "!mute") {
        if (!hasModerationPermission(message.member))
            return message.reply("❌ Du hast keine Berechtigung für diesen Command.");

        const target = message.mentions.members.first();
        if (!target) return message.reply("❌ Nutzung: `!mute @User [Minuten] [Grund]`");

        const minutes = parseInt(args[2]) || 10;
        const reason = args.slice(3).join(" ") || "Kein Grund angegeben";
        const duration = minutes * 60 * 1000;

        if (!target.moderatable)
            return message.reply("❌ Ich kann diesen User nicht muten.");

        await target.timeout(duration, reason);
        return message.reply(`🔇 **${target.user.tag}** wurde für **${minutes} Minuten** gemutet.\n📋 Grund: ${reason}`);
    }

    if (cmd === "!unmute") {
        if (!hasModerationPermission(message.member))
            return message.reply("❌ Du hast keine Berechtigung für diesen Command.");

        const target = message.mentions.members.first();
        if (!target) return message.reply("❌ Nutzung: `!unmute @User`");

        if (!target.moderatable)
            return message.reply("❌ Ich kann diesen User nicht entmuten.");

        const reason = args.slice(2).join(" ") || "Kein Grund angegeben";
        await target.timeout(null, reason);
        return message.reply(`🔊 **${target.user.tag}** wurde entmutet.\n📋 Grund: ${reason}`);
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
        shop.forEach((item, i) => {
            const desc = item.isBox ? `${item.name} *(🎲 50:50 – Zufällige Coins zurück!)*` : item.name;
            text += `**#${i + 1}** – ${item.price.toLocaleString()} Coins → ${desc}\n`;
        });
        text += "\nKaufen mit: **!buy <Nummer>**";
        return message.reply(text);
    }


// =====================
// ITEM KAUFEN
// =====================

if (cmd === "!buy" && bet) {

    const itemIndex = bet - 1;
    const item = shop[itemIndex];

    if (!item) return message.reply(`❌ Item #${bet} existiert nicht! Schau dir den **!shop** an.`);

    const balance = await getCoins(message.author.id);
    if (balance < item.price) return message.reply(`❌ Nicht genug Coins! Du brauchst ${item.price.toLocaleString()} Coins.`);

    removeCoins(message.author.id, item.price);

    // Box-Items: zufällige Coins zurückgeben (50:50 mehr oder weniger)
    if (item.isBox) {
        const payout = Math.floor(Math.random() * item.price * 2);
        addCoins(message.author.id, payout);

        const won = payout > item.price;
        const diff = Math.abs(payout - item.price);
        const resultText = won
            ? `📈 Mehr! Du bekommst **${payout.toLocaleString()} Coins** zurück! (+${diff.toLocaleString()})`
            : `📉 Weniger... Du bekommst nur **${payout.toLocaleString()} Coins** zurück. (-${diff.toLocaleString()})`;

        message.reply(`🎲 **${item.name}** geöffnet!\n${resultText}`);

        const feedChannel = message.guild.channels.cache.find(c => c.name === "bot-feed");
        if (feedChannel) {
            feedChannel.send(`
📢 **Box geöffnet!**
👤 User: <@${message.author.id}>
📦 Box: ${item.name}
💰 Einsatz: ${item.price.toLocaleString()} Coins
${won ? "📈" : "📉"} Ergebnis: ${payout.toLocaleString()} Coins
            `);
        }
        return;
    }

    message.reply(`✅ Du hast gekauft: **${item.name}**`);

    const feedChannel = message.guild.channels.cache.find(c => c.name === "bot-feed");

    if (feedChannel) {
        feedChannel.send(`
📢 **Neuer Kauf!**
👤 User: <@${message.author.id}>
🎟️ Item: ${item.name}
💰 Preis: ${item.price.toLocaleString()} Coins
        `);
    }
}
});


client.login(process.env.TOKEN);

// =====================
// WEB API STARTEN
// =====================
require('./api')(db, client);



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