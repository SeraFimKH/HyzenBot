import { ChannelType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { startSay } from "../interactions/sayPanel.js";
import { errorEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";

// /say: the bot publishes a message written by an admin. The form, the preview and the publishing are in interactions/sayPanel.js.
export const data = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Publica uma mensagem do bot, com título, cor e imagem (apenas administradores).")
  .addChannelOption((opt) =>
    opt
      .setName("canal")
      .setDescription("Onde publicar. Sem escolher, é neste canal (dá para trocar na prévia).")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addAttachmentOption((opt) => opt.setName("imagem").setDescription("Imagem grande embaixo da mensagem."));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], flags: MessageFlags.Ephemeral });
  }

  const image = interaction.options.getAttachment("imagem");
  if (image && !image.contentType?.startsWith("image/")) {
    return interaction.reply({ embeds: [errorEmbed("O arquivo de `imagem` precisa ser uma imagem (PNG, JPG, GIF ou WEBP).")], flags: MessageFlags.Ephemeral });
  }

  return startSay(interaction, { channel: interaction.options.getChannel("canal") ?? interaction.channel, image });
}
