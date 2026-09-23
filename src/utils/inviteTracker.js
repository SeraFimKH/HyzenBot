// Cache em memória (não persistido) do número de usos de cada convite por servidor.
// Usado só pra descobrir, comparando antes/depois, qual convite um novo membro usou —
// técnica padrão pra rastrear convites no discord.js, já que o gateway não informa isso direto.
const inviteCache = new Map(); // guildId -> Map<code, uses>

export async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map(invites.map((inv) => [inv.code, inv.uses]));
    inviteCache.set(guild.id, map);
  } catch (err) {
    console.warn(`[inviteTracker] Não foi possível carregar os convites do servidor ${guild.id} (falta permissão "Gerenciar Servidor"?):`, err.message);
  }
}

export async function resolveUsedInvite(guild) {
  const before = inviteCache.get(guild.id);
  if (!before) {
    await cacheGuildInvites(guild);
    return null;
  }

  let after;
  try {
    after = await guild.invites.fetch();
  } catch (err) {
    console.warn(`[inviteTracker] Não foi possível reconsultar os convites do servidor ${guild.id}:`, err.message);
    return null;
  }

  const afterMap = new Map(after.map((inv) => [inv.code, inv.uses]));
  inviteCache.set(guild.id, afterMap);

  const used = after.find((inv) => (before.get(inv.code) ?? 0) < inv.uses);
  return used || null;
}

export function handleInviteCreate(invite) {
  const map = inviteCache.get(invite.guild.id);
  if (map) map.set(invite.code, invite.uses ?? 0);
}

export function handleInviteDelete(invite) {
  const map = inviteCache.get(invite.guild.id);
  if (map) map.delete(invite.code);
}
