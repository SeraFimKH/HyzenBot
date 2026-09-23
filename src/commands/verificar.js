import { SlashCommandBuilder } from "discord.js";
import { buildVerificationResponse } from "../interactions/authButtons.js";

export const data = new SlashCommandBuilder()
  .setName("verificar")
  .setDescription("Gera um código pra vincular sua conta do Discord ao seu jogador na Hyzen Network.");

export async function execute(interaction) {
  const response = await buildVerificationResponse(interaction.user.id);
  await interaction.reply({ ...response, ephemeral: true });
}
