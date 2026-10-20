import { errorEmbed } from "../utils/embeds.js";
import * as ticketButtons from "../interactions/ticketButtons.js";
import * as pollButtons from "../interactions/pollButtons.js";
import * as feedModal from "../interactions/feedModal.js";
import * as avisoModal from "../interactions/avisoModal.js";
import * as painelMenu from "../interactions/painelMenu.js";
import * as feedButton from "../interactions/feedButton.js";
import * as pixButtons from "../interactions/pixButtons.js";
import * as rulesModal from "../interactions/rulesModal.js";
import * as rulesButtons from "../interactions/rulesButtons.js";
import * as raffleButtons from "../interactions/raffleButtons.js";
import * as aiConfig from "../interactions/aiConfig.js";
import * as textConfig from "../interactions/textConfig.js";
import * as statusConfig from "../interactions/statusConfig.js";
import * as suggestionButtons from "../interactions/suggestionButtons.js";
import * as suggestionConfig from "../interactions/suggestionConfig.js";
import * as supportConfig from "../interactions/supportConfig.js";
import * as adminGuildConfig from "../interactions/adminGuildConfig.js";
import * as betaConfig from "../interactions/betaConfig.js";
import { BETA_CLOSE_BUTTON_ID, BETA_OPEN_BUTTON_ID } from "../utils/betaViews.js";
import * as betaRegistration from "../interactions/betaRegistration.js";
import * as preRegistration from "../utils/betaRegistrationViews.js";
import { PANEL_BUTTON_ID as SUGGESTION_BUTTON_ID, REASON_MODAL_PREFIX, STATUS_BUTTON_PREFIX, SUGGESTION_MODAL_ID } from "../utils/suggestionViews.js";
import { handleAuthStart, handleAuthCheck } from "../interactions/authButtons.js";

