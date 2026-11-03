import { MessageFlags, PermissionsBitField } from "discord.js";
import { ClockStatus, ClockTableMissingError, countPendingEntries, getEntry, lastPresence, listPendingEntries, reviewEntry } from "../database/clock.js";
import { findLinkedPlayerName } from "../database/auth.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import {
  buildCardFor,
  buildWeekReport,
  CLOCK_TABLE_MISSING,
  clockGuild,
  displayNameOf,
  findInactive,
  isClockAdmin,
  periodSummaries,
  refreshEntryCard,
  teamMembers,
} from "../services/clock.js";
import { weekEnd, weekStart } from "../utils/clockTime.js";
import {
  ADMIN_APPROVE_PREFIX,
  ADMIN_CONFIG_MODAL_ID,
  ADMIN_INACTIVE_ID,
  ADMIN_MEMBER_SELECT_PREFIX,
  ADMIN_PENDING_ID,
  ADMIN_REJECT_MODAL_PREFIX,
  ADMIN_REJECT_PREFIX,
  ADMIN_REPORT_PREFIX,
  ADMIN_REVIEW_SELECT_ID,
  ADMIN_VIEW_PREFIX,
  ADMIN_WEEK_PREFIX,
  buildConfigModal,
  buildInactiveView,
  buildMemberDetail,
  buildOverview,
  buildPendingView,
  buildRejectModal,
  buildReviewDm,
} from "../utils/clockViews.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";
import { postLog } from "../utils/staffLog.js";

// /ponto admin and what comes from it: who's present, each member's week, the records waiting for an answer and the report.
// Only admins and the roles chosen on /painel → Bate-ponto. It looks and answers: nothing here removes or punishes anyone.

const PENDING_SHOWN = 25;
const MAX_INACTIVE_DAYS = 90;
const MAX_OPEN_HOURS = 72;

const denied = (interaction) => !isClockAdmin(interaction.member, getGuildConfig(interaction.guildId));

function deny(interaction) {
  return interaction.reply({ embeds: [errorEmbed("Só a administração do bate-ponto pode fazer isso.")], flags: MessageFlags.Ephemeral });
}

