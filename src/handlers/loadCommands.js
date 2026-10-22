import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ApplicationIntegrationType, Collection, InteractionContextType } from "discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// What Discord is given for a command (commandSync per server, deployCommands globally): usable only inside a server.
// Every command reads the server — the member, their roles, its config — and a global registration would otherwise also
// list it in DMs, where it can only break.
export function commandJson(command) {
  return {
    ...command.data.toJSON(),
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
  };
}

export async function loadCommands(client) {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, "..", "commands");
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

  for (const file of files) {
    const command = await import(pathToFileURL(path.join(commandsPath, file)).href);
    if (!command.data || !command.execute) {
      console.warn(`[loadCommands] Ignorando ${file}: precisa exportar "data" e "execute".`);
      continue;
    }
    client.commands.set(command.data.name, command);
  }

  console.log(`[loadCommands] ${client.commands.size} comando(s) carregado(s).`);
  return client.commands;
}
