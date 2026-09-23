import { SlashCommandBuilder } from "discord.js";
import { executeProfileCommand } from "../utils/profileView.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Mostra suas stats (ou de outro jogador): vitórias, kills, K/D, ban e status online.")
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false));

export const execute = executeProfileCommand;
