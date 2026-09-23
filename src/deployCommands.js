import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { REST, Routes } from "discord.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsPath = path.join(__dirname, "commands");
const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

const commands = [];
for (const file of files) {
  const command = await import(pathToFileURL(path.join(commandsPath, file)).href);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(config.token);

try {
  console.log(`[deploy-commands] Registrando ${commands.length} comando(s)...`);

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commands });

  console.log(
    config.guildId
      ? `[deploy-commands] Comandos registrados instantaneamente no servidor ${config.guildId}.`
      : "[deploy-commands] Comandos registrados globalmente (pode levar até 1h para aparecer em todos os servidores).",
  );
} catch (err) {
  console.error("[deploy-commands] Falha ao registrar comandos:", err);
  process.exit(1);
}
