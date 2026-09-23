// O cargo @everyone tem o mesmo ID do servidor — por isso escolher ele no seletor de
// cargos já funciona pra "marcar todo mundo" sem precisar de um caso especial separado.
export function getPingMention(cfg) {
  return cfg.announcePingRoleId ? `<@&${cfg.announcePingRoleId}>` : null;
}
