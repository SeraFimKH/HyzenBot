import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { updateGuildConfig } from "../database/guildConfig.js";
import { baseEmbed } from "./embeds.js";
import { getText } from "./textDefaults.js";

export const TICKET_HOURS_NOTE = "🕐 **Horário de atendimento:** Segunda a Sábado das 08:00 às 22:30 · Domingo das 08:00 às 12:30";

export async function publishTicketPanel(guild, cfg) {
  if (!cfg.channels.ticket) {
    return { ok: false, reason: "Configure o canal de ticket primeiro." };
  }

  const channel = await guild.channels.fetch(cfg.channels.ticket).catch(() => null);
  if (!channel) {
    return { ok: false, reason: "O canal de ticket configurado não foi encontrado." };
  }

  const embed = baseEmbed(cfg.communityName)
    .setTitle(getText(cfg, "ticket_panel_titulo"))
    .setDescription(`${getText(cfg, "ticket_panel_desc")}\n\n${TICKET_HOURS_NOTE}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_open").setLabel(getText(cfg, "ticket_abrir_botao")).setEmoji("🎫").setStyle(ButtonStyle.Primary),
  );

  const panelMessage = await channel.send({ embeds: [embed], components: [row] });

  updateGuildConfig(guild.id, (c) => {
    c.ticketPanelMessageId = panelMessage.id;
  });

  return { ok: true, channel };
}
