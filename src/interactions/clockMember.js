import { MessageFlags } from "discord.js";
import { addManualEntry, ClockStatus, ClockTableMissingError, finishEntry, findOpenEntry, listRecentEntries, startEntry } from "../database/clock.js";
import { findLinkedPlayerName } from "../database/auth.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { CLOCK_TABLE_MISSING, entryVerifiedSeconds, isClockMember, periodSummaries, postEntryCard } from "../services/clock.js";
import { formatDateTime, formatDuration, formatTime, parseManualTimes, weekEnd, weekStart } from "../utils/clockTime.js";
import {
  ACTIVITIES,
  ACTIVITY_SELECT_ID,
  activityList,
  buildActivityPicker,
  buildFinishModal,
  buildHistoryEmbed,
  buildManualModal,
  buildMyView,
  FINISH_BUTTON_ID,
  FINISH_MODAL_PREFIX,
  HISTORY_BUTTON_ID,
  MANUAL_BUTTON_ID,
  MANUAL_MODAL_ID,
  START_BUTTON_ID,
} from "../utils/clockViews.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";

// The panel's buttons (Iniciar, Finalizar, Meu histórico, Registro manual) and /ponto meu: what a member does on the clock.

const HOUR_MS = 60 * 60 * 1000;
const RECENT_RECORDS = 8;

function notAllowed(interaction, cfg) {
  if (isClockMember(interaction.member, cfg)) return null;
  return cfg.clockRoles.length ? "Você não está em um cargo que marca presença." : "Nenhum cargo marca presença ainda. A administração escolhe em `/painel` → Bate-ponto.";
}

function answer(interaction, payload) {
  const content = { components: [], ...payload };
  return interaction.deferred || interaction.replied ? interaction.editReply(content) : interaction.reply({ ...content, flags: MessageFlags.Ephemeral });
}

// Without HyzenCore's tables yet, it says so instead of the generic error.
async function guarded(interaction, run) {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof ClockTableMissingError)) throw err;
    return answer(interaction, { embeds: [errorEmbed(CLOCK_TABLE_MISSING)] });
  }
}

const isLinked = (discordId) => findLinkedPlayerName(discordId).then(Boolean, () => false);

export async function historyData(discordId, now = new Date()) {
  const from = weekStart(now);
  const to = weekEnd(from);
  const lastFrom = weekStart(now, 1);
  const [current, previous, recent, linked] = await Promise.all([
    periodSummaries([discordId], from, to, now.getTime()),
    periodSummaries([discordId], lastFrom, from, now.getTime()),
    listRecentEntries(discordId, RECENT_RECORDS),
    isLinked(discordId),
  ]);
  const week = current.get(discordId);
  const records = await Promise.all(recent.map(async (entry) => ({ entry, verifiedSeconds: await entryVerifiedSeconds(entry, now.getTime()) })));
  return { week, lastWeek: previous.get(discordId), recent: records, from, to, linked };
}

// /ponto meu.
export async function showMyClock(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const refusal = notAllowed(interaction, cfg);
  if (refusal) return answer(interaction, { embeds: [errorEmbed(refusal)] });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return guarded(interaction, async () => interaction.editReply(buildMyView(interaction.member.displayName, await historyData(interaction.user.id))));
}

export async function handleButton(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const refusal = notAllowed(interaction, cfg);
  if (refusal) return answer(interaction, { embeds: [errorEmbed(refusal)] });

  // Nothing may be awaited before a form opens.
  if (interaction.customId === MANUAL_BUTTON_ID) return interaction.showModal(buildManualModal());

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return guarded(interaction, async () => {
    if (interaction.customId === START_BUTTON_ID) return start(interaction);
    if (interaction.customId === FINISH_BUTTON_ID) return askActivities(interaction);
    if (interaction.customId === HISTORY_BUTTON_ID) {
      return interaction.editReply({ embeds: [buildHistoryEmbed(interaction.member.displayName, await historyData(interaction.user.id))], components: [] });
    }
  });
}

async function start(interaction) {
  const entry = await startEntry(interaction.user.id);
  if (!entry) {
    const open = await findOpenEntry(interaction.user.id);
    return interaction.editReply({ embeds: [errorEmbed(`Você já tem um ponto aberto desde **${open ? formatDateTime(open.startedAt) : "agora"}**. Finalize antes de iniciar outro.`)] });
  }
  const hint = (await isLinked(interaction.user.id)) ? "" : "\n⚠️ Sua conta do jogo não está vinculada: use `/verificar` para o tempo no Minecraft contar.";
  return interaction.editReply({ embeds: [successEmbed(`Ponto iniciado às **${formatTime(entry.startedAt)}** (horário de Brasília). Bom trabalho!${hint}`)] });
}

