import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";

// ---------- Config ----------
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.BOSS_CHANNEL_ID;
const API_URL =
  process.env.BOSS_API_URL ||
  "https://webhook-server-production-cc52.up.railway.app/api/ask";
const API_TIMEOUT_MS = Number(process.env.BOSS_API_TIMEOUT_MS) || 180_000;

if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}
if (!CHANNEL_ID) {
  console.error("BOSS_CHANNEL_ID is not set");
  process.exit(1);
}

// ---------- Discord client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(
    `[boss-bot] online as ${c.user.tag} — watching channel ${CHANNEL_ID}`
  );
});

client.on(Events.MessageCreate, async (message) => {
  // Guard rails
  if (message.author.bot) return;
  if (message.channelId !== CHANNEL_ID) return;
  const content = (message.content || "").trim();
  const attachmentUrls = message.attachments
    .filter((a) => a.contentType && a.contentType.startsWith("image/"))
    .map((a) => a.url);
  if (!content && attachmentUrls.length === 0) return;

  // If this is a reply, include the quoted message for context
  let replyContext = "";
  if (message.reference?.messageId) {
    try {
      const quoted = await message.channel.messages.fetch(message.reference.messageId);
      if (quoted) {
        const quotedAuthor = quoted.author.bot ? "Boss" : quoted.author.username;
        const quotedText = (quoted.content || "").slice(0, 300);
        replyContext = `[Replying to ${quotedAuthor}: "${quotedText}"] `;
      }
    } catch { /* non-fatal */ }
  }

  // Show "Boss is typing…" while we wait on the API
  try {
    await message.channel.sendTyping();
  } catch {
    /* non-fatal */
  }

  let reply;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: replyContext + (attachmentUrls.length > 0
          ? `${content}\n[Images attached: ${attachmentUrls.join(", ")}]`.trim()
          : content),
        image_urls: attachmentUrls,
        user: message.author.username,
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!res.ok) {
      reply = `_Boss API returned ${res.status} ${res.statusText}._`;
    } else {
      const data = await res.json().catch(() => ({}));
      reply = (data && data.response) || "_(empty response from Boss)_";
    }
  } catch (err) {
    console.error("[boss-bot] api error:", err);
    reply = `_Failed to reach Boss: ${err?.message || "unknown error"}._`;
  }

  // Discord caps messages at 2000 chars — split safely
  for (const chunk of chunkify(reply, 1900)) {
    try {
      await message.reply({ content: chunk, allowedMentions: { parse: [] } });
    } catch (err) {
      console.error("[boss-bot] reply error:", err);
    }
  }
});

// ---------- Helpers ----------
function chunkify(text, max) {
  if (!text) return [""];
  const out = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + max));
    i += max;
  }
  return out;
}

// ---------- Resilience ----------
client.on("error", (e) => console.error("[boss-bot] client error:", e));
process.on("unhandledRejection", (e) =>
  console.error("[boss-bot] unhandledRejection:", e)
);

client.login(TOKEN);
