import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("tickets.json", {});

export function getTicket(channelId) {
  return store.get(channelId) || null;
}

export function createTicket(channelId, ticket) {
  store.set(channelId, {
    guildId: ticket.guildId,
    openerId: ticket.openerId,
    type: ticket.type || null,
    number: ticket.number,
    claimedBy: null,
    voiceChannelId: null,
    createdAt: Date.now(),
    lastAutoReply: 0,
  });
}

export function updateTicket(channelId, mutator) {
  const ticket = getTicket(channelId);
  if (!ticket) return null;
  mutator(ticket);
  store.set(channelId, ticket);
  return ticket;
}

export function deleteTicket(channelId) {
  store.delete(channelId);
}

export function findOpenTicketByUser(guildId, userId) {
  const all = store.all();
  for (const [channelId, ticket] of Object.entries(all)) {
    if (ticket.guildId === guildId && ticket.openerId === userId) {
      return { channelId, ticket };
    }
  }
  return null;
}
