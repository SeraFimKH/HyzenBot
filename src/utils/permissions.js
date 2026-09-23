import { PermissionsBitField } from "discord.js";

export function hasAnyRole(member, roleIds) {
  if (!roleIds || roleIds.length === 0) return false;
  return member.roles.cache.some((role) => roleIds.includes(role.id));
}

/**
 * Enquanto o servidor não configurar nenhum cargo de admin pelo /config, o dono/quem
 * tem "Gerenciar Servidor" nativo do Discord já consegue usar os comandos administrativos —
 * evita que o cliente fique travado antes da primeira configuração.
 */
export function isAdmin(member, guildConfig) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  if (guildConfig.adminRoles.length === 0) {
    return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
  }
  return hasAnyRole(member, guildConfig.adminRoles);
}

export function isStaff(member, guildConfig) {
  if (isAdmin(member, guildConfig)) return true;
  return hasAnyRole(member, guildConfig.staffRoles);
}
