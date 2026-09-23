import { errorEmbed, baseEmbed } from "./embeds.js";
import { formatDuration } from "./format.js";
import { findActiveBan, findActiveMute } from "../database/punishments.js";
import { getPresence } from "../database/redis.js";
import { resolveTargetPlayerOrSelf } from "./playerResolver.js";
import { findDiscordIdByPlayerId } from "../database/auth.js";
import { colorForLevel, levelProgressLine } from "./levelDisplay.js";

// Shared by /perfil e /stats — same read-only profile view, just under two names since some staff/players
// reach for "stats" out of habit and others for "perfil".
export async function executeProfileCommand(interaction) {
  await interaction.deferReply();

  const { player, error } = await resolveTargetPlayerOrSelf(interaction);
  if (!player) {
    return interaction.editReply({ embeds: [errorEmbed(error)] });
  }

  const [activeBan, activeMute, presence, discordId] = await Promise.all([
    findActiveBan(player.id),
    findActiveMute(player.id),
    getPresence(player.id),
    findDiscordIdByPlayerId(player.id),
  ]);

  const kdr = player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2);
  const wlr = player.losses > 0 ? (player.wins / player.losses).toFixed(2) : player.wins.toFixed(2);

  const levelLine = levelProgressLine(player.level, player.xp);

  const statusLine = presence ? `🟢 Online — ${presence.server || "?"}` : "⚪ Offline";
  const banLine = activeBan
    ? `🔨 Banido${activeBan.type === "TEMPBAN" && activeBan.expires_at ? ` até ${new Date(activeBan.expires_at).toLocaleString("pt-BR")}` : " (permanente)"} — ${activeBan.reason}`
    : "✅ Sem banimento ativo";
  const muteLine = activeMute
    ? `🔇 Mutado${activeMute.type === "TEMPMUTE" && activeMute.expires_at ? ` até ${new Date(activeMute.expires_at).toLocaleString("pt-BR")}` : " (permanente)"} — ${activeMute.reason}`
    : null;

  const embed = baseEmbed()
    .setColor(colorForLevel(player.level))
    .setTitle(`📊 Perfil de ${player.display_name || player.name}`)
    .addFields(
      { name: "🏷️ Grupo", value: player.group || "default", inline: true },
      { name: "📶 Status", value: statusLine, inline: true },
      { name: "​", value: "​", inline: true },
      { name: "🔹 Nível", value: levelLine, inline: false },
      { name: "🏆 Vitórias", value: `${player.wins}`, inline: true },
      { name: "☠️ Derrotas", value: `${player.losses}`, inline: true },
      { name: "⚖️ W/L", value: `${wlr}`, inline: true },
      { name: "⚔️ Kills", value: `${player.kills}`, inline: true },
      { name: "💀 Mortes", value: `${player.deaths}`, inline: true },
      { name: "🎯 K/D", value: `${kdr}`, inline: true },
      { name: "🔥 Sequência atual", value: `${player.winstreak}`, inline: true },
      { name: "🌟 Melhor sequência", value: `${player.best_winstreak}`, inline: true },
      { name: "⏱️ Tempo jogado", value: formatDuration(Number(player.playtime) * 1000), inline: true },
      { name: "🔨 Banimento", value: banLine },
    );

  if (muteLine) {
    embed.addFields({ name: "🔇 Mute", value: muteLine });
  }

  if (discordId) {
    try {
      const user = await interaction.client.users.fetch(discordId);
      embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
    } catch {
      // best-effort only — a stale/unfetchable discord id just means no thumbnail, nothing to report to the user
    }
  }

  return interaction.editReply({ embeds: [embed] });
}
