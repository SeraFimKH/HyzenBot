import { pool } from "./pool.js";
import { publishNetworkStatus } from "./redis.js";
import { StatusTableMissingError } from "./networkStatus.js";

// Mirrors HyzenCore/migrations/V3__create_hyzen_maintenance_allowlist.sql — the players let in during a maintenance
// besides the staff. The game manages the same list (/manutencao adicionar | remover | lista); every change is
// published on hyzen:network-status, so the servers read it again at once (and disconnect, mid-maintenance, whoever
// was taken off it).
export const MAX_NAME_LENGTH = 32;

// Postgres' "undefined_table": the HyzenCore that creates the table hasn't started against this database yet.
const UNDEFINED_TABLE = "42P01";
const DISCORD_ORIGIN = "Discord";

const key = (name) => name.trim().toLowerCase();

async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === UNDEFINED_TABLE) throw new StatusTableMissingError();
    throw err;
  }
}

export async function listAllowedPlayers() {
  const result = await query("SELECT display_name, added_by, added_at FROM hyzen_maintenance_allowlist ORDER BY added_at");
  return result.rows.map((row) => ({
    name: row.display_name,
    addedBy: row.added_by,
    addedAt: row.added_at ? new Date(row.added_at).getTime() : null,
  }));
}

// False when the name was already on the list.
export async function allowPlayer(name, addedBy) {
  const result = await query(
    "INSERT INTO hyzen_maintenance_allowlist (name, display_name, added_by) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
    [key(name), name.trim(), addedBy],
  );
  if (result.rowCount === 1) await publishNetworkStatus({ allowlist: true, server: DISCORD_ORIGIN });
  return result.rowCount === 1;
}

// False when the name wasn't on the list.
export async function disallowPlayer(name) {
  const result = await query("DELETE FROM hyzen_maintenance_allowlist WHERE name = $1", [key(name)]);
  if (result.rowCount === 1) await publishNetworkStatus({ allowlist: true, server: DISCORD_ORIGIN });
  return result.rowCount === 1;
}

// The name exactly as a player who already joined has it (hyzen_players), or null for a name never seen.
export async function findKnownPlayerName(name) {
  try {
    const result = await pool.query("SELECT name FROM hyzen_players WHERE LOWER(name) = LOWER($1) LIMIT 1", [name.trim()]);
    return result.rows[0]?.name ?? null;
  } catch (err) {
    console.error("[maintenanceAllowlist] failed to look the player up", err.message);
    return null;
  }
}
