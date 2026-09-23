import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { baseEmbed } from "./embeds.js";
import { formatBRL } from "./pixEmbed.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getText } from "./textDefaults.js";

export function buildRaffleEmbed(raffle) {
  const endSeconds = Math.floor(raffle.endTimestamp / 1000);
  const cfg = getGuildConfig(raffle.guildId);

  const embed = baseEmbed(cfg.communityName)
    .setTitle(getText(cfg, "sorteio_titulo"))
    .setDescription(`## 🏆 ${raffle.prize}\n🎮 **Jogo:** ${raffle.game}${raffle.description ? `\n\n${raffle.description}` : ""}`)
    .addFields(
      { name: "🎟️ Entradas", value: `${raffle.participants.length}`, inline: true },
      { name: "🗓️ Sorteio", value: `<t:${endSeconds}:F>\n<t:${endSeconds}:R>`, inline: true },
      { name: "💵 Valor da entrada", value: raffle.entryPrice > 0 ? formatBRL(raffle.entryPrice) : "Grátis", inline: true },
      { name: "🎁 Tipo de prêmio", value: raffle.prizeType === "key" ? "🔑 Chave digital" : "📦 Físico (retirada com a staff)", inline: true },
      { name: "🔁 Máx. de entradas por pessoa", value: `${raffle.maxEntriesPerMember}`, inline: true },
    );

  if (raffle.entryMode === "convite") {
    embed.addFields({
      name: "🔗 Como participar",
      value: `Use \`/convite link\` pra pegar seu link pessoal e chame a galera! Cada pessoa nova que entrar pelo seu link = **1 bilhete automático** (até o limite de **${raffle.maxEntriesPerMember}** por pessoa). Ex: convidou 3 amigos → 3 bilhetes, sem precisar clicar em nada.`,
    });
  }

  if (raffle.status === "open") {
    embed.addFields({ name: "📌 Status", value: getText(cfg, "sorteio_status_aberto"), inline: true });
  } else if (raffle.status === "finished") {
    embed
      .addFields({
        name: "📌 Status",
        value: raffle.winnerId ? `🏆 Encerrado — vencedor: <@${raffle.winnerId}>!` : "🔒 Encerrado — ninguém participou 😢",
        inline: true,
      })
      .setColor(0x57f287);
  } else if (raffle.status === "cancelled") {
    embed.addFields({ name: "📌 Status", value: "🚫 Cancelado por um administrador", inline: true }).setColor(0xed4245);
  }

  if (raffle.imageUrl) {
    embed.setImage(raffle.imageUrl);
  }

  return embed;
}

export function buildRaffleComponents(raffle) {
  if (raffle.status !== "open" || raffle.entryMode === "convite") return [];

  const cfg = getGuildConfig(raffle.guildId);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("raffle_participar").setLabel(getText(cfg, "sorteio_participar_botao")).setStyle(ButtonStyle.Success),
    ),
  ];
}
