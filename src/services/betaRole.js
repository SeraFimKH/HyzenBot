import { PermissionFlagsBits } from "discord.js";
import { getBetaTagKey, listBetaGrants, listBetaTagHolders } from "../database/betaGrants.js";
import { findRegistrations, RegistrationStatus } from "../database/betaRegistrations.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";

// The beta testers' role on Discord (/painel → Cargo de Beta Tester, /config cargo-beta): whoever is a beta tester in
// the game gets it, in every server that chose one, and loses it when they stop being one. Who that is comes from the
// same place as /beta lista: the beta tag in the game, plus who was approved and hasn't joined yet. Nobody tells the bot
// when the tag changes (the site and the game can do it too), so it looks every little while, like the nickname sync.
//
// A role is only taken from who the bot gave it to (cfg.betaRoleGiven: discord id → the tester's name): someone the
// staff gave it by hand keeps it. And a tester can only be found on Discord through their linked account (/verificar)
// or the approval that named their member: with neither, there's nobody to give it to.

const SYNC_INTERVAL_MS = 30_000;
const GIVE_REASON = "Beta tester no jogo";
const TAKE_REASON = "Não é mais beta tester no jogo";

let running = false;
const loadedGuilds = new Set();
const warned = new Set();

export function startBetaRoleSync(client) {
  const sync = () => syncBetaRoles(client).catch((err) => console.error("[betaRole] sync failed", err.message));
  sync();
  setInterval(sync, SYNC_INTERVAL_MS);
}

export async function syncBetaRoles(client) {
  if (running) return;
  running = true;
  try {
    const guilds = [...client.guilds.cache.values()].filter((guild) => getGuildConfig(guild.id).betaRoleId);
    if (!guilds.length) return;
    const testers = await readTesters();
    for (const guild of guilds) {
      await syncGuild(guild, testers);
    }
  } finally {
    running = false;
  }
}

// Saves the server's choice. The role it had leaves whoever the bot gave it to, in the background: this is called while
// an interaction waits for its answer.
export function setBetaRole(client, guildId, roleId) {
  const { betaRoleId: oldRoleId, betaRoleGiven: given } = getGuildConfig(guildId);
  if (oldRoleId === roleId) return;
  updateGuildConfig(guildId, (c) => {
    c.betaRoleId = roleId;
    c.betaRoleGiven = {};
  });
  takeOldRole(client.guilds.cache.get(guildId), oldRoleId, Object.keys(given))
    .then(() => syncBetaRoles(client))
    .catch((err) => console.error("[betaRole] failed to change the role", err.message));
}

// Why the bot can't hand this role out, in words for the staff, or null when it can.
export function betaRoleProblem(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return "O cargo de beta tester escolhido não existe mais neste servidor.";
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) return 'O bot precisa da permissão "Gerenciar cargos" para dar o cargo de beta tester.';
  if (!role.editable) return `O cargo do bot precisa estar acima de ${role} na lista de cargos do servidor, senão ele não consegue dar esse cargo.`;
  return null;
}

// names: every tester, lowercase. discordIds: discord id → the tester's name, for the ones who can be found on Discord.
async function readTesters() {
  const [tagged, waiting] = await Promise.all([getBetaTagKey().then(listBetaTagHolders), listBetaGrants()]);
  const names = new Set([...tagged, ...waiting].map((tester) => tester.name.toLowerCase()));
  const discordIds = new Map();
  for (const { name, discordId } of [...tagged, ...waiting]) {
    if (discordId) discordIds.set(discordId, name.toLowerCase());
  }
  // Approved, joined and got the tag without ever linking the account: the approved request still knows who they are.
  for (const { registration } of findRegistrations(RegistrationStatus.APPROVED)) {
    const name = registration.name.toLowerCase();
    if (registration.discordId && names.has(name) && !discordIds.has(registration.discordId)) discordIds.set(registration.discordId, name);
  }
  return { names, discordIds };
}

async function syncGuild(guild, { names, discordIds }) {
  const cfg = getGuildConfig(guild.id);
  const problem = betaRoleProblem(guild, cfg.betaRoleId);
  if (problem) {
    warnOnce(`${guild.id}:${cfg.betaRoleId}`, `[betaRole] ${guild.name}: ${problem}`);
    return;
  }
  // One member list per server, once: joins and role changes keep the cache up to date from then on.
  if (!loadedGuilds.has(guild.id)) {
    await guild.members.fetch();
    loadedGuilds.add(guild.id);
  }

  const given = { ...cfg.betaRoleGiven };
  let changed = false;
  for (const [discordId, name] of discordIds) {
    const member = guild.members.cache.get(discordId);
    if (!member) continue;
    if (!member.roles.cache.has(cfg.betaRoleId) && !(await changeRole(member, () => member.roles.add(cfg.betaRoleId, GIVE_REASON)))) continue;
    if (given[discordId] !== name) {
      given[discordId] = name;
      changed = true;
    }
  }
  for (const [discordId, name] of Object.entries(given)) {
    if (discordIds.has(discordId) || names.has(name)) continue;
    const member = guild.members.cache.get(discordId);
    if (member?.roles.cache.has(cfg.betaRoleId) && !(await changeRole(member, () => member.roles.remove(cfg.betaRoleId, TAKE_REASON)))) continue;
    delete given[discordId];
    changed = true;
  }
  if (changed) {
    updateGuildConfig(guild.id, (c) => {
      c.betaRoleGiven = given;
    });
  }
}

async function takeOldRole(guild, roleId, discordIds) {
  if (!guild || !roleId) return;
  for (const discordId of discordIds) {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member?.roles.cache.has(roleId)) await changeRole(member, () => member.roles.remove(roleId, TAKE_REASON));
  }
}

// True when it went through. Tried again on the next pass; said once in the console.
async function changeRole(member, change) {
  try {
    await change();
    return true;
  } catch (err) {
    warnOnce(`${member.guild.id}:${member.id}`, `[betaRole] Falhou ao mudar o cargo de ${member.user.tag} em ${member.guild.name}: ${err.message}`);
    return false;
  }
}

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}
