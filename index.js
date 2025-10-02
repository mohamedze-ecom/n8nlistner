// index.js
// ESM (package.json has "type": "module")

import { Client, GatewayIntentBits, Partials, ActivityType } from "discord.js";
import { fetch } from "undici";
import http from "node:http";

// ===== env =====
const TOKEN = process.env.DISCORD_TOKEN;              // required
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;  // required
const CHANNEL_ID = process.env.CHANNEL_ID || null;    // optional: restrict to 1 channel

if (!TOKEN || !N8N_WEBHOOK_URL) {
  console.error("Missing env DISCORD_TOKEN or N8N_WEBHOOK_URL");
  process.exit(1);
}

// ===== discord client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // enable in Dev Portal if you check content/mentions
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Optional presence
  client.user.setPresence({
    status: "online", // "online" | "idle" | "dnd" | "invisible"
    activities: [{ name: "mentions", type: ActivityType.Watching }],
  });
});

// Forward ONLY mentions to n8n; do not send any messages here.
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;                     // ignore bots
    if (CHANNEL_ID && msg.channelId !== CHANNEL_ID) return; // optional filter
    if (!msg.mentions.has(client.user)) return;     // only when bot is mentioned

    // If you want the relay to show typing (optional), uncomment:
    // await msg.channel.sendTyping();

    // Fire-and-forget POST to n8n; we don't parse or depend on the response
    const payload = {
      type: "message",
      guild_id: msg.guildId ?? null,
      channel_id: msg.channelId,
      author_id: msg.author.id,
      author_username: msg.author.username,
      message_id: msg.id,
      content: msg.content ?? "",
      mentions: msg.mentions.users.map(u => u.id),
      // add more fields if you need them in n8n:
      // attachments: msg.attachments.map(a => ({ id: a.id, url: a.url, name: a.name })),
      // timestamp: msg.createdTimestamp,
    };

    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((e) => console.error("POST to n8n failed:", e));
  } catch (err) {
    console.error("relay error:", err);
  }
});

client.login(TOKEN);

// ===== minimal health server (keeps Render Web Service happy) =====
// If deploying as a Background Worker on a paid plan, you may keep or remove this.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok\n");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("discord relay up\n");
  })
  .listen(PORT, () => console.log(`Health on :${PORT}`));

// graceful shutdown (optional)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, logging out…");
  client.destroy();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("SIGINT received, logging out…");
  client.destroy();
  process.exit(0);
});
