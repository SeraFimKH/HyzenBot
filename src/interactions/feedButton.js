import { MessageFlags } from "discord.js";
import { buildFeedbackModal } from "../utils/feedbackModal.js";
import { hasFeedback } from "../database/ticketFeedback.js";
import { errorEmbed } from "../utils/embeds.js";

export async function handleOpenFeedback(interaction) {
  const [, guildId, ticketChannelId] = interaction.customId.split(":");

  if (ticketChannelId && hasFeedback(ticketChannelId)) {
    return interaction.reply({
      embeds: [errorEmbed("Você já avaliou o atendimento deste ticket. Obrigado pelo feedback!")],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.showModal(buildFeedbackModal(guildId, ticketChannelId));
}
