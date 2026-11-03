import { AttachmentBuilder, PermissionsBitField } from "discord.js";
import {
  ClockTableMissingError,
  countPendingEntries,
  lastPresence,
  listEntries,
  listOpenEntries,
  listSessions,
  setEntryCard,
} from "../database/clock.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { formatPermissionList, missingPermissions } from "../utils/channelPermissions.js";
import { buildAlertEmbed, buildClockPanel, buildEntryCard, buildReportEmbed, buildReportText } from "../utils/clockViews.js";
import { dayKey, hourOf, weekEnd, weekStart } from "../utils/clockTime.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { hasAnyRole, isAdmin } from "../utils/permissions.js";
import { postLog } from "../utils/staffLog.js";
import { overlapSeconds, stayIntervals, summarize } from "./clockStats.js";

// The time clock (/ponto): who's in it, the sums for a whole team, and what it does by itself. It reports and warns; it
// never takes anything from anyone. Who has to clock is the roles chosen on /painel → Bate-ponto (cfg.clockRoles).

const { Flags } = PermissionsBitField;
const PANEL_PERMISSIONS = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks];
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const FULL_MEMBER_FETCH_MS = 6 * 60 * 60 * 1000;
const REPORT_HOUR = 8;
const ALERT_HOUR = 9;
// Still inactive this long after the last warning: warned again.
const ALERT_REPEAT_MS = 7 * DAY_MS;

export const CLOCK_TABLE_MISSING = "O banco ainda não tem as tabelas do bate-ponto. Elas são criadas pelo **HyzenCore** atualizado quando o servidor do jogo liga.";

const memberFetches = new Map();

export const isClockMember = (member, cfg) => hasAnyRole(member, cfg.clockRoles);
export const isClockAdmin = (member, cfg) => isAdmin(member, cfg) || hasAnyRole(member, cfg.clockAdminRoles);

// The server whose team this is: on the admin server (/painel → Servidor Administrativo), the one it serves.
export function clockGuild(client, guildId) {
  for (const guild of client.guilds.cache.values()) {
    if (guild.id !== guildId && getGuildConfig(guild.id).adminGuildId === guildId) return guild;
  }
  return client.guilds.cache.get(guildId);
}

