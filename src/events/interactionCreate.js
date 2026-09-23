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
      if (interaction.customId === "ai_key_modal") return await aiConfig.handleAiKeyModalSubmit(interaction);
      if (interaction.customId === "ai_context_modal") return await aiConfig.handleAiContextModalSubmit(interaction);
      if (interaction.customId.startsWith("text_edit_modal:")) return await textConfig.handleTextModalSubmit(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "painel_categoria") return await painelMenu.handleCategorySelect(interaction);
      if (interaction.customId === "painel_menu") return await painelMenu.handleMenuSelect(interaction);
      if (interaction.customId === "ticket_type_select") return await ticketButtons.handleTypeSelected(interaction);
      if (interaction.customId === "painel_tipoticket_remover") return await painelMenu.handleTipoTicketRemoveSelect(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId.startsWith("painel_channel_")) return await painelMenu.handleChannelSelect(interaction);
      return;
    }

    if (interaction.isRoleSelectMenu()) {
      if (interaction.customId.startsWith("painel_role_")) return await painelMenu.handleRoleSelect(interaction);
      return;
    }
  } catch (err) {
    console.error("[interactionCreate] Erro ao processar interação:", err);
    await replyError(interaction, "Ocorreu um erro inesperado ao processar sua solicitação. Tente novamente.");
  }
}
