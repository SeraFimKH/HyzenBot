import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { baseEmbed } from "./embeds.js";
import { getText } from "./textDefaults.js";

export const PANEL_BUTTON_ID = "sugestao_abrir";
export const SUGGESTION_MODAL_ID = "sugestao_modal";
// sugestao_status:<número>:<situação> — os botões da equipe no cartão de cada sugestão.
export const STATUS_BUTTON_PREFIX = "sugestao_status:";
// sugestao_motivo:<número>:<situação> — o motivo que a equipe pode dar ao aprovar, recusar ou implementar.
export const REASON_MODAL_PREFIX = "sugestao_motivo:";

export const TITLE_MIN_LENGTH = 5;
export const TITLE_MAX_LENGTH = 100;
export const DETAILS_MAX_LENGTH = 1000;
export const REASON_MAX_LENGTH = 500;
// O máximo que o Discord deixa uma enquete aberta: 32 dias.
export const MAX_POLL_DAYS = 32;
const THREAD_NAME_MAX_LENGTH = 100;

// As respostas da enquete — a ordem importa: o Discord numera as respostas a partir de 1, nesta ordem.
export const POLL_ANSWERS = [
  { text: "Concordo", emoji: "✅" },
  { text: "Discordo", emoji: "❌" },
];

// final: a equipe deu a palavra final — a votação é encerrada e o resultado fica congelado.
export const SuggestionStatus = {
  OPEN: { emoji: "🗳️", label: "Em votação", color: 0x5865f2, final: false },
  REVIEW: { emoji: "🔍", label: "Em análise", color: 0xfaa61a, final: false },
  APPROVED: { emoji: "✅", label: "Aprovada", color: 0x57f287, final: true },
  REJECTED: { emoji: "❌", label: "Recusada", color: 0xed4245, final: true },
  DONE: { emoji: "🚀", label: "Implementada", color: 0xeb459e, final: true },
};

