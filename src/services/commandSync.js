import { config } from "../config.js";

// With DISCORD_GUILD_ID set the slash commands are per server, and the deploy script only registers them in that one
// — but the players' server, the admin server and the beta server all need them. So the bot registers the same commands
// in every server it's in when it starts, and in a new server as soon as it's added there. With DISCORD_GUILD_ID empty
// they're global (deployCommands.js) and already everywhere: nothing to do here.
export async function syncGuildCommands(client, guilds = [...client.guilds.cache.values()]) {
  if (!config.guildId) return;
  const body = [...client.commands.values()].map((command) => command.data.toJSON());
  let synced = 0;
  for (const guild of guilds) {
    try {
      await guild.commands.set(body);
      synced++;
    } catch (err) {
      // 50001 "Missing Access": the bot was added without the applications.commands permission — inviting it again fixes it.
      console.error(`[commandSync] não consegui registrar os comandos em ${guild.name} (${guild.id}): ${err.message}`);
    }
  }
  if (synced) console.log(`[commandSync] ${body.length} comando(s) registrado(s) em ${synced} servidor(es).`);
}
