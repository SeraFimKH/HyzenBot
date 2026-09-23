import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("raffles.json", {});

export function getRaffle(guildId) {
  return store.get(guildId) || null;
}

export function setRaffle(guildId, raffle) {
  store.set(guildId, raffle);
  return raffle;
}

export function updateRaffle(guildId, mutator) {
  const raffle = getRaffle(guildId);
  if (!raffle) return null;
  mutator(raffle);
  store.set(guildId, raffle);
  return raffle;
}

export function clearRaffle(guildId) {
  store.delete(guildId);
}

export function allRaffles() {
  return store.all();
}
