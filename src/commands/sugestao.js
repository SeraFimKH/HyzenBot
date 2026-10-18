import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";
import { setSuggestionStatus } from "../services/suggestionStatus.js";
import { REASON_MAX_LENGTH } from "../utils/suggestionViews.js";

// O mesmo que os botões do cartão de cada sugestão, mas indo para qualquer situação — inclusive mudar uma resposta já
// dada (os botões só seguem em frente: em votação → em análise → aprovada → implementada).
export const data = new SlashCommandBuilder()
  .setName("sugestao")
  .setDescription("Sugestões da comunidade (administradores).")
  .addSubcommand((sub) =>
    sub
      .setName("responder")
      .setDescription("Muda a situação de uma sugestão: em análise, aprovada, recusada ou implementada.")
      .addIntegerOption((opt) => opt.setName("numero").setDescription("O número da sugestão (#12 → 12)").setRequired(true).setMinValue(1))
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("Aprovada, recusada e implementada encerram a votação")
          .setRequired(true)
          .addChoices(
            { name: "🔍 Em análise", value: "REVIEW" },
            { name: "✅ Aprovada", value: "APPROVED" },
            { name: "❌ Recusada", value: "REJECTED" },
            { name: "🚀 Implementada", value: "DONE" },
          ),
      )
      .addStringOption((opt) => opt.setName("motivo").setDescription("O porquê, para a comunidade e para quem sugeriu").setRequired(false).setMaxLength(REASON_MAX_LENGTH)),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const number = interaction.options.getInteger("numero", true);
  const status = interaction.options.getString("status", true);
  const reason = interaction.options.getString("motivo")?.trim() || null;

  const result = await setSuggestionStatus(interaction.client, interaction.guildId, number, status, interaction.user.id, reason);
  if (!result.ok) {
    return interaction.editReply({ embeds: [errorEmbed(result.reason)] });
  }
  return interaction.editReply({
    embeds: [
      successEmbed(
        `Sugestão **#${number}** marcada como ${result.view.emoji} **${result.view.label}**.` +
          (result.view.final ? " A votação foi encerrada." : "") +
          (result.dmSent ? " Quem sugeriu foi avisado no privado." : " Não deu para avisar quem sugeriu no privado."),
      ),
    ],
  });
}
