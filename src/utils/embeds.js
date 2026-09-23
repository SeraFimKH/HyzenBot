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
