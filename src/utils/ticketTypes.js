const MAX_TYPES = 25; // limite de opções de um select menu do Discord

export function addTicketType(cfg, label, emoji) {
  if (cfg.ticketTypes.length >= MAX_TYPES) {
    return { ok: false, reason: `Limite de ${MAX_TYPES} tipos de suporte atingido. Remova algum antes de adicionar outro.` };
  }
  if (cfg.ticketTypes.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
    return { ok: false, reason: `Já existe um tipo de suporte chamado **${label}**.` };
  }
  cfg.ticketTypes.push({ label, emoji: emoji || null });
  return { ok: true };
}

export function removeTicketTypes(cfg, labels) {
  const lower = labels.map((l) => l.toLowerCase());
  const before = cfg.ticketTypes.length;
  cfg.ticketTypes = cfg.ticketTypes.filter((t) => !lower.includes(t.label.toLowerCase()));
  return before - cfg.ticketTypes.length;
}

export { MAX_TYPES };
