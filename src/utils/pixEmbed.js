import { baseEmbed } from "./embeds.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getText } from "./textDefaults.js";

export function formatBRL(amount) {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildPixEmbed(payment) {
  const cfg = getGuildConfig(payment.guildId);
  const embed = baseEmbed(cfg.communityName)
    .setTitle(getText(cfg, "pix_titulo"))
    .setDescription(`## ${formatBRL(payment.amount)}\n${payment.description}`)
    .addFields({ name: "📋 Código Copia e Cola", value: `\`\`\`${payment.qrCode}\`\`\`` })
    .setImage("attachment://pix-qrcode.png");

  if (payment.testMode) {
    embed.setAuthor({ name: "🧪 MODO TESTE — Mercado Pago não configurado, isso não é uma cobrança real" });
  }

  if (payment.status === "pending") {
    embed.addFields({
      name: "📌 Status",
      value: `🟡 Aguardando pagamento — expira <t:${Math.floor(payment.expiresAt / 1000)}:R>`,
    });
  } else if (payment.status === "approved") {
    embed.addFields({ name: "📌 Status", value: "✅ Pagamento confirmado!" }).setColor(0x57f287);
  } else if (payment.status === "expired") {
    embed.addFields({ name: "📌 Status", value: "⏱️ Cobrança expirada sem pagamento." }).setColor(0xed4245);
  } else {
    embed.addFields({ name: "📌 Status", value: `🚫 Pagamento ${payment.status}.` }).setColor(0xed4245);
  }

  return embed;
}
