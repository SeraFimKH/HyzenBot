import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { canSupport, SupportPermission } from "../utils/supportPermissions.js";
import { getTicket } from "../database/tickets.js";
import { errorEmbed } from "../utils/embeds.js";
import { createAndPostPixCharge, replyPixError } from "../utils/pixCharge.js";

export const data = new SlashCommandBuilder()
  .setName("pix")
  .setDescription("Gera uma cobrança Pix via Mercado Pago (apenas staff/admin).")
  .addNumberOption((opt) =>
    opt.setName("valor").setDescription("Valor a cobrar, em reais (ex: 49.90)").setMinValue(0.01).setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("descricao").setDescription("Descrição da cobrança (opcional)").setRequired(false),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!canSupport(interaction.member, cfg, SupportPermission.PIX, getTicket(interaction.channelId)?.type)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para gerar cobranças Pix.")], flags: MessageFlags.Ephemeral });
  }

  const valor = interaction.options.getNumber("valor", true);
  const descricao = interaction.options.getString("descricao") || `Pagamento ${cfg.communityName}`;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await createAndPostPixCharge({
      channel: interaction.channel,
      guildId: interaction.guildId,
      requesterId: interaction.user.id,
      amount: valor,
      description: descricao,
      cfg,
    });
    await interaction.editReply({ content: "✅ Cobrança Pix gerada neste canal." });
  } catch (err) {
    console.error("[pix] Falha ao criar cobrança:", err);
    await replyPixError(interaction, err);
  }
}
