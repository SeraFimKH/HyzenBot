import { ActivityType } from "discord.js";
import Redis from "ioredis";
import { config } from "../config.js";
import { JsonStore } from "../database/jsonStore.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { getNetworkStatus, setNetworkStatus, StatusMode } from "../database/networkStatus.js";
import { getServerHeartbeats } from "../database/redis.js";
import { pingBedrock } from "../utils/bedrockPing.js";
import { resolveStatus, ServerState } from "../utils/serverState.js";
import { buildStatusEmbed, describeState } from "../utils/statusEmbed.js";

const POLL_INTERVAL_MS = 15_000;
// The panel is edited when something in it changed, and at least this often so its "updated" time stays fresh.
const PANEL_REFRESH_MS = 60_000;
// In automatic mode the server only counts as offline (or the status as unavailable) after this many polls in a
// row found nothing — one lost ping (it's UDP) or one Redis hiccup isn't an outage.
const OUTAGE_CONFIRMATIONS = 2;
const DEFAULT_BEDROCK_PORT = 19132;
const NETWORK_STATUS_CHANNEL = "hyzen:network-status";
const UNKNOWN_MESSAGE = 10008;

const PRESENCE_STATUS = {
  [ServerState.ONLINE]: "online",
  [ServerState.MAINTENANCE]: "idle",
  [ServerState.OFFLINE]: "dnd",
  [ServerState.UNKNOWN]: "idle",
};

// Since when the server has been in its current state, kept across bot restarts ("online desde ...").
const store = new JsonStore("serverStatus.json", {});

let current = null;
let polling = null;
let missedPolls = 0;
let lastPresence = null;
let redisWasDown = false;
const panels = new Map(); // guildId -> { signature, editedAt, error }

// The last status computed, or null before the first poll finished.
export function getServerStatus() {
  return current;
}

// For commands: the last status, computing it now if the bot only just started.
export async function currentServerStatus(client) {
  return current || refreshServerStatus(client);
}

// Sets the mode (database + the message that makes the servers apply it now) and shows it everywhere right away.
// Throws what setNetworkStatus throws.
export async function setStatusMode(client, mode, reason, changedBy) {
  const network = await setNetworkStatus(mode, reason, changedBy);
  missedPolls = OUTAGE_CONFIRMATIONS; // what the staff just chose is shown at once, no confirmation needed
  const status = await freshServerStatus(client);
  return { network, status };
}

// Turns a message the bot already posted (the reply of /status) into the status panel of that server: from now on
// it's the one kept up to date, in that channel.
export async function pinStatusPanel(client, guild, channelId, messageId) {
  updateGuildConfig(guild.id, (c) => {
    c.channels.status = channelId;
    c.statusPanelChannelId = channelId;
    c.statusPanelMessageId = messageId;
  });
  panels.delete(guild.id);
  return freshServerStatus(client);
}

export function startServerStatus(client) {
  const tick = () => refreshServerStatus(client).catch((err) => console.error("[serverStatus] refresh failed", err));
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
  listenForModeChanges(client);
}

// HyzenCore publishes on hyzen:network-status when someone uses /manutencao in the game (and this bot does when
// the mode is set from Discord). Refreshing right then is what makes the presence and the panel switch to "em
// manutenção" within a second, by themselves, instead of on the next poll. A connection of its own, as in
// services/gameEvents.js: one that issued SUBSCRIBE can't run normal commands anymore.
function listenForModeChanges(client) {
  const subscriber = new Redis(config.redis);
  let failing = false;

  subscriber.on("error", (err) => {
    // ioredis keeps trying to reconnect: one line when it goes away is enough.
    if (!failing) console.error("[serverStatus] redis subscription error", err.message);
    failing = true;
  });
  subscriber.on("ready", () => {
    failing = false;
  });

  subscriber.subscribe(NETWORK_STATUS_CHANNEL, (err) => {
    if (err) console.error("[serverStatus] failed to subscribe", err.message);
  });

  subscriber.on("message", () => {
    missedPolls = OUTAGE_CONFIRMATIONS; // the staff just changed the mode: shown at once
    freshServerStatus(client).catch((err) => console.error("[serverStatus] refresh failed", err));
  });
}

// After something changed: a refresh already running may have read the old state, so wait for it and look again.
async function freshServerStatus(client) {
  if (polling) await polling.catch(() => {});
  return refreshServerStatus(client);
}

// One refresh at a time: a caller arriving while one is running gets that one's result.
export function refreshServerStatus(client) {
  if (!polling) {
    polling = refresh(client).finally(() => {
      polling = null;
    });
  }
  return polling;
}

