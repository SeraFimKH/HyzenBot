import { pool } from "./pool.js";

// Read-only view of HyzenStaff's hyzen_ip_bans (V1 + V2__add_player_to_ip_bans.sql) for the punishment feed —
// IP bans only ever come from the game (/punir ... ipban), this bot never writes them.

export async function latestIpBanId() {
  const result = await pool.query(`SELECT COALESCE(max(id), 0)::text AS id FROM hyzen_ip_bans`);
  return result.rows[0].id;
}

// Same flags as findPunishmentsAfter: `settled` = old enough to read safely, `stale` = too old to still announce.
export async function findIpBansAfter(afterId, { settleSeconds, staleHours, limit }) {
  const result = await pool.query(
    `SELECT id::text AS id, player_id, reason, staff_id, created_at, expires_at,
            created_at <= now() - make_interval(secs => $2) AS settled,
            created_at < now() - make_interval(hours => $3) AS stale
     FROM hyzen_ip_bans
     WHERE id > $1
     ORDER BY id
     LIMIT $4`,
    [afterId, settleSeconds, staleHours, limit],
  );
  return result.rows;
}

// Rows revoked inside (after, upTo], on the database clock.
export async function findRevokedIpBans(after, upTo) {
  const result = await pool.query(
    `SELECT id::text AS id, player_id, reason, revoked_at
     FROM hyzen_ip_bans
     WHERE revoked_at > $1 AND revoked_at <= $2
     ORDER BY revoked_at`,
    [after, upTo],
  );
  return result.rows;
}
