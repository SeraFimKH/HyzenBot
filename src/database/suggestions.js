import { JsonStore } from "./jsonStore.js";

// One entry per guild: { counter, items: { [number]: suggestion }, lastByUser: { [userId]: timestamp } }. Local JSON
// like the other community features (polls, raffles): the suggestions themselves live in Discord, this is the index
// the bot needs to find one again (/sugestao responder numero:12) and to space out each member's suggestions.
const store = new JsonStore("suggestions.json", {});

function guildData(guildId) {
  const data = store.get(guildId) || {};
  return { counter: data.counter || 0, items: data.items || {}, lastByUser: data.lastByUser || {} };
}

export function getSuggestion(guildId, number) {
  return guildData(guildId).items[number] || null;
}

export function lastSuggestionAt(guildId, userId) {
  return guildData(guildId).lastByUser[userId] || 0;
}

// Takes the next number and records the suggestion; the message it ends up in is added with updateSuggestion once
// it's posted (or the whole thing undone with discardSuggestion if posting failed).
export function createSuggestion(guildId, { authorId, authorName, authorAvatarUrl, title, details }) {
  const data = guildData(guildId);
  const now = Date.now();
  const number = data.counter + 1;
  data.counter = number;
  data.items[number] = {
    number,
    authorId,
    authorName,
    authorAvatarUrl,
    title,
    details,
    status: "OPEN",
    createdAt: now,
    channelId: null,
    // The card (embed with the status and the staff's buttons) and, right below it, the poll message.
    cardMessageId: null,
    messageId: null,
    threadId: null,
    previousSuggestionAt: data.lastByUser[authorId] || 0,
    decision: null,
  };
  data.lastByUser[authorId] = now;
  store.set(guildId, data);
  return data.items[number];
}

export function updateSuggestion(guildId, number, mutator) {
  const data = guildData(guildId);
  const item = data.items[number];
  if (!item) return null;
  mutator(item);
  store.set(guildId, data);
  return item;
}

// Undoes a createSuggestion whose message never got posted: the member isn't left waiting out the interval for a
// suggestion nobody saw, and the number is reused if nothing was created after it.
export function discardSuggestion(guildId, number) {
  const data = guildData(guildId);
  const item = data.items[number];
  if (!item) return;
  delete data.items[number];
  if (item.previousSuggestionAt) {
    data.lastByUser[item.authorId] = item.previousSuggestionAt;
  } else {
    delete data.lastByUser[item.authorId];
  }
  if (data.counter === number) data.counter = number - 1;
  store.set(guildId, data);
}
