import { pool } from "./pool.js";

// name→id/stats lookup against HyzenCore's own hyzen_players table (see HyzenCore/migrations/V1__create_hyzen_players.sql)
// — case-insensitive since players rarely type their exact-case IGN.
export async function findPlayerByName(name) {
  const result = await pool.query(`SELECT * FROM hyzen_players WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  return result.rows[0] || null;
}

export async function findPlayerById(playerId) {
  const result = await pool.query(`SELECT * FROM hyzen_players WHERE id = $1`, [playerId]);
  return result.rows[0] || null;
}
