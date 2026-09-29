import { PunishmentType } from "../database/punishments.js";
import { baseEmbed } from "./embeds.js";
import { discordTimestamp } from "./format.js";

// The private message a punished player gets on Discord, the same whether the punishment came from the bot's own
// /ban, /mute and /warn or from the game (services/punishmentFeed.js). Sent through dmPunishedPlayer, which skips
// players who never linked their account with /verificar.

const BAN = { color: 0xed4245, title: "🔨 Você foi banido", sentence: "Você foi banido" };
const MUTE = { color: 0xfaa61a, title: "🔇 Você foi mutado", sentence: "Você foi mutado" };

// IPBAN isn't a hyzen_punishments type — it comes from hyzen_ip_bans.
const NOTICES = {
  [PunishmentType.BAN]: BAN,
  [PunishmentType.TEMPBAN]: BAN,
  [PunishmentType.MUTE]: MUTE,
  [PunishmentType.TEMPMUTE]: MUTE,
  IPBAN: { color: 0xed4245, title: "🚫 Seu IP foi banido", sentence: "Seu IP foi banido" },
  [PunishmentType.WARN]: { color: 0xfee75c, title: "⚠️ Você recebeu uma advertência" },
};

// "até <data>" for a temporary punishment, "permanentemente" otherwise.
export function untilText(expiresAt) {
  return expiresAt ? `até ${discordTimestamp(expiresAt, "F")}` : "**permanentemente**";
}

export function punishmentNoticeEmbed({ type, staff, reason, expiresAt = null, activeWarnings = null }) {
  const notice = NOTICES[type];
  const embed = baseEmbed().setColor(notice.color).setTitle(notice.title);
  if (notice.sentence) {
    embed.setDescription(`${notice.sentence} ${untilText(expiresAt)}.`);
  }
  embed.addFields({ name: "Staff", value: staff, inline: true }, { name: "Motivo", value: reason });
  if (activeWarnings !== null) {
    embed.addFields({ name: "Advertências ativas", value: `${activeWarnings}` });
  }
  return embed;
}
