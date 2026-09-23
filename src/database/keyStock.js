import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("keyStock.json", {});

function getGuildStocks(guildId) {
  return store.get(guildId) || {};
}

export function listStocks(guildId) {
  return getGuildStocks(guildId);
}

export function addKeys(guildId, nome, keys) {
  const stocks = getGuildStocks(guildId);
  const list = stocks[nome] || [];
  stocks[nome] = [...list, ...keys];
  store.set(guildId, stocks);
  return stocks[nome].length;
}

export function takeKey(guildId, nome) {
  const stocks = getGuildStocks(guildId);
  const list = stocks[nome];
  if (!list || !list.length) return null;
  const [key, ...rest] = list;
  stocks[nome] = rest;
  store.set(guildId, stocks);
  return key;
}

export function removeStock(guildId, nome) {
  const stocks = getGuildStocks(guildId);
  if (!(nome in stocks)) return false;
  delete stocks[nome];
  store.set(guildId, stocks);
  return true;
}

export function countKeys(guildId, nome) {
  const stocks = getGuildStocks(guildId);
  return stocks[nome]?.length || 0;
}
