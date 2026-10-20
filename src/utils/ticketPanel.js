import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { baseEmbed } from "./embeds.js";
import { getText } from "./textDefaults.js";

export const TICKET_HOURS_NOTE = "🕐 **Horário de atendimento:** Segunda a Sábado das 08:00 às 22:30 · Domingo das 08:00 às 12:30";

export const TICKET_OPEN_BUTTON_ID = "ticket_open";
export const TICKET_TYPE_SELECT_ID = "ticket_open_select";
// ticket_modal:<tipo> — o formulário de motivo e descrição (tipo vazio quando o servidor não tem tipos de suporte).
export const TICKET_MODAL_PREFIX = "ticket_modal:";

export const REASON_MAX_LENGTH = 100;
export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 1000;
const MODAL_TITLE_MAX_LENGTH = 45;

// Como se abre um ticket no painel: com tipos de suporte configurados, o menu de tipos fica no próprio painel — um
// clique a menos e sem a mensagem "só você pode ver"; sem tipos, o botão.
export function buildTicketOpenRow(cfg) {
  if (cfg.ticketTypes.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(TICKET_TYPE_SELECT_ID)
      .setPlaceholder(getText(cfg, "ticket_select_placeholder"))
      // A descrição de cada tipo aparece em letra pequena embaixo do nome.
      .addOptions(cfg.ticketTypes.map((type) => ({ label: type.label, value: type.label, emoji: type.emoji || undefined, description: type.description || undefined })));
    return new ActionRowBuilder().addComponents(menu);
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_OPEN_BUTTON_ID).setLabel(getText(cfg, "ticket_abrir_botao")).setEmoji("🎫").setStyle(ButtonStyle.Primary),
  );
}

export function buildTicketPanelPayload(cfg) {
  const embed = baseEmbed(cfg.communityName)
    .setTitle(getText(cfg, "ticket_panel_titulo"))
    .setDescription(`${getText(cfg, "ticket_panel_desc")}\n\n${TICKET_HOURS_NOTE}`);
  return { embeds: [embed], components: [buildTicketOpenRow(cfg)] };
}

// O formulário que abre ao escolher o tipo (ou clicar no botão): o motivo, em uma linha, e a descrição.
export function buildTicketModal(ticketType) {
  const title = ticketType ? `🎫 Abrir ticket — ${ticketType.label}` : "🎫 Abrir ticket";

  const reason = new TextInputBuilder()
    .setCustomId("motivo")
    .setLabel("Motivo")
    .setPlaceholder("Ex: Não recebi meu VIP depois de pagar")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(REASON_MAX_LENGTH)
    .setRequired(true);

  const description = new TextInputBuilder()
    .setCustomId("descricao")
    .setLabel("Descrição")
    .setPlaceholder("Conte com detalhes o que aconteceu — assim a equipe já chega sabendo como ajudar.")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(DESCRIPTION_MIN_LENGTH)
    .setMaxLength(DESCRIPTION_MAX_LENGTH)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`${TICKET_MODAL_PREFIX}${ticketType?.label ?? ""}`)
    .setTitle(title.length > MODAL_TITLE_MAX_LENGTH ? `${title.slice(0, MODAL_TITLE_MAX_LENGTH - 1)}…` : title)
    .addComponents(new ActionRowBuilder().addComponents(reason), new ActionRowBuilder().addComponents(description));
}

// Publica o painel no canal de ticket. O painel que já está lá é atualizado no mesmo lugar (ninguém perde ele de
// vista, e não fica um painel antigo para trás); só sem painel é que uma mensagem nova é postada.
export async function publishTicketPanel(guild, cfg) {
  if (!cfg.channels.ticket) {
    return { ok: false, reason: "Configure o canal de ticket primeiro." };
  }

  const channel = await guild.channels.fetch(cfg.channels.ticket).catch(() => null);
  if (!channel) {
    return { ok: false, reason: "O canal de ticket configurado não foi encontrado." };
  }

  const payload = buildTicketPanelPayload(cfg);
  const existing = cfg.ticketPanelMessageId ? await channel.messages.fetch(cfg.ticketPanelMessageId).catch(() => null) : null;
  if (existing) {
    await existing.edit(payload);
    return { ok: true, channel, updated: true };
  }

  const panelMessage = await channel.send(payload);
  updateGuildConfig(guild.id, (c) => {
    c.ticketPanelMessageId = panelMessage.id;
  });
  return { ok: true, channel, updated: false };
}

// Atualiza o painel já publicado, se houver um — depois de mudar os tipos de suporte ou os textos, e quando o bot
// liga (um painel antigo, com o botão, passa sozinho para o menu). Nunca posta um painel novo.
export async function refreshTicketPanel(guild) {
  const cfg = getGuildConfig(guild.id);
  if (!cfg.channels.ticket || !cfg.ticketPanelMessageId) return false;
  const channel = await guild.channels.fetch(cfg.channels.ticket).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(cfg.ticketPanelMessageId).catch(() => null) : null;
  if (!message) return false;
  await message.edit(buildTicketPanelPayload(cfg));
  return true;
}

export async function refreshTicketPanels(client) {
  for (const guild of client.guilds.cache.values()) {
    await refreshTicketPanel(guild).catch((err) => console.error(`[ticketPanel] failed to update the ticket panel in guild ${guild.id}:`, err.message));
  }
}
