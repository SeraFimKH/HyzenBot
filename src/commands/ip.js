import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { currentServerStatus } from "../services/serverStatus.js";
import { errorEmbed } from "../utils/embeds.js";
import { buildServerInfoEmbed } from "../utils/statusEmbed.js";

export const data = new SlashCommandBuilder().setName("ip").setDescription("Mostra o IP do servidor e quantos jogadores estão online.");

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!cfg.serverIp) {
    return interaction.reply({
      embeds: [errorEmbed("O endereço do servidor ainda não foi configurado. Um administrador pode definir em `/painel` → Administração → Endereço do Servidor.")],
      ephemeral: true,
    });
  }

  await interaction.deferReply();
  const status = await currentServerStatus(interaction.client);
  await interaction.editReply({ embeds: [buildServerInfoEmbed(cfg, status)] });
}
