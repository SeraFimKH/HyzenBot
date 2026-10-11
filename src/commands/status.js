import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { currentServerStatus } from "../services/serverStatus.js";
import { isAdmin } from "../utils/permissions.js";
import { buildStatusEmbed } from "../utils/statusEmbed.js";
import { pinPanelRow } from "../interactions/statusConfig.js";

export const data = new SlashCommandBuilder().setName("status").setDescription("Mostra se o servidor está online, em manutenção ou offline e quantos jogadores tem.");

export async function execute(interaction) {
  // A primeira consulta depois do bot ligar pode esperar o ping do servidor (até uns segundos).
  await interaction.deferReply();

  const cfg = getGuildConfig(interaction.guildId);
  const status = await currentServerStatus(interaction.client);

  // Esta resposta é uma foto do momento. Enquanto o servidor não tiver um painel de status, um administrador
  // ganha o botão que transforma esta mesma mensagem no painel — que o bot passa a atualizar sozinho.
  const offerPin = !cfg.channels.status && isAdmin(interaction.member, cfg);
  await interaction.editReply({
    embeds: [buildStatusEmbed(cfg, status, interaction.guild?.iconURL({ size: 256 }))],
    components: offerPin ? [pinPanelRow()] : [],
  });
}
