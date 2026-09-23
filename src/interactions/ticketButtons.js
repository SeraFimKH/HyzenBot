import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { getTicket, createTicket, updateTicket, deleteTicket, findOpenTicketByUser } from "../database/tickets.js";
import { isStaff } from "../utils/permissions.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildTranscriptAttachment } from "../utils/ticketTranscript.js";
import { formatDuration } from "../utils/format.js";
import { TICKET_HOURS_NOTE } from "../utils/ticketPanel.js";
import { isWithinSupportHours } from "../utils/businessHours.js";
import { getText } from "../utils/textDefaults.js";

function ticketControlsRow({ claimed, closing, hasVoice }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(claimed ? "Assumido" : "Assumir")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimed || closing),
    new ButtonBuilder()
      .setCustomId("ticket_voice")
      .setLabel(hasVoice ? "Canal de Voz Criado" : "Criar Canal de Voz")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(hasVoice || closing),
    new ButtonBuilder()
      .setCustomId("ticket_pix")
      .setLabel("Gerar Pix")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closing),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Fechar")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closing),
  );
}

function getStaffAndAdminRoleIds(cfg) {
  return [...new Set([...cfg.adminRoles, ...cfg.staffRoles])];
}

function buildPermissionOverwrites(guild, cfg, openerId) {
  const staffAndAdminRoles = getStaffAndAdminRoleIds(cfg);
  const memberPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
  ];

  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: openerId, allow: memberPerms },
    { id: guild.client.user.id, allow: [...memberPerms, PermissionFlagsBits.ManageChannels] },
    ...staffAndAdminRoles.map((roleId) => ({ id: roleId, allow: memberPerms })),
  ];
}

