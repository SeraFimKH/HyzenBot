import { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from "discord.js";
import { config } from "../config.js";
import * as realMp from "../services/mercadoPago.js";
import * as mockMp from "../services/mercadoPagoMock.js";
import { getPayment, setPayment, updatePayment } from "../database/pixPayments.js";
import { getTicket } from "../database/tickets.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { buildPixEmbed, formatBRL } from "./pixEmbed.js";
import { errorEmbed } from "./embeds.js";

// Enquanto não houver token do Mercado Pago (nem por guild via /config, nem no .env),
// o bot usa o serviço mock (QR falso, aprovação automática) pra testar o fluxo sem credenciais reais.
function resolveToken(cfg) {
  return cfg.mercadoPagoAccessToken || config.mercadoPagoAccessToken || null;
}

function mpService(testMode) {
  return testMode ? mockMp : realMp;
}

function checkButtonRow(paymentId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pix_check:${paymentId}`).setLabel("🔄 Verificar Agora").setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Cria a cobrança no Mercado Pago, salva no store e posta o embed com QR Code
 * + código copia e cola no canal. Usado tanto pelo /pix quanto pelo botão do ticket.
 */
export async function createAndPostPixCharge({ channel, guildId, requesterId, amount, description, cfg, purpose = null }) {
  const mpToken = resolveToken(cfg);
  const testMode = cfg.pixTestMode || !mpToken;
  const mpPayment = await mpService(testMode).createPixPayment({ accessToken: mpToken, amount, description });

  const payment = {
    guildId,
    channelId: channel.id,
    messageId: null,
    requesterId,
    amount,
    description,
    status: "pending",
    testMode,
    mpToken: testMode ? null : mpToken,
    createdAt: Date.now(),
    expiresAt: mpPayment.expiresAt,
    qrCode: mpPayment.qrCode,
    purpose,
  };

  const attachment = new AttachmentBuilder(Buffer.from(mpPayment.qrCodeBase64, "base64"), { name: "pix-qrcode.png" });

  const message = await channel.send({
    embeds: [buildPixEmbed(payment)],
    files: [attachment],
    components: [checkButtonRow(mpPayment.id)],
  });

  payment.messageId = message.id;
  setPayment(mpPayment.id, payment);

  return { paymentId: mpPayment.id, payment };
}

/**
 * Consulta o status atual no Mercado Pago (ou expira localmente se passou do prazo),
 * atualiza o store e edita a mensagem se o status mudou. Usado tanto pelo scheduler
 * quanto pelo botão "Verificar Agora".
 */
export async function checkAndUpdatePixPayment(client, paymentId) {
  const payment = getPayment(paymentId);
  if (!payment || payment.status !== "pending") return payment;

  let status;
  if (Date.now() > payment.expiresAt) {
    status = "expired";
  } else {
    try {
      status = await mpService(payment.testMode).getPaymentStatus(paymentId, payment.mpToken);
    } catch (err) {
      console.error(`[pixCharge] Falha ao consultar status do pagamento ${paymentId}:`, err.message);
      return payment;
    }
  }

  if (status === payment.status) return payment;

  const updated = updatePayment(paymentId, (p) => {
    p.status = status;
  });

  const channel = await client.channels.fetch(payment.channelId).catch(() => null);
  const ticket = getTicket(payment.channelId);
  const payerMention = ticket ? `<@${ticket.openerId}>` : "";

  if (channel) {
    const message = await channel.messages.fetch(payment.messageId).catch(() => null);
    if (message) {
      const components = status === "pending" ? [checkButtonRow(paymentId)] : [];
      await message.edit({ embeds: [buildPixEmbed(updated)], components }).catch(() => {});
    }
    if (status === "approved") {
      await channel.send(`✅ Pagamento de **${formatBRL(updated.amount)}** confirmado! Obrigado ${payerMention}`.trim()).catch(() => {});
    }
  }

  if (status === "approved") {
    const guildCfg = getGuildConfig(payment.guildId);
    if (guildCfg.channels.paymentLog) {
      const logChannel = await client.channels.fetch(guildCfg.channels.paymentLog).catch(() => null);
      if (logChannel) {
        await logChannel.send({ embeds: [buildPixEmbed(updated)] }).catch(() => {});
      }
    }

    if (updated.purpose?.type === "raffle_entry") {
      // Import tardio (dinâmico) pra evitar ciclo de módulo ESM travando na inicialização:
      // raffleEntries.js já importa createAndPostPixCharge deste arquivo no topo do módulo.
      const { addPaidRaffleEntry } = await import("./raffleEntries.js");
      await addPaidRaffleEntry(client, updated);
    }
  }

  return updated;
}

export async function replyPixError(interaction, err) {
  const message = err.notConfigured
    ? "O Mercado Pago ainda não foi configurado neste bot. Configure com `/config pagamento` ou pelo `/painel`."
    : `Não foi possível gerar a cobrança Pix: ${err.message}`;

  const payload = { embeds: [errorEmbed(message)], ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}

export { checkButtonRow };
