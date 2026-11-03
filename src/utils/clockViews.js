import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { ClockStatus } from "../database/clock.js";
import { baseEmbed } from "./embeds.js";
import { formatDateTime, formatDay, formatDayKey, formatDuration, formatTime } from "./clockTime.js";

// What the time clock shows and asks. Declared hours are always ⏰ and verified ones always 🎮, so they're never mixed up.

export const MEMBER_PREFIX = "clock_";
export const ADMIN_PREFIX = "clock_admin_";

export const START_BUTTON_ID = "clock_start";
export const FINISH_BUTTON_ID = "clock_finish";
export const HISTORY_BUTTON_ID = "clock_history";
export const MANUAL_BUTTON_ID = "clock_manual";
export const ACTIVITY_SELECT_ID = "clock_activities";
export const FINISH_MODAL_PREFIX = "clock_finish_modal:";
export const MANUAL_MODAL_ID = "clock_manual_modal";

export const ADMIN_WEEK_PREFIX = "clock_admin_week:";
export const ADMIN_MEMBER_SELECT_PREFIX = "clock_admin_member:";
export const ADMIN_VIEW_PREFIX = "clock_admin_view:";
export const ADMIN_PENDING_ID = "clock_admin_pending";
export const ADMIN_INACTIVE_ID = "clock_admin_inactive";
export const ADMIN_REPORT_PREFIX = "clock_admin_report:";
export const ADMIN_REVIEW_SELECT_ID = "clock_admin_review";
export const ADMIN_APPROVE_PREFIX = "clock_admin_approve:";
export const ADMIN_REJECT_PREFIX = "clock_admin_reject:";
export const ADMIN_REJECT_MODAL_PREFIX = "clock_admin_reject_modal:";
export const ADMIN_CONFIG_MODAL_ID = "clock_admin_config_modal";

export const ACTIVITIES = [
  { value: "moderacao", label: "Moderação", emoji: "🛡️" },
  { value: "beta", label: "Acompanhamento dos Beta Testers", emoji: "🧪" },
  { value: "suporte", label: "Suporte aos jogadores", emoji: "🎧" },
  { value: "desenvolvimento", label: "Desenvolvimento do servidor", emoji: "🛠️" },
  { value: "outros", label: "Outras atividades", emoji: "📝" },
];

const CLOCK_COLOR = 0x5865f2;
const WARNING_COLOR = 0xfdd835;
const OK_COLOR = 0x57f287;
const DANGER_COLOR = 0xed4245;
const MAX_FIELD = 1024;
const MAX_DESCRIPTION = 4000;
const MAX_PENDING_OPTIONS = 25;

const activityLabel = (value) => ACTIVITIES.find((activity) => activity.value === value)?.label ?? value;
export const activityList = (values) => values.map(activityLabel).join(", ");

const TOTALS = (summary) => `⏰ ${formatDuration(summary.declaredSeconds)} · 🎮 ${formatDuration(summary.verifiedSeconds)}`;
const LEGEND = "⏰ **Ponto:** o que o membro declarou. 🎮 **Minecraft:** o que o servidor registrou.";

