import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { StatusMode } from "../database/networkStatus.js";
import { baseEmbed } from "./embeds.js";

// The beta testers' entry during a maintenance: a beta tester is whoever has the beta tag in the game (given with
// /tagadmin; which tag is beta-tag in HyzenCore's config.yml). /manutencao beta and /painel → Servidor do Jogo.
export const BETA_OPEN_BUTTON_ID = "painel_beta_open";
export const BETA_CLOSE_BUTTON_ID = "painel_beta_close";

// When the HyzenCore that adds hyzen_network_status.beta_open hasn't started against the database yet.
export const BETA_TABLE_MISSING =
  "O banco ainda não tem a chave dos beta testers. Ela é criada pelo **HyzenCore** atualizado quando o servidor liga — atualize o plugin, ligue o servidor uma vez e tente de novo.";

export const accessLabel = (open) => (open ? "🔓 **liberada**" : "🔒 **bloqueada**");

// The answer after the entry is opened or closed.
export function accessChangedText(open, status) {
  if (open) return "Entrada dos beta testers **liberada**: quem tem a tag de beta no jogo entra durante a manutenção.";
  return (
    "Entrada dos beta testers **bloqueada**: durante a manutenção, só a equipe e os liberados no `/manutencao` entram." +
    (status.mode === StatusMode.MAINTENANCE ? "\nOs beta testers que estavam jogando foram desconectados." : "")
  );
}

// A field's lines, cut to fit Discord's 1024 characters with the rest counted.
function fieldLines(lines, empty) {
  if (!lines.length) return empty;
  const shown = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 40 > 1024) break;
    shown.push(line);
    length += line.length + 1;
  }
  if (shown.length < lines.length) shown.push(`*… e mais ${lines.length - shown.length}.*`);
  return shown.join("\n");
}

const relative = (ms) => (ms ? ` · <t:${Math.floor(ms / 1000)}:R>` : "");

// /beta lista and /painel → Servidor do Jogo → Ver beta testers: everyone who is a beta tester (the tag in the game,
// or approved and not joined yet) and the requests still waiting.
export function buildBetaOverviewEmbed(cfg, { open, tagKey, tagged, waiting, pending }) {
  const tagLines = tagged.map((t) => `• **${t.name}** — ${t.discordId ? `<@${t.discordId}> ✅` : "⚠️ sem Discord vinculado"}`);
  const waitingLines = waiting.map((w) => `• **${w.name}**${w.discordId ? ` — <@${w.discordId}>` : ""}${w.grantedBy ? ` · aprovado por ${w.grantedBy}` : ""}${relative(w.grantedAt)}`);
  const pendingLines = pending.map((r) => `• **${r.name}** — <@${r.discordId}> · pedido #${r.number}${relative(r.requestedAt)}`);
  return baseEmbed(cfg.communityName)
    .setTitle(`🧪 Beta testers (${tagged.length + waiting.length})`)
    .setDescription(`Entrada durante a manutenção: ${accessLabel(open)} · tag de beta no jogo: \`${tagKey}\``)
    .addFields(
      { name: `🎮 Com a tag no jogo (${tagged.length})`, value: fieldLines(tagLines, "*(ninguém)*") },
      { name: `⏳ Aprovados, ainda não entraram no servidor (${waiting.length})`, value: fieldLines(waitingLines, "*(ninguém)*") },
      { name: `📝 Pedidos de pré-registro aguardando (${pending.length})`, value: fieldLines(pendingLines, "*(nenhum)*") },
    )
    .setFooter({ text: `${cfg.communityName} · /beta adicionar · /beta remover · /beta acesso` });
}

export function buildBetaAccessEmbed(cfg, open, notice = null) {
  return baseEmbed(cfg.communityName)
    .setTitle("🧪 Entrada dos beta testers")
    .setDescription(
      `${notice ? `${notice}\n\n` : ""}Agora: ${accessLabel(open)}\n\n` +
        "Beta tester é quem tem a **tag de beta** no jogo (dada com `/tagadmin`). Com a entrada liberada, eles entram no servidor durante a manutenção.\n" +
        "Bloqueada, ficam de fora como todo mundo — quem estiver jogando na manutenção é desconectado na hora.\n\n" +
        "Vale para a rede inteira: é a mesma chave do `/manutencao beta` no jogo.",
    );
}

// /painel → Servidor do Jogo → Entrada dos Beta Testers.
export function buildBetaAccessView(cfg, open, backButton, notice = null) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BETA_OPEN_BUTTON_ID).setLabel("Liberar").setEmoji("🔓").setStyle(ButtonStyle.Success).setDisabled(open),
    new ButtonBuilder().setCustomId(BETA_CLOSE_BUTTON_ID).setLabel("Bloquear").setEmoji("🔒").setStyle(ButtonStyle.Danger).setDisabled(!open),
    backButton,
  );
  return { embeds: [buildBetaAccessEmbed(cfg, open, notice)], components: [row] };
}
