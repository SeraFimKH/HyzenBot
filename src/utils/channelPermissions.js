import { PermissionsBitField } from "discord.js";

const { Flags } = PermissionsBitField;

// Os nomes como aparecem nas permissões do canal no Discord em português, para a staff achar o que ligar.
const PERMISSION_NAMES = new Map([
  [Flags.ViewChannel, "Ver canal"],
  [Flags.SendMessages, "Enviar mensagens"],
  [Flags.EmbedLinks, "Inserir links"],
  [Flags.ReadMessageHistory, "Ver histórico de mensagens"],
  [Flags.SendPolls, "Criar enquetes"],
  [Flags.CreatePublicThreads, "Criar tópicos públicos"],
  [Flags.SendMessagesInThreads, "Enviar mensagens em tópicos"],
]);

/**
 * Quais destas permissões o bot (me) não tem no canal, pelo nome que o Discord mostra. Vazio quando não dá para
 * saber (o membro do bot ainda não está em cache): quem chama segue em frente, e um erro de permissão de verdade
 * aparece no envio.
 */
export function missingPermissions(channel, me, flags) {
  const granted = me && channel?.permissionsFor ? channel.permissionsFor(me) : null;
  if (!granted) return [];
  return flags.filter((flag) => !granted.has(flag)).map((flag) => PERMISSION_NAMES.get(flag) ?? String(flag));
}

export function formatPermissionList(names) {
  return `**${names.join("**, **")}**`;
}
