import { ClockStatus } from "../database/clock.js";
import { dayKey, nextDay } from "../utils/clockTime.js";

// The sums behind the time clock's views and reports, from the records (declared) and the stays in the game (verified).
// The two are never added together. Only math here: nothing to read, nothing to send.

// A stay nobody closed and not renewed for this long is a server that stopped: it ended when it was last seen.
const FRESH_MS = 5 * 60 * 1000;
// Moving between servers isn't leaving: the stays on each are one access.
const SAME_ACCESS_GAP_MS = 60 * 1000;
// Waiting for the staff, or refused, a record counts no hours.
const COUNTED = [ClockStatus.CLOSED, ClockStatus.APPROVED];

export function isOnline(session, now) {
  return !session.leftAt && now - session.lastSeen.getTime() <= FRESH_MS;
}

function stayEnd(session, now) {
  if (session.leftAt) return session.leftAt.getTime();
  return isOnline(session, now) ? now : session.lastSeen.getTime();
}

function mergeIntervals(intervals, gapMs = 0) {
  const merged = [];
  for (const { start, end } of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && start <= last.end + gapMs) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }
  return merged;
}

const clipped = (intervals, from, to) =>
  intervals.map(({ start, end }) => ({ start: Math.max(start, from), end: Math.min(end, to) })).filter(({ start, end }) => end > start);

const totalSeconds = (intervals) => Math.floor(intervals.reduce((sum, { start, end }) => sum + (end - start), 0) / 1000);

// dayKey → seconds, cutting at each midnight in Brasília.
function secondsByDay(intervals) {
  const days = new Map();
  for (const { start, end } of intervals) {
    let at = start;
    while (at < end) {
      const until = Math.min(end, nextDay(new Date(at)).getTime());
      const key = dayKey(new Date(at));
      days.set(key, (days.get(key) ?? 0) + (until - at) / 1000);
      at = until;
    }
  }
  return days;
}

export function overlapSeconds(start, end, intervals) {
  return totalSeconds(clipped(intervals, start, end));
}

export function stayIntervals(sessions, now) {
  return mergeIntervals(sessions.map((session) => ({ start: session.joinedAt.getTime(), end: stayEnd(session, now) })));
}

// One member's period. Times that overlap count once: a manual record over a clocked one, or two servers at once.
export function summarize(entries, sessions, from, to, now) {
  const start = from.getTime();
  const end = to.getTime();
  const counted = entries.filter((entry) => COUNTED.includes(entry.status) && entry.endedAt);
  const declared = clipped(mergeIntervals(counted.map((entry) => ({ start: entry.startedAt.getTime(), end: entry.endedAt.getTime() }))), start, end);
  const allStays = stayIntervals(sessions, now);
  const verified = clipped(allStays, start, end);
  const activities = new Map();
  for (const entry of counted) {
    for (const activity of entry.activities) activities.set(activity, (activities.get(activity) ?? 0) + 1);
  }
  const declaredByDay = secondsByDay(declared);
  const verifiedByDay = secondsByDay(verified);

  return {
    declaredSeconds: totalSeconds(declared),
    verifiedSeconds: totalSeconds(verified),
    accesses: clipped(mergeIntervals(allStays, SAME_ACCESS_GAP_MS), start, end).length,
    declaredByDay,
    verifiedByDay,
    days: [...new Set([...declaredByDay.keys(), ...verifiedByDay.keys()])].sort(),
    activities,
    stays: sessions
      .map((session) => ({ start: session.joinedAt.getTime(), end: stayEnd(session, now), server: session.server, online: isOnline(session, now) }))
      .filter((stay) => stay.end > start && stay.start < end),
    records: entries.map((entry) => ({
      entry,
      verifiedSeconds: overlapSeconds(entry.startedAt.getTime(), entry.endedAt?.getTime() ?? now, allStays),
    })),
    open: entries.find((entry) => entry.status === ClockStatus.OPEN) ?? null,
    pending: entries.filter((entry) => entry.status === ClockStatus.PENDING).length,
    online: sessions.some((session) => isOnline(session, now)),
  };
}
