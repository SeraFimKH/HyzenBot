import { getGuildConfig } from "../database/guildConfig.js";
import { getTicket, updateTicket } from "../database/tickets.js";
import { getOnlinePlayerCount } from "../database/redis.js";
import { baseEmbed } from "../utils/embeds.js";
import { isWithinSupportHours } from "../utils/businessHours.js";
import { generateTicketAiReply } from "../utils/ticketAi.js";
import { getText } from "../utils/textDefaults.js";

const TICKET_AUTO_REPLY_COOLDOWN_MS = 60 * 1000;
const AJUDA_COOLDOWN_MS = 60 * 1000;
const ajudaCooldowns = new Map(); // userId -> timestamp da última resposta automática

const IP_COOLDOWN_MS = 60 * 1000;
const ipCooldowns = new Map(); // userId -> timestamp da última resposta automática
// Cobre "qual o ip", "qual é o ip", "ip do servidor/server", "manda o ip", "me passa o ip", "tem ip?" etc.
// \bip\b evita bater em palavras que só contêm "ip" (ex: "principal", "equipe").
const IP_QUESTION_RE = /\b(ip|endereço)\b.*\b(servidor|server|jogo)\b|\b(qual|quero|manda|passa|me\s*(dá|passa))\b.*\bip\b|\bip\b.*\bpra\s*(entrar|jogar)\b/i;

async function handleTicketAutoReply(message, ticket) {
  if (message.author.id !== ticket.openerId) return;
  if (ticket.claimedBy) return;

  const now = Date.now();
  if (now - (ticket.lastAutoReply || 0) < TICKET_AUTO_REPLY_COOLDOWN_MS) return;

  updateTicket(message.channel.id, (t) => {
    t.lastAutoReply = now;
  });

  const cfg = getGuildConfig(message.guildId);
  const aiReply = await generateTicketAiReply(message, ticket, cfg);

  if (aiReply) {
    await message.reply({
      embeds: [
        baseEmbed(cfg.communityName)
          .setAuthor({ name: "🤖 Assistente IA" })
          .setDescription(aiReply)
          .setFooter({ text: `${cfg.communityName} · resposta automática — a equipe ainda vai te atender` }),
      ],
    });
    return;
  }

  const text = isWithinSupportHours() ? getText(cfg, "ticket_autoreply_aberto") : getText(cfg, "ticket_autoreply_fechado");

  await message.reply({ embeds: [baseEmbed(cfg.communityName).setDescription(text)] });
}

async function handleAjudaDetector(message, cfg) {
  const content = message.content.toLowerCase();
  if (!content.includes("ajuda")) return;

  const lastReply = ajudaCooldowns.get(message.author.id) || 0;
  if (Date.now() - lastReply < AJUDA_COOLDOWN_MS) return;
  ajudaCooldowns.set(message.author.id, Date.now());

  const ticketMention = cfg.channels.ticket ? `<#${cfg.channels.ticket}>` : "🎫┃ticket";

  await message.reply({
    embeds: [baseEmbed(cfg.communityName).setDescription(getText(cfg, "ajuda_detector_msg", { canal: ticketMention }))],
  });
}

async function handleIpDetector(message, cfg) {
  if (!cfg.serverIp) return; // nada configurado ainda — não tem o que responder
  if (!IP_QUESTION_RE.test(message.content)) return;

  const lastReply = ipCooldowns.get(message.author.id) || 0;
  if (Date.now() - lastReply < IP_COOLDOWN_MS) return;
  ipCooldowns.set(message.author.id, Date.now());

  const count = await getOnlinePlayerCount();
  const playersField = count === null ? "Não foi possível consultar agora" : `${count} jogador(es) online`;

  await message.reply({
    embeds: [
      baseEmbed(cfg.communityName)
        .setTitle(`🌐 ${cfg.communityName}`)
        .addFields({ name: "IP", value: `\`${cfg.serverIp}\``, inline: true }, { name: "Jogadores", value: playersField, inline: true }),
    ],
  });
}

export const name = "messageCreate";
export async function execute(message) {
  if (message.author.bot || !message.guild) return;

  try {
    const ticket = getTicket(message.channel.id);
    if (ticket) {
      await handleTicketAutoReply(message, ticket);
      return;
    }

    const cfg = getGuildConfig(message.guildId);
    await handleAjudaDetector(message, cfg);
    await handleIpDetector(message, cfg);
  } catch (err) {
    console.error("[messageCreate] Erro:", err);
  }
}