// As many lines as fit, saying how many were left out.
function fitLines(lines, max) {
  const kept = [];
  let length = 0;
  for (const [index, line] of lines.entries()) {
    const more = `\n… e mais ${lines.length - index}`;
    if (length + line.length + 1 + more.length > max) {
      kept.push(more.trim());
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
}

const statusText = (status, manual) =>
  ({
    [ClockStatus.OPEN]: "🟢 aberto",
    [ClockStatus.CLOSED]: "✅",
    [ClockStatus.PENDING]: "⏳ aguardando aprovação",
    [ClockStatus.APPROVED]: manual ? "✅ manual aprovado" : "✅ aprovado",
    [ClockStatus.REJECTED]: "❌ recusado",
  })[status];

function recordLine({ entry, verifiedSeconds }) {
  const end = entry.endedAt ? formatTime(entry.endedAt) : "agora";
  const duration = entry.endedAt ? ` (${formatDuration((entry.endedAt - entry.startedAt) / 1000)})` : "";
  const activities = entry.activities.length ? ` · ${activityList(entry.activities)}` : "";
  return `${statusText(entry.status, entry.manual)} ${formatDay(entry.startedAt)} ${formatTime(entry.startedAt)} → ${end}${duration} · 🎮 ${formatDuration(verifiedSeconds)}${activities}`;
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(START_BUTTON_ID).setLabel("Iniciar ponto").setEmoji("▶️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(FINISH_BUTTON_ID).setLabel("Finalizar ponto").setEmoji("🏁").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(HISTORY_BUTTON_ID).setLabel("Meu histórico").setEmoji("📋").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(MANUAL_BUTTON_ID).setLabel("Registro manual").setEmoji("📝").setStyle(ButtonStyle.Secondary),
  );
}

export function buildClockPanel() {
  const embed = new EmbedBuilder()
    .setColor(CLOCK_COLOR)
    .setTitle("🕒 Bate-ponto da Equipe")
    .setDescription(
      [
        "Registre aqui quando estiver trabalhando na equipe. É o que mostra quem realmente participa.",
        "",
        "▶️ **Iniciar ponto:** começa a contar agora.",
        "🏁 **Finalizar ponto:** para de contar e pergunta o que você fez.",
        "📋 **Meu histórico:** seus dias, horários e horas.",
        "📝 **Registro manual:** esqueceu de marcar? Peça para a administração aprovar.",
        "",
        "Seu tempo no Minecraft é contado sozinho, se a conta estiver vinculada com `/verificar`.",
        "Horários de Brasília. Ninguém é removido automaticamente por falta de registros.",
      ].join("\n"),
    );
  return { embeds: [embed], components: [panelButtons()] };
}

export function buildActivityPicker(open) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(ACTIVITY_SELECT_ID)
    .setPlaceholder("Escolha o que você fez")
    .setMinValues(1)
    .setMaxValues(ACTIVITIES.length)
    .addOptions(ACTIVITIES);
  const embed = baseEmbed().setDescription(`🏁 Ponto aberto desde **${formatDateTime(open.startedAt)}**.\nQuais atividades você realizou?`);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function textField(id, label, style, max, required, placeholder) {
  return new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(required).setPlaceholder(placeholder));
}

export function buildFinishModal(activities) {
  const required = activities.includes("outros");
  return new ModalBuilder()
    .setCustomId(`${FINISH_MODAL_PREFIX}${activities.join(",")}`)
    .setTitle("Finalizar ponto")
    .addComponents(textField("detalhes", required ? "O que você fez?" : "Detalhes (opcional)", TextInputStyle.Paragraph, 500, required, "Ex: respondi 3 tickets e acompanhei os testes"));
}

export function buildManualModal() {
  return new ModalBuilder()
    .setCustomId(MANUAL_MODAL_ID)
    .setTitle("Registro manual")
    .addComponents(
      textField("data", "Data", TextInputStyle.Short, 10, true, "03/11"),
      textField("inicio", "Início (horário de Brasília)", TextInputStyle.Short, 5, true, "14:30"),
      textField("fim", "Fim (horário de Brasília)", TextInputStyle.Short, 5, true, "16:00"),
      textField("detalhes", "O que você fez e por que não marcou?", TextInputStyle.Paragraph, 500, true, "Ex: moderei o Bedwars e esqueci de iniciar o ponto"),
    );
}

export function buildConfigModal(cfg) {
  const days = new TextInputBuilder().setCustomId("dias").setLabel("Dias sem presença até avisar (1 a 90)").setStyle(TextInputStyle.Short).setMaxLength(2).setValue(String(cfg.clockInactiveDays)).setRequired(true);
  const hours = new TextInputBuilder().setCustomId("horas").setLabel("Horas de um ponto até aprovação (1 a 72)").setStyle(TextInputStyle.Short).setMaxLength(2).setValue(String(cfg.clockMaxHours)).setRequired(true);
  return new ModalBuilder()
    .setCustomId(ADMIN_CONFIG_MODAL_ID)
    .setTitle("Configurar Bate-ponto")
    .addComponents(new ActionRowBuilder().addComponents(days), new ActionRowBuilder().addComponents(hours));
}

// The member's own history, on the panel's "Meu histórico" and on /ponto meu.
export function buildHistoryEmbed(name, { week, lastWeek, recent, from, to, linked }) {
  const days = week.days.map((key) => `${formatDayKey(key)}: ⏰ ${formatDuration(week.declaredByDay.get(key) ?? 0)} · 🎮 ${formatDuration(week.verifiedByDay.get(key) ?? 0)}`);
  const embed = baseEmbed()
    .setColor(CLOCK_COLOR)
    .setTitle(`📋 Histórico de ${name}`)
    .setDescription(`${LEGEND}\nSemana de ${formatDay(from)} a ${formatDay(new Date(to - 1))}, horário de Brasília.`)
    .addFields(
      { name: "Esta semana", value: `${TOTALS(week)}\n${week.days.length} dia(s) · ${week.accesses} acesso(s)`, inline: true },
      { name: "Semana passada", value: `${TOTALS(lastWeek)}\n${lastWeek.days.length} dia(s) · ${lastWeek.accesses} acesso(s)`, inline: true },
      { name: "Por dia", value: days.length ? fitLines(days, MAX_FIELD) : "Nada nesta semana ainda." },
      { name: "Últimos registros", value: recent.length ? fitLines(recent.map(recordLine), MAX_FIELD) : "Nenhum registro ainda." },
    );
  if (week.open) embed.addFields({ name: "🟢 Ponto aberto", value: `Desde ${formatDateTime(week.open.startedAt)}.` });
  if (!linked) embed.addFields({ name: "⚠️ Conta não vinculada", value: "Use `/verificar` para o seu tempo no Minecraft contar." });
  return embed;
}

export function buildMyView(name, data) {
  return { embeds: [buildHistoryEmbed(name, data)], components: [panelButtons()] };
}

function weekButtons(prefix, weeksAgo) {
  const buttons = [new ButtonBuilder().setCustomId(`${prefix}${weeksAgo + 1}`).setLabel("Semana anterior").setEmoji("◀️").setStyle(ButtonStyle.Secondary)];
  if (weeksAgo > 0) buttons.push(new ButtonBuilder().setCustomId(`${prefix}${weeksAgo - 1}`).setLabel("Semana seguinte").setEmoji("▶️").setStyle(ButtonStyle.Secondary));
  return buttons;
}

function memberLine({ member, summary, inactive }) {
  const marks = `${summary.open ? "🟢" : ""}${summary.online ? "🎮" : ""}${inactive ? "⚠️" : ""}`;
  return `${marks ? `${marks} ` : ""}**${escapeMarkdown(member.displayName)}**: ${TOTALS(summary)} · ${summary.days.length} dia(s) · ${summary.accesses} acesso(s)`;
}

// /ponto admin: everyone who has to clock, this week.
export function buildOverview({ rows, from, to, weeksAgo, pendingCount, inactiveCount }) {
  const body = rows.length ? fitLines(rows.map(memberLine), MAX_DESCRIPTION - LEGEND.length - 120) : "Ninguém tem os cargos que marcam presença. Escolha em `/painel` → Bate-ponto.";
  const embed = baseEmbed()
    .setColor(CLOCK_COLOR)
    .setTitle(`🛡️ Bate-ponto: ${formatDay(from)} a ${formatDay(new Date(to - 1))}`)
    .setDescription(`${LEGEND}\n🟢 ponto aberto · 🎮 no jogo agora · ⚠️ inativo\n\n${body}`);
  const select = new UserSelectMenuBuilder().setCustomId(`${ADMIN_MEMBER_SELECT_PREFIX}${weeksAgo}`).setPlaceholder("Ver os detalhes de um membro").setMinValues(1).setMaxValues(1);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        ...weekButtons(ADMIN_WEEK_PREFIX, weeksAgo),
        new ButtonBuilder().setCustomId(ADMIN_PENDING_ID).setLabel(`Pendentes (${pendingCount})`).setEmoji("⏳").setStyle(pendingCount ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ADMIN_INACTIVE_ID).setLabel(`Inativos (${inactiveCount})`).setEmoji("⚠️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${ADMIN_REPORT_PREFIX}${weeksAgo}`).setLabel("Publicar relatório").setEmoji("📊").setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function backRow(weeksAgo = 0) {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${ADMIN_WEEK_PREFIX}${weeksAgo}`).setLabel("Voltar ao painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary));
}

