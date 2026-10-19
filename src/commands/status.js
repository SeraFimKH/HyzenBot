import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { currentServerStatus, setMaintenanceProgress } from "../services/serverStatus.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed } from "../utils/embeds.js";
import { buildStatusEmbed } from "../utils/statusEmbed.js";
import { pinPanelRow } from "../interactions/statusConfig.js";

const STAGE_MAX_LENGTH = 100;
// "40", "40%" ou "40 %".
const PROGRESS_PATTERN = /^(\d{1,3})\s*%?$/;
// Escrito no lugar da etapa, apaga a que estava.
const CLEAR_STAGE = "-";

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Mostra se o servidor está online, em manutenção ou offline e quantos jogadores tem.")
  .addStringOption((opt) =>
    opt.setName("progresso").setDescription("Administradores: o progresso da manutenção em andamento (ex: 40%)").setRequired(false).setMaxLength(5),
  )
  .addStringOption((opt) =>
    opt
      .setName("etapa")
      .setDescription(`Administradores: o que está sendo feito agora na manutenção ("${CLEAR_STAGE}" apaga)`)
      .setRequired(false)
      .setMaxLength(STAGE_MAX_LENGTH),
  );

export async function execute(interaction) {
  const progressText = interaction.options.getString("progresso");
  const stageText = interaction.options.getString("etapa");
  if (progressText !== null || stageText !== null) {
    return updateProgress(interaction, progressText, stageText);
  }

  // A primeira consulta depois do bot ligar pode esperar o ping do servidor (até uns segundos).
  await interaction.deferReply();

  const cfg = getGuildConfig(interaction.guildId);
  const status = await currentServerStatus(interaction.client);

  // Esta resposta é uma foto do momento. Enquanto o servidor não tiver um painel de status, um administrador
  // ganha o botão que transforma esta mesma mensagem no painel — que o bot passa a atualizar sozinho.
  const offerPin = !cfg.channels.status && isAdmin(interaction.member, cfg);
  await interaction.editReply({
    embeds: [buildStatusEmbed(cfg, status, interaction.guild?.iconURL({ size: 256 }))],
    components: offerPin ? [pinPanelRow()] : [],
  });
}

// /status progresso:40% etapa:Atualizando os mapas — o painel, a presença do bot e o /ip mostram na hora.
async function updateProgress(interaction, progressText, stageText) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Só administradores podem dar o progresso da manutenção. Use `/status` sem nada para ver o status.")], ephemeral: true });
  }

  let progress = null;
  if (progressText !== null) {
    const match = progressText.trim().match(PROGRESS_PATTERN);
    progress = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(progress) || progress > 100) {
      return interaction.reply({ embeds: [errorEmbed("O progresso precisa ser um número de 0 a 100, como `40` ou `40%`.")], ephemeral: true });
    }
  }
  const stage = stageText === null ? null : stageText.trim() === CLEAR_STAGE ? "" : stageText.trim();

  await interaction.deferReply({ ephemeral: true });
  const result = await setMaintenanceProgress(interaction.client, { progress, stage, updatedBy: interaction.user.id });
  if (!result.ok) {
    return interaction.editReply({ embeds: [errorEmbed(result.reason)] });
  }

  const shown = result.status.maintenance;
  return interaction.editReply({
    content: `✅ Progresso da manutenção: **${shown?.progress ?? 0}%**${shown?.stage ? ` — ${shown.stage}` : ""}. O painel de status e a presença do bot já mostram.` +
      (shown?.progress >= 100 ? "\nQuando o servidor estiver pronto, encerre a manutenção com `/status-definir modo:Automático`." : ""),
    embeds: [buildStatusEmbed(cfg, result.status, interaction.guild?.iconURL({ size: 256 }))],
  });
}
