import { startRaffleScheduler, startPixScheduler } from "../utils/scheduler.js";
import { cacheGuildInvites } from "../utils/inviteTracker.js";

export const name = "clientReady";
export const once = true;
export async function execute(client) {
  console.log(`[ready] Bot online como ${client.user.tag}.`);
  startRaffleScheduler(client);
  startPixScheduler(client);

  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
  console.log(`[ready] Cache de convites carregado para ${client.guilds.cache.size} servidor(es).`);
}
