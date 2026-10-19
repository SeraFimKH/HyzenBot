import { pool } from "./pool.js";
import { publishNetworkStatus } from "./redis.js";
import { StatusTableMissingError } from "./networkStatus.js";

// Mirrors HyzenCore/migrations/V4__create_hyzen_beta_testers.sql — the beta testers' game names (one per Discord member)
// and hyzen_network_status.beta_open, whether they get in during a maintenance. The game reads both (and flips the
// switch with /manutencao beta); every change is published on hyzen:network-status, so the servers apply it at once —
// closing the entry mid-maintenance disconnects the testers who are playing.
export const MAX_NAME_LENGTH = 32;

const ROW_ID = 1;
// Postgres' "undefined_table" / "undefined_column": the HyzenCore that creates them hasn't started against this
// database yet. "unique_violation": the name belongs to another tester.
const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";
const UNIQUE_VIOLATION = "23505";
const DISCORD_ORIGIN = "Discord";

const key = (name) => name.trim().toLowerCase();

export class NameTakenError extends Error {
  constructor(name) {
    super(`${name} is another beta tester's name`);
    this.name = "NameTakenError";
  }
}

async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === UNDEFINED_TABLE || err.code === UNDEFINED_COLUMN) throw new StatusTableMissingError();
    throw err;
  }
}

function mapRow(row) {
  return {
    discordId: row.discord_id,
    guildId: row.guild_id,
    name: row.display_name,
    addedAt: row.added_at ? new Date(row.added_at).getTime() : null,
  };
}

const announce = () => publishNetworkStatus({ beta: true, server: DISCORD_ORIGIN });

export async function listBetaTesters() {
  const result = await query("SELECT discord_id, guild_id, display_name, added_at FROM hyzen_beta_testers ORDER BY name");
  return result.rows.map(mapRow);
}

export async function getBetaTester(discordId) {
  const result = await query("SELECT discord_id, guild_id, display_name, added_at FROM hyzen_beta_testers WHERE discord_id = $1", [discordId]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

// Registers or replaces the member's name. Throws NameTakenError when another tester has it.
export async function saveBetaTester(discordId, guildId, name) {
  try {
    await query(
      `INSERT INTO hyzen_beta_testers (discord_id, guild_id, name, display_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (discord_id) DO UPDATE SET guild_id = EXCLUDED.guild_id, name = EXCLUDED.name,
         display_name = EXCLUDED.display_name, added_at = now()`,
      [discordId, guildId, key(name), name.trim()],
    );
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) throw new NameTakenError(name);
    throw err;
  }
  await announce();
}

// The tester taken off, or null when the member had no name registered.
export async function deleteBetaTester(discordId) {
  const result = await query("DELETE FROM hyzen_beta_testers WHERE discord_id = $1 RETURNING discord_id, guild_id, display_name, added_at", [discordId]);
  if (!result.rows[0]) return null;
  await announce();
  return mapRow(result.rows[0]);
}

export async function isBetaAccessOpen() {
  const result = await query("SELECT beta_open FROM hyzen_network_status WHERE id = $1", [ROW_ID]);
  return result.rows[0]?.beta_open ?? true;
}

export async function setBetaAccessOpen(open) {
  await query("UPDATE hyzen_network_status SET beta_open = $1 WHERE id = $2", [open, ROW_ID]);
  await announce();
}
