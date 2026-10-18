import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { baseEmbed } from "./embeds.js";
import { getText } from "./textDefaults.js";

export const PANEL_BUTTON_ID = "sugestao_abrir";
export const SUGGESTION_MODAL_ID = "sugestao_modal";

export const TITLE_MIN_LENGTH = 5;
// A frase da sugestão vira a pergunta da enquete do Discord (que aceita até 300 caracteres).
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

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

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

// A enquete nativa do Discord de cada sugestão: a frase é a pergunta, e o próprio Discord mostra as barras e a
// porcentagem de cada resposta.
export function buildSuggestionPoll(cfg, suggestion) {
  const days = Math.min(MAX_POLL_DAYS, Math.max(1, cfg.suggestionPollDays || 7));
  return { question: { text: suggestion.title }, answers: POLL_ANSWERS, duration: days * 24, allowMultiselect: false };
}

// O que vai junto da enquete: quem sugeriu, o número e os detalhes (a frase já está na pergunta da enquete).
export function buildSuggestionEmbed(cfg, suggestion, author) {
  const embed = baseEmbed(cfg.communityName)
    .setColor(SuggestionStatus.OPEN.color)
    .setAuthor({ name: author.name, iconURL: author.avatarUrl })
    .setTitle(`💡 Sugestão #${suggestion.number}`)
    .setFooter({ text: `${cfg.communityName} · vote na enquete e discuta no tópico` });
  if (suggestion.details) embed.setDescription(suggestion.details);
  return embed;
}

// O mesmo conteúdo em texto, para o caso de o Discord não aceitar o embed junto da enquete.
export function buildSuggestionText(suggestion, authorId) {
  const details = suggestion.details ? `\n${suggestion.details}` : "";
  return `### 💡 Sugestão #${suggestion.number}${details}\n-# Sugerida por <@${authorId}> · vote na enquete e discuta no tópico`;
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
  if (reason) embed.setDescription(`> ${reason.replace(/\n/g, "\n> ")}`);
  if (view.final) embed.setFooter({ text: `${cfg.communityName} · votação encerrada` });
  return embed;
}

// O aviso no privado de quem sugeriu.
export function buildDecisionDm(cfg, suggestion, status, reason, url) {
  const view = SuggestionStatus[status];
  return baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`${view.emoji} Sua sugestão #${suggestion.number} está: ${view.label}`)
    .setDescription(`**${suggestion.title}**${reason ? `\n\n> ${reason.replace(/\n/g, "\n> ")}` : ""}${url ? `\n\n[Ver a sugestão](${url})` : ""}`);
}