async function replyOrEdit(interaction, embed) {
  const payload = { embeds: [embed], components: [] };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

async function createTicketChannel(interaction, cfg, ticketType) {
  const category = await interaction.guild.channels.fetch(cfg.ticketCategoryId).catch(() => null);
  if (!category) {
    return replyOrEdit(interaction, errorEmbed("A categoria de tickets configurada não foi encontrada. Peça a um administrador para configurá-la novamente."));
  }

  const permissionOverwrites = buildPermissionOverwrites(interaction.guild, cfg, interaction.user.id);
  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "usuario";
  const typeSlug = ticketType ? `-${ticketType.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "")}` : "";

  let number;
  updateGuildConfig(interaction.guildId, (c) => {
    c.ticketCounter = (c.ticketCounter || 0) + 1;
    number = c.ticketCounter;
  });

  const channel = await interaction.guild.channels.create({
    name: `ticket-${String(number).padStart(4, "0")}${typeSlug}-${safeName}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });

  createTicket(channel.id, { guildId: interaction.guildId, openerId: interaction.user.id, type: ticketType?.label || null, number });

  const withinHours = isWithinSupportHours();

  const statusLine = withinHours ? getText(cfg, "ticket_boasvindas_aberto") : getText(cfg, "ticket_boasvindas_fechado");

  const embed = baseEmbed(cfg.communityName)
    .setTitle(`🎫 Ticket #${String(number).padStart(4, "0")}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(`Olá <@${interaction.user.id}>! Obrigado por abrir um ticket.\n\n${statusLine}\n\n${TICKET_HOURS_NOTE}`)
    .addFields(
      { name: "👤 Aberto por", value: `<@${interaction.user.id}>`, inline: true },
      { name: "🗂️ Tipo de suporte", value: ticketType ? `${ticketType.emoji ? `${ticketType.emoji} ` : ""}${ticketType.label}` : "*(não informado)*", inline: true },
      { name: "📌 Status", value: withinHours ? "🟡 Aguardando atendimento" : "🌙 Fora do horário de atendimento", inline: true },
    );

  const pingContent = withinHours
    ? [`<@${interaction.user.id}>`, ...getStaffAndAdminRoleIds(cfg).map((roleId) => `<@&${roleId}>`)].join(" ")
    : `<@${interaction.user.id}>`;

  await channel.send({
    content: pingContent,
    embeds: [embed],
    components: [ticketControlsRow({ claimed: false, closing: false, hasVoice: false })],
  });

  await replyOrEdit(interaction, successEmbed(`Seu ticket foi criado em ${channel}.`));
  setTimeout(() => interaction.deleteReply().catch(() => {}), 8000);
}

export async function handleOpen(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!cfg.ticketCategoryId) {
    return interaction.reply({
      embeds: [errorEmbed("O sistema de tickets ainda não foi configurado. Peça a um administrador para rodar `/config categoria-ticket`.")],
      ephemeral: true,
    });
  }

  const existing = findOpenTicketByUser(interaction.guildId, interaction.user.id);
  if (existing) {
    return interaction.reply({
      embeds: [errorEmbed(`Você já tem um ticket aberto em <#${existing.channelId}>.`)],
      ephemeral: true,
    });
  }

  if (!cfg.ticketTypes.length) {
    await interaction.deferReply({ ephemeral: true });
    return createTicketChannel(interaction, cfg, null);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_type_select")
    .setPlaceholder("Selecione o tipo de suporte...")
    .addOptions(cfg.ticketTypes.map((t) => ({ label: t.label, value: t.label, emoji: t.emoji || undefined })));

  await interaction.reply({
    embeds: [
      baseEmbed(cfg.communityName)
        .setTitle(getText(cfg, "ticket_panel_titulo"))
        .setDescription(
          `Selecione abaixo o tipo de suporte que você precisa. Em seguida, criaremos um canal privado só para você e nossa equipe.\n\n${TICKET_HOURS_NOTE}`,
        ),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

export async function handleTypeSelected(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  const existing = findOpenTicketByUser(interaction.guildId, interaction.user.id);
  if (existing) {
    await interaction.deferUpdate();
    return replyOrEdit(interaction, errorEmbed(`Você já tem um ticket aberto em <#${existing.channelId}>.`));
  }

  const label = interaction.values[0];
  const ticketType = cfg.ticketTypes.find((t) => t.label === label) || { label, emoji: null };

  await interaction.deferUpdate();
  await createTicketChannel(interaction, cfg, ticketType);
}

export async function handleClaim(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed("Este canal não é um ticket ativo.")], ephemeral: true });
  }

  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para assumir tickets.")], ephemeral: true });
  }

  if (ticket.claimedBy) {
    return interaction.reply({ embeds: [errorEmbed(`Este ticket já foi assumido por <@${ticket.claimedBy}>.`)], ephemeral: true });
  }

  updateTicket(interaction.channel.id, (t) => {
    t.claimedBy = interaction.user.id;
  });

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setDescription(`Este ticket foi assumido por <@${interaction.user.id}>. Ele(a) vai te ajudar a partir de agora!`)
    .setFields(
      { name: "👤 Aberto por", value: `<@${ticket.openerId}>`, inline: true },
      { name: "🗂️ Tipo de suporte", value: ticket.type ? ticket.type : "*(não informado)*", inline: true },
      { name: "📌 Status", value: `🟢 Em atendimento por <@${interaction.user.id}>`, inline: true },
    );

  await interaction.update({
    embeds: [embed],
    components: [ticketControlsRow({ claimed: true, closing: false, hasVoice: !!ticket.voiceChannelId })],
  });
}

export async function handleCreateVoice(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed("Este canal não é um ticket ativo.")], ephemeral: true });
  }

  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para criar o canal de voz.")], ephemeral: true });
  }

  if (ticket.voiceChannelId) {
    return interaction.reply({ embeds: [errorEmbed("Este ticket já tem um canal de voz.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const category = await interaction.guild.channels.fetch(cfg.ticketCategoryId).catch(() => null);
  if (!category) {
    return interaction.editReply({ embeds: [errorEmbed("A categoria de tickets configurada não foi encontrada.")] });
  }

  const permissionOverwrites = buildPermissionOverwrites(interaction.guild, cfg, ticket.openerId);
  const baseName = interaction.channel.name.replace(/^ticket-?/, "") || interaction.channel.name;

  const voiceChannel = await interaction.guild.channels.create({
    name: `voz-${baseName}`,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites,
  });

  updateTicket(interaction.channel.id, (t) => {
    t.voiceChannelId = voiceChannel.id;
  });

  const controlMessage = interaction.message;
  const updatedEmbed = EmbedBuilder.from(controlMessage.embeds[0]).addFields({ name: "🔊 Canal de voz", value: `${voiceChannel}` });

  await controlMessage.edit({
    embeds: [updatedEmbed],
    components: [ticketControlsRow({ claimed: !!ticket.claimedBy, closing: false, hasVoice: true })],
  });

  await interaction.editReply({ embeds: [successEmbed(`Canal de voz criado: ${voiceChannel}`)] });
}

export async function handleClose(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed("Este canal não é um ticket ativo.")], ephemeral: true });
  }

  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Apenas a staff pode fechar o ticket.")], ephemeral: true });
  }

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setDescription("🔒 Este ticket será encerrado em alguns segundos. A transcrição da conversa será enviada em breve.")
    .setFields({ name: "📌 Status", value: "🔴 Encerrando..." });

  await interaction.update({
    embeds: [embed],
    components: [ticketControlsRow({ claimed: !!ticket.claimedBy, closing: true, hasVoice: !!ticket.voiceChannelId })],
  });

  await sendTicketTranscript(interaction, cfg, ticket);

  deleteTicket(interaction.channel.id);

  if (ticket.voiceChannelId) {
    const voiceChannel = await interaction.guild.channels.fetch(ticket.voiceChannelId).catch(() => null);
    if (voiceChannel) {
      setTimeout(() => voiceChannel.delete().catch((err) => console.error("[ticketButtons] Falha ao deletar canal de voz:", err)), 5000);
    }
  }

  setTimeout(() => {
    interaction.channel.delete().catch((err) => console.error("[ticketButtons] Falha ao deletar canal de ticket:", err));
  }, 5000);
}

