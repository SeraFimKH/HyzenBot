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
  const known = onlineCount !== null;
  const online = known && onlineCount > 0;

  const statusLine = !known ? "🟡 Status indisponível no momento" : online ? "🟢 Servidor online agora" : "⚪ Nenhum jogador online no momento";
  const playersValue = known ? `**${onlineCount}** jogador${onlineCount === 1 ? "" : "es"}` : "—";

  // Verde com gente jogando, cinza (cor padrão da marca) quando vazio, amarelo se não deu pra consultar —
  // mesmo espírito do bolinha-de-status colorida que /perfil já usa para online/offline.
  const color = !known ? 0xfaa61a : online ? 0x57f287 : config.brandColor;

  return baseEmbed(cfg.communityName)
    .setColor(color)
    .setTitle(`🌐 Conecte-se ao ${cfg.communityName}`)
    .setDescription(`${statusLine}\n\nClique no IP e na porta abaixo para copiar e cole no seu cliente Minecraft.`)
    .addFields(
      { name: "📡 IP", value: `\`\`\`${cfg.serverIp}\`\`\``, inline: true },
      { name: "🔌 Porta", value: `\`\`\`${cfg.serverPort || "19132 (padrão)"}\`\`\``, inline: true },
      { name: "​", value: "​", inline: false },
      { name: "👥 Jogadores", value: playersValue, inline: true },
      { name: "​", value: "​", inline: true },
      { name: "🕹️ Versão", value: "Bedrock", inline: true },
    );
}
