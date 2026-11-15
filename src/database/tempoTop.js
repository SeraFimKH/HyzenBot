import { pool } from "./pool.js";

// The hours ranking, read from HyzenTempo's tables (the game plugin writes them; same SQL as its /tophoras): this
// week's and this month's active minutes add up hyzen_tempo_days, all time reads hyzen_tempo.total_minutes. Brazil's
// calendar; only time spent playing counts (a player standing still doesn't).

const UNDEFINED_TABLE = "42P01";

export const PERIODS = {
  semana: { label: "Esta semana", from: "date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date" },
  mes: { label: "Este mês", from: "date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date" },
  geral: { label: "Geral", from: null },
};

export class TempoTablesMissingError extends Error {}

function totals(period) {
  const from = PERIODS[period].from;
  return from
    ? `SELECT player_id, SUM(minutes) AS minutes FROM hyzen_tempo_days WHERE day >= ${from} GROUP BY player_id`
    : "SELECT player_id, total_minutes AS minutes FROM hyzen_tempo";
}

async function query(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === UNDEFINED_TABLE) throw new TempoTablesMissingError();
    throw err;
  }
}

// [{ id, name, minutes }] — the first `limit` players of the period.
export async function topHours(period, limit = 10) {
  const result = await query(
    `SELECT p.id, p.name, totals.minutes::bigint AS minutes FROM (${totals(period)}) totals
     JOIN hyzen_players p ON p.id = totals.player_id WHERE totals.minutes > 0
     ORDER BY totals.minutes DESC, p.name LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({ id: Number(row.id), name: row.name, minutes: Number(row.minutes) }));
}

// { position, minutes } of one player in the period (ties share the place), or null without time in it.
export async function standingOf(period, playerId) {
  const result = await query(
    `WITH totals AS (${totals(period)})
     SELECT (SELECT COUNT(*) FROM totals o WHERE o.minutes > me.minutes) + 1 AS position, me.minutes::bigint AS minutes
     FROM totals me WHERE me.player_id = $1 AND me.minutes > 0`,
    [playerId],
  );
  const row = result.rows[0];
  return row ? { position: Number(row.position), minutes: Number(row.minutes) } : null;
}
