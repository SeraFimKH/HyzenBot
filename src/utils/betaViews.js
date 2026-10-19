import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { StatusMode } from "../database/networkStatus.js";
import { baseEmbed } from "./embeds.js";

export const BETA_OPEN_BUTTON_ID = "painel_beta_open";
export const BETA_CLOSE_BUTTON_ID = "painel_beta_close";

// Embed descriptions are cut at 4096 characters; past this many lines the rest is only counted.
const MAX_LISTED = 60;

export const accessLabel = (open) => (open ? "🔓 **liberada**" : "🔒 **bloqueada**");

// The answer after the entry is opened or closed (/beta acesso and the panel's buttons).
export function accessChangedText(open, status) {
  if (open) return "Entrada dos beta testers **liberada**: quem registrou o nick entra durante a manutenção.";
  return (
    "Entrada dos beta testers **bloqueada**: durante a manutenção, só a equipe e os liberados no `/manutencao` entram." +
    (status.mode === StatusMode.MAINTENANCE ? "\nOs beta testers que estavam jogando foram desconectados." : "")
  );
}

// /beta lista and /painel → Beta Testers → Ver beta testers.
export function buildBetaListEmbed(cfg, testers, open) {
  const embed = baseEmbed(cfg.communityName).setTitle(`🧪 Beta testers (${testers.length})`);
  const header = `Entrada durante a manutenção: ${accessLabel(open)}`;
  if (!testers.length) {
    return embed.setDescription(`${header}\n\nNinguém registrou o nick ainda. Quem tem o cargo de beta tester usa \`/beta nick\`.`);
  }
  const lines = testers.slice(0, MAX_LISTED).map((t) => `• **${t.name}** — <@${t.discordId}>${t.addedAt ? ` · <t:${Math.floor(t.addedAt / 1000)}:R>` : ""}`);
  if (testers.length > MAX_LISTED) lines.push(`*… e mais ${testers.length - MAX_LISTED}.*`);
  return embed.setDescription(`${header}\n\n${lines.join("\n")}`);
}

// When the HyzenCore that creates hyzen_beta_testers hasn't started against the database yet.
export const BETA_TABLE_MISSING =
  "O banco ainda não tem a parte dos beta testers. Ela é criada pelo **HyzenCore** atualizado quando o servidor liga — atualize o plugin, ligue o servidor uma vez e tente de novo.";

// /painel → Beta Testers → Liberar ou bloquear a entrada.
export function buildBetaAccessView(cfg, open, backButton, notice = null) {
  const embed = baseEmbed(cfg.communityName)
    .setTitle("🧪 Entrada dos beta testers")
    .setDescription(
      `${notice ? `${notice}\n\n` : ""}Agora: ${accessLabel(open)}\n\n` +
        "Liberada, quem tem o cargo de beta tester e registrou o nick (`/beta nick`) entra no servidor durante a manutenção.\n" +
        "Bloqueada, eles ficam de fora como todo mundo — quem estiver jogando na manutenção é desconectado na hora.\n\n" +
        "Vale para a rede inteira (é a mesma chave do `/manutencao beta` no jogo).",
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BETA_OPEN_BUTTON_ID).setLabel("Liberar").setEmoji("🔓").setStyle(ButtonStyle.Success).setDisabled(open),
    new ButtonBuilder().setCustomId(BETA_CLOSE_BUTTON_ID).setLabel("Bloquear").setEmoji("🔒").setStyle(ButtonStyle.Danger).setDisabled(!open),
    backButton,
  );
  return { embeds: [embed], components: [row] };
}
