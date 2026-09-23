import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, baseEmbed } from "../utils/embeds.js";
import { formatDuration } from "../utils/format.js";
import { findActiveBan, findActiveMute, countActiveWarnings } from "../database/punishments.js";
import { getPresence } from "../database/redis.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";
import { findDiscordIdByPlayerId } from "../database/auth.js";
import { colorForLevel, levelProgressLine } from "../utils/levelDisplay.js";

export const data = new SlashCommandBuilder()
  .setName("infoplayer")
  .setDescription("[Staff] Mostra todas as informações registradas de um jogador.")
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const { player, error } = await resolveTargetPlayer(interaction);
  if (!player) {
    return interaction.editReply({ embeds: [errorEmbed(error)] });
  }

  const [activeBan, activeMute, warnCount, presence, discordId] = await Promise.all([
    findActiveBan(player.id),
    findActiveMute(player.id),
    countActiveWarnings(player.id),
    getPresence(player.id),
    findDiscordIdByPlayerId(player.id),
  ]);

  const statusLine = presence ? `🟢 Online — servidor **${presence.server || "?"}**, mundo **${presence.world || "?"}**` : "⚪ Offline";
  const banLine = activeBan
    ? `🔨 **${activeBan.type}**${activeBan.expires_at ? ` até ${new Date(activeBan.expires_at).toLocaleString("pt-BR")}` : " (permanente)"} — ${activeBan.reason}`
    : "✅ Sem banimento ativo";
  const muteLine = activeMute
    ? `🔇 **${activeMute.type}**${activeMute.expires_at ? ` até ${new Date(activeMute.expires_at).toLocaleString("pt-BR")}` : " (permanente)"} — ${activeMute.reason}`
    : "✅ Sem mute ativo";

  // Discord embeds cap out at 25 fields — several related columns are merged into one field each to stay
  // safely under that (23 fields total here) while still surfacing every column on hyzen_players.
  const embed = baseEmbed()
    .setColor(colorForLevel(player.level))
    .setTitle(`🗂️ Informações completas — ${player.name}`)
    .addFields(
      { name: "🎮 IGN", value: player.name, inline: true },
      { name: "🏷️ Exibição / Título", value: `${player.display_name || player.name}${player.title ? ` — ${player.title}` : ""}`, inline: true },
      { name: "💬 Discord", value: discordId ? `<@${discordId}>` : "Não vinculado", inline: true },
      { name: "🆔 UUID", value: `\`${player.uuid}\``, inline: false },
      { name: "📶 Status", value: statusLine, inline: true },
      { name: "🛡️ Grupo", value: player.group || "default", inline: true },
      { name: "​", value: "​", inline: true },
      { name: "🔹 Nível", value: levelProgressLine(player.level, player.xp), inline: false },
      { name: "💰 Coins / Cash", value: `${player.coins} / ${player.cash}`, inline: true },
      { name: "🎖️ Rank", value: player.rank_tier ? `${player.rank_tier}${player.rank_div ?? ""} (${player.rank_points} pts)` : "—", inline: true },
      { name: "⏱️ Tempo jogado", value: formatDuration(Number(player.playtime) * 1000), inline: true },
      { name: "🏆 Vitórias / Derrotas", value: `${player.wins} / ${player.losses}`, inline: true },
      { name: "⚔️ Kills / Mortes", value: `${player.kills} / ${player.deaths}`, inline: true },
      { name: "🔥 Sequência (atual/melhor)", value: `${player.winstreak} / ${player.best_winstreak}`, inline: true },
      { name: "🏠 Guild / Party ID", value: `${player.guild_id ?? "—"} / ${player.party_id ?? "—"}`, inline: true },
      { name: "📅 Primeiro login", value: new Date(player.first_join).toLocaleString("pt-BR"), inline: true },
      { name: "🕒 Último login", value: new Date(player.last_login).toLocaleString("pt-BR"), inline: true },
      { name: "🌐 Último servidor", value: player.last_server || "—", inline: true },
      { name: "📱 Dispositivo / Plataforma", value: `${player.last_device || "—"} / ${player.last_platform || "—"}`, inline: true },
      { name: "🔒 IP (hash) / Idioma", value: `${player.last_ip_hash ? `\`${player.last_ip_hash}\`` : "—"} / ${player.language || "—"}`, inline: true },
      { name: "🔨 Banimento", value: banLine, inline: false },
      { name: "🔇 Mute", value: muteLine, inline: false },
      { name: "⚠️ Advertências ativas", value: `${warnCount}`, inline: true },
    );

  if (discordId) {
    try {
      const user = await interaction.client.users.fetch(discordId);
      embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
    } catch {
      // best-effort only
    }
  }

  return interaction.editReply({ embeds: [embed] });
}
