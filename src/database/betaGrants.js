import { pool } from "./pool.js";
import { publishNetworkStatus, publishTagAction } from "./redis.js";
import { StatusTableMissingError } from "./networkStatus.js";

// The beta testers as the database has them. Two kinds:
//   - who has the beta tag in the game (HyzenTags' hyzen_tags / hyzen_player_tags, read here; the tag is taken through
//     HyzenTags, over Redis). Which tag is the beta one is hyzen_network_status.beta_tag, written by HyzenCore.
//   - who was approved on Discord and hasn't joined since (HyzenCore/migrations/V5__create_hyzen_beta_grants.sql):
//     HyzenCore lets them in by name, and HyzenTags turns the row into the tag the next time they join.
// Every change is published on hyzen:network-status, so every server knows at once.
export const MAX_NAME_LENGTH = 32;

// Postgres' "undefined_table" / "undefined_column": the HyzenCore (or HyzenTags) that creates it hasn't started yet.
const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";
const DEFAULT_BETA_TAG = "beta";
const DISCORD_ORIGIN = "Discord";

const isMissing = (err) => err.code === UNDEFINED_TABLE || err.code === UNDEFINED_COLUMN;

async function grantsQuery(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (isMissing(err)) throw new StatusTableMissingError();
    throw err;
  }
}

const announce = () => publishNetworkStatus({ beta: true, server: DISCORD_ORIGIN });

export async function grantBetaAccess(name, discordId, grantedBy) {
  await grantsQuery(
    `INSERT INTO hyzen_beta_grants (name, display_name, discord_id, granted_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, discord_id = EXCLUDED.discord_id,
       granted_by = EXCLUDED.granted_by, granted_at = now()`,
    [name.trim().toLowerCase(), name.trim(), discordId, grantedBy],
  );
  await announce();
}

export async function findBetaGrant(name) {
  const result = await grantsQuery("SELECT display_name, discord_id FROM hyzen_beta_grants WHERE name = $1", [name.trim().toLowerCase()]);
  return result.rows[0] ? { name: result.rows[0].display_name, discordId: result.rows[0].discord_id } : null;
}

// The approval taken back, or null when there was none for the name.
export async function revokeBetaGrant(name) {
  const result = await grantsQuery("DELETE FROM hyzen_beta_grants WHERE name = $1 RETURNING display_name, discord_id", [name.trim().toLowerCase()]);
  if (!result.rows[0]) return null;
  await announce();
  return { name: result.rows[0].display_name, discordId: result.rows[0].discord_id };
}

// Approved on Discord, waiting to join: { name, discordId, grantedBy, grantedAt }, alphabetical.
export async function listBetaGrants() {
  const result = await grantsQuery("SELECT display_name, discord_id, granted_by, granted_at FROM hyzen_beta_grants ORDER BY name");
  return result.rows.map((row) => ({
    name: row.display_name,
    discordId: row.discord_id,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at ? new Date(row.granted_at).getTime() : null,
  }));
}

export async function getBetaTagKey() {
  try {
    const result = await pool.query("SELECT beta_tag FROM hyzen_network_status WHERE id = 1");
    return result.rows[0]?.beta_tag || DEFAULT_BETA_TAG;
  } catch (err) {
    if (isMissing(err)) return DEFAULT_BETA_TAG;
    throw err;
  }
}

// Who has the beta tag: { playerId, name, discordId (their linked Discord, or null) }, alphabetical. Empty while
// HyzenTags isn't installed.
export async function listBetaTagHolders(tagKey) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, l.discord_id FROM hyzen_player_tags pt
       JOIN hyzen_tags t ON t.id = pt.tag_id
       JOIN hyzen_players p ON p.id = pt.player_id
       LEFT JOIN hyzen_auth_links l ON l.player_id = p.id
       WHERE LOWER(t.key) = $1 ORDER BY LOWER(p.name)`,
      [tagKey.toLowerCase()],
    );
    return result.rows.map((row) => ({ playerId: Number(row.id), name: row.name, discordId: row.discord_id ?? null }));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

export async function hasBetaTag(playerId, tagKey) {
  try {
    const result = await pool.query(
      "SELECT 1 FROM hyzen_player_tags pt JOIN hyzen_tags t ON t.id = pt.tag_id WHERE pt.player_id = $1 AND LOWER(t.key) = $2",
      [playerId, tagKey.toLowerCase()],
    );
    return result.rows.length > 0;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

// HyzenTags takes the tag (and, if they're playing in a maintenance with the entry for testers on, they're
// disconnected right after). False when the message couldn't be sent.
export function takeBetaTag(playerId, tagKey) {
  return publishTagAction({ type: "REVOKE", playerId, key: tagKey });
}
