import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { findActiveMute, insertPunishment, PunishmentType } from "../database/punishments.js";
import { resolveStaffId } from "../utils/staffContext.js";
import { parseDurationToMinutes } from "../utils/duration.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";
import { publishStaffAction } from "../database/redis.js";
import { discordTimestamp } from "../utils/format.js";
import { postStaffLog, punishmentLogEmbed, dmPunishedPlayer } from "../utils/staffLog.js";
import { baseEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Silencia um jogador no chat do jogo (permanente, ou temporário com duração).")
  .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo do mute").setRequired(true).setMaxLength(255))
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false))
  .addStringOption((opt) =>
    opt.setName("duracao").setDescription("Duração (ex: 1d, 12h, 30m). Omita para mute permanente.").setRequired(false),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  const motivo = interaction.options.getString("motivo", true).trim();
  const duracaoRaw = interaction.options.getString("duracao");

  let minutes = null;
  if (duracaoRaw) {
    minutes = parseDurationToMinutes(duracaoRaw);
    if (minutes === null) {
      return interaction.reply({
        embeds: [errorEmbed("Duração inválida. Use o formato `1d`, `12h`, `30m`, `1d12h`, etc.")],
        ephemeral: true,
      });
    }
  }

  await interaction.deferReply({ ephemeral: true });

  const { player, error } = await resolveTargetPlayer(interaction);
  if (!player) {
    return interaction.editReply({ embeds: [errorEmbed(error)] });
  }

  const activeMute = await findActiveMute(player.id);
  if (activeMute) {
    return interaction.editReply({ embeds: [errorEmbed(`**${player.name}** já está mutado (motivo: ${activeMute.reason}).`)] });
  }

  const staffId = await resolveStaffId(interaction.user.id);
  const punishment = await insertPunishment({
    playerId: player.id,
    type: minutes ? PunishmentType.TEMPMUTE : PunishmentType.MUTE,
    reason: motivo,
    staffId,
    expiresInMinutes: minutes,
  });
  await publishStaffAction({
    type: minutes ? PunishmentType.TEMPMUTE : PunishmentType.MUTE,
    playerId: player.id,
    reason: motivo,
    expiresAt: punishment.expires_at,
    staffTag: interaction.user.tag,
  });

  const duracaoTexto = punishment.expires_at ? `até ${discordTimestamp(punishment.expires_at, "F")}` : "**permanentemente**";

  await postStaffLog(
    interaction.guild,
    "muteLog",
    punishmentLogEmbed({
      title: "🔇 Mute",
      color: 0xfaa61a,
      player,
      staffTag: interaction.user.tag,
      reason: motivo,
      extraFields: punishment.expires_at ? [{ name: "Expira em", value: discordTimestamp(punishment.expires_at, "F"), inline: true }] : [],
    }),
  );

  await dmPunishedPlayer(
    interaction.client,
    player.id,
    baseEmbed()
      .setColor(0xfaa61a)
      .setTitle("🔇 Você foi mutado")
      .setDescription(`Você foi mutado ${duracaoTexto}.`)
      .addFields({ name: "Staff", value: interaction.user.tag, inline: true }, { name: "Motivo", value: motivo }),
  );

  return interaction.editReply({
    embeds: [successEmbed(`**${player.name}** foi mutado ${duracaoTexto}.\n**Motivo:** ${motivo}`)],
  });
}
