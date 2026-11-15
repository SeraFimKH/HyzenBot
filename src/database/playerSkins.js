import { config } from "../config.js";
import { pool } from "./pool.js";

// The player's skin as their game sent it (hyzen_player_skins, kept by the HyzenCosmetics plugin), drawn by the site:
// Bedrock skins can't be fetched from the skin sites, which only know Java's.

const UNDEFINED_TABLE = "42P01";

// The URL of the player's head on the site, or null when the site doesn't have their skin (yet). The skin's hash in the
// URL makes Discord fetch it again when the skin changes.
export async function skinHeadUrl(playerId, playerName) {
  let hash;
  try {
    const result = await pool.query("SELECT hash FROM hyzen_player_skins WHERE player_id = $1", [playerId]);
    hash = result.rows[0]?.hash;
  } catch (err) {
    if (err.code === UNDEFINED_TABLE) return null;
    throw err;
  }
  return hash ? `${config.siteUrl}/skin/${encodeURIComponent(playerName)}/head.png?size=256&v=${hash.slice(0, 12)}` : null;
}
