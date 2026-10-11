import { baseEmbed } from "./embeds.js";
import { ServerState } from "./serverState.js";
import { StatusMode } from "../database/networkStatus.js";

const STATE_VIEW = {
  [ServerState.ONLINE]: { emoji: "🟢", label: "Online", color: 0x57f287 },
  [ServerState.MAINTENANCE]: { emoji: "🛠️", label: "Em manutenção", color: 0xfaa61a },
  [ServerState.OFFLINE]: { emoji: "🔴", label: "Offline", color: 0xed4245 },
  [ServerState.UNKNOWN]: { emoji: "🟡", label: "Status indisponível", color: 0x99aab5 },
};

export const MODE_VIEW = {
  [StatusMode.AUTO]: { emoji: "🤖", label: "Automático", description: "O bot detecta sozinho se o servidor está online ou offline." },
  [StatusMode.ONLINE]: { emoji: "🟢", label: "Online", description: "Mostra online sempre, sem detectar." },
  [StatusMode.MAINTENANCE]: { emoji: "🛠️", label: "Manutenção", description: "Mostra em manutenção, e o servidor só deixa a equipe entrar." },
  [StatusMode.OFFLINE]: { emoji: "🔴", label: "Offline", description: "Mostra offline sempre, sem detectar." },
};

function playersText(status) {
  if (status.players === null) return null;
  const plural = status.players === 1 ? "jogador" : "jogadores";
  return status.maxPlayers ? `${status.players}/${status.maxPlayers} ${plural}` : `${status.players} ${plural}`;
}

// Como cada estado aparece: a cor e o texto da linha de status (embeds), e o texto curto da presença do bot.
export function describeState(status) {
  const view = STATE_VIEW[status.state];
  const players = playersText(status);

  let presence = `${view.emoji} ${view.label}`;
  if (status.state === ServerState.ONLINE) {
    presence = players ? `🟢 ${players} online` : "🟢 Servidor online";
  } else if (status.state === ServerState.OFFLINE) {
    presence = "🔴 Servidor offline";
  }

  return { ...view, players, presence };
}

// Compartilhado por /ip e pelo detector de "qual o ip" no chat (messageCreate.js) — mesmo embed nos dois lugares:
// o endereço para copiar, com o status de verdade do servidor (services/serverStatus.js) e os jogadores online.
export function buildServerInfoEmbed(cfg, status) {
  const view = describeState(status);
  const statusLine =
    status.state === ServerState.ONLINE
      ? "🟢 Servidor online agora"
      : status.state === ServerState.MAINTENANCE
        ? `🛠️ Servidor em manutenção${status.reason ? ` — ${status.reason}` : ""}`
        : status.state === ServerState.OFFLINE
          ? "🔴 Servidor offline no momento"
          : "🟡 Status indisponível no momento";

  return baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`🌐 Conecte-se ao ${cfg.communityName}`)
    .setDescription(`${statusLine}\n\nClique no IP e na porta abaixo para copiar e cole no seu cliente Minecraft.`)
    .addFields(
      { name: "📡 IP", value: `\`\`\`${cfg.serverIp}\`\`\``, inline: true },
      { name: "🔌 Porta", value: `\`\`\`${cfg.serverPort || "19132 (padrão)"}\`\`\``, inline: true },
      { name: "\u200b", value: "\u200b", inline: false },
      { name: "👥 Jogadores", value: view.players ? `**${view.players}**` : "—", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "🕹️ Versão", value: "Bedrock", inline: true },
    );
}

// O painel de status que o bot mantém atualizado no canal escolhido, e a resposta do /status.
export function buildStatusEmbed(cfg, status) {
  const view = describeState(status);
  const since = status.since ? ` · desde <t:${Math.floor(status.since / 1000)}:R>` : "";

  const lines = [`${view.emoji} **${view.label}**${since}`];
  if (status.reason) {
    lines.push(`> ${status.reason}`);
  } else if (status.state === ServerState.MAINTENANCE) {
    lines.push("> Estamos fazendo melhorias no servidor. Voltamos em breve!");
  } else if (status.state === ServerState.UNKNOWN) {
    lines.push("> Não foi possível consultar o servidor agora.");
  }

  const embed = baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`📊 Status do ${cfg.communityName}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${cfg.communityName} · atualizado` })
    .setTimestamp(status.checkedAt);

  if (view.players) {
    embed.addFields({ name: "👥 Jogadores", value: `**${view.players}**`, inline: true });
  }
  if (cfg.serverIp) {
    embed.addFields(
      { name: "📡 IP", value: `\`${cfg.serverIp}\``, inline: true },
      { name: "🔌 Porta", value: `\`${cfg.serverPort || "19132"}\``, inline: true },
    );
  }
  // Com um servidor só, a linha de cima já diz tudo.
  if (status.servers.length > 1) {
    embed.addFields({
      name: "🖥️ Servidores",
      value: status.servers
        .map((server) => `${STATE_VIEW[server.state].emoji} **${server.name}** — ${server.players} jogador${server.players === 1 ? "" : "es"}`)
        .join("\n")
        .slice(0, 1024),
    });
  }
  return embed;
}

// A tela de "Definir Status do Servidor" do /painel e a resposta do /status-definir: o modo escolhido pela staff
// e o que o bot está mostrando por causa dele.
export function buildStatusModeEmbed(network, status) {
  const mode = MODE_VIEW[network.mode];
  const view = describeState(status);
  const changed = network.changedBy ? `\nDefinido por **${network.changedBy}**${network.changedAt ? ` <t:${Math.floor(network.changedAt / 1000)}:R>` : ""}.` : "";

  return baseEmbed()
    .setColor(view.color)
    .setTitle("🚦 Status do Servidor")
    .setDescription(
      `Modo atual: ${mode.emoji} **${mode.label}** — ${mode.description}${changed}\n` +
        `O bot está mostrando: ${view.emoji} **${view.label}**${view.players ? ` (${view.players})` : ""}` +
        (status.reason ? `\nMotivo: ${status.reason}` : ""),
    )
    .addFields(
      Object.values(StatusMode).map((key) => ({ name: `${MODE_VIEW[key].emoji} ${MODE_VIEW[key].label}`, value: MODE_VIEW[key].description, inline: true })),
    );
}
