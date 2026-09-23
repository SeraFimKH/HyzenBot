const UNIT_MINUTES = { m: 1, h: 60, d: 1440, w: 10080 };

// "1d12h", "30m", "2h" → minutes. Accepts multiple units concatenated (matches the same shorthand players
// already see in-game punishment messages). Returns null if the string doesn't parse as a valid duration.
export function parseDurationToMinutes(raw) {
  const trimmed = raw.trim().toLowerCase();
  const matches = [...trimmed.matchAll(/(\d+)\s*([mhdw])/g)];
  if (!matches.length) return null;

  const consumed = matches.reduce((sum, m) => sum + m[0].length, 0);
  if (consumed !== trimmed.replace(/\s+/g, "").length) return null;

  const totalMinutes = matches.reduce((sum, m) => sum + Number(m[1]) * UNIT_MINUTES[m[2]], 0);
  return totalMinutes > 0 ? totalMinutes : null;
}

export function formatMinutes(totalMinutes) {
  const weeks = Math.floor(totalMinutes / 10080);
  const days = Math.floor((totalMinutes % 10080) / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (weeks) parts.push(`${weeks}sem`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}min`);
  return parts.length ? parts.join(" ") : "0min";
}
