import { baseEmbed } from "./embeds.js";
import { ServerState } from "./serverState.js";
import { StatusMode } from "../database/networkStatus.js";

// since: o que vem antes do "há 5 minutos" que o Discord escreve para o horário em que o estado começou.
const STATE_VIEW = {
  [ServerState.ONLINE]: { emoji: "🟢", label: "Online", color: 0x57f287, since: "No ar" },
  [ServerState.MAINTENANCE]: { emoji: "🛠️", label: "Em manutenção", color: 0xfaa61a, since: "Começou" },
  [ServerState.OFFLINE]: { emoji: "🔴", label: "Offline", color: 0xed4245, since: "Fora do ar" },
  [ServerState.UNKNOWN]: { emoji: "🟡", label: "Status indisponível", color: 0x99aab5, since: "Sem resposta" },
};

const BAR_SEGMENTS = 20;

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

// O progresso da manutenção em andamento (/status progresso), ou null.
function maintenanceProgress(status) {
  return status.state === ServerState.MAINTENANCE && status.maintenance ? status.maintenance : null;
}

// Como cada estado aparece: a cor e o texto da linha de status (embeds), e o texto curto da presença do bot.
export function describeState(status) {
  const view = STATE_VIEW[status.state];
  const players = playersText(status);
  const progress = maintenanceProgress(status);

  let presence = `${view.emoji} ${view.label}`;
  if (status.state === ServerState.ONLINE) {
    presence = players ? `🟢 ${players} online` : "🟢 Servidor online";
  } else if (status.state === ServerState.OFFLINE) {
    presence = "🔴 Servidor offline";
  } else if (progress) {
    presence = `🛠️ Em manutenção — ${progress.progress}%`;
  }

  return { ...view, players, presence, progress };
}

// Compartilhado por /ip e pelo detector de "qual o ip" no chat (messageCreate.js) — mesmo embed nos dois lugares:
// o endereço para copiar, com o status de verdade do servidor (services/serverStatus.js) e os jogadores online.
export function buildServerInfoEmbed(cfg, status) {
  const view = describeState(status);
  const statusLine =
    status.state === ServerState.ONLINE
      ? "🟢 Servidor online agora"
      : status.state === ServerState.MAINTENANCE
        ? `🛠️ Servidor em manutenção${view.progress ? ` (${view.progress.progress}% concluído)` : ""}${status.reason ? ` — ${status.reason}` : ""}`
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

// Uma barra de 20 quadradinhos, cheios na proporção dada (0 a 1). atLeastOne: nunca toda vazia quando há algo.
function progressBar(ratio, atLeastOne = false) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const filled = Math.max(atLeastOne && clamped > 0 ? 1 : 0, Math.round(clamped * BAR_SEGMENTS));
  return `\`${"█".repeat(filled)}${"░".repeat(BAR_SEGMENTS - filled)}\` **${Math.round(clamped * 100)}%**`;
}

// A barra de lotação do painel: com alguém online ela nunca fica toda vazia, por menor que seja a proporção.
function playersBar(players, maxPlayers) {
  return progressBar(players / maxPlayers, players > 0);
}

// O progresso da manutenção no painel: o quanto já foi feito, a barra, a etapa de agora e quando foi atualizado.
function progressLines(progress) {
  const lines = [
    progress.progress >= 100 ? "## ✅ 100% concluído — voltamos em instantes!" : `## 🔧 ${progress.progress}% concluído`,
    progressBar(progress.progress / 100),
  ];
  if (progress.stage) lines.push(`🔨 Agora: **${progress.stage}**`);
  lines.push(`Atualizado <t:${Math.floor(progress.updatedAt / 1000)}:R>`);
  return lines;
}

/**
 * O painel de status que o bot mantém atualizado no canal escolhido, e a resposta do /status. O estado e os
 * jogadores vão em títulos (os "#" do Discord, que deixam o texto grande), com a barra de lotação embaixo; o IP e
 * a porta em bloco de código, para copiar com um clique. iconUrl: o ícone do servidor do Discord, no canto.
 */
export function buildStatusEmbed(cfg, status, iconUrl = null) {
  const view = describeState(status);

  const lines = [`# ${view.emoji} ${view.label}`];
  if (status.since) {
    lines.push(`${view.since} <t:${Math.floor(status.since / 1000)}:R>`);
  }
  if (status.reason) {
    lines.push(`> ${status.reason}`);
  } else if (status.state === ServerState.MAINTENANCE) {
    lines.push("> Estamos fazendo melhorias no servidor. Voltamos em breve!");
  } else if (status.state === ServerState.UNKNOWN) {
    lines.push("> Não foi possível consultar o servidor agora.");
  }
  if (view.progress) {
    lines.push(...progressLines(view.progress));
  }
  if (view.players) {
    lines.push(`## 👥 ${view.players}`);
    if (status.maxPlayers) lines.push(playersBar(status.players, status.maxPlayers));
  }

  const embed = baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`📊 Status do ${cfg.communityName}`)
    .setDescription(lines.join("\n"))
    .setThumbnail(iconUrl)
    .setFooter({ text: `${cfg.communityName} · atualizado` })
    .setTimestamp(status.checkedAt);

  if (cfg.serverIp) {
    embed.addFields(
      { name: "📡 IP", value: `\`\`\`${cfg.serverIp}\`\`\``, inline: true },
      { name: "🔌 Porta", value: `\`\`\`${cfg.serverPort || "19132"}\`\`\``, inline: true },
    );
  }
  // Com um servidor só, o título já diz tudo.
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
        (status.reason ? `\nMotivo: ${status.reason}` : "") +
        (view.progress ? `\nProgresso: **${view.progress.progress}%**${view.progress.stage ? ` — ${view.progress.stage}` : ""} (mude com \`/status progresso\`)` : ""),
    )
    .addFields(
      Object.values(StatusMode).map((key) => ({ name: `${MODE_VIEW[key].emoji} ${MODE_VIEW[key].label}`, value: MODE_VIEW[key].description, inline: true })),
    );
}
