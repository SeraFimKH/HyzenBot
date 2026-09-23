import { pool } from "./pool.js";
import { randomInt } from "node:crypto";

// Mirrors the Java side's AuthCodeRepository/AuthLinkRepository (see
// plugins/java-powernukkitx/HyzenAuth/src/main/java/br/hyzen/auth/repository) — this is the writing half of
// hyzen_auth_codes (the bot generates codes; /verificar <código> in-game consumes them), and a read-only view
// of hyzen_auth_links for confirming a link went through.

// 000000-999999, zero-padded — matches the 6-digit code the architecture doc and hyzen_auth_codes.code
// (VARCHAR(6)) both expect.
function generateSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Retries on a rare primary-key collision instead of trusting one random draw to always be free.
export async function createVerificationCode(discordId, expiryMinutes) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSixDigitCode();
    try {
      await pool.query(
        "INSERT INTO hyzen_auth_codes (code, discord_id, expires_at) VALUES ($1, $2, now() + ($3 || ' minutes')::interval)",
        [code, discordId, expiryMinutes],
      );
      return code;
    } catch (err) {
      if (err.code === "23505") {
        continue; // code PK collision — draw again
      }
      throw err;
    }
  }
  throw new Error("Could not generate a unique verification code after 5 attempts");
}

export async function findLinkByDiscordId(discordId) {
  const result = await pool.query(
    "SELECT player_id, discord_id, linked_at FROM hyzen_auth_links WHERE discord_id = $1",
    [discordId],
  );
  return result.rows[0] ?? null;
}

// Reverse of findLinkByDiscordId — the auth table is only indexed for discord_id → player_id, so a lookup by
// player_id (used to DM a punished player, or to show their linked account in /infocompleta) needs its own
// query rather than a cache-friendly index hit.
export async function findDiscordIdByPlayerId(playerId) {
  const result = await pool.query("SELECT discord_id FROM hyzen_auth_links WHERE player_id = $1", [playerId]);
  return result.rows[0]?.discord_id ?? null;
}
