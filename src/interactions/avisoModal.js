import { getGuildConfig } from "../database/guildConfig.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { getText } from "../utils/textDefaults.js";
import { getPingMention } from "../utils/announcePing.js";

export async function handle(interaction) {
  const titulo = interaction.fields.getTextInputValue("titulo");
  const mensagem = interaction.fields.getTextInputValue("mensagem");

  const cfg = getGuildConfig(interaction.guildId);
  if (!cfg.channels.changelog) {
    return interaction.reply({
      embeds: [errorEmbed("O canal de changelog ainda não foi configurado.")],
      ephemeral: true,
    });
  }

  const channel = await interaction.guild.channels.fetch(cfg.channels.changelog).catch(() => null);
  if (!channel) {
    return interaction.reply({
      embeds: [errorEmbed("O canal de changelog configurado não foi encontrado.")],
      ephemeral: true,
    });
  }

  const embed = baseEmbed(cfg.communityName)
    .setAuthor({ name: getText(cfg, "aviso_autor"), iconURL: interaction.guild.iconURL() || undefined })
    .setTitle(titulo)
    .setDescription(mensagem)
    .setFooter({ text: `Publicado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await channel.send({ content: getPingMention(cfg) || undefined, embeds: [embed] });

  return interaction.reply({ embeds: [successEmbed(`Aviso publicado em ${channel}.`)], ephemeral: true });
}
