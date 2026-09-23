import { allRaffles, updateRaffle } from "../database/raffles.js";
import { buildRaffleEmbed, buildRaffleComponents } from "./raffleEmbed.js";
import { allPendingPayments } from "../database/pixPayments.js";
import { checkAndUpdatePixPayment } from "./pixCharge.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { successEmbed } from "./embeds.js";
import { takeKey } from "../database/keyStock.js";
import { getText } from "./textDefaults.js";

const CHECK_INTERVAL_MS = 30 * 1000;
const PIX_CHECK_INTERVAL_MS = 15 * 1000;

async function notifyWinner(client, raffle, winnerId, keyStockEmpty) {
  try {
    const user = await client.users.fetch(winnerId);
    const cfg = getGuildConfig(raffle.guildId);
    const vars = { jogo: raffle.game, premio: raffle.prize };

    let text;
    if (raffle.prizeType === "key" && !(keyStockEmpty || !raffle.keyValue)) {
      text = getText(cfg, "sorteio_dm_vencedor_chave", { ...vars, chave: raffle.keyValue });
    } else if (raffle.prizeType === "key") {
      text = `🏆 Parabéns! Você ganhou o sorteio de **${raffle.game}** (${raffle.prize}) na ${cfg.communityName}!\n\nO estoque de chaves está vazio no momento — a staff vai te enviar manualmente em breve, sem precisar abrir ticket.`;
    } else {
      text = getText(cfg, "sorteio_dm_vencedor_fisico", vars);
    }

    await user.send({ embeds: [successEmbed(text)] });
  } catch (err) {
    console.error(`[scheduler] Não foi possível notificar o vencedor ${winnerId} por DM:`, err.message);
  }
}

export async function finishRaffle(client, guildId, raffle) {
  const winnerId = raffle.participants.length
    ? raffle.participants[Math.floor(Math.random() * raffle.participants.length)]
    : null;

  // Sorteios com estoque puxam a chave só na hora do resultado, pra não "reservar"
  // uma chave num sorteio que pode ser cancelado/reiniciado antes de terminar.
  let keyStockEmpty = false;
  let resolvedKeyValue = raffle.keyValue;
  if (winnerId && raffle.prizeType === "key" && raffle.keyStockName) {
    const drawn = takeKey(guildId, raffle.keyStockName);
    if (drawn) {
      resolvedKeyValue = drawn;
    } else {
      keyStockEmpty = true;
    }
  }

  const finished = updateRaffle(guildId, (r) => {
    r.status = "finished";
    r.winnerId = winnerId;
    if (winnerId && raffle.prizeType === "key") r.keyValue = resolvedKeyValue;
  });

  console.log(
    `[scheduler] Sorteio "${raffle.game}" encerrado no servidor ${guildId} (vencedor: ${winnerId ?? "nenhum participante"}).`,
  );

  if (keyStockEmpty) {
    console.error(
      `[scheduler] Estoque de chaves "${raffle.keyStockName}" vazio ao encerrar sorteio "${raffle.game}" no servidor ${guildId} — vencedor não recebeu chave automática.`,
    );
  }

  if (winnerId) {
    await notifyWinner(client, finished, winnerId, keyStockEmpty);
  }

  try {
    const panelChannel = await client.channels.fetch(raffle.channelId);
    const embed = buildRaffleEmbed(finished);
    const message = await panelChannel.messages.fetch(raffle.messageId);
    await message.edit({ embeds: [embed], components: buildRaffleComponents(finished) });

    const cfg = getGuildConfig(guildId);
    const resultChannelId = cfg.channels.sorteioResultado || raffle.channelId;
    const resultChannel = resultChannelId === raffle.channelId ? panelChannel : await client.channels.fetch(resultChannelId).catch(() => null);

    if (resultChannel) {
      await resultChannel.send(
        winnerId
          ? getText(cfg, "sorteio_anuncio_vencedor", { jogo: raffle.game, vencedor: `<@${winnerId}>`, premio: raffle.prize })
          : getText(cfg, "sorteio_anuncio_sem_participantes", { jogo: raffle.game }),
      );
    }
  } catch (err) {
    console.error(`[scheduler] Falha ao anunciar resultado do sorteio no servidor ${guildId}:`, err);
  }
}

export function startRaffleScheduler(client) {
  setInterval(async () => {
    const raffles = allRaffles();
    const now = Date.now();

    for (const [guildId, raffle] of Object.entries(raffles)) {
      if (raffle.status === "open" && raffle.endTimestamp <= now) {
        await finishRaffle(client, guildId, raffle);
      }
    }
  }, CHECK_INTERVAL_MS);
}

export function startPixScheduler(client) {
  setInterval(async () => {
    const pending = allPendingPayments();
    for (const [paymentId] of pending) {
      await checkAndUpdatePixPayment(client, paymentId);
    }
  }, PIX_CHECK_INTERVAL_MS);
}
