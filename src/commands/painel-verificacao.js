import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { buildAuthPanelMessage } from "../interactions/authButtons.js";

// Nome separado de /painel (o menu de configuração geral do bot, em commands/painel.js) — evita colisão e
// deixa claro que este painel é só o de verificação de conta.
export const data = new SlashCommandBuilder()
  .setName("painel-verificacao")
  .setDescription("Posta o painel fixo de verificação de conta neste canal.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.channel.send(buildAuthPanelMessage());
  await interaction.reply({ content: "Painel postado.", ephemeral: true });
}
