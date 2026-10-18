import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getSuggestion, updateSuggestion } from "../database/suggestions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isStaff } from "../utils/permissions.js";
import { buildDecisionDm, buildDecisionEmbed, REASON_MAX_LENGTH, SuggestionStatus, summarizeVotes, threadName } from "../utils/suggestionViews.js";

const POLL_EXPIRED = 520001;

export const data = new SlashCommandBuilder()
  .setName("sugestao")
  .setDescription("Sugestões da comunidade (equipe).")
  .addSubcommand((sub) =>
    sub
      .setName("responder")
      .setDescription("Dá a resposta da equipe a uma sugestão: em análise, aprovada, recusada ou implementada.")
      .addIntegerOption((opt) => opt.setName("numero").setDescription("O número da sugestão (#12 → 12)").setRequired(true).setMinValue(1))
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("Aprovada, recusada e implementada encerram a votação")
          .setRequired(true)
          .addChoices(
            { name: "🔍 Em análise", value: "REVIEW" },
            { name: "✅ Aprovada", value: "APPROVED" },
            { name: "❌ Recusada", value: "REJECTED" },
            { name: "🚀 Implementada", value: "DONE" },
          ),
      )
      .addStringOption((opt) => opt.setName("motivo").setDescription("O porquê, para a comunidade e para quem sugeriu").setRequired(false).setMaxLength(REASON_MAX_LENGTH)),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const number = interaction.options.getInteger("numero", true);
  const status = interaction.options.getString("status", true);
  const reason = interaction.options.getString("motivo")?.trim() || null;
  const suggestion = getSuggestion(interaction.guildId, number);
  if (!suggestion?.messageId) {
    return interaction.editReply({ embeds: [errorEmbed(`Não existe a sugestão **#${number}**.`)] });
  }

  const view = SuggestionStatus[status];
  const channel = await interaction.client.channels.fetch(suggestion.channelId).catch(() => null);
  const message = channel ? await channel.messages.fetch(suggestion.messageId).catch(() => null) : null;

  // A votação até agora; numa decisão final ela é encerrada, e o Discord congela o resultado.
  const votes = summarizeVotes(message?.poll);
  if (view.final && message?.poll && !(message.poll.expiresTimestamp && message.poll.expiresTimestamp <= Date.now())) {
    await message.poll.end().catch((err) => {
      if (err.code !== POLL_EXPIRED) console.error(`[sugestao] failed to end the poll of #${number}`, err.message);
    });
  }

  const decision = buildDecisionEmbed(cfg, suggestion, status, interaction.user.id, reason, votes);
  const thread = suggestion.threadId ? await interaction.client.channels.fetch(suggestion.threadId).catch(() => null) : null;
  if (thread) {
    await thread.send({ embeds: [decision] });
    // O nome do tópico aparece embaixo da sugestão no canal: é onde todos veem a situação dela. Sem esperar: o
    // Discord só deixa renomear um canal 2 vezes a cada 10 minutos, e a resposta não precisa ficar presa nisso.
    thread.setName(threadName(suggestion, status)).catch((err) => console.error(`[sugestao] failed to rename the thread of #${number}`, err.message));
  } else if (message) {
    await message.reply({ embeds: [decision], allowedMentions: { parse: [] } });
  }

  updateSuggestion(interaction.guildId, number, (s) => {
    s.status = status;
    s.decision = { status, reason, staffId: interaction.user.id, at: Date.now() };
  });

  // Quem sugeriu fica sabendo no privado — se a DM estiver fechada, tudo bem, a resposta já está no tópico.
  const author = await interaction.client.users.fetch(suggestion.authorId).catch(() => null);
  const dmSent = author ? await author.send({ embeds: [buildDecisionDm(cfg, suggestion, status, reason, message?.url)] }).then(() => true).catch(() => false) : false;

  return interaction.editReply({
    embeds: [
      successEmbed(
        `Sugestão **#${number}** marcada como ${view.emoji} **${view.label}**.` +
          (view.final ? " A votação foi encerrada." : "") +
          (dmSent ? " Quem sugeriu foi avisado no privado." : " Não deu para avisar quem sugeriu no privado."),
      ),
    ],
  });
}
