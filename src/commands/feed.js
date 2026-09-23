import { SlashCommandBuilder } from "discord.js";
import { buildFeedbackModal } from "../utils/feedbackModal.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { enforceCommandsChannel } from "../utils/commandsChannel.js";

export const data = new SlashCommandBuilder()
  .setName("feed")
  .setDescription("Avalie sua experiência com este servidor (atendimento, comunidade, etc).");

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!(await enforceCommandsChannel(interaction, cfg))) return;

  await interaction.showModal(buildFeedbackModal(interaction.guildId));
}
