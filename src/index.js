import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./handlers/loadCommands.js";
import { loadEvents } from "./handlers/loadEvents.js";
import { pool } from "./database/pool.js";
import { startGameEventsListener } from "./services/gameEvents.js";
import { startExpirySweep } from "./services/expirySweep.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Channel],
});

await loadCommands(client);
await loadEvents(client);

client.login(config.token).catch((err) => {
  console.error("[index] Falha ao logar o bot. Verifique se DISCORD_TOKEN em .env está correto.", err);
  process.exit(1);
});

startGameEventsListener(client);
startExpirySweep(client);

// Sem este listener, o Node derruba o processo inteiro sempre que o discord.js
// emite 'error' internamente (ex: erro assíncrono não tratado num handler de evento)
// — diferente de unhandledRejection, 'error' sem listener é fatal por padrão no Node.
client.on("error", (err) => {
  console.error("[client error]", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

async function shutdown(signal) {
  console.log(`[index] ${signal} recebido, encerrando...`);
  client.destroy();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
