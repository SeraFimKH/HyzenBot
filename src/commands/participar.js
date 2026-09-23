import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { joinRaffle } from "../utils/raffleEntries.js";
import { enforceCommandsChannel } from "../utils/commandsChannel.js";

export const data = new SlashCommandBuilder()
  .setName("participar")
  .setDescription("Confirma sua presença no sorteio ativo do servidor.");

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!(await enforceCommandsChannel(interaction, cfg))) return;

  return joinRaffle(interaction);
}
