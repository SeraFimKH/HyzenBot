import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { hasFeedback, markFeedbackGiven } from "../database/ticketFeedback.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { getText } from "../utils/textDefaults.js";

function renderStars(n) {
  return "⭐".repeat(n) + "☆".repeat(5 - n);
}

export async function handle(interaction) {
  const estrelas = Number(interaction.fields.getTextInputValue("estrelas"));
  const nota = Number(interaction.fields.getTextInputValue("nota"));
  const comentario = interaction.fields.getTextInputValue("comentario") || null;

  if (!Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) {
    return interaction.reply({
      embeds: [errorEmbed("A quantidade de estrelas precisa ser um número inteiro entre 1 e 5. Use `/feed` novamente.")],
      ephemeral: true,
    });
  }

  if (!Number.isInteger(nota) || nota < 0 || nota > 10) {
    return interaction.reply({
      embeds: [errorEmbed("A nota precisa ser um número inteiro entre 0 e 10. Use `/feed` novamente.")],
      ephemeral: true,
    });
  }

  // Quando aberto pelo botão de DM (após fechar um ticket), a interação não tem guildId —
  // o servidor de origem (e o canal do ticket) vêm embutidos no customId do modal.
  const [, embeddedGuildId, ticketChannelId] = interaction.customId.split(":");
  const guildId = interaction.guildId || embeddedGuildId;

  if (!guildId) {
    return interaction.reply({
      embeds: [errorEmbed("Não foi possível identificar o servidor de origem deste feedback. Tente novamente pelo `/feed` dentro do servidor.")],
      ephemeral: true,
    });
  }

  if (ticketChannelId && hasFeedback(ticketChannelId)) {
    return interaction.reply({
      embeds: [errorEmbed("Você já avaliou o atendimento deste ticket. Obrigado pelo feedback!")],
      ephemeral: true,
    });
  }

  const cfg = getGuildConfig(guildId);
  if (!cfg.channels.feedback) {
    return interaction.reply({
      embeds: [errorEmbed("O canal de feedback ainda não foi configurado. Peça a um administrador para rodar `/config canal tipo:Feedback`.")],
      ephemeral: true,
    });
  }

  const channel = await interaction.client.channels.fetch(cfg.channels.feedback).catch(() => null);
  if (!channel) {
    return interaction.reply({
      embeds: [errorEmbed("O canal de feedback configurado não foi encontrado.")],
      ephemeral: true,
    });
  }

  const embed = baseEmbed(cfg.communityName)
    .setTitle(getText(cfg, "feedback_titulo"))
    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
    .addFields(
      { name: "Estrelas", value: renderStars(estrelas), inline: true },
      { name: "Nota", value: `${nota}/10`, inline: true },
      { name: "Comentário", value: comentario || "*(sem comentário)*" },
    );

  await channel.send({ embeds: [embed] });

  if (ticketChannelId) {
    markFeedbackGiven(ticketChannelId, guildId);

    if (interaction.isFromMessage()) {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("feed_open_modal_done")
          .setLabel("✅ Avaliado — obrigado!")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
      );
      await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
    }
  }

  return interaction.reply({
    embeds: [successEmbed(getText(cfg, "feedback_sucesso_msg"))],
    ephemeral: true,
  });
}
