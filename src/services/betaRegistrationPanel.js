import { PermissionsBitField } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { buildRegistrationPanel } from "../utils/betaRegistrationViews.js";
import { formatPermissionList, missingPermissions } from "../utils/channelPermissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";

const { Flags } = PermissionsBitField;
const PANEL_PERMISSIONS = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks];

// Posts the pre-registration panel in its channel. The panel already there is edited in place; one left in a channel
// the staff moved away from is deleted. Resolves to an embed telling the staff how it went.
export async function publishBetaRegistrationPanel(client, guildId) {
  const cfg = getGuildConfig(guildId);
  if (!cfg.channels.preRegistro) return errorEmbed("Escolha o canal do pré-registro primeiro.");
  const channel = await client.channels.fetch(cfg.channels.preRegistro).catch(() => null);
  if (!channel?.isTextBased()) return errorEmbed("O canal do pré-registro configurado não foi encontrado.");
  const missing = missingPermissions(channel, channel.guild?.members.me, PANEL_PERMISSIONS);
  if (missing.length) return errorEmbed(`O bot não consegue publicar em ${channel} (falta: ${formatPermissionList(missing)}).`);

  const payload = buildRegistrationPanel(cfg);
  const sameChannel = cfg.preRegistroPanelChannelId === channel.id;
  const previousChannel = cfg.preRegistroPanelChannelId && !sameChannel ? await client.channels.fetch(cfg.preRegistroPanelChannelId).catch(() => null) : channel;
  const previous = cfg.preRegistroPanelMessageId && previousChannel ? await previousChannel.messages.fetch(cfg.preRegistroPanelMessageId).catch(() => null) : null;
  if (previous && sameChannel) {
    await previous.edit(payload);
    return successEmbed(`Painel de pré-registro atualizado em ${channel}.`);
  }
  await previous?.delete().catch(() => {});

  const message = await channel.send(payload);
  updateGuildConfig(guildId, (c) => {
    c.preRegistroPanelChannelId = channel.id;
    c.preRegistroPanelMessageId = message.id;
  });
  return successEmbed(`Painel de pré-registro publicado em ${channel}.`);
}

// After the texts change: the panel already published shows them. Never posts a new one.
export async function refreshBetaRegistrationPanel(client, guildId) {
  const cfg = getGuildConfig(guildId);
  if (!cfg.preRegistroPanelChannelId || !cfg.preRegistroPanelMessageId) return;
  const channel = await client.channels.fetch(cfg.preRegistroPanelChannelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(cfg.preRegistroPanelMessageId).catch(() => null) : null;
  await message?.edit(buildRegistrationPanel(cfg));
}