// O botão que leva a cada situação, e para quais situações dá para ir a partir de cada uma.
const STATUS_ACTIONS = {
  REVIEW: { label: "Analisar", emoji: "🔍", style: ButtonStyle.Secondary },
  APPROVED: { label: "Aprovar", emoji: "✅", style: ButtonStyle.Success },
  REJECTED: { label: "Recusar", emoji: "✖️", style: ButtonStyle.Danger },
  DONE: { label: "Implementada", emoji: "🚀", style: ButtonStyle.Primary },
};
export const NEXT_STATUSES = {
  OPEN: ["REVIEW", "APPROVED", "REJECTED"],
  REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["DONE"],
  REJECTED: [],
  DONE: [],
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const quote = (text) => `> ${text.replace(/\n/g, "\n> ")}`;

// O painel que fica sempre por último no canal de sugestões, com o botão de enviar.
export function buildSuggestionPanel(cfg) {
  const embed = baseEmbed(cfg.communityName).setTitle(getText(cfg, "sugestao_panel_titulo")).setDescription(getText(cfg, "sugestao_panel_desc"));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(PANEL_BUTTON_ID).setLabel(getText(cfg, "sugestao_botao")).setEmoji("💡").setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

export function buildSuggestionModal() {
  const title = new TextInputBuilder()
    .setCustomId("titulo")
    .setLabel("Sua sugestão, em uma frase")
    .setPlaceholder("Ex: Adicionar o modo SkyWars em duplas")
    .setStyle(TextInputStyle.Short)
    .setMinLength(TITLE_MIN_LENGTH)
    .setMaxLength(TITLE_MAX_LENGTH)
    .setRequired(true);

  const details = new TextInputBuilder()
    .setCustomId("detalhes")
    .setLabel("Detalhes (opcional)")
    .setPlaceholder("Como funcionaria e por que deixaria o servidor melhor?")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(DETAILS_MAX_LENGTH)
    .setRequired(false);

  return new ModalBuilder()
    .setCustomId(SUGGESTION_MODAL_ID)
    .setTitle("💡 Nova sugestão")
    .addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(details));
}

// A enquete nativa do Discord, logo abaixo do cartão: o próprio Discord mostra as barras e a porcentagem.
export function buildSuggestionPoll(cfg, suggestion) {
  const days = Math.min(MAX_POLL_DAYS, Math.max(1, cfg.suggestionPollDays || 7));
  return {
    question: { text: `Você concorda com a sugestão #${suggestion.number}?` },
    answers: POLL_ANSWERS,
    duration: days * 24,
    allowMultiselect: false,
  };
}

/**
 * O cartão da sugestão: quem sugeriu, a ideia e a situação dela. Uma enquete do Discord não pode ser editada depois
 * de enviada, por isso a situação mora aqui, numa mensagem separada logo acima da enquete — este cartão o bot edita
 * a cada resposta da equipe.
 */
export function buildSuggestionCard(cfg, suggestion) {
  const view = SuggestionStatus[suggestion.status] || SuggestionStatus.OPEN;
  const decision = suggestion.decision;

  const embed = baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setAuthor({ name: suggestion.authorName || "Membro", iconURL: suggestion.authorAvatarUrl || undefined })
    .setTitle(`💡 Sugestão #${suggestion.number}`)
    .setDescription(`### ${suggestion.title}${suggestion.details ? `\n${suggestion.details}` : ""}`)
    .addFields({ name: "📌 Situação", value: `${view.emoji} **${view.label}**`, inline: true });

  if (decision) {
    embed.addFields({ name: "👤 Pela equipe", value: `<@${decision.staffId}> <t:${Math.floor(decision.at / 1000)}:R>`, inline: true });
    if (decision.votes) embed.addFields({ name: "🗳️ Resultado", value: decision.votes, inline: true });
    if (decision.reason) embed.addFields({ name: "💬 Resposta da equipe", value: truncate(quote(decision.reason), 1024) });
  }

  const footer = view.final ? "votação encerrada" : NEXT_STATUSES[suggestion.status]?.length ? "vote na enquete abaixo · os botões são da equipe" : "vote na enquete abaixo";
  return embed.setFooter({ text: `${cfg.communityName} · ${footer}` });
}

// Os botões da equipe no cartão: só as situações para onde a sugestão ainda pode ir.
export function buildSuggestionCardComponents(suggestion) {
  const next = NEXT_STATUSES[suggestion.status] || [];
  if (!next.length) return [];
  return [
    new ActionRowBuilder().addComponents(
      next.map((status) =>
        new ButtonBuilder()
          .setCustomId(`${STATUS_BUTTON_PREFIX}${suggestion.number}:${status}`)
          .setLabel(STATUS_ACTIONS[status].label)
          .setEmoji(STATUS_ACTIONS[status].emoji)
          .setStyle(STATUS_ACTIONS[status].style),
      ),
    ),
  ];
}

// Ao aprovar, recusar ou implementar: o motivo (opcional) que vai para o cartão, o tópico e o privado de quem sugeriu.
export function buildReasonModal(number, status) {
  const view = SuggestionStatus[status];
  const reason = new TextInputBuilder()
    .setCustomId("motivo")
    .setLabel("Resposta para a comunidade (opcional)")
    .setPlaceholder(status === "REJECTED" ? "Ex: Já existe algo parecido no servidor." : "Ex: Vai entrar na próxima atualização!")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(REASON_MAX_LENGTH)
    .setRequired(false);
  return new ModalBuilder()
    .setCustomId(`${REASON_MODAL_PREFIX}${number}:${status}`)
    .setTitle(`${view.emoji} Sugestão #${number}: ${view.label}`)
    .addComponents(new ActionRowBuilder().addComponents(reason));
}

export function threadName(suggestion, status = "OPEN") {
  return truncate(`${SuggestionStatus[status].emoji} #${suggestion.number} · ${suggestion.title}`, THREAD_NAME_MAX_LENGTH);
}

// "✅ 12 (75%) · ❌ 4 (25%)", das contagens que o Discord manda na mensagem da enquete; null sem enquete.
export function summarizeVotes(poll) {
  if (!poll?.answers) return null;
  const counts = POLL_ANSWERS.map((_, index) => poll.answers.get(index + 1)?.voteCount ?? 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return "Nenhum voto";
  return POLL_ANSWERS.map((answer, index) => `${answer.emoji} ${counts[index]} (${Math.round((counts[index] * 100) / total)}%)`).join(" · ");
}

// A resposta da equipe, postada no tópico da sugestão.
export function buildDecisionEmbed(cfg, suggestion, status, staffId, reason, votes) {
  const view = SuggestionStatus[status];
  const embed = baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`${view.emoji} Sugestão #${suggestion.number} — ${view.label}`)
    .addFields({ name: "💡 Sugestão", value: truncate(suggestion.title, 1024) }, { name: "👤 Respondida por", value: `<@${staffId}>`, inline: true });
  if (votes) embed.addFields({ name: "🗳️ Votação", value: votes, inline: true });
  if (reason) embed.setDescription(quote(reason));
  if (view.final) embed.setFooter({ text: `${cfg.communityName} · votação encerrada` });
  return embed;
}

// O registro no canal de logs de sugestões (que pode ficar no servidor administrativo): cada sugestão nova e cada
// resposta da equipe, com quem fez e o link para a sugestão.
export function buildSuggestionLogEmbed(cfg, suggestion, { status = "OPEN", staffId = null, reason = null, votes = null, url = null } = {}) {
  const view = SuggestionStatus[status];
  const embed = baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(staffId ? `${view.emoji} Sugestão #${suggestion.number} — ${view.label}` : `💡 Nova sugestão #${suggestion.number}`)
    .addFields({ name: "💡 Sugestão", value: truncate(suggestion.title, 1024) });
  if (!staffId && suggestion.details) embed.addFields({ name: "📝 Detalhes", value: truncate(suggestion.details, 1024) });
  embed.addFields({ name: "👤 Quem sugeriu", value: `<@${suggestion.authorId}> · ${truncate(suggestion.authorName ?? "?", 80)}`, inline: true });
  if (staffId) embed.addFields({ name: "🛡️ Respondida por", value: `<@${staffId}>`, inline: true });
  if (votes) embed.addFields({ name: "🗳️ Votação", value: votes, inline: true });
  if (reason) embed.addFields({ name: "💬 Motivo", value: truncate(reason, 1024) });
  if (url) embed.setDescription(`[Ver a sugestão](${url})`);
  return embed;
}

// O aviso no privado de quem sugeriu.
export function buildDecisionDm(cfg, suggestion, status, reason, url) {
  const view = SuggestionStatus[status];
  return baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`${view.emoji} Sua sugestão #${suggestion.number} está: ${view.label}`)
    .setDescription(`**${suggestion.title}**${reason ? `\n\n${quote(reason)}` : ""}${url ? `\n\n[Ver a sugestão](${url})` : ""}`);
}
