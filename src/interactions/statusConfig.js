import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { getCachedNetworkStatus, StatusMode, StatusTableMissingError } from "../database/networkStatus.js";
import { currentServerStatus, setStatusMode } from "../services/serverStatus.js";
import { errorEmbed } from "../utils/embeds.js";
import { buildStatusModeEmbed, MODE_VIEW } from "../utils/statusEmbed.js";

// O motivo vai para um VARCHAR(255) e aparece na tela de desconexão do jogo.
export const MAX_REASON_LENGTH = 200;
// O nome de quem mudou (hyzen_network_status.changed_by é VARCHAR(64)).
const MAX_AUTHOR_LENGTH = 64;
// Nestes modos faz sentido dizer o porquê; nos outros o motivo é descartado.
const MODES_WITH_REASON = [StatusMode.MAINTENANCE, StatusMode.OFFLINE];

const BUTTON_PREFIX = "painel_status_";
const MODAL_PREFIX = "status_reason_modal:";

/**
 * Grava o modo escolhido (o banco + o aviso que faz os servidores aplicarem na hora) e atualiza a presença e o
 * painel de status. Usado pelo /status-definir e pelos botões do /painel. Não lança: devolve { ok, embed }, com o
 * embed do resultado ou do erro.
 */
export async function applyStatusMode(interaction, mode, reason) {
  const cleanReason = MODES_WITH_REASON.includes(mode) ? reason?.trim().slice(0, MAX_REASON_LENGTH) || null : null;
  try {
    const { network, status } = await setStatusMode(interaction.client, mode, cleanReason, interaction.user.tag.slice(0, MAX_AUTHOR_LENGTH));
    return { ok: true, embed: buildStatusModeEmbed(network, status) };
  } catch (err) {
    if (err instanceof StatusTableMissingError) {
      return {
        ok: false,
        embed: errorEmbed("O banco ainda não tem a tabela de status. Ela é criada pelo **HyzenCore** atualizado na primeira vez que o servidor liga — atualize o plugin, ligue o servidor uma vez e tente de novo."),
      };
    }
    console.error("[statusConfig] failed to set the server status", err);
    return { ok: false, embed: errorEmbed("Não consegui gravar o status no banco de dados. Tente de novo em instantes.") };
  }
}

function modeButtons(currentMode) {
  const row = new ActionRowBuilder().addComponents(
    Object.values(StatusMode).map((mode) =>
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${mode}`)
        .setLabel(`${MODE_VIEW[mode].emoji} ${MODE_VIEW[mode].label}`)
        .setStyle(mode === currentMode ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(mode === currentMode),
    ),
  );
  const back = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("painel_back").setLabel("⬅️ Voltar ao painel").setStyle(ButtonStyle.Secondary));
  return [row, back];
}

// A tela "Definir Status do Servidor" do /painel: o modo atual e um botão para cada modo.
export async function buildStatusModeView(client) {
  const network = getCachedNetworkStatus();
  const status = await currentServerStatus(client);
  return { embeds: [buildStatusModeEmbed(network, status)], components: modeButtons(network.mode) };
}

export async function handleStatusModeButton(interaction) {
  const mode = interaction.customId.slice(BUTTON_PREFIX.length);
  if (!StatusMode[mode]) return;

  if (MODES_WITH_REASON.includes(mode)) {
    const modal = new ModalBuilder().setCustomId(`${MODAL_PREFIX}${mode}`).setTitle(`${MODE_VIEW[mode].label} — motivo`);
    const reasonInput = new TextInputBuilder()
      .setCustomId("motivo")
      .setLabel("Motivo (opcional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(mode === StatusMode.MAINTENANCE ? "Ex: Atualização do servidor, voltamos às 18h" : "Ex: Voltamos na sexta-feira")
      .setMaxLength(MAX_REASON_LENGTH)
      .setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }

  await interaction.deferUpdate();
  await showResult(interaction, await applyStatusMode(interaction, mode, null));
}

export async function handleStatusReasonModalSubmit(interaction) {
  const mode = interaction.customId.slice(MODAL_PREFIX.length);
  if (!StatusMode[mode]) return;

  // O modal aberto por um botão do painel atualiza o próprio painel; qualquer outro caso responde à parte.
  if (interaction.isFromMessage()) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ ephemeral: true });
  }
  await showResult(interaction, await applyStatusMode(interaction, mode, interaction.fields.getTextInputValue("motivo")));
}

async function showResult(interaction, result) {
  const components = modeButtons(getCachedNetworkStatus().mode);
  await interaction.editReply({ embeds: [result.embed], components });
}
