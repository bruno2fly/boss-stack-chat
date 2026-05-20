import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  Events,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";

// ---------- Cross-channel events log ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_LOG_PATH = path.join(__dirname, "events.log");
const EVENTS_TAIL_LINES = 20;  // was 50 — token audit showed lines 21-50 rarely used; saved ~465 tok/request

function logEvent(channelId, username, message) {
  try {
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const snippet = (message || "").replace(/\s+/g, " ").slice(0, 80);
    const line = `[${ts}] #${channelId} | ${username}: ${snippet}\n`;
    fs.appendFileSync(EVENTS_LOG_PATH, line);
  } catch (err) {
    console.error("[events] write failed:", err.message);
  }
}

function tailEvents(n = EVENTS_TAIL_LINES) {
  try {
    if (!fs.existsSync(EVENTS_LOG_PATH)) return "";
    const all = fs.readFileSync(EVENTS_LOG_PATH, "utf-8").split("\n").filter(Boolean);
    return all.slice(-n).join("\n");
  } catch {
    return "";
  }
}

// ---------- Config ----------
const TOKEN = process.env.DISCORD_BOT_TOKEN;
// Accept either BOSS_CHANNEL_IDS (comma-separated list) or BOSS_CHANNEL_ID (single).
// Examples:
//   BOSS_CHANNEL_IDS=149...035,150...111,150...222
//   BOSS_CHANNEL_ID=149...035
const CHANNEL_IDS = (process.env.BOSS_CHANNEL_IDS || process.env.BOSS_CHANNEL_ID || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const API_URL =
  process.env.BOSS_API_URL ||
  "https://webhook-server-production-cc52.up.railway.app/api/ask";
const API_TIMEOUT_MS = Number(process.env.BOSS_API_TIMEOUT_MS) || 180_000;

// ---------- Control API config ----------
const CONTROL_PORT = Number(process.env.DISCORD_CONTROL_PORT) || 5050;
const CONTROL_SECRET = process.env.DISCORD_CONTROL_SECRET || "";
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";

if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}
if (CHANNEL_IDS.length === 0) {
  console.error("Set BOSS_CHANNEL_IDS (comma-separated) or BOSS_CHANNEL_ID (single).");
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
    `[boss-bot] online as ${c.user.tag} — watching ${CHANNEL_IDS.length} channel(s): ${CHANNEL_IDS.join(", ")}`
  );
});

client.on(Events.MessageCreate, async (message) => {
  // Guard rails
  if (message.author.bot) return;
  if (!CHANNEL_IDS.includes(message.channelId)) return;
  const content = (message.content || "").trim();
  // Append to cross-channel events log so Boss has visibility across channels.
  logEvent(message.channelId, message.author.username, content);
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
        channel_id: message.channelId,
        events_context: tailEvents(),
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

// ---------- Control HTTP API ----------
// Lets Boss's Railway brain create channels, add users, post messages.
// Auth: every request must carry header `x-control-secret: <DISCORD_CONTROL_SECRET>`.
// Exposed via a second ngrok tunnel (or Railway public URL once redeployed).

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => (buf += chunk));
    req.on("end", () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function getGuild() {
  if (GUILD_ID) return client.guilds.cache.get(GUILD_ID);
  return client.guilds.cache.first();
}

const controlServer = http.createServer(async (req, res) => {
  if (!CONTROL_SECRET) {
    return sendJSON(res, 503, {
      ok: false,
      error: "DISCORD_CONTROL_SECRET not set on bot — control API disabled",
    });
  }
  if (req.headers["x-control-secret"] !== CONTROL_SECRET) {
    return sendJSON(res, 401, { ok: false, error: "unauthorized" });
  }
  if (req.method === "GET" && (req.url === "/health" || req.url === "/discord/health")) {
    return sendJSON(res, 200, {
      ok: true,
      bot: client.user ? client.user.tag : null,
      guilds: client.guilds.cache.size,
    });
  }
  if (req.method !== "POST") {
    return sendJSON(res, 405, { ok: false, error: "method not allowed" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJSON(res, 400, { ok: false, error: "invalid JSON" });
  }

  const guild = getGuild();
  if (!guild) {
    return sendJSON(res, 500, {
      ok: false,
      error: "no guild found (bot may not be in any server yet)",
    });
  }

  try {
    // ---- Create a (private by default) text channel ----
    if (req.url === "/discord/create_channel") {
      const { name, topic, members = [], category_id, public: isPublic } = body;
      if (!name || typeof name !== "string") {
        return sendJSON(res, 400, { ok: false, error: "name required" });
      }
      const memberList = Array.isArray(members) ? members.filter(Boolean) : [];

      const overwrites = isPublic
        ? []
        : [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            // Always give the bot access so it can post afterwards
            {
              id: client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            ...memberList.map((userId) => ({
              id: userId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            })),
          ];

      const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        topic: topic || "",
        parent: category_id || undefined,
        permissionOverwrites: overwrites,
      });

      return sendJSON(res, 200, {
        ok: true,
        channel_id: channel.id,
        channel_name: channel.name,
        url: `https://discord.com/channels/${guild.id}/${channel.id}`,
      });
    }

    // ---- Add a user to an existing channel ----
    if (req.url === "/discord/add_user") {
      const { channel_id, user_id } = body;
      if (!channel_id || !user_id) {
        return sendJSON(res, 400, {
          ok: false,
          error: "channel_id and user_id required",
        });
      }
      const channel = guild.channels.cache.get(channel_id);
      if (!channel) {
        return sendJSON(res, 404, { ok: false, error: "channel not found" });
      }
      await channel.permissionOverwrites.create(user_id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      return sendJSON(res, 200, { ok: true, channel_id, user_id });
    }

    // ---- Post a message to a channel ----
    if (req.url === "/discord/post") {
      const { channel_id, content } = body;
      if (!channel_id || !content) {
        return sendJSON(res, 400, {
          ok: false,
          error: "channel_id and content required",
        });
      }
      const channel = guild.channels.cache.get(channel_id);
      if (!channel) {
        return sendJSON(res, 404, { ok: false, error: "channel not found" });
      }
      const msg = await channel.send({
        content: String(content).slice(0, 2000),
        allowedMentions: { parse: [] },
      });
      return sendJSON(res, 200, { ok: true, message_id: msg.id });
    }

    return sendJSON(res, 404, { ok: false, error: "unknown endpoint" });
  } catch (err) {
    console.error("[control] error:", err);
    return sendJSON(res, 500, {
      ok: false,
      error: err?.message || String(err),
    });
  }
});

controlServer.listen(CONTROL_PORT, () => {
  console.log(
    `[control] HTTP API listening on :${CONTROL_PORT} ` +
      `(auth: ${CONTROL_SECRET ? "enabled" : "DISABLED — set DISCORD_CONTROL_SECRET"})`
  );
});

client.login(TOKEN);