// One member's week, for the staff: every entry and exit, day by day.
export function buildMemberDetail({ discordId, name, summary, from, to, weeksAgo, linked, lastSeen }) {
  const days = summary.days.map((key) => `${formatDayKey(key)}: ⏰ ${formatDuration(summary.declaredByDay.get(key) ?? 0)} · 🎮 ${formatDuration(summary.verifiedByDay.get(key) ?? 0)}`);
  const stays = summary.stays.map((stay) => `${formatDay(new Date(stay.start))} ${formatTime(new Date(stay.start))} → ${stay.online ? "agora" : formatTime(new Date(stay.end))} (${formatDuration((stay.end - stay.start) / 1000)}) · ${stay.server}`);
  const activities = [...summary.activities.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => `${activityLabel(value)}: ${count}x`);
  const embed = baseEmbed()
    .setColor(CLOCK_COLOR)
    .setTitle(`👤 ${name}: ${formatDay(from)} a ${formatDay(new Date(to - 1))}`)
    .setDescription(`<@${discordId}>\n${LEGEND}`)
    .addFields(
      { name: "Na semana", value: `${TOTALS(summary)}\n${summary.days.length} dia(s) · ${summary.accesses} acesso(s)`, inline: true },
      { name: "Última presença", value: lastSeen ? formatDateTime(new Date(lastSeen)) : "Nenhuma registrada", inline: true },
      { name: "Por dia", value: days.length ? fitLines(days, MAX_FIELD) : "Nada nesta semana." },
      { name: "🎮 Entradas e saídas no Minecraft", value: stays.length ? fitLines(stays, MAX_FIELD) : linked ? "Nenhuma nesta semana." : "⚠️ Conta do jogo não vinculada: o Minecraft não tem como contar." },
      { name: "⏰ Registros de ponto", value: summary.records.length ? fitLines(summary.records.map(recordLine), MAX_FIELD) : "Nenhum nesta semana." },
      { name: "Atividades", value: activities.length ? fitLines(activities, MAX_FIELD) : "Nenhuma informada." },
    );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(...weekButtons(`${ADMIN_VIEW_PREFIX}${discordId}:`, weeksAgo), new ButtonBuilder().setCustomId(`${ADMIN_WEEK_PREFIX}${weeksAgo}`).setLabel("Voltar ao painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary))],
    allowedMentions: { parse: [] },
  };
}

function inactiveLine({ member, last, days }) {
  return `**${escapeMarkdown(member.displayName)}**: ${last ? `última presença em ${formatDateTime(new Date(last))} (${days} dias)` : `nenhuma presença registrada (${days} dias)`}`;
}

export function buildInactiveView(cfg, inactive) {
  const embed = baseEmbed()
    .setColor(WARNING_COLOR)
    .setTitle(`⚠️ Sem presença há ${cfg.clockInactiveDays} dias ou mais`)
    .setDescription(`${inactive.length ? fitLines(inactive.map(inactiveLine), MAX_DESCRIPTION) : "Ninguém. Todos estão em dia."}\n\nConte ponto e Minecraft. Verifique a situação de cada um antes de qualquer punição.`);
  return { embeds: [embed], components: [backRow()], allowedMentions: { parse: [] } };
}

export function buildPendingView(entries, names, total) {
  const embed = baseEmbed()
    .setColor(WARNING_COLOR)
    .setTitle(`⏳ Registros aguardando aprovação (${total})`)
    .setDescription(entries.length ? "Escolha um para ver os detalhes e responder." : "Nenhum registro aguardando.");
  const components = [];
  if (entries.length) {
    const options = entries.slice(0, MAX_PENDING_OPTIONS).map((entry) => ({
      value: String(entry.id),
      label: `${names.get(entry.discordId) ?? entry.discordId} · ${formatDay(entry.startedAt)} ${formatTime(entry.startedAt)}`.slice(0, 100),
      description: `${formatDuration((entry.endedAt - entry.startedAt) / 1000)} · ${entry.manual ? "registro manual" : "ponto muito longo"}`,
    }));
    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(ADMIN_REVIEW_SELECT_ID).setPlaceholder("Escolha um registro").addOptions(options)));
  }
  components.push(backRow());
  return { embeds: [embed], components };
}

