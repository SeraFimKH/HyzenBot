import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { StatusMode } from "../database/networkStatus.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed } from "../utils/embeds.js";
import { applyStatusMode, MAX_REASON_LENGTH } from "../interactions/statusConfig.js";

export const data = new SlashCommandBuilder()
  .setName("status-definir")
  .setDescription("Define o status do servidor: automático, online, manutenção ou offline (apenas administradores).")
  .addStringOption((opt) =>
    opt
      .setName("modo")
      .setDescription("O que o bot mostra (em manutenção, o servidor também só deixa a equipe entrar)")
      .setRequired(true)
      .addChoices(
        { name: "Automático — o bot detecta online/offline", value: StatusMode.AUTO },
        { name: "Online", value: StatusMode.ONLINE },
        { name: "Manutenção", value: StatusMode.MAINTENANCE },
        { name: "Offline", value: StatusMode.OFFLINE },
      ),
  )
  .addStringOption((opt) =>
    opt.setName("motivo").setDescription("Aparece no status e, na manutenção, para quem tenta entrar no servidor").setRequired(false).setMaxLength(MAX_REASON_LENGTH),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const mode = interaction.options.getString("modo", true);
  const reason = interaction.options.getString("motivo");
  const result = await applyStatusMode(interaction, mode, reason);
  await interaction.editReply({ embeds: [result.embed] });
}
