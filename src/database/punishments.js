import { pool } from "./pool.js";

// Mirrors the schema in HyzenStaff/migrations/V1__create_hyzen_staff_tables.sql — one hyzen_punishments row
// per action (BAN/TEMPBAN/MUTE/TEMPMUTE/KICK/WARN), "active" meaning not revoked and not (yet) expired.
export const PunishmentType = {
  BAN: "BAN",
  TEMPBAN: "TEMPBAN",
  MUTE: "MUTE",
  TEMPMUTE: "TEMPMUTE",
  KICK: "KICK",
  WARN: "WARN",
};

const BAN_TYPES = [PunishmentType.BAN, PunishmentType.TEMPBAN];
const MUTE_TYPES = [PunishmentType.MUTE, PunishmentType.TEMPMUTE];

async function findActive(playerId, types) {
  const result = await pool.query(
    `SELECT id, type, reason, staff_id, server, created_at, expires_at
     FROM hyzen_punishments
     WHERE player_id = $1 AND type = ANY($2) AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC
     LIMIT 1`,
    [playerId, types],
  );
  return result.rows[0] || null;
}

export function findActiveBan(playerId) {
  return findActive(playerId, BAN_TYPES);
}

export function findActiveMute(playerId) {
  return findActive(playerId, MUTE_TYPES);
}

// expiresInMinutes null = permanent (BAN/MUTE/KICK/WARN); a number = TEMPBAN/TEMPMUTE.
export async function insertPunishment({ playerId, type, reason, staffId, server = null, expiresInMinutes = null }) {
  const result = await pool.query(
    `INSERT INTO hyzen_punishments (player_id, type, reason, staff_id, server, expires_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::double precision IS NULL THEN NULL ELSE now() + ($6 || ' minutes')::interval END)
     RETURNING id, type, reason, staff_id, server, created_at, expires_at`,
    [playerId, type, reason, staffId, server, expiresInMinutes],
  );
  return result.rows[0];
}

// Revokes every currently-active row of the given types for a player (so /unban also clears a stray duplicate
// active ban row rather than only the newest one) — returns how many rows were revoked.
export async function revokeActive(playerId, types, revokedBy) {
  const result = await pool.query(
    `UPDATE hyzen_punishments
     SET revoked_at = now(), revoked_by = $3
     WHERE player_id = $1 AND type = ANY($2) AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())`,
    [playerId, types, revokedBy],
  );
  return result.rowCount;
}

export function revokeActiveBan(playerId, revokedBy) {
  return revokeActive(playerId, BAN_TYPES, revokedBy);
}

export function revokeActiveMute(playerId, revokedBy) {
  return revokeActive(playerId, MUTE_TYPES, revokedBy);
}

export async function insertWarn({ playerId, reason, staffId, server = null }) {
  return insertPunishment({ playerId, type: PunishmentType.WARN, reason, staffId, server });
}

export async function insertKick({ playerId, reason, staffId, server = null }) {
  return insertPunishment({ playerId, type: PunishmentType.KICK, reason, staffId, server });
}

export async function countActiveWarnings(playerId) {
  const result = await pool.query(
    `SELECT count(*)::int AS count FROM hyzen_punishments WHERE player_id = $1 AND type = 'WARN' AND revoked_at IS NULL`,
    [playerId],
  );
  return result.rows[0].count;
}

export async function findHistory(playerId, limit = 10) {
  const result = await pool.query(
    `SELECT id, type, reason, staff_id, server, created_at, expires_at, revoked_at, revoked_by
     FROM hyzen_punishments
     WHERE player_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [playerId, limit],
  );
  return result.rows;
}
