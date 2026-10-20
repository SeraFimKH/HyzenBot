import { baseEmbed } from "./embeds.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { findDiscordIdByPlayerId } from "../database/auth.js";
import { logGuildIds } from "./linkedGuilds.js";

// Posts to whichever log channel the server configured for that key (/config canal or /painel) — in the server itself
// or in its admin server (/painel → Servidor Administrativo). Silently does nothing when the channel isn't set or the
// bot can't post there: every log channel in this bot is optional. A channel in any other server is refused, should a
// stale setting point there after the admin server changed. Resolves to the message posted, or null.
export async function postLog(client, guildId, channelKey, payload) {
  const cfg = getGuildConfig(guildId);
  const channelId = cfg.channels[channelKey];
  if (!channelId) return null;
  return sendLog(client, channelId, logGuildIds(guildId, cfg), channelKey, payload);
}

async function sendLog(client, channelId, allowedGuildIds, channelKey, payload) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !allowedGuildIds.includes(channel.guildId)) return null;
    return await channel.send(payload);
  } catch (err) {
    console.error(`[staffLog] failed to post to ${channelKey}`, err.message);
    return null;
  }
}

// A punishment/win record (/ban, /mute, /warn...) to the server's channel for that category.
export async function postStaffLog(guild, channelKey, embed) {
  await postLog(guild.client, guild.id, channelKey, { embeds: [embed] });
}

export function punishmentLogEmbed({ title, color, player, staffTag, reason, extraFields = [] }) {
  return baseEmbed()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: "Jogador", value: player.name, inline: true },
      { name: "Staff", value: staffTag, inline: true },
      ...extraFields,
      { name: "Motivo", value: reason },
    );
}

// Same as postStaffLog, but for events with no single originating guild (a punishment expiring naturally has
// no "staff member who did it right now" to scope it to) — posts to every guild that configured the channel. Once per
// channel: the players' server and the admin server both pointing at the same log channel would post everything twice.
export async function broadcastStaffLog(client, channelKey, embed) {
  const targets = new Map();
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuildConfig(guild.id);
    const channelId = cfg.channels[channelKey];
    if (channelId && !targets.has(channelId)) targets.set(channelId, logGuildIds(guild.id, cfg));
  }
  for (const [channelId, allowedGuildIds] of targets) {
    await sendLog(client, channelId, allowedGuildIds, channelKey, { embeds: [embed] });
  }
}

// Best-effort DM to the punished player — silently does nothing if they never linked their account via
// /verificar, or if their DMs are closed to the bot (Discord throws 50007 for that; not worth surfacing to
// staff, the punishment itself already succeeded regardless of whether the DM lands).
export async function dmPunishedPlayer(client, playerId, embed) {
  const discordId = await findDiscordIdByPlayerId(playerId);
  if (!discordId) return;

  try {
    const user = await client.users.fetch(discordId);
    await user.send({ embeds: [embed] });
  } catch (err) {
    console.error(`[staffLog] failed to DM player ${playerId} (discord ${discordId})`, err.message);
  }
}
