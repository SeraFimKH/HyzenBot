const MAX_TYPES = 25; // limite de opções de um select menu do Discord
// A descrição aparece em letra pequena embaixo do nome, no menu do painel de tickets — o Discord aceita até 100.
const MAX_DESCRIPTION_LENGTH = 100;
const MAX_LABEL_LENGTH = 50;

const clean = (description) => description?.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null;

export function addTicketType(cfg, label, emoji, description = null) {
  if (cfg.ticketTypes.length >= MAX_TYPES) {
    return { ok: false, reason: `Limite de ${MAX_TYPES} tipos de suporte atingido. Remova algum antes de adicionar outro.` };
  }
  if (cfg.ticketTypes.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
    return { ok: false, reason: `Já existe um tipo de suporte chamado **${label}**.` };
  }
  cfg.ticketTypes.push({ label, emoji: emoji || null, description: clean(description) });
  return { ok: true };
}

// Troca o nome, o emoji e a descrição de um tipo. Renomeado, a equipe própria dele (Suporte — Permissões) vai junto.
export function editTicketType(cfg, index, { label, emoji, description }) {
  const type = cfg.ticketTypes[index];
  if (!type) return { ok: false, reason: "Esse tipo de suporte não existe mais. Abra o `/painel` de novo." };
  const newLabel = label.trim();
  if (!newLabel) return { ok: false, reason: "O nome não pode ficar vazio." };
  if (cfg.ticketTypes.some((t, i) => i !== index && t.label.toLowerCase() === newLabel.toLowerCase())) {
    return { ok: false, reason: `Já existe um tipo de suporte chamado **${newLabel}**.` };
  }
  if (newLabel !== type.label && cfg.support?.typeRoles?.[type.label]) {
    cfg.support.typeRoles[newLabel] = cfg.support.typeRoles[type.label];
    delete cfg.support.typeRoles[type.label];
  }
  type.label = newLabel;
  type.emoji = emoji?.trim() || null;
  type.description = clean(description);
  return { ok: true, type };
}

export function removeTicketTypes(cfg, labels) {
  const lower = labels.map((l) => l.toLowerCase());
  const before = cfg.ticketTypes.length;
  for (const type of cfg.ticketTypes) {
    if (lower.includes(type.label.toLowerCase()) && cfg.support?.typeRoles) delete cfg.support.typeRoles[type.label];
  }
  cfg.ticketTypes = cfg.ticketTypes.filter((t) => !lower.includes(t.label.toLowerCase()));
  return before - cfg.ticketTypes.length;
}

// "🛒 Compra — Suporte para compras", como aparece nas listas da equipe.
export function describeTicketType(type) {
  return `${type.emoji || "•"} ${type.label}${type.description ? ` — *${type.description}*` : ""}`;
}

export { MAX_TYPES, MAX_DESCRIPTION_LENGTH, MAX_LABEL_LENGTH };
