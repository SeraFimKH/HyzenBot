import { PermissionFlagsBits } from "discord.js";
import {
  forgetOtherServers,
  listGroupRoles,
  listLinkedGroups,
  listLinkedTags,
  listTagRoles,
  publishRoles,
} from "../database/discordRoles.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { changeRole, warnOnce } from "../utils/roleChanges.js";

// The game's groups and tags as Discord roles, chosen on the site (admin → Configurações → Cargos do Discord), in every
// server the bot is in: each group and each tag can give one or more roles per server. Every player who linked their
// Discord (/verificar) gets the roles of their group and of every tag they have, and loses them when the group ends (a
// VIP that expires) or changes, or the tag is taken. Like the beta role, a role is only taken from who the bot gave it to
// (cfg.groupRolesGiven: discord id → role ids, for groups and tags alike): roles the staff gave by hand stay. Nobody
// tells the bot when a group or a tag changes (the game, the site and the shop all do it), so it looks every little
// while. It also tells the site which roles each server has, so the staff picks them by name there. A role with
// Administrator is never handed out, whatever the site says.

const SYNC_INTERVAL_MS = 30_000;
const TAG = "groupRoles";
const GIVE_REASON = "Grupo ou tag no jogo (Hyzen)";
const TAKE_REASON = "Não tem mais o grupo ou a tag no jogo (Hyzen)";
const MISSING_TABLE = "42P01";

let running = false;
const published = new Map(); // server id → its role list as last written, in JSON
let publishedServers = "";
const loadedGuilds = new Set();

export function startGroupRoleSync(client) {
  const sync = () => syncGroupRoles(client).catch((err) => console.error(`[${TAG}] sync failed`, err.message));
  sync();
  setInterval(sync, SYNC_INTERVAL_MS);
}

export async function syncGroupRoles(client) {
  if (running) return;
  running = true;
  try {
    await publishAll(client);
    const [groupChoices, tagChoices, linked, linkedTags] = await Promise.all([
      listGroupRoles(),
      listTagRoles(),
      listLinkedGroups(),
      listLinkedTags(),
    ]);
    const tagsOf = new Map();
    for (const { discord_id: discordId, tag_id: tagId } of linkedTags) {
      if (!tagsOf.has(discordId)) tagsOf.set(discordId, []);
      tagsOf.get(discordId).push(String(tagId));
    }
    const players = linked.map(({ discord_id: discordId, group_id: groupId }) => ({
      discordId,
      groupId: String(groupId),
      tagIds: tagsOf.get(discordId) ?? [],
    }));
    for (const guild of client.guilds.cache.values()) {
      const here = (choice) => choice.guild_id === guild.id;
      await syncGuild(guild, groupChoices.filter(here), tagChoices.filter(here), players);
    }
  } catch (err) {
    if (err.code !== MISSING_TABLE) throw err;
    warnOnce(`${TAG}:tables`, `[${TAG}] As tabelas dos cargos do Discord ainda não existem: atualize o site.`);
  } finally {
    running = false;
  }
}

// The roles the bot could hand out in a server, written for the site when they changed. @everyone and the roles
// Discord manages itself (bots, boosters) can't be given by anyone, so they are left out.
async function publishAll(client) {
  const servers = [...client.guilds.cache.values()];
  for (const guild of servers) {
    const canManage = Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles));
    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id && !role.managed)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        editable: canManage && role.editable,
        admin: role.permissions.has(PermissionFlagsBits.Administrator),
      }));
    const snapshot = JSON.stringify([guild.name, roles]);
    if (published.get(guild.id) === snapshot) continue;
    await publishRoles(guild.id, guild.name, roles);
    published.set(guild.id, snapshot);
  }
  const ids = servers.map((guild) => guild.id).sort();
  if (ids.join() !== publishedServers) {
    await forgetOtherServers(ids);
    publishedServers = ids.join();
  }
}