// A record waiting for the staff, in their channel and on the panel. inPanel: with the way back to it.
export function buildEntryCard(entry, { name, verifiedSeconds, inPanel = false }) {
  const pending = entry.status === ClockStatus.PENDING;
  const color = pending ? WARNING_COLOR : entry.status === ClockStatus.REJECTED ? DANGER_COLOR : OK_COLOR;
  const embed = baseEmbed()
    .setColor(color)
    .setTitle(`${entry.manual ? "📝 Registro manual" : "⏰ Ponto muito longo"} #${entry.id}: ${statusText(entry.status, entry.manual)}`)
    .addFields(
      { name: "Membro", value: `<@${entry.discordId}> (${name})` },
      { name: "⏰ Declarado", value: `${formatDateTime(entry.startedAt)} → ${formatDateTime(entry.endedAt)}\n${formatDuration((entry.endedAt - entry.startedAt) / 1000)}`, inline: true },
      { name: "🎮 No Minecraft nesse período", value: formatDuration(verifiedSeconds), inline: true },
    );
  if (entry.activities.length) embed.addFields({ name: "Atividades", value: activityList(entry.activities) });
  if (entry.details) embed.addFields({ name: "O que disse", value: entry.details.slice(0, MAX_FIELD) });
  if (entry.reviewedBy) embed.addFields({ name: "Respondido por", value: `<@${entry.reviewedBy}>${entry.reviewNote ? `\nMotivo: ${entry.reviewNote}` : ""}`.slice(0, MAX_FIELD) });

  const components = [];
  if (pending) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${ADMIN_APPROVE_PREFIX}${entry.id}`).setLabel("Aprovar").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${ADMIN_REJECT_PREFIX}${entry.id}`).setLabel("Recusar").setEmoji("❌").setStyle(ButtonStyle.Danger),
      ),
    );
  }
  if (inPanel) components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(ADMIN_PENDING_ID).setLabel("Voltar aos pendentes").setEmoji("⬅️").setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

