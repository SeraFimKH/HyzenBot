import { SlashCommandBuilder } from "discord.js";
import { executeProfileCommand } from "../utils/profileView.js";

export const data = new SlashCommandBuilder()
  .setName("perfil")
  .setDescription("Mostra o perfil de um jogador: stats, status de ban e se está online. Sem alvo, mostra o seu.")
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false));

export const execute = executeProfileCommand;
