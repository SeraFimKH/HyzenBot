import { ChannelType, PermissionsBitField } from "discord.js";

// The admin server: another Discord server the bot is in, where this server's logs go — the players in one server, the
// staff and its logs in another. Linked in /painel → Servidor Administrativo; from then on every log channel
// (LOG_CHANNEL_KEYS) can be a channel there. Only logs: what the players use (tickets, suggestions, status) stays here.
export const LOG_CHANNEL_KEYS = ["ticketLog", "paymentLog", "banLog", "muteLog", "warnLog", "winLog", "sugestoesLog", "betaLog"];

const { Flags } = PermissionsBitField;
const POST_PERMISSIONS = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks];
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

export function isLogChannelKey(key) {
  return LOG_CHANNEL_KEYS.includes(key);
}

// The linked admin server, while the bot is still in it.
export function getAdminGuild(client, cfg) {
  return cfg.adminGuildId ? (client.guilds.cache.get(cfg.adminGuildId) ?? null) : null;
}

// The servers a log of this one may be posted in: itself and its admin server.
export function logGuildIds(guildId, cfg) {
  return cfg.adminGuildId ? [guildId, cfg.adminGuildId] : [guildId];
}

export function canManage(member) {
  return member.permissions.has(Flags.Administrator) || member.permissions.has(Flags.ManageGuild);
}

// The bot's other servers where this person is an admin (Administrador or Gerenciar Servidor): only those can become
// the admin server, so nobody sends the logs to a server that isn't the staff's.
export async function guildsManagedBy(client, userId, exceptGuildId) {
  const guilds = [];
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === exceptGuildId) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && canManage(member)) guilds.push(guild);
  }
  return guilds.sort((a, b) => a.name.localeCompare(b.name));
}

export function canPostLogs(channel) {
  const me = channel?.guild?.members.me;
  return Boolean(me && TEXT_TYPES.includes(channel.type) && channel.permissionsFor(me)?.has(POST_PERMISSIONS));
}

// The server's text channels the bot can post a log in, in the order Discord shows them.
export function postableTextChannels(guild) {
  const order = (channel) => [channel.parent?.rawPosition ?? -1, channel.rawPosition];
  return [...guild.channels.cache.values()].filter(canPostLogs).sort((a, b) => {
    const [categoryA, positionA] = order(a);
    const [categoryB, positionB] = order(b);
    return categoryA - categoryB || positionA - positionB;
  });
}

// A configured channel as shown in the panel: its mention, plus the server's name when it's in the admin server.
export function describeChannel(client, guildId, channelId) {
  if (!channelId) return null;
  const channel = client?.channels.cache.get(channelId);
  return channel?.guildId && channel.guildId !== guildId ? `<#${channelId}> · 🔗 ${channel.guild.name}` : `<#${channelId}>`;
}