export function buildRejectModal(id) {
  return new ModalBuilder()
    .setCustomId(`${ADMIN_REJECT_MODAL_PREFIX}${id}`)
    .setTitle("Recusar registro")
    .addComponents(textField("motivo", "Motivo (o membro vai ver)", TextInputStyle.Paragraph, 500, true, "Ex: nesse horário não há nada no Minecraft nem nos tickets"));
}

// The answer the member gets in private.
export function buildReviewDm(entry) {
  const approved = entry.status === ClockStatus.APPROVED;
  const lines = [`Seu registro de ${formatDateTime(entry.startedAt)} a ${formatDateTime(entry.endedAt)} foi **${approved ? "aprovado" : "recusado"}**.`];
  if (entry.reviewNote) lines.push(`Motivo: ${entry.reviewNote}`);
  return baseEmbed().setColor(approved ? OK_COLOR : DANGER_COLOR).setTitle("🕒 Bate-ponto").setDescription(lines.join("\n"));
}

// The warning to the staff. It only informs: nothing happens to anyone by itself.
export function buildAlertEmbed(cfg, inactive, longOpen, names, now) {
  const parts = [];
  if (inactive.length) parts.push(`**Sem registrar presença há ${cfg.clockInactiveDays} dias ou mais (ponto e Minecraft):**\n${fitLines(inactive.map(inactiveLine), 2500)}`);
  if (longOpen.length) {
    const lines = longOpen.map((entry) => `**${escapeMarkdown(names.get(entry.discordId) ?? entry.discordId)}**: aberto há ${formatDuration((now - entry.startedAt) / 1000)}, desde ${formatDateTime(entry.startedAt)}`);
    parts.push(`**Ponto aberto há mais de ${cfg.clockMaxHours}h (pode ter esquecido):**\n${fitLines(lines, 1000)}`);
  }
  parts.push("Verifique a situação de cada um antes de qualquer punição. Ninguém é removido automaticamente.");
  return baseEmbed().setColor(WARNING_COLOR).setTitle("⚠️ Bate-ponto: verificar equipe").setDescription(parts.join("\n\n"));
}

