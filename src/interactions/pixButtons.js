import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { getPayment } from "../database/pixPayments.js";
import { isStaff, isAdmin } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { createAndPostPixCharge, checkAndUpdatePixPayment, replyPixError } from "../utils/pixCharge.js";
import { buildMainPanel } from "../utils/painelView.js";

function parseValor(raw) {
  const trimmed = raw.trim();
  // Formato brasileiro (ex: 1.234,56): remove separador de milhar e troca vírgula decimal por ponto.
  if (trimmed.includes(",")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return Number(trimmed);
}

export async function handleOpenPixModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para gerar cobranças Pix.")], ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId("pix_modal").setTitle("Gerar Cobrança Pix");

  const valorInput = new TextInputBuilder()
    .setCustomId("valor")
    .setLabel("Valor (R$)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 49,90")
    .setMaxLength(12)
    .setRequired(true);

  const descricaoInput = new TextInputBuilder()
    .setCustomId("descricao")
    .setLabel("Descrição (opcional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: Pacote de gemas")
    .setMaxLength(200)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(valorInput),
    new ActionRowBuilder().addComponents(descricaoInput),
  );

  await interaction.showModal(modal);
}

export async function handlePixModalSubmit(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para gerar cobranças Pix.")], ephemeral: true });
  }

  const valor = parseValor(interaction.fields.getTextInputValue("valor"));
  if (!Number.isFinite(valor) || valor <= 0) {
    return interaction.reply({ embeds: [errorEmbed("Valor inválido. Use um número maior que zero, ex: 49,90.")], ephemeral: true });
  }

  const descricao = interaction.fields.getTextInputValue("descricao") || `Pagamento ${cfg.communityName}`;

  await interaction.deferReply({ ephemeral: true });

  try {
    await createAndPostPixCharge({
      channel: interaction.channel,
      guildId: interaction.guildId,
      requesterId: interaction.user.id,
      amount: valor,
      description: descricao,
      cfg,
    });
    await interaction.editReply({ embeds: [successEmbed("Cobrança Pix gerada neste canal.")] });
  } catch (err) {
    console.error("[pixButtons] Falha ao criar cobrança:", err);
    await replyPixError(interaction, err);
  }
}

export async function handleCheckButton(interaction) {
  const paymentId = interaction.customId.split(":")[1];
  const payment = getPayment(paymentId);

  if (!payment) {
    return interaction.reply({ embeds: [errorEmbed("Cobrança não encontrada.")], ephemeral: true });
  }

  if (payment.status !== "pending") {
    return interaction.reply({ embeds: [errorEmbed(`Esta cobrança já está com status: ${payment.status}.`)], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const updated = await checkAndUpdatePixPayment(interaction.client, paymentId);

  const statusMessage =
    updated.status === "pending"
      ? "Ainda sem confirmação de pagamento."
      : updated.status === "approved"
        ? "✅ Pagamento confirmado!"
        : `Status atual: ${updated.status}.`;

  await interaction.editReply({ embeds: [successEmbed(statusMessage)] });
}

export async function handleOpenMpTokenModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem configurar o Mercado Pago.")], ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId("mp_token_modal").setTitle("Configurar Mercado Pago");

  const tokenInput = new TextInputBuilder()
    .setCustomId("token")
    .setLabel("Access Token do Mercado Pago")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.mercadoPagoAccessToken ? "Já configurado — digite um novo pra substituir" : "Cole aqui o Access Token de produção")
    .setMaxLength(300)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));

  await interaction.showModal(modal);
}

export async function handleMpTokenModalSubmit(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem configurar o Mercado Pago.")], ephemeral: true });
  }

  const token = interaction.fields.getTextInputValue("token").trim();

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    c.mercadoPagoAccessToken = token || null;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(updated));
  }

  return interaction.reply({
    embeds: [successEmbed("Token do Mercado Pago salvo! O `/pix` já vai gerar cobranças reais a partir de agora.")],
    ephemeral: true,
  });
}
