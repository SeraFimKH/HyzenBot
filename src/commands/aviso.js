import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("aviso")
  .setDescription("Publica um aviso/changelog para a comunidade (apenas administradores).");

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  if (!cfg.channels.changelog) {
    return interaction.reply({
      embeds: [errorEmbed("O canal de changelog ainda não foi configurado. Rode `/config canal tipo:Changelog / Avisos` primeiro.")],
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder().setCustomId("aviso_modal").setTitle("Publicar Aviso / Changelog");

  const tituloInput = new TextInputBuilder()
    .setCustomId("titulo")
    .setLabel("Título")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(200)
    .setRequired(true);

  const mensagemInput = new TextInputBuilder()
    .setCustomId("mensagem")
    .setLabel("Mensagem")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(tituloInput),
    new ActionRowBuilder().addComponents(mensagemInput),
  );

  await interaction.showModal(modal);
}
