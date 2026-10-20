import { JsonStore } from "./jsonStore.js";

// The pre-registration requests (/painel → Servidor do Jogo → Pré-registro): one entry per guild,
// { counter, items: { [number]: request } }. Local JSON like the suggestions — the request itself is a card in the
// approval channel, this is the index the buttons on it need. What an approval grants lives in Postgres
// (hyzen_beta_grants, database/betaGrants.js).
const store = new JsonStore("betaRegistrations.json", {});

export const RegistrationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  // Approved, then taken out of the beta testers (/beta remover, or the card's button).
  REMOVED: "REMOVED",
};

// Still counting: waiting for an answer, or approved. Refused or removed, the member may ask again.
const isActive = (r) => r.status === RegistrationStatus.PENDING || r.status === RegistrationStatus.APPROVED;

function guildData(guildId) {
  const data = store.get(guildId) || {};
  return { counter: data.counter || 0, items: data.items || {} };
}

export function getRegistration(guildId, number) {
  return guildData(guildId).items[number] || null;
}

export function findActiveRegistration(guildId, discordId) {
  return Object.values(guildData(guildId).items).find((r) => r.discordId === discordId && isActive(r)) || null;
}

// The same name, asked for (or approved) by someone else.
export function findRegistrationByName(guildId, name) {
  const key = name.toLowerCase();
  return Object.values(guildData(guildId).items).find((r) => r.name.toLowerCase() === key && isActive(r)) || null;
}

// Across every Discord server: [{ guildId, registration }] with this status (and this name, when given).
export function findRegistrations(status, name = null) {
  const key = name?.toLowerCase();
  const found = [];
  for (const [guildId, data] of Object.entries(store.all())) {
    for (const registration of Object.values(data?.items || {})) {
      if (registration.status === status && (!key || registration.name.toLowerCase() === key)) found.push({ guildId, registration });
    }
  }
  return found;
}

// Takes the next number; the card it's posted in is added with updateRegistration (or the whole thing undone with
// discardRegistration if posting failed).
export function createRegistration(guildId, { discordId, userTag, name, knownName, linkedName }) {
  const data = guildData(guildId);
  const number = data.counter + 1;
  data.counter = number;
  data.items[number] = {
    number,
    discordId,
    userTag,
    name,
    // Whether the name already joined the server, and the game account this Discord user linked with /verificar — shown
    // to the staff on the card.
    knownName,
    linkedName,
    status: RegistrationStatus.PENDING,
    requestedAt: Date.now(),
    channelId: null,
    messageId: null,
    decision: null,
  };
  store.set(guildId, data);
  return data.items[number];
}

export function updateRegistration(guildId, number, mutator) {
  const data = guildData(guildId);
  const item = data.items[number];
  if (!item) return null;
  mutator(item);
  store.set(guildId, data);
  return item;
}

export function discardRegistration(guildId, number) {
  const data = guildData(guildId);
  if (!data.items[number]) return;
  delete data.items[number];
  if (data.counter === number) data.counter = number - 1;
  store.set(guildId, data);
}
