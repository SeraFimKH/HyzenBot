import { PermissionFlagsBits } from "discord.js";
import { findAllLinkedNames, findLinkedPlayerName, findLinksBetween } from "../database/auth.js";
import { databaseTime } from "../database/databaseClock.js";

// A member who linked their Discord to the game (/verificar here, then /verificar <código> in the game) is called by
// their game name in every server the bot shares with them. HyzenAuth writes the link to hyzen_auth_links and tells
// nobody, so new links are picked up by looking every few seconds (linked_at past a watermark on the database's clock,
// same as punishmentFeed); everyone linked is checked at startup and every few hours, which also follows a name changed
// in the game. A member joining a server gets it right away (guildMemberAdd → syncMember).
//
// Discord never lets a bot rename the server owner, nor anyone whose top role is at or above the bot's, nor anyone at
// all without Manage Nicknames: those are skipped, said once in the console per server.

const NEW_LINKS_INTERVAL_MS = 10_000;
const FULL_PASS_INTERVAL_MS = 6 * 60 * 60 * 1000;
// A link written inside a transaction can become visible a moment after its linked_at: the window stays this far behind.
const SETTLE_SECONDS = 2;
const MAX_NICKNAME_LENGTH = 32;
const REASON = "Nome do jogo (conta vinculada com /verificar)";

let linkedAfter = null;
const warned = new Set();

export async function startNicknameSync(client) {
  linkedAfter = await databaseTime(SETTLE_SECONDS);
  await fullPass(client);
  setInterval(() => {
    newLinks(client).catch((err) => console.error("[nicknameSync] failed to check new links", err.message));
  }, NEW_LINKS_INTERVAL_MS);
  setInterval(() => {
    fullPass(client).catch((err) => console.error("[nicknameSync] full pass failed", err.message));
  }, FULL_PASS_INTERVAL_MS);
}

// A member who just joined a server: their game name now, if they're linked.
export async function syncMember(member) {
  const name = await findLinkedPlayerName(member.id);
  if (name) await applyGameName(member, name);
}

async function newLinks(client) {
  const after = linkedAfter;
  const upTo = await databaseTime(SETTLE_SECONDS, after);
  linkedAfter = upTo;

  for (const row of await findLinksBetween(after, upTo)) {
    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(row.discord_id).catch(() => null);
      if (member) await applyGameName(member, row.name);
    }
  }
}

// One member list per server (a single request), then every linked member in it.
async function fullPass(client) {
  const names = new Map((await findAllLinkedNames()).map((row) => [row.discord_id, row.name]));
  if (!names.size) return;

  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch().catch((err) => {
      console.error(`[nicknameSync] could not list the members of ${guild.name}`, err.message);
      return null;
    });
    if (!members) continue;
    for (const member of members.values()) {
      const name = names.get(member.id);
      if (name) await applyGameName(member, name);
    }
  }
}

export async function applyGameName(member, name) {
  const nickname = name.slice(0, MAX_NICKNAME_LENGTH);
  const guild = member.guild;
  if (member.user.bot || member.displayName === nickname) return;

  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    warnOnce(guild.id, `[nicknameSync] Sem a permissão "Gerenciar apelidos" em ${guild.name}: os apelidos não são trocados.`);
    return;
  }
  if (!member.manageable) {
    // The owner, or a top role at/above the bot's.
    warnOnce(`${guild.id}:${member.id}`, `[nicknameSync] Não dá para trocar o apelido de ${member.user.tag} em ${guild.name} (dono do servidor ou cargo acima do bot).`);
    return;
  }

  try {
    await member.setNickname(nickname, REASON);
  } catch (err) {
    warnOnce(`${guild.id}:${member.id}`, `[nicknameSync] Falhou ao trocar o apelido de ${member.user.tag} em ${guild.name}: ${err.message}`);
  }
}

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}
