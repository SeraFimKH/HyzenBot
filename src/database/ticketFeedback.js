import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("ticketFeedback.json", {});

export function hasFeedback(ticketChannelId) {
  return Boolean(store.get(ticketChannelId));
}

export function markFeedbackGiven(ticketChannelId, guildId) {
  store.set(ticketChannelId, { guildId, submittedAt: Date.now() });
}
