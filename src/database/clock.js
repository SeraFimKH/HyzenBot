import { pool } from "./pool.js";

// The time clock as the database has it (HyzenCore/migrations/V8__create_hyzen_clock.sql). hyzen_clock_entries is what the
// members declare, written here; hyzen_play_sessions is what the game saw, written by HyzenCore and only read here, tied
// to a member through their linked account (hyzen_auth_links). Nothing is ever deleted.

export const ClockStatus = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

// The HyzenCore that creates the tables hasn't started yet.
export class ClockTableMissingError extends Error {}

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";

async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === UNDEFINED_TABLE || err.code === UNDEFINED_COLUMN) throw new ClockTableMissingError();
    throw err;
  }
}

const toEntry = (row) => ({
  id: Number(row.id),
  discordId: row.discord_id,
  manual: row.manual,
  status: row.status,
  startedAt: new Date(row.started_at),
  endedAt: row.ended_at ? new Date(row.ended_at) : null,
  activities: row.activities ? row.activities.split(",") : [],
  details: row.details,
  reviewedBy: row.reviewed_by,
  reviewNote: row.review_note,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
  cardChannelId: row.card_channel_id,
  cardMessageId: row.card_message_id,
});

// The new open record, or null when they already have one: the database's unique index decides, even for two clicks at once.
export async function startEntry(discordId) {
  const result = await query(
    `INSERT INTO hyzen_clock_entries (discord_id, status, started_at) VALUES ($1, $2, now())
     ON CONFLICT (discord_id) WHERE status = 'OPEN' DO NOTHING RETURNING *`,
    [discordId, ClockStatus.OPEN],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export async function findOpenEntry(discordId) {
  const result = await query("SELECT * FROM hyzen_clock_entries WHERE discord_id = $1 AND status = $2", [discordId, ClockStatus.OPEN]);
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

// Null when it was already finished.
export async function finishEntry(id, { activities, details, status }) {
  const result = await query(
    `UPDATE hyzen_clock_entries SET ended_at = now(), activities = $2, details = $3, status = $4
     WHERE id = $1 AND status = 'OPEN' RETURNING *`,
    [id, activities.join(","), details, status],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export async function addManualEntry(discordId, start, end, details) {
  const result = await query(
    `INSERT INTO hyzen_clock_entries (discord_id, manual, status, started_at, ended_at, details)
     VALUES ($1, true, $2, $3, $4, $5) RETURNING *`,
    [discordId, ClockStatus.PENDING, start, end, details],
  );
  return toEntry(result.rows[0]);
}

export async function getEntry(id) {
  const result = await query("SELECT * FROM hyzen_clock_entries WHERE id = $1", [id]);
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export async function setEntryCard(id, channelId, messageId) {
  await query("UPDATE hyzen_clock_entries SET card_channel_id = $2, card_message_id = $3 WHERE id = $1", [id, channelId, messageId]);
}

// Null when someone else answered first.
export async function reviewEntry(id, status, reviewerId, note) {
  const result = await query(
    `UPDATE hyzen_clock_entries SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now()
     WHERE id = $1 AND status = 'PENDING' RETURNING *`,
    [id, status, reviewerId, note],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

// Every record of these members touching the period.
export async function listEntries(discordIds, from, to) {
  const result = await query(
    `SELECT * FROM hyzen_clock_entries
     WHERE discord_id = ANY($1) AND started_at < $3 AND COALESCE(ended_at, now()) > $2 ORDER BY started_at`,
    [discordIds, from, to],
  );
  return result.rows.map(toEntry);
}

export async function listRecentEntries(discordId, limit) {
  const result = await query("SELECT * FROM hyzen_clock_entries WHERE discord_id = $1 ORDER BY started_at DESC LIMIT $2", [discordId, limit]);
  return result.rows.map(toEntry);
}

export async function listPendingEntries(limit) {
  const result = await query("SELECT * FROM hyzen_clock_entries WHERE status = 'PENDING' ORDER BY created_at LIMIT $1", [limit]);
  return result.rows.map(toEntry);
}

export async function countPendingEntries() {
  const result = await query("SELECT count(*) AS total FROM hyzen_clock_entries WHERE status = 'PENDING'");
  return Number(result.rows[0].total);
}

export async function listOpenEntries(discordIds) {
  const result = await query("SELECT * FROM hyzen_clock_entries WHERE status = 'OPEN' AND discord_id = ANY($1)", [discordIds]);
  return result.rows.map(toEntry);
}

// The stays in the game touching the period, of the members with a linked account.
export async function listSessions(discordIds, from, to) {
  const result = await query(
    `SELECT l.discord_id, s.server, s.joined_at, s.last_seen, s.left_at FROM hyzen_play_sessions s
     JOIN hyzen_auth_links l ON l.player_id = s.player_id
     WHERE l.discord_id = ANY($1) AND s.joined_at < $3 AND COALESCE(s.left_at, s.last_seen) > $2 ORDER BY s.joined_at`,
    [discordIds, from, to],
  );
  return result.rows.map((row) => ({
    discordId: row.discord_id,
    server: row.server,
    joinedAt: new Date(row.joined_at),
    lastSeen: new Date(row.last_seen),
    leftAt: row.left_at ? new Date(row.left_at) : null,
  }));
}

// discord id → when they last showed up, in ms: a record that counts, or a stay in the game. A record still waiting for
// the staff isn't presence yet.
export async function lastPresence(discordIds) {
  const [entries, sessions] = await Promise.all([
    query(
      `SELECT discord_id, MAX(COALESCE(ended_at, started_at)) AS last FROM hyzen_clock_entries
       WHERE discord_id = ANY($1) AND status IN ('OPEN', 'CLOSED', 'APPROVED') GROUP BY discord_id`,
      [discordIds],
    ),
    query(
      `SELECT l.discord_id, MAX(s.last_seen) AS last FROM hyzen_play_sessions s
       JOIN hyzen_auth_links l ON l.player_id = s.player_id WHERE l.discord_id = ANY($1) GROUP BY l.discord_id`,
      [discordIds],
    ),
  ]);
  const last = new Map();
  for (const row of [...entries.rows, ...sessions.rows]) {
    last.set(row.discord_id, Math.max(last.get(row.discord_id) ?? 0, new Date(row.last).getTime()));
  }
  return last;
}
