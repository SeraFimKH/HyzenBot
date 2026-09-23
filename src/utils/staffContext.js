import { findLinkByDiscordId } from "../database/auth.js";

// Staff commands write staff_id as a hyzen_players.id (matching the in-game side of punishments) — a staff
// member who hasn't linked their account via /verificar yet still gets to punish, just with no attributable
// player_id (NULL, shown as "Discord" in history instead of an in-game name).
export async function resolveStaffId(discordId) {
  const link = await findLinkByDiscordId(discordId);
  return link ? link.player_id : null;
}
