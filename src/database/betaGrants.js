import { pool } from "./pool.js";
import { publishNetworkStatus } from "./redis.js";
import { StatusTableMissingError } from "./networkStatus.js";

// Mirrors HyzenCore/migrations/V5__create_hyzen_beta_grants.sql — the names approved in the pre-registration. Until they
// have the beta tag, HyzenCore lets them in during a maintenance by name (while the beta testers' entry is open), and
// HyzenTags gives them the tag the next time they join. Published on hyzen:network-status so every server knows at once.
export const MAX_NAME_LENGTH = 32;

// Postgres' "undefined_table": the HyzenCore that creates it hasn't started against this database yet.
const UNDEFINED_TABLE = "42P01";
const DISCORD_ORIGIN = "Discord";

export async function grantBetaAccess(name, discordId, grantedBy) {
  try {
    await pool.query(
      `INSERT INTO hyzen_beta_grants (name, display_name, discord_id, granted_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, discord_id = EXCLUDED.discord_id,
         granted_by = EXCLUDED.granted_by, granted_at = now()`,
      [name.trim().toLowerCase(), name.trim(), discordId, grantedBy],
    );
  } catch (err) {
    if (err.code === UNDEFINED_TABLE) throw new StatusTableMissingError();
    throw err;
  }
  await publishNetworkStatus({ beta: true, server: DISCORD_ORIGIN });
}
