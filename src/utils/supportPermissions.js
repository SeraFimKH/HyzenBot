import { hasAnyRole, isAdmin } from "./permissions.js";

// What the support team can do in the tickets (/painel → Suporte — Permissões). Separate from the staff roles, which
// are moderation (/ban, /mute, /kick, /warn): a role can attend tickets without punishing anyone. Admins can always
// do everything.
export const SupportPermission = {
  ATTEND: "atender", // see the tickets (of their types), answer, claim, open the voice channel
  CLOSE: "fechar",
  PIX: "pix",
};

const unique = (ids) => [...new Set(ids)];

// The support type's label for what a ticket stored: "🐛 Bug" now, "Bug" on tickets opened before the emoji was kept.
function typeLabelOf(cfg, type) {
  if (!type) return null;
  const match = cfg.ticketTypes.find((t) => t.label === type || type.endsWith(` ${t.label}`));
  return match ? match.label : type;
}

// The roles that attend a ticket of this type: the type's own team when it has one, otherwise the support roles, and
// — while support isn't configured at all — the staff roles, which is who attended every ticket before.
export function attendingRoles(cfg, type) {
  const label = typeLabelOf(cfg, type);
  const team = label ? cfg.support.typeRoles[label] || [] : [];
  if (team.length) return team;
  if (cfg.support.roles.atender.length) return cfg.support.roles.atender;
  return cfg.staffRoles;
}

// Who may do it: closing and Pix have their own roles when set, otherwise whoever attends that ticket.
export function permissionRoles(cfg, permission, type = null) {
  if (permission === SupportPermission.ATTEND) return attendingRoles(cfg, type);
  const own = cfg.support.roles[permission] || [];
  return own.length ? own : attendingRoles(cfg, type);
}

export function canSupport(member, cfg, permission, type = null) {
  return isAdmin(member, cfg) || hasAnyRole(member, permissionRoles(cfg, permission, type));
}

// Every role that sees a ticket's channel: admins, whoever attends it, and the roles given closing or Pix on their own
// (they act inside the ticket, so they have to see it).
export function ticketChannelRoles(cfg, type) {
  return unique([...cfg.adminRoles, ...attendingRoles(cfg, type), ...cfg.support.roles.fechar, ...cfg.support.roles.pix]);
}

export function isSupportConfigured(cfg) {
  return cfg.support.roles.atender.length > 0 || Object.values(cfg.support.typeRoles).some((roles) => roles.length > 0);
}

// Who a ticket pings when it opens during support hours: whoever attends it. Before support was configured that was
// staff and admins together, and it stays so until it is.
export function ticketPingRoles(cfg, type) {
  if (!isSupportConfigured(cfg)) return unique([...cfg.adminRoles, ...cfg.staffRoles]);
  return attendingRoles(cfg, type);
}