async function refresh(client) {
  const [network, heartbeats] = await Promise.all([getNetworkStatus(), getServerHeartbeats()]);
  logRedisState(heartbeats === null);

  // The direct ping is the second opinion, asked only when no server is reporting in through Redis.
  let ping;
  if (!heartbeats?.length) {
    const address = findServerAddress(client);
    if (address) ping = await pingBedrock(address.host, address.port);
  }

  let resolved = resolveStatus({ network, heartbeats, ping });

  const lostContact = resolved.mode === StatusMode.AUTO && (resolved.state === ServerState.OFFLINE || resolved.state === ServerState.UNKNOWN);
  if (lostContact) {
    missedPolls++;
    if (missedPolls < OUTAGE_CONFIRMATIONS && current && current.state !== resolved.state) {
      // Not confirmed yet: keep showing what was there.
      resolved = { ...current };
    }
  } else {
    missedPolls = 0;
  }

  const now = Date.now();
  const saved = store.get("network");
  const since = saved && saved.state === resolved.state ? saved.since : now;
  if (!saved || saved.state !== resolved.state) {
    store.set("network", { state: resolved.state, since });
    if (saved) console.log(`[serverStatus] ${saved.state} -> ${resolved.state}`);
  }

  current = { ...resolved, since, checkedAt: now };

  if (client.isReady()) {
    updatePresence(client, current);
    for (const guild of client.guilds.cache.values()) {
      await updatePanel(guild, current);
    }
  }
  return current;
}

function logRedisState(down) {
  if (down && !redisWasDown) {
    console.error("[serverStatus] o Redis não respondeu — sem ele o status depende do ping direto ao endereço do servidor (/painel → Administração → Endereço do Servidor).");
  } else if (!down && redisWasDown) {
    console.log("[serverStatus] o Redis voltou a responder.");
  }
  redisWasDown = down;
}

// The address players connect to, as configured in /painel — the first server (guild) that has one.
function findServerAddress(client) {
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuildConfig(guild.id);
    if (cfg.serverIp) return { host: cfg.serverIp, port: cfg.serverPort || DEFAULT_BEDROCK_PORT };
  }
  return null;
}

// "🟢 12/100 jogadores online" under the bot's name, with the green/yellow/red dot to match. Discord only gets
// an update when the text or the dot actually changed.
function updatePresence(client, status) {
  const text = describeState(status).presence;
  const presenceStatus = PRESENCE_STATUS[status.state];
  const key = `${presenceStatus}|${text}`;
  if (key === lastPresence) return;
  lastPresence = key;

  client.user.setPresence({
    status: presenceStatus,
    activities: [{ name: text, state: text, type: ActivityType.Custom }],
  });
}

// The status message the bot keeps in the channel chosen in /painel → Servidor do Jogo: posted once, then edited.
async function updatePanel(guild, status) {
  const cfg = getGuildConfig(guild.id);
  const channelId = cfg.channels.status;
  if (!channelId) return;

  const embed = buildStatusEmbed(cfg, status, guild.iconURL({ size: 256 }));
  const signature = JSON.stringify({ ...embed.data, timestamp: null, channelId });
  const panel = panels.get(guild.id) || {};
  if (panel.signature === signature && Date.now() - panel.editedAt < PANEL_REFRESH_MS) return;

  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    let message = null;
    const postedIn = cfg.statusPanelChannelId;
    if (cfg.statusPanelMessageId && postedIn) {
      const oldChannel = postedIn === channelId ? channel : await guild.channels.fetch(postedIn).catch(() => null);
      message = oldChannel?.isTextBased() ? await oldChannel.messages.fetch(cfg.statusPanelMessageId).catch(ignoreUnknownMessage) : null;
      if (message && postedIn !== channelId) {
        // The panel was moved to another channel: the old message goes away, a new one is posted below.
        await message.delete().catch(() => {});
        message = null;
      }
    }

    if (message) {
      await message.edit({ embeds: [embed] });
    } else {
      message = await channel.send({ embeds: [embed] });
      updateGuildConfig(guild.id, (c) => {
        c.statusPanelMessageId = message.id;
        c.statusPanelChannelId = channelId;
      });
    }
    panels.set(guild.id, { signature, editedAt: Date.now(), error: null });
  } catch (err) {
    // Usually a missing permission in that channel — logged once, not every 15 seconds.
    if (panel.error !== err.message) {
      console.error(`[serverStatus] failed to update the status panel in guild ${guild.id}: ${err.message}`);
    }
    panels.set(guild.id, { ...panel, error: err.message });
  }
}

// A panel message someone deleted is simply posted again; anything else is a real error.
function ignoreUnknownMessage(err) {
  if (err.code === UNKNOWN_MESSAGE) return null;
  throw err;
}
