import { baseEmbed } from "./embeds.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getText } from "./textDefaults.js";

const BAR_LENGTH = 14;
export const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

export function buildPollEmbed(poll) {
  const total = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
  const cfg = getGuildConfig(poll.guildId);

  const embed = baseEmbed(cfg.communityName)
    .setTitle(getText(cfg, "enquete_titulo"))
    .setDescription(
      `**${poll.question}**\n\n${
        poll.closed ? "🔒 Esta enquete está encerrada — confira o resultado final abaixo." : "_Clique em uma opção abaixo para votar. Você pode trocar de opção quando quiser._"
      }`,
    );

  if (poll.prize) {
    embed.addFields({ name: "🎁 Prêmio", value: poll.prize });
  }

  poll.options.forEach((opt, i) => {
    const count = opt.votes.length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const filled = Math.round((pct / 100) * BAR_LENGTH);
    const bar = "▰".repeat(filled) + "▱".repeat(BAR_LENGTH - filled);

    embed.addFields({
      name: `${NUMBER_EMOJIS[i] || `${i + 1}.`} ${opt.label}`,
      value: `${bar}  **${pct}%** · ${count} voto(s)`,
    });
  });

  embed.addFields(
    { name: "🗳️ Total de votos", value: `${total}`, inline: true },
    { name: "Status", value: poll.closed ? "🔒 Encerrada" : "🟢 Aberta", inline: true },
  );

  return embed;
}
