import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";

export const data = new SlashCommandBuilder()
  .setName("painel")
  .setDescription("Abre o painel de configuração interativo do bot (apenas administradores).");

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.reply({ ...buildMainPanel(cfg), ephemeral: true });
}
