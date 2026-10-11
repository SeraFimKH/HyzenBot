import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { currentServerStatus } from "../services/serverStatus.js";
import { buildStatusEmbed } from "../utils/statusEmbed.js";

export const data = new SlashCommandBuilder().setName("status").setDescription("Mostra se o servidor está online, em manutenção ou offline e quantos jogadores tem.");

export async function execute(interaction) {
  // A primeira consulta depois do bot ligar pode esperar o ping do servidor (até uns segundos).
  await interaction.deferReply();

  const cfg = getGuildConfig(interaction.guildId);
  const status = await currentServerStatus(interaction.client);
  await interaction.editReply({ embeds: [buildStatusEmbed(cfg, status)] });
}
