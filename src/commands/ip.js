import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getOnlinePlayerCount } from "../database/redis.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder().setName("ip").setDescription("Mostra o IP do servidor e quantos jogadores estão online.");

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!cfg.serverIp) {
    return interaction.reply({
      embeds: [errorEmbed("O IP do servidor ainda não foi configurado. Um administrador pode definir em `/painel` → Administração → IP do Servidor.")],
      ephemeral: true,
    });
  }

  const count = await getOnlinePlayerCount();
  const playersField = count === null ? "Não foi possível consultar agora" : `${count} jogador(es) online`;

  const embed = baseEmbed(cfg.communityName)
    .setTitle(`🌐 ${cfg.communityName}`)
    .addFields({ name: "IP", value: `\`${cfg.serverIp}\``, inline: true }, { name: "Jogadores", value: playersField, inline: true });

  await interaction.reply({ embeds: [embed] });
}
