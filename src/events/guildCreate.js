import { syncGuildCommands } from "../services/commandSync.js";
import { cacheGuildInvites } from "../utils/inviteTracker.js";

// The bot was added to a new server (the admin or the beta one): the commands show up there right away.
export const name = "guildCreate";
export async function execute(guild) {
  console.log(`[guildCreate] Adicionado ao servidor ${guild.name} (${guild.id}).`);
  await syncGuildCommands(guild.client, [guild]);
  await cacheGuildInvites(guild);
}
