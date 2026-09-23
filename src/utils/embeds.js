import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

export function baseEmbed(communityName = "Hyzen Network") {
  return new EmbedBuilder().setColor(config.brandColor).setFooter({ text: communityName }).setTimestamp();
}

export function errorEmbed(description) {
  return baseEmbed().setColor(0xed4245).setDescription(`❌ ${description}`);
}

export function successEmbed(description) {
  return baseEmbed().setColor(0x57f287).setDescription(`✅ ${description}`);
}

// Compartilhado por /ip e pelo detector de "qual o ip" no chat (messageCreate.js) — mesmo embed nos dois
// lugares. `onlineCount` é null quando o Redis não respondeu (ver getOnlinePlayerCount), não quando ninguém
// está online, então a mensagem distingue os dois casos em vez de mostrar "0" para uma falha de consulta.
export function buildServerInfoEmbed(cfg, onlineCount) {
  const endereco = cfg.serverPort ? `${cfg.serverIp}:${cfg.serverPort}` : cfg.serverIp;
  const playersField = onlineCount === null ? "Não foi possível consultar agora" : `${onlineCount} jogador(es) online`;

  return baseEmbed(cfg.communityName)
    .setTitle(`🌐 ${cfg.communityName}`)
    .addFields({ name: "IP", value: `\`${endereco}\``, inline: true }, { name: "Jogadores", value: playersField, inline: true });
}
