import { SlashCommandBuilder, version as djsVersion } from "discord.js";
import { baseEmbed } from "../utils/embeds.js";
import { formatDuration } from "../utils/format.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));

export const data = new SlashCommandBuilder()
  .setName("version")
  .setDescription("Mostra a versão do bot e informações do sistema.");

export async function execute(interaction) {
  const embed = baseEmbed()
    .setTitle("🤖 Versão do Bot")
    .addFields(
      { name: "Bot", value: `v${pkg.version}`, inline: true },
      { name: "discord.js", value: `v${djsVersion}`, inline: true },
      { name: "Node.js", value: process.version, inline: true },
      { name: "Ping", value: `${interaction.client.ws.ping}ms`, inline: true },
      { name: "Uptime", value: formatDuration(interaction.client.uptime), inline: true },
      { name: "Servidores", value: `${interaction.client.guilds.cache.size}`, inline: true },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