async function sendTicketTranscript(interaction, cfg, ticket) {
  let attachment;
  try {
    attachment = await buildTranscriptAttachment(interaction.channel);
  } catch (err) {
    console.error("[ticketButtons] Falha ao gerar transcrição do ticket:", err);
    return;
  }

  const summary = baseEmbed(cfg.communityName)
    .setTitle(`🎫 Ticket #${String(ticket.number || 0).padStart(4, "0")} — Encerrado`)
    .addFields(
      { name: "👤 Aberto por", value: `<@${ticket.openerId}>`, inline: true },
      { name: "🗂️ Tipo de suporte", value: ticket.type || "*(não informado)*", inline: true },
      { name: "⏱️ Duração", value: formatDuration(Date.now() - ticket.createdAt), inline: true },
      { name: "🙋 Assumido por", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "*(ninguém assumiu)*", inline: true },
      { name: "🔒 Fechado por", value: `<@${interaction.user.id}>`, inline: true },
    );

  const feedbackRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feed_open_modal:${ticket.guildId}:${interaction.channel.id}`)
      .setLabel("⭐ Avaliar Atendimento")
      .setStyle(ButtonStyle.Primary),
  );

  const opener = await interaction.client.users.fetch(ticket.openerId).catch(() => null);
  if (opener) {
    await opener
      .send({
        embeds: [summary.setDescription("Seu ticket foi encerrado. Segue abaixo o registro da conversa. Se puder, avalie o atendimento clicando no botão abaixo!")],
        files: [attachment],
        components: [feedbackRow],
      })
      .catch((err) => console.warn(`[ticketButtons] Não foi possível enviar a transcrição no privado de ${ticket.openerId} (provavelmente DMs fechadas):`, err.message));
  }

  if (cfg.channels.ticketLog) {
    const logChannel = await interaction.guild.channels.fetch(cfg.channels.ticketLog).catch(() => null);
    if (logChannel) {
      await logChannel.send({ embeds: [summary], files: [attachment] }).catch((err) => console.error("[ticketButtons] Falha ao enviar log de ticket:", err));
    }
  }
}
