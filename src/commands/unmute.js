import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { findActiveMute, revokeActiveMute } from "../database/punishments.js";
import { resolveStaffId } from "../utils/staffContext.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";
import { publishStaffAction } from "../database/redis.js";
import { postStaffLog, punishmentLogEmbed } from "../utils/staffLog.js";

export const data = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove o mute ativo de um jogador.")
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

  const activeMute = await findActiveMute(player.id);
  if (!activeMute) {
    return interaction.editReply({ embeds: [errorEmbed(`**${player.name}** não está mutado atualmente.`)] });
  }

  const staffId = await resolveStaffId(interaction.user.id);
  await revokeActiveMute(player.id, staffId);
  await publishStaffAction({ type: "UNMUTE", playerId: player.id });

  await postStaffLog(
    interaction.guild,
    "muteLog",
    punishmentLogEmbed({
      title: "✅ Desmute",
      color: 0x57f287,
      player,
      staffTag: interaction.user.tag,
      reason: activeMute.reason,
    }),
  );

  return interaction.editReply({ embeds: [successEmbed(`Mute de **${player.name}** removido.`)] });
}