async function askActivities(interaction) {
  const open = await findOpenEntry(interaction.user.id);
  if (!open) return interaction.editReply({ embeds: [errorEmbed("Você não tem nenhum ponto aberto.")] });
  return interaction.editReply(buildActivityPicker(open));
}

export async function handleSelect(interaction) {
  if (interaction.customId !== ACTIVITY_SELECT_ID) return;
  const refusal = notAllowed(interaction, getGuildConfig(interaction.guildId));
  if (refusal) return answer(interaction, { embeds: [errorEmbed(refusal)] });
  return interaction.showModal(buildFinishModal(interaction.values));
}

export async function handleModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const refusal = notAllowed(interaction, cfg);
  if (refusal) return answer(interaction, { embeds: [errorEmbed(refusal)] });
  if (interaction.customId === MANUAL_MODAL_ID) return submitManual(interaction, cfg);
  if (interaction.customId.startsWith(FINISH_MODAL_PREFIX)) return finish(interaction, cfg);
}

async function finish(interaction, cfg) {
  const known = ACTIVITIES.map((activity) => activity.value);
  const activities = interaction.customId.slice(FINISH_MODAL_PREFIX.length).split(",").filter((value) => known.includes(value));
  const details = interaction.fields.getTextInputValue("detalhes").trim();
  // From the activity list, so that message is the one that shows the result.
  await interaction.deferUpdate();
  return guarded(interaction, async () => {
    const open = await findOpenEntry(interaction.user.id);
    if (!open) return interaction.editReply({ embeds: [errorEmbed("Esse ponto já foi finalizado.")], components: [] });
    // Forgotten open for this long, the hours wait for someone to confirm them instead of counting by themselves.
    const tooLong = Date.now() - open.startedAt >= cfg.clockMaxHours * HOUR_MS;
    const entry = await finishEntry(open.id, { activities, details, status: tooLong ? ClockStatus.PENDING : ClockStatus.CLOSED });
    if (!entry) return interaction.editReply({ embeds: [errorEmbed("Esse ponto já foi finalizado.")], components: [] });

    const seconds = (entry.endedAt - entry.startedAt) / 1000;
    const verified = await entryVerifiedSeconds(entry);
    const lines = [
      `Ponto finalizado: **${formatDuration(seconds)}**, de ${formatDateTime(entry.startedAt)} a ${formatTime(entry.endedAt)}.`,
      `🎮 No Minecraft nesse período: **${formatDuration(verified)}**.`,
      `Atividades: ${activityList(entry.activities)}.`,
    ];
    if (tooLong) {
      await postEntryCard(interaction.client, interaction.guildId, entry);
      lines.push(`⏳ Passou de ${cfg.clockMaxHours}h, então foi para aprovação da administração antes de contar nas horas.`);
    }
    return interaction.editReply({ embeds: [(tooLong ? errorEmbed : successEmbed)(lines.join("\n")).setColor(tooLong ? 0xfdd835 : 0x57f287)], components: [] });
  });
}

async function submitManual(interaction, cfg) {
  const times = parseManualTimes(
    interaction.fields.getTextInputValue("data"),
    interaction.fields.getTextInputValue("inicio"),
    interaction.fields.getTextInputValue("fim"),
    new Date(),
  );
  if (times.error) return answer(interaction, { embeds: [errorEmbed(times.error)] });
  if (times.end - times.start >= cfg.clockMaxHours * HOUR_MS) {
    return answer(interaction, { embeds: [errorEmbed(`Um registro manual pode ter no máximo ${cfg.clockMaxHours}h. Se foi mais, envie em partes.`)] });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return guarded(interaction, async () => {
    const entry = await addManualEntry(interaction.user.id, times.start, times.end, interaction.fields.getTextInputValue("detalhes").trim());
    await postEntryCard(interaction.client, interaction.guildId, entry);
    return interaction.editReply({ embeds: [successEmbed(`Registro de **${formatDateTime(entry.startedAt)}** a **${formatTime(entry.endedAt)}** enviado para aprovação. Ele conta nas horas depois de aprovado, e você recebe a resposta em privado.`)] });
  });
}

