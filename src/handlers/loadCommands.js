import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Collection } from "discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
