import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadEvents(client) {
  const eventsPath = path.join(__dirname, "..", "events");
  const files = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

  for (const file of files) {
    const event = await import(pathToFileURL(path.join(eventsPath, file)).href);
    if (!event.name || !event.execute) {
      console.warn(`[loadEvents] Ignorando ${file}: precisa exportar "name" e "execute".`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  console.log(`[loadEvents] ${files.length} evento(s) carregado(s).`);
}
