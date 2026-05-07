# Discord Gamble Bot 🎰

A Discord bot with a gambling system and virtual coin economy.

## Features

- 🪙 Virtual coin economy — earn and spend coins
- 🎰 Gambling commands — test your luck
- 💾 SQLite database — persistent coin storage per user
- 🚀 Deployable via Railway

## Tech Stack

- Node.js
- discord.js
- SQLite (better-sqlite3)

## Setup

1. Clone the repo:
   git clone https://github.com/Demon-wire/Discord_Gamble_Bot.git
   cd Discord_Gamble_Bot

2. Install dependencies:
   npm install

3. Create a .env file:
   cp .env.example .env

4. Fill in your values:
   DISCORD_TOKEN=your_token_here
   CLIENT_ID=your_client_id_here

5. Start the bot:
   node bot.js

## Deployment

See [DEPLOY.md](DEPLOY.md) for Railway deployment instructions.

## License

MIT
