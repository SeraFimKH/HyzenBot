import { isStaff } from "./permissions.js";
import { errorEmbed } from "./embeds.js";

/**
 * Restringe comandos de membro (ex: /participar, /feed) ao canal configurado em
 * cfg.channels.commands, se houver um definido. Staff/admin sempre podem usar em
 * qualquer canal. Retorna true se a execução pode continuar; se retornar false,
 * já respondeu a interação com o erro (não chame interaction.reply de novo).
 */
export async function enforceCommandsChannel(interaction, cfg) {
  if (!cfg.channels.commands) return true;
  if (isStaff(interaction.member, cfg)) return true;
  if (interaction.channelId === cfg.channels.commands) return true;

  await interaction.reply({
    embeds: [errorEmbed(`Esse comando só pode ser usado em <#${cfg.channels.commands}>.`)],
    ephemeral: true,
  });
  return false;
}
