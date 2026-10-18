import { PermissionsBitField } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { formatPermissionList, missingPermissions } from "../utils/channelPermissions.js";
import { buildSuggestionPanel, PANEL_BUTTON_ID } from "../utils/suggestionViews.js";

const { Flags } = PermissionsBitField;

// What the bot needs in the suggestions channel: post the panel and the suggestions (with their poll), find the
// last message, and open a discussion thread on each suggestion.
export const SUGGESTION_CHANNEL_PERMISSIONS = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks, Flags.ReadMessageHistory, Flags.SendPolls];
export const SUGGESTION_THREAD_PERMISSIONS = [Flags.CreatePublicThreads, Flags.SendMessagesInThreads];

// How long the channel has to stay quiet before the panel is moved: a burst of messages moves it once.
const SETTLE_MS = 2_500;

const pending = new Map(); // guildId -> timeout of the next move
const moves = new Map(); // guildId -> the move running now (one at a time, or two panels end up in the channel)
const loggedErrors = new Map(); // guildId -> last error logged, so a channel without permission isn't logged on every message

export function isSuggestionPanel(message) {
  if (message.author?.id !== message.client?.user?.id) return false;
  return (message.components || []).some((row) => (row.components || []).some((component) => component.customId === PANEL_BUTTON_ID));
}

// Every new message in the suggestions channel — a suggestion, the result of an ended poll, someone talking — pushes
// the panel up. Once the channel settles the panel is posted again at the bottom, so the button is always the last
// thing in the channel and the suggestions pile up above it.
export function watchSuggestionChannel(message) {
  if (!message.guildId) return;
  const cfg = getGuildConfig(message.guildId);
  if (!cfg.channels.sugestoes || message.channelId !== cfg.channels.sugestoes || isSuggestionPanel(message)) return;
  scheduleSuggestionPanel(message.client, message.guildId);
}

export function scheduleSuggestionPanel(client, guildId, delayMs = SETTLE_MS) {
  clearTimeout(pending.get(guildId));
  pending.set(
    guildId,
    setTimeout(() => {
      pending.delete(guildId);
      moveSuggestionPanel(client, guildId).catch((err) => logOnce(guildId, err));
    }, delayMs),
  );
}

// At startup: each server's panel is checked (and posted again if a message arrived while the bot was off).
export async function ensureSuggestionPanels(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!getGuildConfig(guild.id).channels.sugestoes) continue;
    await moveSuggestionPanel(client, guild.id).catch((err) => logOnce(guild.id, err));
  }
}

/**
 * Makes sure the panel is the last message of the suggestions channel. force: posts it again even if it already is
 * (after its texts changed). Resolves to { ok: true, channel, moved } or { ok: false, reason } for things the staff
 * can fix (channel gone, a permission missing); throws on anything else.
 */
export function moveSuggestionPanel(client, guildId, { force = false } = {}) {
  const previous = moves.get(guildId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => movePanel(client, guildId, force));
  moves.set(guildId, next);
  next
    .finally(() => {
      if (moves.get(guildId) === next) moves.delete(guildId);
    })
    .catch(() => {});
  return next;
}

async function movePanel(client, guildId, force) {
  const cfg = getGuildConfig(guildId);
  const channelId = cfg.channels.sugestoes;
  if (!channelId) return { ok: false, reason: "Configure o canal de sugestões primeiro." };

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return { ok: false, reason: "O canal de sugestões configurado não foi encontrado." };

  const me = channel.guild?.members.me ?? (await channel.guild?.members.fetchMe().catch(() => null));
  const missing = missingPermissions(channel, me, SUGGESTION_CHANNEL_PERMISSIONS);
  if (missing.length) {
    return { ok: false, reason: `No canal ${channel} o bot precisa destas permissões: ${formatPermissionList(missing)}.` };
  }

  if (!force) {
    const last = (await channel.messages.fetch({ limit: 1 })).first();
    if (last && last.id === cfg.suggestionPanelMessageId) return { ok: true, channel, moved: false };
  }

  // The new panel first, then the old one goes: there's never a moment without the button.
  const panel = await channel.send(buildSuggestionPanel(cfg));
  updateGuildConfig(guildId, (c) => {
    c.suggestionPanelMessageId = panel.id;
    c.suggestionPanelChannelId = channelId;
  });
  if (cfg.suggestionPanelMessageId) {
    const oldChannel = cfg.suggestionPanelChannelId && cfg.suggestionPanelChannelId !== channelId ? await client.channels.fetch(cfg.suggestionPanelChannelId).catch(() => null) : channel;
    await oldChannel?.messages.delete(cfg.suggestionPanelMessageId).catch(() => {});
  }
  loggedErrors.delete(guildId);
  return { ok: true, channel, moved: true };
}

function logOnce(guildId, err) {
  if (loggedErrors.get(guildId) === err.message) return;
  loggedErrors.set(guildId, err.message);
  console.error(`[suggestionPanel] failed to keep the suggestion panel at the bottom in guild ${guildId}: ${err.message}`);
}
