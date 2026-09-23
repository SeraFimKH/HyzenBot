import { getGuildConfig } from "../database/guildConfig.js";
import { getRaffle, updateRaffle } from "../database/raffles.js";
import { allPendingPayments } from "../database/pixPayments.js";
import { errorEmbed, successEmbed } from "./embeds.js";
import { buildRaffleEmbed, buildRaffleComponents } from "./raffleEmbed.js";
import { createAndPostPixCharge, replyPixError } from "./pixCharge.js";

async function updateRafflePanel(client, raffle) {
  const channel = await client.channels.fetch(raffle.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(raffle.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildRaffleEmbed(raffle)], components: buildRaffleComponents(raffle) }).catch(() => {});
}

/**
 * Lógica de entrada compartilhada entre /participar e o botão do painel do sorteio.
 * Sorteios gratuitos entram na hora; sorteios pagos geram uma cobrança Pix no privado
 * do membro e a entrada só é confirmada quando o pagamento aprova (ver addPaidRaffleEntry).
 */
export async function joinRaffle(interaction) {
  const guildId = interaction.guildId;
  const cfg = getGuildConfig(guildId);
  const raffle = getRaffle(guildId);

  if (!raffle || raffle.status !== "open") {
    return interaction.reply({ embeds: [errorEmbed("Não há nenhum sorteio ativo no momento.")], ephemeral: true });
  }

  if (raffle.entryMode === "convite") {
    return interaction.reply({
      embeds: [errorEmbed("Este sorteio é só por convite — use `/convite link` pra pegar seu link e ganhar entradas convidando pessoas.")],
      ephemeral: true,
    });
  }

  const entryCount = raffle.participants.filter((id) => id === interaction.user.id).length;
  if (entryCount >= raffle.maxEntriesPerMember) {
    return interaction.reply({
      embeds: [errorEmbed(`Você já atingiu o limite de ${raffle.maxEntriesPerMember} entrada(s) neste sorteio.`)],
      ephemeral: true,
    });
  }

  if (!(raffle.entryPrice > 0)) {
    const updated = updateRaffle(guildId, (r) => {
      r.participants.push(interaction.user.id);
    });
    await updateRafflePanel(interaction.client, updated);
    return interaction.reply({
      embeds: [successEmbed(`Presença confirmada no sorteio de **${raffle.game}**! Seu bilhete: **#${updated.participants.length}**. Boa sorte 🍀`)],
      ephemeral: true,
    });
  }

  const alreadyPending = allPendingPayments().some(
    ([, p]) => p.purpose?.type === "raffle_entry" && p.purpose.raffleId === raffle.id && p.purpose.userId === interaction.user.id,
  );
  if (alreadyPending) {
    return interaction.reply({
      embeds: [errorEmbed("Você já tem uma cobrança pendente para este sorteio. Verifique seu privado.")],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const dm = await interaction.user.createDM();
    await createAndPostPixCharge({
      channel: dm,
      guildId,
      requesterId: interaction.user.id,
      amount: raffle.entryPrice,
      description: `Entrada — sorteio ${raffle.game}`,
      cfg,
      purpose: { type: "raffle_entry", guildId, raffleId: raffle.id, userId: interaction.user.id },
    });
    await interaction.editReply({
      embeds: [successEmbed("Cobrança Pix enviada no seu privado! Confirme o pagamento por lá pra garantir sua entrada.")],
    });
  } catch (err) {
    if (err.code === 50007) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'Não consegui te enviar uma mensagem privada. Ative "Permitir mensagens diretas de membros do servidor" nas configurações de privacidade deste servidor e tente de novo.',
          ),
        ],
      });
    }
    console.error("[raffleEntries] Falha ao gerar cobrança de entrada:", err);
    await replyPixError(interaction, err);
  }
}

/**
 * Chamado pelo pixCharge.js quando um pagamento com purpose "raffle_entry" é aprovado.
 * Reconfere o sorteio/limite no momento da aprovação (pode ter mudado entre a criação
 * da cobrança e o pagamento) — não há sistema de reembolso, então falhas aqui só notificam.
 */
export async function addPaidRaffleEntry(client, payment) {
  const { guildId, purpose } = payment;
  const raffle = getRaffle(guildId);

  const stillValid =
    raffle &&
    raffle.id === purpose.raffleId &&
    raffle.status === "open" &&
    raffle.participants.filter((id) => id === purpose.userId).length < raffle.maxEntriesPerMember;

  if (!stillValid) {
    console.error(
      `[raffleEntries] Pagamento aprovado mas entrada não pôde ser concedida (sorteio encerrado/cancelado ou limite atingido) — guild ${guildId}, usuário ${purpose.userId}.`,
    );
    try {
      const user = await client.users.fetch(purpose.userId);
      await user.send({
        embeds: [
          errorEmbed(
            "Seu pagamento foi confirmado, mas não foi possível registrar sua entrada no sorteio (ele pode ter encerrado ou você atingiu o limite de entradas). Entre em contato com a staff do servidor.",
          ),
        ],
      });
    } catch {
      // usuário com DMs fechadas — nada a fazer
    }
    return;
  }

  const updated = updateRaffle(guildId, (r) => {
    r.participants.push(purpose.userId);
  });

  await updateRafflePanel(client, updated);

  try {
    const user = await client.users.fetch(purpose.userId);
    await user.send({
      embeds: [
        successEmbed(
          `Pagamento confirmado! Sua entrada no sorteio de **${updated.game}** foi registrada. Seu bilhete: **#${updated.participants.length}**. Boa sorte 🍀`,
        ),
      ],
    });
  } catch {
    // usuário com DMs fechadas — nada a fazer
  }
}

/**
 * Chamado pelo guildMemberAdd.js quando um novo membro entra por um convite pessoal
 * cujo dono é identificável. Só concede bilhete se houver um sorteio ativo em modo
 * "convite" e o dono do convite ainda não tiver atingido o limite de entradas.
 */
export async function creditInviteRaffleEntry(client, guildId, inviterId) {
  const raffle = getRaffle(guildId);
  if (!raffle || raffle.status !== "open" || raffle.entryMode !== "convite") return;

  const entryCount = raffle.participants.filter((id) => id === inviterId).length;
  if (entryCount >= raffle.maxEntriesPerMember) return;

  const updated = updateRaffle(guildId, (r) => {
    r.participants.push(inviterId);
  });

  await updateRafflePanel(client, updated);

  try {
    const user = await client.users.fetch(inviterId);
    await user.send({
      embeds: [
        successEmbed(
          `🔗 Alguém entrou pelo seu link de convite! Você ganhou uma entrada no sorteio de **${updated.game}**. Seu bilhete: **#${updated.participants.length}**. Boa sorte 🍀`,
        ),
      ],
    });
  } catch {
    // usuário com DMs fechadas — nada a fazer
  }
}
