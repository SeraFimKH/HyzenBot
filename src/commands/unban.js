import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { findActiveBan, revokeActiveBan } from "../database/punishments.js";
import { resolveStaffId } from "../utils/staffContext.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";
import { postStaffLog, punishmentLogEmbed } from "../utils/staffLog.js";

export const data = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Remove o banimento ativo de um jogador.")
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

  const activeBan = await findActiveBan(player.id);
  if (!activeBan) {
    return interaction.editReply({ embeds: [errorEmbed(`**${player.name}** não está banido atualmente.`)] });
  }

  const staffId = await resolveStaffId(interaction.user.id);
  await revokeActiveBan(player.id, staffId);

  await postStaffLog(
    interaction.guild,
    "banLog",
    punishmentLogEmbed({
      title: "✅ Desbanimento",
      color: 0x57f287,
      player,
      staffTag: interaction.user.tag,
      reason: activeBan.reason,
    }),
  );

  return interaction.editReply({ embeds: [successEmbed(`Banimento de **${player.name}** removido.`)] });
}
