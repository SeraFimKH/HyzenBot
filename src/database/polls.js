import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("polls.json", {});

export function getPoll(messageId) {
  return store.get(messageId) || null;
}

export function setPoll(messageId, poll) {
  store.set(messageId, poll);
  return poll;
}

export function updatePoll(messageId, mutator) {
  const poll = getPoll(messageId);
  if (!poll) return null;
  mutator(poll);
  store.set(messageId, poll);
  return poll;
}

export function findLatestOpenPoll(guildId) {
  const all = store.all();
  let latest = null;
  for (const [messageId, poll] of Object.entries(all)) {
    if (poll.guildId !== guildId || poll.closed) continue;
    if (!latest || poll.createdAt > latest.poll.createdAt) {
      latest = { messageId, poll };
    }
  }
  return latest;
}