async function replyError(interaction, message) {
  const payload = { embeds: [errorEmbed(message)], ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

export const name = "interactionCreate";
export async function execute(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const { customId } = interaction;
      if (customId === "ticket_open") return await ticketButtons.handleOpen(interaction);
      if (customId === "ticket_claim") return await ticketButtons.handleClaim(interaction);
      if (customId === "ticket_voice") return await ticketButtons.handleCreateVoice(interaction);
      if (customId === "ticket_close") return await ticketButtons.handleClose(interaction);
      if (customId.startsWith("poll_vote_")) return await pollButtons.handleVote(interaction);
      if (customId === "painel_back") return await painelMenu.handleBack(interaction);
      if (customId === "painel_tipoticket_add") return await painelMenu.handleTipoTicketAddButton(interaction);
      if (customId.startsWith("feed_open_modal")) return await feedButton.handleOpenFeedback(interaction);
      if (customId === "ticket_pix") return await pixButtons.handleOpenPixModal(interaction);
      if (customId.startsWith("pix_check:")) return await pixButtons.handleCheckButton(interaction);
      if (customId === "painel_pixtest_on" || customId === "painel_pixtest_off") return await painelMenu.handlePixTestToggle(interaction);
      if (customId.startsWith("rules_accept")) return await rulesButtons.handleAccept(interaction);
      if (customId.startsWith("rules_decline")) return await rulesButtons.handleDecline(interaction);
      if (customId === "raffle_participar") return await raffleButtons.handleParticipar(interaction);
      if (customId === "painel_ia_on" || customId === "painel_ia_off") return await painelMenu.handleAiToggle(interaction);
      if (customId.startsWith("painel_status_")) return await statusConfig.handleStatusModeButton(interaction);
      if (customId === statusConfig.PIN_BUTTON_ID) return await statusConfig.handleStatusPin(interaction);
      if (customId === SUGGESTION_BUTTON_ID) return await suggestionButtons.handleOpenSuggestion(interaction);
      if (customId.startsWith(STATUS_BUTTON_PREFIX)) return await suggestionButtons.handleStatusButton(interaction);
      if (customId === adminGuildConfig.ADMIN_GUILD_UNLINK_ID) return await adminGuildConfig.handleAdminGuildUnlink(interaction);
      if (customId.startsWith(adminGuildConfig.REMOTE_PAGE_PREFIX)) return await adminGuildConfig.handleRemoteChannelPage(interaction);
      if (customId === BETA_OPEN_BUTTON_ID || customId === BETA_CLOSE_BUTTON_ID) return await betaConfig.handleBetaAccessButton(interaction);
      if (customId === preRegistration.PANEL_BUTTON_ID) return await betaRegistration.handleOpen(interaction);
      if (customId.startsWith(preRegistration.APPROVE_PREFIX)) return await betaRegistration.handleApprove(interaction);
      if (customId.startsWith(preRegistration.REJECT_PREFIX)) return await betaRegistration.handleReject(interaction);
      if (customId === "auth:start") return await handleAuthStart(interaction);
      if (customId === "auth:check") return await handleAuthCheck(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("feed_modal")) return await feedModal.handle(interaction);
      if (interaction.customId === "aviso_modal") return await avisoModal.handle(interaction);
      if (interaction.customId === "painel_tipoticket_add_modal") return await painelMenu.handleTipoTicketAddModal(interaction);
      if (interaction.customId === "pix_modal") return await pixButtons.handlePixModalSubmit(interaction);
      if (interaction.customId === "mp_token_modal") return await pixButtons.handleMpTokenModalSubmit(interaction);
      if (interaction.customId.startsWith("rules_edit_modal:")) return await rulesModal.handleRulesModalSubmit(interaction);
      if (interaction.customId === "sorteio_max_modal") return await painelMenu.handleSorteioMaxModalSubmit(interaction);
      if (interaction.customId === "sorteio_preco_modal") return await painelMenu.handleSorteioPrecoModalSubmit(interaction);
      if (interaction.customId === "bot_nome_modal") return await painelMenu.handleBotNomeModalSubmit(interaction);
      if (interaction.customId === "nome_comunidade_modal") return await painelMenu.handleNomeComunidadeModalSubmit(interaction);
      if (interaction.customId === "server_ip_modal") return await painelMenu.handleServerIpModalSubmit(interaction);
      if (interaction.customId === "ai_key_modal") return await aiConfig.handleAiKeyModalSubmit(interaction);
      if (interaction.customId === "ai_context_modal") return await aiConfig.handleAiContextModalSubmit(interaction);
      if (interaction.customId.startsWith("text_edit_modal:")) return await textConfig.handleTextModalSubmit(interaction);
      if (interaction.customId.startsWith("status_reason_modal:")) return await statusConfig.handleStatusReasonModalSubmit(interaction);
      if (interaction.customId.startsWith("ticket_modal:")) return await ticketButtons.handleTicketModalSubmit(interaction);
      if (interaction.customId === SUGGESTION_MODAL_ID) return await suggestionButtons.handleSuggestionModalSubmit(interaction);
      if (interaction.customId.startsWith(REASON_MODAL_PREFIX)) return await suggestionButtons.handleReasonModalSubmit(interaction);
      if (interaction.customId === suggestionConfig.CONFIG_MODAL_ID) return await suggestionConfig.handleSuggestionConfigModalSubmit(interaction);
      if (interaction.customId === preRegistration.MODAL_ID) return await betaRegistration.handleModalSubmit(interaction);
      if (interaction.customId.startsWith(preRegistration.REASON_MODAL_PREFIX)) return await betaRegistration.handleReasonSubmit(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "painel_categoria") return await painelMenu.handleCategorySelect(interaction);
      if (interaction.customId === "painel_menu") return await painelMenu.handleMenuSelect(interaction);
      // ticket_type_select: o menu antigo, que aparecia só para quem clicava no botão.
      if (interaction.customId === "ticket_open_select" || interaction.customId === "ticket_type_select") return await ticketButtons.handleTypeSelected(interaction);
      if (interaction.customId === "painel_tipoticket_remover") return await painelMenu.handleTipoTicketRemoveSelect(interaction);
      if (interaction.customId === supportConfig.TYPE_SELECT_ID) return await supportConfig.handleTypeSelect(interaction);
      if (interaction.customId === adminGuildConfig.ADMIN_GUILD_SELECT_ID) return await adminGuildConfig.handleAdminGuildSelect(interaction);
      if (interaction.customId.startsWith(adminGuildConfig.REMOTE_CHANNEL_PREFIX)) return await adminGuildConfig.handleRemoteChannelSelect(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId.startsWith("painel_channel_")) return await painelMenu.handleChannelSelect(interaction);
      return;
    }

    if (interaction.isRoleSelectMenu()) {
      if (interaction.customId.startsWith("painel_role_")) return await painelMenu.handleRoleSelect(interaction);
      if (interaction.customId.startsWith(supportConfig.ROLE_SELECT_PREFIX)) return await supportConfig.handleRoleSelect(interaction);
      return;
    }
  } catch (err) {
    console.error("[interactionCreate] Erro ao processar interação:", err);
    await replyError(interaction, "Ocorreu um erro inesperado ao processar sua solicitação. Tente novamente.");
  }
}
