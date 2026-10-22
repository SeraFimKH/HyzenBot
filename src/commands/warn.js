import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { insertWarn, countActiveWarnings, PunishmentType } from "../database/punishments.js";
import { resolveStaffId } from "../utils/staffContext.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";
import { publishStaffAction } from "../database/redis.js";
import { postStaffLog, punishmentLogEmbed, dmPunishedPlayer } from "../utils/staffLog.js";
import { punishmentNoticeEmbed } from "../utils/punishmentNotice.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Aplica uma advertência a um jogador.")
  .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo da advertência").setRequired(true).setMaxLength(255))
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], flags: MessageFlags.Ephemeral });
  }

  const motivo = interaction.options.getString("motivo", true).trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { player, error } = await resolveTargetPlayer(interaction);
  if (!player) {
    return interaction.editReply({ embeds: [errorEmbed(error)] });
  }

  const staffId = await resolveStaffId(interaction.user.id);
  await insertWarn({ playerId: player.id, reason: motivo, staffId });
  const total = await countActiveWarnings(player.id);
  await publishStaffAction({ type: "WARN", playerId: player.id, reason: motivo, total, staffTag: interaction.user.tag });

  await postStaffLog(
    interaction.guild,
    "warnLog",
    punishmentLogEmbed({
      title: "⚠️ Advertência",
      color: 0xfee75c,
      player,
      staffTag: interaction.user.tag,
      reason: motivo,
      extraFields: [{ name: "Total ativo", value: `${total}`, inline: true }],
    }),
  );

  await dmPunishedPlayer(
    interaction.client,
    player.id,
    punishmentNoticeEmbed({ type: PunishmentType.WARN, staff: interaction.user.tag, reason: motivo, activeWarnings: total }),
  );

  return interaction.editReply({
    embeds: [successEmbed(`**${player.name}** foi advertido.\n**Motivo:** ${motivo}\n**Advertências ativas:** ${total}`)],
  });
}
