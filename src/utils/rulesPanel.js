import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { updateGuildConfig } from "../database/guildConfig.js";
import { baseEmbed } from "./embeds.js";
import { getText } from "./textDefaults.js";

export function buildRulesEmbeds(cfg) {
  const embeds = [baseEmbed(cfg.communityName).setTitle(getText(cfg, "regras_titulo")).setDescription(cfg.rulesText)];

  if (cfg.termsText) {
    embeds.push(baseEmbed(cfg.communityName).setTitle(getText(cfg, "termos_titulo")).setDescription(cfg.termsText));
  }

  return embeds;
}

// Usados só no privado enviado quando um membro entra no servidor (veja events/guildMemberAdd.js) —
// a interação de um botão em DM não tem guildId, por isso ele viaja embutido no customId.
export function buildJoinRulesButtons(guildId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rules_accept:${guildId}`).setLabel("Aceitar").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rules_decline:${guildId}`).setLabel("Recusar").setEmoji("❌").setStyle(ButtonStyle.Danger),
    ),
  ];
}

export async function publishRules(guild, cfg) {
  if (!cfg.channels.rules) {
    return { ok: false, reason: "Configure o canal de regras primeiro." };
  }

  const channel = await guild.channels.fetch(cfg.channels.rules).catch(() => null);
  if (!channel) {
    return { ok: false, reason: "O canal de regras configurado não foi encontrado." };
  }

  const message = await channel.send({ embeds: buildRulesEmbeds(cfg) });

  updateGuildConfig(guild.id, (c) => {
    c.rulesPanelMessageId = message.id;
  });

  return { ok: true, channel };
}
