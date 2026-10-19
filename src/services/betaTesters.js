import { getGuildConfig } from "../database/guildConfig.js";
import { deleteBetaTester, listBetaTesters, saveBetaTester, setBetaAccessOpen } from "../database/betaTesters.js";
import { StatusTableMissingError } from "../database/networkStatus.js";
import { hasAnyRole } from "../utils/permissions.js";
import { broadcastStaffLog } from "../utils/staffLog.js";
import { baseEmbed } from "../utils/embeds.js";

// Who is a beta tester is decided on Discord: having one of the server's beta tester roles (/painel → Beta Testers).
// The name a tester registered (/beta nick) only lasts while they keep it — losing the role, leaving that server or the
// staff emptying the roles takes the name off hyzen_beta_testers, and with it the entry during the maintenance.
// Everything that changes is logged in the beta log channel (which can be in the admin server).

const UNKNOWN_MEMBER = 10007;

// discordId -> the server they registered from, for everyone registered: every member update is checked against it
// without asking the database.
const registered = new Map();
let loggedMissingTable = false;

export function canBeBetaTester(member, cfg) {
  return cfg.betaRoles.length > 0 && hasAnyRole(member, cfg.betaRoles);
}

// Throws NameTakenError (another tester has the name) and StatusTableMissingError (HyzenCore not updated yet).
export async function registerBetaTester(member, name, previousName) {
  await saveBetaTester(member.id, member.guild.id, name);
  registered.set(member.id, member.guild.id);
  const fields = [
    { name: "Membro", value: `<@${member.id}> · ${member.user.tag}`, inline: true },
    { name: "Nick no jogo", value: name, inline: true },
  ];
  if (previousName && previousName !== name) fields.push({ name: "Nick anterior", value: previousName, inline: true });
  await log(member.client, member.guild.id, previousName ? "🧪 Beta tester trocou o nick" : "🧪 Beta tester registrado", 0x5865f2, fields);
}

// The tester taken off (null when they had no name), with why for the log: "removido por @x", "perdeu o cargo"...
export async function removeBetaTester(client, guildId, discordId, why) {
  const removed = await deleteBetaTester(discordId);
  registered.delete(discordId);
  if (removed) {
    await log(client, guildId, "🧪 Beta tester removido", 0xed4245, [
      { name: "Membro", value: `<@${discordId}>`, inline: true },
      { name: "Nick no jogo", value: removed.name, inline: true },
      { name: "Por quê", value: why },
    ]);
  }
  return removed;
}

export async function setBetaAccess(client, guildId, open, staffId) {
  await setBetaAccessOpen(open);
  await log(client, guildId, open ? "🔓 Entrada dos beta testers liberada" : "🔒 Entrada dos beta testers bloqueada", open ? 0x57f287 : 0xed4245, [
    { name: "Por", value: `<@${staffId}>`, inline: true },
  ]);
}

// Checks every registered tester against Discord: at startup (who lost the role while the bot was off) and after the
// beta tester roles change. Only a member Discord says is gone, or one present without the role, is taken off — a
// failed lookup keeps the name.
export async function syncBetaTesters(client) {
  let testers;
  try {
    testers = await listBetaTesters();
    loggedMissingTable = false;
  } catch (err) {
    if (!(err instanceof StatusTableMissingError)) {
      console.error("[betaTesters] failed to read the beta testers", err.message);
    } else if (!loggedMissingTable) {
      loggedMissingTable = true;
      console.error("[betaTesters] a tabela hyzen_beta_testers ainda não existe — ela é criada pelo HyzenCore atualizado quando o servidor liga.");
    }
    return;
  }

  registered.clear();
  for (const tester of testers) {
    registered.set(tester.discordId, tester.guildId);
    const guild = client.guilds.cache.get(tester.guildId);
    if (!guild) {
      await removeBetaTester(client, tester.guildId, tester.discordId, "O bot não está mais no servidor de onde ele registrou o nick.");
      continue;
    }
    if (!guild.available) continue;
    const member = await guild.members.fetch(tester.discordId).catch((err) => (err.code === UNKNOWN_MEMBER ? null : undefined));
    if (member === undefined) continue;
    const why = !member ? `Saiu do servidor ${guild.name}.` : canBeBetaTester(member, getGuildConfig(guild.id)) ? null : "Não tem mais o cargo de beta tester.";
    if (why) await removeBetaTester(client, guild.id, tester.discordId, why);
  }
}

// guildMemberUpdate: the role taken away (or the roles emptied) ends the registration.
export async function onBetaMemberUpdate(member) {
  if (registered.get(member.id) !== member.guild.id || canBeBetaTester(member, getGuildConfig(member.guild.id))) return;
  await removeBetaTester(member.client, member.guild.id, member.id, "Perdeu o cargo de beta tester.").catch((err) =>
    console.error("[betaTesters] failed to remove a tester who lost the role", err.message),
  );
}

// guildMemberRemove: leaving the server (or being kicked) ends it too.
export async function onBetaMemberLeave(member) {
  if (registered.get(member.id) !== member.guild.id) return;
  await removeBetaTester(member.client, member.guild.id, member.id, `Saiu do servidor ${member.guild.name}.`).catch((err) =>
    console.error("[betaTesters] failed to remove a tester who left", err.message),
  );
}

// One beta tester system for the whole network, so its log goes to every server's beta log channel (the admin server's
// included), once per channel. guildId names where it happened.
async function log(client, guildId, title, color, fields) {
  const where = client.guilds.cache.get(guildId)?.name;
  const embed = baseEmbed(getGuildConfig(guildId).communityName).setColor(color).setTitle(title).addFields(fields);
  if (where) embed.setFooter({ text: `Discord: ${where}` });
  await broadcastStaffLog(client, "betaLog", embed);
}