// Why the bot can't hand out this role, in words for the console, or null when it can.
function roleProblem(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return "o cargo escolhido no site não existe mais neste servidor";
  if (role.permissions.has(PermissionFlagsBits.Administrator)) return `o cargo ${role.name} tem permissão de Administrador, e o bot não dá esses cargos`;
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) return 'o bot precisa da permissão "Gerenciar cargos"';
  if (!role.editable) return `o cargo do bot precisa estar acima de ${role.name} na lista de cargos`;
  return null;
}

// owner id (a group's or a tag's) → the roles it gives here, leaving out (and saying once) the ones the bot can't hand out.
function rolesByOwner(guild, choices, ownerColumn) {
  const roles = new Map();
  for (const choice of choices) {
    const roleId = choice.role_id;
    const problem = roleProblem(guild, roleId);
    if (problem) {
      warnOnce(`${TAG}:${guild.id}:${roleId}`, `[${TAG}] ${guild.name}: ${problem}.`);
      continue;
    }
    const owner = String(choice[ownerColumn]);
    if (!roles.has(owner)) roles.set(owner, new Set());
    roles.get(owner).add(roleId);
  }
  return roles;
}

async function syncGuild(guild, groupChoices, tagChoices, players) {
  const cfg = getGuildConfig(guild.id);
  const given = Object.fromEntries(Object.entries(cfg.groupRolesGiven ?? {}).map(([id, roles]) => [id, new Set(roles)]));
  if (!groupChoices.length && !tagChoices.length && !Object.keys(given).length) return;

  const groupRoles = rolesByOwner(guild, groupChoices, "group_id");
  const tagRoles = rolesByOwner(guild, tagChoices, "tag_id");

  // One member list per server, once: joins and role changes keep the cache up to date from then on.
  if (!loadedGuilds.has(guild.id)) {
    await guild.members.fetch();
    loadedGuilds.add(guild.id);
  }

  let changed = false;
  const here = new Set();
  for (const { discordId, groupId, tagIds } of players) {
    const member = guild.members.cache.get(discordId);
    if (!member) continue;
    here.add(discordId);
    const wanted = new Set(groupRoles.get(groupId) ?? []);
    for (const tagId of tagIds) for (const roleId of tagRoles.get(tagId) ?? []) wanted.add(roleId);
    const mine = given[discordId] ?? new Set();
    for (const roleId of wanted) {
      // Already there (given by hand, or by the bot before): nothing to do, and a role given by hand stays the staff's.
      if (member.roles.cache.has(roleId)) continue;
      if (!(await changeRole(member, () => member.roles.add(roleId, GIVE_REASON), TAG))) continue;
      mine.add(roleId);
      changed = true;
    }
    for (const roleId of [...mine]) {
      if (wanted.has(roleId)) continue;
      if (member.roles.cache.has(roleId) && !(await changeRole(member, () => member.roles.remove(roleId, TAKE_REASON), TAG))) continue;
      mine.delete(roleId);
      changed = true;
    }
    if (mine.size) given[discordId] = mine;
    else if (given[discordId]) {
      delete given[discordId];
      changed = true;
    }
  }

  // Unlinked, or no longer in this server: the roles the bot gave them go (if they are still here to lose them).
  for (const [discordId, mine] of Object.entries(given)) {
    if (here.has(discordId)) continue;
    const member = guild.members.cache.get(discordId);
    let left = false;
    for (const roleId of mine) {
      if (member?.roles.cache.has(roleId) && !(await changeRole(member, () => member.roles.remove(roleId, TAKE_REASON), TAG))) left = true;
    }
    if (left) continue;
    delete given[discordId];
    changed = true;
  }

  if (changed) {
    updateGuildConfig(guild.id, (c) => {
      c.groupRolesGiven = Object.fromEntries(Object.entries(given).map(([id, roles]) => [id, [...roles]]));
    });
  }
}