// Everyone with the roles that have to clock, by name. One full member list every few hours: joins and role changes keep
// the cache up to date in between.
export async function teamMembers(guild, cfg) {
  if (!cfg.clockRoles.length) return [];
  if (Date.now() - (memberFetches.get(guild.id) ?? 0) > FULL_MEMBER_FETCH_MS) {
    await guild.members.fetch().then(() => memberFetches.set(guild.id, Date.now())).catch((err) => console.error(`[clock] could not list the members of ${guild.name}`, err.message));
  }
  return [...guild.members.cache.values()].filter((member) => !member.user.bot && isClockMember(member, cfg)).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// discord id → this period's sums.
export async function periodSummaries(discordIds, from, to, now = Date.now()) {
  if (!discordIds.length) return new Map();
  const [entries, sessions] = await Promise.all([listEntries(discordIds, from, to), listSessions(discordIds, from, to)]);
  const ofMember = (list, id) => list.filter((item) => item.discordId === id);
  return new Map(discordIds.map((id) => [id, summarize(ofMember(entries, id), ofMember(sessions, id), from, to, now)]));
}

export async function entryVerifiedSeconds(entry, now = Date.now()) {
  const end = entry.endedAt ?? new Date(now);
  const sessions = await listSessions([entry.discordId], entry.startedAt, end);
  return overlapSeconds(entry.startedAt.getTime(), end.getTime(), stayIntervals(sessions, now));
}

// Who has to clock and hasn't shown up for the configured days, on the clock or in the game. Whoever has never shown up
// counts from when they joined the server or the clock was turned on, so nobody starts out as inactive.
export async function findInactive(guild, cfg, now = Date.now()) {
  const team = await teamMembers(guild, cfg);
  if (!team.length) return [];
  const last = await lastPresence(team.map((member) => member.id));
  const limit = cfg.clockInactiveDays * DAY_MS;
  const inactive = [];
  for (const member of team) {
    const seen = last.get(member.id) ?? null;
    const since = seen ?? Math.max(member.joinedTimestamp ?? 0, cfg.clockSince ?? now);
    if (now - since >= limit) inactive.push({ member, last: seen, days: Math.floor((now - since) / DAY_MS) });
  }
  return inactive.sort((a, b) => (a.last ?? 0) - (b.last ?? 0));
}

// The member's name for a record, whichever server they're seen from.
export async function displayNameOf(client, guild, discordId) {
  const member = guild?.members.cache.get(discordId) ?? (await guild?.members.fetch(discordId).catch(() => null));
  if (member) return member.displayName;
  const user = await client.users.fetch(discordId).catch(() => null);
  return user?.username ?? discordId;
}

export async function buildCardFor(client, guild, entry, inPanel = false) {
  return buildEntryCard(entry, { name: await displayNameOf(client, guild, entry.discordId), verifiedSeconds: await entryVerifiedSeconds(entry), inPanel });
}

// A record that needs an answer goes to the staff's channel, if there is one. It's on the admin panel either way.
export async function postEntryCard(client, guildId, entry) {
  const message = await postLog(client, guildId, "clockLog", await buildCardFor(client, client.guilds.cache.get(guildId), entry));
  if (message) await setEntryCard(entry.id, message.channelId, message.id);
}

// Answered somewhere else (the panel): the card in the channel stops offering the buttons.
export async function refreshEntryCard(client, guild, entry) {
  if (!entry.cardChannelId || !entry.cardMessageId) return;
  const channel = await client.channels.fetch(entry.cardChannelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(entry.cardMessageId).catch(() => null) : null;
  await message?.edit(await buildCardFor(client, guild, entry)).catch((err) => console.error(`[clock] failed to update the card of #${entry.id}`, err.message));
}

// Posts the panel with the buttons in its channel: the one there is edited; one left in another channel is deleted.
export async function publishClockPanel(client, guildId) {
  const cfg = getGuildConfig(guildId);
  if (!cfg.channels.clockPanel) return errorEmbed("Escolha o canal do painel de ponto primeiro.");
  const channel = await client.channels.fetch(cfg.channels.clockPanel).catch(() => null);
  if (!channel?.isTextBased()) return errorEmbed("O canal do painel de ponto não foi encontrado.");
  const missing = missingPermissions(channel, channel.guild?.members.me, PANEL_PERMISSIONS);
  if (missing.length) return errorEmbed(`O bot não consegue publicar em ${channel} (falta: ${formatPermissionList(missing)}).`);

  const sameChannel = cfg.clockPanelChannelId === channel.id;
  const previousChannel = cfg.clockPanelChannelId && !sameChannel ? await client.channels.fetch(cfg.clockPanelChannelId).catch(() => null) : channel;
  const previous = cfg.clockPanelMessageId && previousChannel ? await previousChannel.messages.fetch(cfg.clockPanelMessageId).catch(() => null) : null;
  if (previous && sameChannel) {
    await previous.edit(buildClockPanel());
    return successEmbed(`Painel de ponto atualizado em ${channel}.`);
  }
  await previous?.delete().catch(() => {});
  const message = await channel.send(buildClockPanel());
  updateGuildConfig(guildId, (c) => {
    c.clockPanelChannelId = channel.id;
    c.clockPanelMessageId = message.id;
  });
  return successEmbed(`Painel de ponto publicado em ${channel}.`);
}

// The week's report: { embeds, files }. Active is having any hour, declared or verified.
export async function buildWeekReport(guild, cfg, from, to, now = Date.now()) {
  const team = await teamMembers(guild, cfg);
  const summaries = await periodSummaries(team.map((member) => member.id), from, to, now);
  const total = (row) => row.summary.declaredSeconds + row.summary.verifiedSeconds;
  const rows = team.map((member) => ({ member, summary: summaries.get(member.id) })).sort((a, b) => total(b) - total(a));
  const active = rows.filter((row) => total(row) > 0);
  const inactive = rows.filter((row) => total(row) === 0);
  const pendingCount = await countPendingEntries();
  const file = new AttachmentBuilder(Buffer.from(buildReportText(rows, from, to), "utf8"), { name: `bate-ponto-${dayKey(from)}.txt` });
  return { embeds: [buildReportEmbed({ active, inactive, from, to, pendingCount })], files: [file], allowedMentions: { parse: [] } };
}

async function sendWeeklyReport(client, guild, cfg, nowDate) {
  const from = weekStart(nowDate, 1);
  const message = await postLog(client, guild.id, "clockLog", await buildWeekReport(guild, cfg, from, weekEnd(from), nowDate.getTime()));
  if (message) {
    updateGuildConfig(guild.id, (c) => {
      c.clockLastReportWeek = dayKey(from);
    });
  }
}

async function sendAlerts(client, guild, cfg, nowDate) {
  const now = nowDate.getTime();
  const inactive = await findInactive(guild, cfg, now);
  const team = await teamMembers(guild, cfg);
  const open = team.length ? await listOpenEntries(team.map((member) => member.id)) : [];
  const longOpen = open.filter((entry) => now - entry.startedAt >= cfg.clockMaxHours * 60 * 60 * 1000);

  // Whoever came back leaves the list, so they're warned about again if it happens again.
  const alerted = {};
  const newInactive = inactive.filter(({ member }) => {
    const before = cfg.clockAlerted[member.id];
    const due = !before || now - before >= ALERT_REPEAT_MS;
    alerted[member.id] = due ? now : before;
    return due;
  });
  const newOpen = longOpen.filter((entry) => {
    const key = `open:${entry.id}`;
    alerted[key] = cfg.clockAlerted[key] ?? now;
    return !cfg.clockAlerted[key];
  });

  if (newInactive.length || newOpen.length) {
    const names = new Map(team.map((member) => [member.id, member.displayName]));
    const message = await postLog(client, guild.id, "clockLog", { embeds: [buildAlertEmbed(cfg, newInactive, newOpen, names, now)], allowedMentions: { parse: [] } });
    if (!message) return;
  }
  updateGuildConfig(guild.id, (c) => {
    c.clockAlerted = alerted;
    c.clockLastAlertDay = dayKey(nowDate);
  });
}

// One server's turn: the first time, it only marks that the clock is on. Then a report once a week, on Monday morning for
// the week that ended, and the warnings once a day. If the bot was down at that hour, it does it when it's back.
export async function sweepGuild(client, guild, nowDate = new Date()) {
  let cfg = getGuildConfig(guild.id);
  if (!cfg.channels.clockLog || !cfg.clockRoles.length) return;
  if (!cfg.clockSince) {
    updateGuildConfig(guild.id, (c) => {
      c.clockSince = nowDate.getTime();
      c.clockLastReportWeek = dayKey(weekStart(nowDate, 1));
    });
    return;
  }
  const lastWeek = dayKey(weekStart(nowDate, 1));
  const pastReportHour = nowDate.getTime() >= weekStart(nowDate).getTime() + REPORT_HOUR * 60 * 60 * 1000;
  if (cfg.clockLastReportWeek !== lastWeek && pastReportHour) await sendWeeklyReport(client, guild, cfg, nowDate);

  cfg = getGuildConfig(guild.id);
  if (cfg.clockLastAlertDay !== dayKey(nowDate) && hourOf(nowDate) >= ALERT_HOUR) await sendAlerts(client, guild, cfg, nowDate);
}

export function startClockSweep(client) {
  const sweep = async () => {
    for (const guild of client.guilds.cache.values()) {
      await sweepGuild(client, guild).catch((err) => {
        if (!(err instanceof ClockTableMissingError)) console.error(`[clock] sweep failed in ${guild.name}`, err.message);
      });
    }
  };
  sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS);
}

