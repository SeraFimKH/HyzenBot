import { SlashCommandBuilder } from "discord.js";
import { findLinkByDiscordId } from "../database/auth.js";
import { skinHeadUrl } from "../database/playerSkins.js";
import { PERIODS, TempoTablesMissingError, standingOf, topHours } from "../database/tempoTop.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";

// /tophoras [período]: who played the most this week (default), this month or ever — active time only, the same
// ranking as /tophoras in the game. A member who linked their account (/verificar) also sees their own place.

const MEDALS = ["🥇", "🥈", "🥉"];

export const data = new SlashCommandBuilder()
  .setName("tophoras")
  .setDescription("Mostra quem mais jogou no servidor: na semana, no mês ou desde sempre.")
  .addStringOption((opt) =>
    opt
      .setName("periodo")
      .setDescription("De quando contar (padrão: esta semana)")
      .setRequired(false)
      .addChoices({ name: "Esta semana", value: "semana" }, { name: "Este mês", value: "mes" }, { name: "Geral", value: "geral" }),
  );

export async function execute(interaction) {
  const period = interaction.options.getString("periodo") ?? "semana";
  await interaction.deferReply();

  try {
    const [top, link] = await Promise.all([topHours(period, 10), findLinkByDiscordId(interaction.user.id)]);
    const standing = link ? await standingOf(period, link.player_id) : null;

    const lines = top.map((row, index) => `${MEDALS[index] ?? `**${index + 1}.**`} **${escape(row.name)}** — ${hours(row.minutes)}`);
    const embed = baseEmbed()
      .setTitle(`⏱️ Top horas · ${PERIODS[period].label}`)
      .setDescription(lines.length ? lines.join("\n") : "Ninguém jogou neste período ainda.");

    // The leader's head, from their skin.
    const leaderHead = top[0] ? await skinHeadUrl(top[0].id, top[0].name).catch(() => null) : null;
    if (leaderHead) {
      embed.setThumbnail(leaderHead);
    }

    if (link) {
      embed.addFields({
        name: "Você",
        value: standing ? `**#${standing.position}** — ${hours(standing.minutes)}` : "Sem tempo neste período ainda.",
      });
    }
    embed.setFooter({ text: "Conta só o tempo jogando: quem fica parado não soma. · Hyzen Network" });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof TempoTablesMissingError) {
      return interaction.editReply({ embeds: [errorEmbed("O top de horas ainda não está ligado no servidor.")] });
    }
    throw err;
  }
}

// "3h 20min", "45min".
function hours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// A game name is shown as written: Discord markdown characters in it are escaped.
function escape(text) {
  return text.replace(/([*_~`|\\>])/g, "\\$1");
}
