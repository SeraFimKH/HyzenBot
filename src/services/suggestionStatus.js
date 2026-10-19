import { getGuildConfig } from "../database/guildConfig.js";
import { getSuggestion, updateSuggestion } from "../database/suggestions.js";
import { postLog } from "../utils/staffLog.js";
import {
  buildDecisionDm,
  buildDecisionEmbed,
  buildSuggestionCard,
  buildSuggestionCardComponents,
  buildSuggestionLogEmbed,
  SuggestionStatus,
  summarizeVotes,
  threadName,
} from "../utils/suggestionViews.js";

const POLL_EXPIRED = 520001;

/**
 * The staff's answer to a suggestion — from the buttons on its card or from /sugestao responder. Everything that
 * shows where a suggestion stands is updated: the card (status, who answered, the reason, the final result), the
 * thread (the answer posted there, its name), and the author gets a DM. A final status (approved, rejected,
 * implemented) also ends the poll, freezing the result.
 * Resolves to { ok: true, suggestion, view, dmSent, url } or { ok: false, reason }.
 */
export async function setSuggestionStatus(client, guildId, number, status, staffId, reason) {
  const cfg = getGuildConfig(guildId);
  const current = getSuggestion(guildId, number);
  if (!current?.messageId) return { ok: false, reason: `Não existe a sugestão **#${number}**.` };

  const view = SuggestionStatus[status];
  const channel = await client.channels.fetch(current.channelId).catch(() => null);
  const pollMessage = channel ? await channel.messages.fetch(current.messageId).catch(() => null) : null;

  // The votes so far; on a final answer the poll is ended and this is its result.
  const votes = summarizeVotes(pollMessage?.poll);
  const alreadyClosed = isClosed(pollMessage?.poll);
  if (view.final) await endPoll(pollMessage, number);

  const suggestion = updateSuggestion(guildId, number, (s) => {
    s.status = status;
    // The result is shown once the voting is over (a final answer now, or a poll that had already ended).
    s.decision = { status, reason, staffId, at: Date.now(), votes: view.final || alreadyClosed ? votes : null };
  });

  const card = suggestion.cardMessageId && channel ? await channel.messages.fetch(suggestion.cardMessageId).catch(() => null) : null;
  await card
    ?.edit({ embeds: [buildSuggestionCard(cfg, suggestion)], components: buildSuggestionCardComponents(suggestion) })
    .catch((err) => console.error(`[suggestionStatus] failed to update the card of #${number}`, err.message));

  const decision = buildDecisionEmbed(cfg, suggestion, status, staffId, reason, votes);
  const thread = suggestion.threadId ? await client.channels.fetch(suggestion.threadId).catch(() => null) : null;
  if (thread) {
    await thread.send({ embeds: [decision] }).catch((err) => console.error(`[suggestionStatus] failed to answer in the thread of #${number}`, err.message));
    // Not awaited: Discord only lets a channel be renamed twice every 10 minutes, and the answer can't hang on it.
    thread.setName(threadName(suggestion, status)).catch((err) => console.error(`[suggestionStatus] failed to rename the thread of #${number}`, err.message));
  } else if (!card && pollMessage) {
    // A suggestion without card or thread (posted before the cards existed): the answer goes as a reply.
    await pollMessage.reply({ embeds: [decision], allowedMentions: { parse: [] } }).catch(() => {});
  }

  // The author hears it in a DM — closed DMs are fine, the answer is on the card anyway.
  const url = card?.url ?? pollMessage?.url;
  const author = await client.users.fetch(suggestion.authorId).catch(() => null);
  const dmSent = author
    ? await author
        .send({ embeds: [buildDecisionDm(cfg, suggestion, status, reason, url)] })
        .then(() => true)
        .catch(() => false)
    : false;

  await postLog(client, guildId, "sugestoesLog", { embeds: [buildSuggestionLogEmbed(cfg, suggestion, { status, staffId, reason, votes, url })] });

  return { ok: true, suggestion, view, dmSent, url };
}

function isClosed(poll) {
  return Boolean(poll?.expiresTimestamp && poll.expiresTimestamp <= Date.now());
}

async function endPoll(message, number) {
  const poll = message?.poll;
  if (!poll || isClosed(poll)) return;
  await poll.end().catch((err) => {
    if (err.code !== POLL_EXPIRED) console.error(`[suggestionStatus] failed to end the poll of #${number}`, err.message);
  });
}
