import { startRaffleScheduler, startPixScheduler } from "../utils/scheduler.js";
import { cacheGuildInvites } from "../utils/inviteTracker.js";
import { startServerStatus } from "../services/serverStatus.js";
import { ensureSuggestionPanels } from "../services/suggestionPanel.js";
import { refreshTicketPanels } from "../utils/ticketPanel.js";
import { syncGuildCommands } from "../services/commandSync.js";

export const name = "clientReady";
export const once = true;
export async function execute(client) {
  console.log(`[ready] Bot online como ${client.user.tag}.`);
  startRaffleScheduler(client);
  startPixScheduler(client);
  startServerStatus(client);

  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
  console.log(`[ready] Cache de convites carregado para ${client.guilds.cache.size} servidor(es).`);

  await syncGuildCommands(client);
  await ensureSuggestionPanels(client);
  await refreshTicketPanels(client);
}
