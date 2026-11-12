import { pool } from "./pool.js";

// The Discord roles for the game's groups, chosen on the site (admin → Configurações → Cargos do Discord; the site's
// migration creates both tables). The bot writes hyzen_discord_roles, the roles of each server it is in, so the site can
// offer them by name, and reads hyzen_discord_group_roles, the role the staff picked for each group in each server.

// Replaces what the site knows of one server's roles. roles: [{ id, name, color, position, editable, admin }].
export async function publishRoles(guildId, guildName, roles) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const role of roles) {
      await client.query(
        `INSERT INTO hyzen_discord_roles (guild_id, guild_name, role_id, name, color, position, editable, admin, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (guild_id, role_id) DO UPDATE SET guild_name = $2, name = $4, color = $5, position = $6,
           editable = $7, admin = $8, updated_at = now()`,
        [guildId, guildName, role.id, role.name, role.color, role.position, role.editable, role.admin],
      );
    }
    await client.query("DELETE FROM hyzen_discord_roles WHERE guild_id = $1 AND NOT (role_id = ANY($2::text[]))", [
      guildId,
      roles.map((role) => role.id),
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Servers the bot left: their roles stop being offered on the site.
export async function forgetOtherServers(guildIds) {
  await pool.query("DELETE FROM hyzen_discord_roles WHERE NOT (guild_id = ANY($1::text[]))", [guildIds]);
}

// [{ group_id, guild_id, role_id }]
export async function listGroupRoles() {
  const result = await pool.query("SELECT group_id, guild_id, role_id FROM hyzen_discord_group_roles");
  return result.rows;
}

// Everyone who linked their Discord (/verificar), with the group they are in now: their rank while it lasts, the
// default group otherwise (the same way HyzenPerm decides it in the game). [{ discord_id, group_id }]
export async function listLinkedGroups() {
  const result = await pool.query(
    `SELECT l.discord_id,
            COALESCE(
              (SELECT r.group_id FROM hyzen_player_ranks r
                WHERE r.player_id = l.player_id AND (r.expires_at IS NULL OR r.expires_at > now())),
              (SELECT g.id FROM hyzen_groups g WHERE g.is_default ORDER BY g.id LIMIT 1)
            ) AS group_id
       FROM hyzen_auth_links l`,
  );
  return result.rows;
}
