import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { insertKick } from "../database/punishments.js";
import { resolveStaffId } from "../utils/staffContext.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";
import { publishStaffAction } from "../database/redis.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Expulsa um jogador do servidor (se estiver online agora) e registra no histórico.")
  .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo da expulsão").setRequired(true).setMaxLength(255))
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  const motivo = interaction.options.getString("motivo", true).trim();

  await interaction.deferReply({ ephemeral: true });

  const { player, error } = await resolveTargetPlayer(interaction);
  if (!player) {
    return interaction.editReply({ embeds: [errorEmbed(error)] });
  }

  const staffId = await resolveStaffId(interaction.user.id);
  await insertKick({ playerId: player.id, reason: motivo, staffId });
  await publishStaffAction({ type: "KICK", playerId: player.id, reason: motivo, staffTag: interaction.user.tag });

  return interaction.editReply({
    embeds: [successEmbed(`**${player.name}** foi expulso (se estava online) e a expulsão foi registrada no histórico.\n**Motivo:** ${motivo}`)],
  });
}
