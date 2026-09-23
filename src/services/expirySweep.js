import { pool } from "../database/pool.js";
import { findPlayerById } from "../database/players.js";
import { baseEmbed } from "../utils/embeds.js";
import { broadcastStaffLog } from "../utils/staffLog.js";

const SWEEP_INTERVAL_MS = 30_000;

// Nothing else announces a TEMPBAN/TEMPMUTE running out on its own — /unban and /unmute log a manual removal,
// but time just quietly running out never posted anything. Polls Postgres directly (setInterval, not
// setTimeout, so this survives a bot restart same as pixCharge's own payment polling) since the bot already
// has both a live DB connection and a Discord client — no need to round-trip through HyzenStaff/Redis for a
// log-only notification.
//
// A watermark (not a rolling time window) is what keeps each expiry from being logged more than once: the row
// itself is never marked "announced" (revoked_at would misleadingly read as "an admin removed this" in
// /historico), so a window-based query re-matches the same still-not-revoked row on every single tick for as
// long as it stays inside the window — that's exactly what flooded the log channel with repeat "expirado"
// posts every 30s. Only ever looking at what expired since the last successful sweep means each row is
// inspected exactly once during normal operation. The one accepted gap: a bot restart resets the watermark to
// "now", so anything that expired during downtime goes unlogged — better than re-flooding on every tick.
let lastSweepAt = new Date();

export function startExpirySweep(client) {
  setInterval(() => {
    sweep(client).catch((err) => console.error("[expirySweep] sweep failed", err.message));
  }, SWEEP_INTERVAL_MS);
}

async function sweep(client) {
  const sweepStartedAt = new Date();
  const result = await pool.query(
    `SELECT id, player_id, type, reason
     FROM hyzen_punishments
     WHERE type IN ('TEMPBAN', 'TEMPMUTE') AND revoked_at IS NULL
       AND expires_at IS NOT NULL AND expires_at > $1 AND expires_at <= $2`,
    [lastSweepAt, sweepStartedAt],
  );
  lastSweepAt = sweepStartedAt;

  for (const row of result.rows) {
    const player = await findPlayerById(row.player_id);
    if (!player) continue;

    const isBan = row.type === "TEMPBAN";
    const embed = baseEmbed()
      .setColor(0x57f287)
      .setTitle(isBan ? "✅ Banimento expirado" : "✅ Mute expirado")
      .addFields(
        { name: "Jogador", value: player.name, inline: true },
        { name: "Motivo original", value: row.reason },
      );

    await broadcastStaffLog(client, isBan ? "banLog" : "muteLog", embed);
  }
}