function fail(interaction, err) {
  if (!(err instanceof ClockTableMissingError)) throw err;
  const payload = { embeds: [errorEmbed(CLOCK_TABLE_MISSING)], components: [] };
  return interaction.deferred || interaction.replied ? interaction.editReply(payload) : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function overviewView(interaction, weeksAgo) {
  const guild = clockGuild(interaction.client, interaction.guildId);
  const cfg = getGuildConfig(guild.id);
  const from = weekStart(new Date(), weeksAgo);
  const to = weekEnd(from);
  const team = await teamMembers(guild, cfg);
  const [summaries, inactive, pendingCount] = await Promise.all([periodSummaries(team.map((member) => member.id), from, to), findInactive(guild, cfg), countPendingEntries()]);
  const inactiveIds = new Set(inactive.map(({ member }) => member.id));
  const total = (row) => row.summary.declaredSeconds + row.summary.verifiedSeconds;
  const rows = team.map((member) => ({ member, summary: summaries.get(member.id), inactive: inactiveIds.has(member.id) })).sort((a, b) => total(b) - total(a));
  return buildOverview({ rows, from, to, weeksAgo, pendingCount, inactiveCount: inactive.length });
}

async function memberView(interaction, discordId, weeksAgo) {
  const guild = clockGuild(interaction.client, interaction.guildId);
  const from = weekStart(new Date(), weeksAgo);
  const to = weekEnd(from);
  const [summaries, last, name, linked] = await Promise.all([
    periodSummaries([discordId], from, to),
    lastPresence([discordId]),
    displayNameOf(interaction.client, guild, discordId),
    findLinkedPlayerName(discordId).then(Boolean, () => false),
  ]);
  return buildMemberDetail({ discordId, name, summary: summaries.get(discordId), from, to, weeksAgo, linked, lastSeen: last.get(discordId) ?? null });
}

async function pendingView(interaction) {
  const guild = clockGuild(interaction.client, interaction.guildId);
  const [entries, total] = await Promise.all([listPendingEntries(PENDING_SHOWN), countPendingEntries()]);
  const names = new Map(await Promise.all(entries.map(async (entry) => [entry.discordId, await displayNameOf(interaction.client, guild, entry.discordId)])));
  return buildPendingView(entries, names, total);
}

// /ponto admin.
export async function showOverview(interaction) {
  if (denied(interaction)) return deny(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    return await interaction.editReply(await overviewView(interaction, 0));
  } catch (err) {
    return fail(interaction, err);
  }
}

// /ponto membro.
export async function showMember(interaction, discordId, weeksAgo) {
  if (denied(interaction)) return deny(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    return await interaction.editReply(await memberView(interaction, discordId, weeksAgo));
  } catch (err) {
    return fail(interaction, err);
  }
}

export async function handleButton(interaction) {
  if (denied(interaction)) return deny(interaction);
  const { customId } = interaction;
  // Forms open at once, or Discord refuses them.
  if (customId.startsWith(ADMIN_REJECT_PREFIX)) return interaction.showModal(buildRejectModal(Number(customId.slice(ADMIN_REJECT_PREFIX.length))));

  await interaction.deferUpdate();
  try {
    if (customId.startsWith(ADMIN_WEEK_PREFIX)) return await interaction.editReply(await overviewView(interaction, Number(customId.slice(ADMIN_WEEK_PREFIX.length))));
    if (customId.startsWith(ADMIN_VIEW_PREFIX)) {
      const [discordId, weeksAgo] = customId.slice(ADMIN_VIEW_PREFIX.length).split(":");
      return await interaction.editReply(await memberView(interaction, discordId, Number(weeksAgo)));
    }
    if (customId === ADMIN_PENDING_ID) return await interaction.editReply(await pendingView(interaction));
    if (customId === ADMIN_INACTIVE_ID) {
      const guild = clockGuild(interaction.client, interaction.guildId);
      const cfg = getGuildConfig(guild.id);
      return await interaction.editReply(buildInactiveView(cfg, await findInactive(guild, cfg)));
    }
    if (customId.startsWith(ADMIN_REPORT_PREFIX)) return await publishReport(interaction, Number(customId.slice(ADMIN_REPORT_PREFIX.length)));
    if (customId.startsWith(ADMIN_APPROVE_PREFIX)) return await answerEntry(interaction, Number(customId.slice(ADMIN_APPROVE_PREFIX.length)), ClockStatus.APPROVED, null);
  } catch (err) {
    return fail(interaction, err);
  }
}

async function publishReport(interaction, weeksAgo) {
  const guild = clockGuild(interaction.client, interaction.guildId);
  const cfg = getGuildConfig(guild.id);
  if (!cfg.channels.clockLog) {
    return interaction.followUp({ embeds: [errorEmbed("Escolha o canal de relatórios em `/painel` → Bate-ponto primeiro.")], flags: MessageFlags.Ephemeral });
  }
  const from = weekStart(new Date(), weeksAgo);
  const message = await postLog(interaction.client, guild.id, "clockLog", await buildWeekReport(guild, cfg, from, weekEnd(from)));
  const embed = message ? successEmbed(`Relatório publicado em <#${message.channelId}>.`) : errorEmbed("Não consegui publicar no canal de relatórios. Confira as permissões do bot.");
  return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// Nobody answers their own record, unless they're the server's admin: someone has to be able to, when it's only them.
function ownRecord(interaction, entry) {
  return entry.discordId === interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function answerEntry(interaction, id, status, note) {
  const guild = clockGuild(interaction.client, interaction.guildId);
  const inPanel = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
  const current = await getEntry(id);
  if (!current) return interaction.followUp({ embeds: [errorEmbed("Esse registro não existe mais.")], flags: MessageFlags.Ephemeral });
  if (ownRecord(interaction, current)) return interaction.followUp({ embeds: [errorEmbed("Você não pode responder o seu próprio registro.")], flags: MessageFlags.Ephemeral });

  const entry = await reviewEntry(id, status, interaction.user.id, note);
  if (!entry) {
    await interaction.editReply(await buildCardFor(interaction.client, guild, current, inPanel));
    return interaction.followUp({ embeds: [errorEmbed("Esse registro já foi respondido.")], flags: MessageFlags.Ephemeral });
  }
  await interaction.editReply(await buildCardFor(interaction.client, guild, entry, inPanel));
  if (inPanel) await refreshEntryCard(interaction.client, guild, entry);
  const user = await interaction.client.users.fetch(entry.discordId).catch(() => null);
  await user?.send({ embeds: [buildReviewDm(entry)] }).catch(() => {});
}

export async function handleUserSelect(interaction) {
  if (denied(interaction)) return deny(interaction);
  await interaction.deferUpdate();
  try {
    return await interaction.editReply(await memberView(interaction, interaction.values[0], Number(interaction.customId.slice(ADMIN_MEMBER_SELECT_PREFIX.length))));
  } catch (err) {
    return fail(interaction, err);
  }
}

export async function handleSelect(interaction) {
  if (interaction.customId !== ADMIN_REVIEW_SELECT_ID) return;
  if (denied(interaction)) return deny(interaction);
  await interaction.deferUpdate();
  try {
    const entry = await getEntry(Number(interaction.values[0]));
    if (!entry) return await interaction.editReply(await pendingView(interaction));
    return await interaction.editReply(await buildCardFor(interaction.client, clockGuild(interaction.client, interaction.guildId), entry, true));
  } catch (err) {
    return fail(interaction, err);
  }
}

export async function handleModal(interaction) {
  if (denied(interaction)) return deny(interaction);
  if (interaction.customId === ADMIN_CONFIG_MODAL_ID) return saveConfig(interaction);
  if (!interaction.customId.startsWith(ADMIN_REJECT_MODAL_PREFIX)) return;
  await interaction.deferUpdate();
  try {
    return await answerEntry(interaction, Number(interaction.customId.slice(ADMIN_REJECT_MODAL_PREFIX.length)), ClockStatus.REJECTED, interaction.fields.getTextInputValue("motivo").trim());
  } catch (err) {
    return fail(interaction, err);
  }
}

// /painel → Bate-ponto → Configurar Avisos.
export function openConfigModal(interaction) {
  return interaction.showModal(buildConfigModal(getGuildConfig(interaction.guildId)));
}

async function saveConfig(interaction) {
  const days = Number(interaction.fields.getTextInputValue("dias").trim());
  const hours = Number(interaction.fields.getTextInputValue("horas").trim());
  if (!Number.isInteger(days) || days < 1 || days > MAX_INACTIVE_DAYS) {
    return interaction.reply({ embeds: [errorEmbed(`Os dias precisam ser um número inteiro de 1 a ${MAX_INACTIVE_DAYS}.`)], flags: MessageFlags.Ephemeral });
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_OPEN_HOURS) {
    return interaction.reply({ embeds: [errorEmbed(`As horas precisam ser um número inteiro de 1 a ${MAX_OPEN_HOURS}.`)], flags: MessageFlags.Ephemeral });
  }
  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.clockInactiveDays = days;
    c.clockMaxHours = hours;
  });
  return interaction.update(buildMainPanel(cfg, interaction));
}

