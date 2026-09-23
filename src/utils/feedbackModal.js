import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";

export function buildFeedbackModal(guildId, ticketChannelId) {
  // Quando o botão vem de uma DM (ex: após fechar um ticket), a interação não tem guildId —
  // por isso o servidor de origem (e o canal do ticket, pra limitar a 1 avaliação por ticket)
  // precisam viajar embutidos no customId do modal.
  const communityName = guildId ? getGuildConfig(guildId).communityName : "Hyzen Network";
  const customId = guildId ? `feed_modal:${guildId}:${ticketChannelId || ""}` : "feed_modal";
  const modal = new ModalBuilder().setCustomId(customId).setTitle(`Feedback ${communityName}`);

  const estrelasInput = new TextInputBuilder()
    .setCustomId("estrelas")
    .setLabel("Estrelas (1 a 5)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 5")
    .setMinLength(1)
    .setMaxLength(1)
    .setRequired(true);

  const notaInput = new TextInputBuilder()
    .setCustomId("nota")
    .setLabel("Nota geral (0 a 10)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 10")
    .setMaxLength(2)
    .setRequired(true);

  const comentarioInput = new TextInputBuilder()
    .setCustomId("comentario")
    .setLabel("Comentário (opcional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Conte como foi sua experiência com a ${communityName}...`)
    .setMaxLength(1000)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(estrelasInput),
    new ActionRowBuilder().addComponents(notaInput),
    new ActionRowBuilder().addComponents(comentarioInput),
  );

  return modal;
}
