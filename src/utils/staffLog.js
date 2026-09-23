import { baseEmbed } from "./embeds.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { findDiscordIdByPlayerId } from "../database/auth.js";

// Posts a punishment/win record to whichever log channel the server configured for that category (/config
// canal or /painel → Moderação) — silently does nothing if the channel isn't set or the bot can't post there,
// same "log channel is optional" behavior every other log channel in this bot already has (ticketLog,
// paymentLog, ...).
export async function postStaffLog(guild, channelKey, embed) {
  const cfg = getGuildConfig(guild.id);
  const channelId = cfg.channels[channelKey];
  if (!channelId) return;

  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`[staffLog] failed to post to ${channelKey}`, err.message);
  }
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
// no "staff member who did it right now" to scope it to) — posts to every guild that configured the channel.
export async function broadcastStaffLog(client, channelKey, embed) {
  for (const guild of client.guilds.cache.values()) {
    await postStaffLog(guild, channelKey, embed);
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