export function buildReportEmbed({ active, inactive, from, to, pendingCount }) {
  const line = ({ member, summary }) => `**${escapeMarkdown(member.displayName)}**: ${TOTALS(summary)} · ${summary.days.length} dia(s) · ${summary.accesses} acesso(s)`;
  const declared = active.reduce((sum, row) => sum + row.summary.declaredSeconds, 0);
  const verified = active.reduce((sum, row) => sum + row.summary.verifiedSeconds, 0);
  const parts = [LEGEND, `**Total da equipe:** ⏰ ${formatDuration(declared)} · 🎮 ${formatDuration(verified)}`];
  parts.push(`**🟢 Ativos (${active.length})**\n${active.length ? fitLines(active.map(line), 2300) : "Ninguém."}`);
  parts.push(`**⚠️ Sem presença na semana (${inactive.length})**\n${inactive.length ? fitLines(inactive.map(({ member }) => `**${escapeMarkdown(member.displayName)}**`), 900) : "Ninguém."}`);
  if (pendingCount) parts.push(`⏳ **${pendingCount}** registro(s) aguardando aprovação não entram nas horas até serem aprovados.`);
  parts.push("Dias, horários e atividades de cada um estão no arquivo anexo. Nenhum membro é removido automaticamente.");
  return baseEmbed().setColor(CLOCK_COLOR).setTitle(`📊 Relatório do bate-ponto: ${formatDay(from)} a ${formatDay(new Date(to - 1))}`).setDescription(parts.join("\n\n"));
}

// The report's attachment: everything, member by member, as plain text. Hours in Brasília.
export function buildReportText(rows, from, to) {
  const out = [`RELATORIO DO BATE-PONTO: ${formatDay(from)} a ${formatDay(new Date(to - 1))} (horario de Brasilia)`, "Ponto = declarado pelo membro. Minecraft = registrado pelo servidor.", ""];
  for (const { member, summary } of rows) {
    out.push(`=== ${member.displayName} ===`);
    out.push(`Ponto: ${formatDuration(summary.declaredSeconds)} | Minecraft: ${formatDuration(summary.verifiedSeconds)} | Dias: ${summary.days.length} | Acessos: ${summary.accesses}`);
    if (summary.days.length) {
      out.push("Por dia:");
      for (const key of summary.days) out.push(`  ${formatDayKey(key)}: ponto ${formatDuration(summary.declaredByDay.get(key) ?? 0)}, minecraft ${formatDuration(summary.verifiedByDay.get(key) ?? 0)}`);
    }
    if (summary.stays.length) {
      out.push("Entradas e saidas no Minecraft:");
      for (const stay of summary.stays) out.push(`  ${formatDateTime(new Date(stay.start))} -> ${stay.online ? "agora" : formatDateTime(new Date(stay.end))} (${formatDuration((stay.end - stay.start) / 1000)}) ${stay.server}`);
    }
    if (summary.records.length) {
      out.push("Registros de ponto:");
      for (const { entry, verifiedSeconds } of summary.records) {
        const when = `${formatDateTime(entry.startedAt)} -> ${entry.endedAt ? formatDateTime(entry.endedAt) : "aberto"}`;
        const activities = entry.activities.length ? ` | ${activityList(entry.activities)}` : "";
        const details = entry.details ? ` | ${entry.details.replace(/\s+/g, " ")}` : "";
        out.push(`  [${entry.status}${entry.manual ? " manual" : ""}] ${when} | minecraft ${formatDuration(verifiedSeconds)}${activities}${details}`);
      }
    }
    out.push("");
  }
  return out.join("\n");
}
