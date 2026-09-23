import { JsonStore } from "./jsonStore.js";

const codesStore = new JsonStore("inviteCodes.json", {});
const creditsStore = new JsonStore("inviteCredits.json", {});

function getGuildCodes(guildId) {
  return codesStore.get(guildId) || {};
}

export function getPersonalCode(guildId, userId) {
  return getGuildCodes(guildId)[userId] || null;
}

export function setPersonalCode(guildId, userId, code) {
  const codes = getGuildCodes(guildId);
  codes[userId] = code;
  codesStore.set(guildId, codes);
}

export function getOwnerByCode(guildId, code) {
  const codes = getGuildCodes(guildId);
  const entry = Object.entries(codes).find(([, c]) => c === code);
  return entry ? entry[0] : null;
}

function getGuildCredits(guildId) {
  return creditsStore.get(guildId) || {};
}

export function addInviteCredit(guildId, userId) {
  const credits = getGuildCredits(guildId);
  credits[userId] = (credits[userId] || 0) + 1;
  creditsStore.set(guildId, credits);
  return credits[userId];
}

export function getInviteCount(guildId, userId) {
  return getGuildCredits(guildId)[userId] || 0;
}

export function getGuildInviteCounts(guildId) {
  return getGuildCredits(guildId);
}
