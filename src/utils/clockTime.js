// The time clock's dates and times: always Brasília's, whatever clock the bot's machine runs on. A week goes from Monday
// to Sunday.
const TIME_ZONE = "America/Sao_Paulo";
const MAX_MANUAL_DAYS = 30;
const HOUR_MS = 60 * 60 * 1000;

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, weekday: "short" });
const pad = (value) => String(value).padStart(2, "0");

function zoned(date) {
  const parts = {};
  for (const { type, value } of partsFormat.formatToParts(date)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return parts;
}

// That moment on Brasília's clock. A day or month past the end carries over, like Date.UTC.
export function fromBrasilia(year, month, day, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const seen = zoned(new Date(guess));
  const offset = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second) - guess;
  return new Date(guess - offset);
}

export function dayKey(date) {
  const { year, month, day } = zoned(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function hourOf(date) {
  return zoned(date).hour;
}

export function nextDay(date) {
  const { year, month, day } = zoned(date);
  return fromBrasilia(year, month, day + 1);
}

// The Monday that starts the week of this date, or of that many weeks before it.
export function weekStart(date, weeksAgo = 0) {
  const { year, month, day } = zoned(date);
  const sinceMonday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return fromBrasilia(year, month, day - sinceMonday - 7 * weeksAgo);
}

export function weekEnd(start) {
  const { year, month, day } = zoned(start);
  return fromBrasilia(year, month, day + 7);
}

export function formatDay(date) {
  const { month, day } = zoned(date);
  return `${pad(day)}/${pad(month)}`;
}

export function formatTime(date) {
  const { hour, minute } = zoned(date);
  return `${pad(hour)}:${pad(minute)}`;
}

export function formatDateTime(date) {
  const { year, month, day, hour, minute } = zoned(date);
  return `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}`;
}

// "seg 03/11", from a dayKey.
export function formatDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = fromBrasilia(year, month, day, 12);
  return `${weekdayFormat.format(date).replace(".", "")} ${formatDay(date)}`;
}

export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${pad(minutes % 60)}min` : `${minutes}min`;
}

function parseClock(text) {
  const match = text.trim().match(/^(\d{1,2})(?:[:hH](\d{2})?)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

// A manual record as typed in the form: { start, end }, or { error } in words for the member. An end before the start
// means they went past midnight.
export function parseManualTimes(dateText, startText, endText, now) {
  const match = dateText.trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
  if (!match) return { error: "A data precisa ser como **03/11** ou **03/11/2026**." };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3].padStart(4, "20")) : zoned(now).year;
  const first = parseClock(startText);
  const last = parseClock(endText);
  if (!first || !last) return { error: "Os horários precisam ser como **14:30**." };

  const start = fromBrasilia(year, month, day, first.hour, first.minute);
  const seen = zoned(start);
  if (seen.day !== day || seen.month !== month) return { error: "Essa data não existe." };
  let end = fromBrasilia(year, month, day, last.hour, last.minute);
  if (end <= start) end = fromBrasilia(year, month, day + 1, last.hour, last.minute);

  if (end > now) return { error: "O registro não pode terminar no futuro." };
  if (now - start > MAX_MANUAL_DAYS * 24 * HOUR_MS) return { error: `Só dá para pedir registros dos últimos ${MAX_MANUAL_DAYS} dias.` };
  return { start, end };
}
