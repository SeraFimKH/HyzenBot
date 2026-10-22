import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, StringSelectMenuBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { CHANNEL_LABELS } from "../utils/configEmbed.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";
import {
  canManage,
  canPostLogs,
  describeChannel,
  getAdminGuild,
  guildsManagedBy,
  isLogChannelKey,
  LOG_CHANNEL_KEYS,
  postableTextChannels,
} from "../utils/linkedGuilds.js";

// /painel → Servidor Administrativo & Logs: linking the staff's own Discord server, and every log channel's picker,
// which lists this server's channels and, once linked, the admin server's too.
export const ADMIN_GUILD_SELECT_ID = "painel_admin_guild";
export const ADMIN_GUILD_UNLINK_ID = "painel_admin_unlink";
export const REMOTE_CHANNEL_PREFIX = "painel_xchannel:";
export const REMOTE_PAGE_PREFIX = "painel_xpage:";

// A select menu shows at most 25 options; a bigger admin server is paged.
const PAGE_SIZE = 25;
const MAX_GUILDS = 25;

function backButton() {
  return new ButtonBuilder().setCustomId("painel_back").setLabel("⬅️ Voltar ao painel").setStyle(ButtonStyle.Secondary);
}

const row = (...components) => new ActionRowBuilder().addComponents(...components);

// Log channels pointing at a server other than this one: after unlinking or switching the admin server they'd be dead
// (staffLog refuses them), so they're cleared and the staff is told which.
function clearRemoteLogChannels(cfg, client, guildId) {
  const cleared = [];
  for (const key of LOG_CHANNEL_KEYS) {
    const channelId = cfg.channels[key];
    if (channelId && client.channels.cache.get(channelId)?.guildId !== guildId) {
      cfg.channels[key] = null;
      cleared.push(key);
    }
  }
  return cleared;
}

export async function buildAdminGuildView(interaction, notice = null) {
  const cfg = getGuildConfig(interaction.guildId);
  const linked = getAdminGuild(interaction.client, cfg);
  const guilds = (await guildsManagedBy(interaction.client, interaction.user.id, interaction.guildId)).slice(0, MAX_GUILDS);

  const state = linked ? `Vinculado a **${linked.name}**.` : cfg.adminGuildId ? "⚠️ O bot não está mais no servidor que estava vinculado." : "Nenhum servidor vinculado.";
  const choose = guilds.length
    ? "Escolha o servidor abaixo. Só aparecem os servidores em que o bot está e você é administrador."
    : "Nenhum outro servidor disponível: adicione o bot ao servidor da equipe (com o mesmo link de convite deste) — e você precisa ser administrador lá.";
  const embed = baseEmbed(cfg.communityName)
    .setTitle("🔗 Servidor Administrativo")
    .setDescription(
      `${notice ? `${notice}\n\n` : ""}${state}\n\n` +
        "Os jogadores ficam aqui e a equipe recebe os logs no outro servidor: ao escolher um canal de log (tickets, pagamentos, " +
        "banimentos, mutes, advertências, vitórias e sugestões), aparecem também os canais de lá.\n\n" +
        choose,
    );
  if (linked) {
    const there = LOG_CHANNEL_KEYS.filter((key) => interaction.client.channels.cache.get(cfg.channels[key])?.guildId === linked.id);
    embed.addFields({ name: "Logs que já vão para lá", value: there.length ? there.map((key) => `${CHANNEL_LABELS[key]}: <#${cfg.channels[key]}>`).join("\n") : "*(nenhum ainda — escolha nos canais de log)*" });
  }

  const components = [];
  if (guilds.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(ADMIN_GUILD_SELECT_ID)
      .setPlaceholder("Escolha o servidor administrativo...")
      .addOptions(guilds.map((guild) => ({ label: guild.name.slice(0, 100), value: guild.id, description: `${guild.memberCount} membros`, emoji: "🛡️", default: guild.id === cfg.adminGuildId })));
    components.push(row(select));
  }
  components.push(
    row(new ButtonBuilder().setCustomId(ADMIN_GUILD_UNLINK_ID).setLabel("Desvincular").setEmoji("✂️").setStyle(ButtonStyle.Danger).setDisabled(!cfg.adminGuildId), backButton()),
  );
  return { embeds: [embed], components };
}

export async function handleAdminGuildSelect(interaction) {
  const guildId = interaction.values[0];
  const guild = interaction.client.guilds.cache.get(guildId);
  const member = guild && guildId !== interaction.guildId ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
  if (!member || !canManage(member)) {
    return interaction.reply({ embeds: [errorEmbed("Você precisa ser administrador nesse servidor para vincular ele.")], flags: MessageFlags.Ephemeral });
  }

  let cleared = [];
  updateGuildConfig(interaction.guildId, (c) => {
    if (c.adminGuildId === guildId) return;
    c.adminGuildId = guildId;
    cleared = clearRemoteLogChannels(c, interaction.client, interaction.guildId);
  });
  const notice = `✅ Vinculado a **${guild.name}**. Agora, ao escolher um canal de log, aparecem os canais de lá.${clearedNote(cleared)}`;
  return interaction.update(await buildAdminGuildView(interaction, notice));
}

export async function handleAdminGuildUnlink(interaction) {
  let cleared = [];
  updateGuildConfig(interaction.guildId, (c) => {
    c.adminGuildId = null;
    cleared = clearRemoteLogChannels(c, interaction.client, interaction.guildId);
  });
  return interaction.update(await buildAdminGuildView(interaction, `✂️ Servidor administrativo desvinculado.${clearedNote(cleared)}`));
}

function clearedNote(keys) {
  return keys.length ? `\nEstes logs eram do outro servidor e ficaram sem canal: ${keys.map((key) => CHANNEL_LABELS[key]).join(", ")}.` : "";
}

// A log channel's picker: this server's channels (Discord's own channel menu, handled by painelMenu#handleChannelSelect)
// and, below, the admin server's channels the bot can post in.
export function buildLogChannelView(tipo, cfg, client, guildId, page = 0) {
  const current = cfg.channels[tipo];
  const local = new ChannelSelectMenuBuilder()
    .setCustomId(`painel_channel_${tipo}`)
    .addChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder("Canal deste servidor...");
  if (current && client.channels.cache.get(current)?.guildId === guildId) local.setDefaultChannels(current);

  const lines = [`Agora: ${describeChannel(client, guildId, current) ?? "*(não definido)*"}`, ""];
  const components = [row(local)];
  const admin = getAdminGuild(client, cfg);
  if (!admin) {
    lines.push("Escolha o canal abaixo. A configuração é salva assim que você escolher.", "", "💡 Quer este log no servidor da equipe? Vincule ele em **🔗 Servidor Administrativo & Logs**.");
    components.push(row(backButton()));
  } else {
    const channels = postableTextChannels(admin);
    const pages = Math.max(1, Math.ceil(channels.length / PAGE_SIZE));
    const at = Math.min(Math.max(page, 0), pages - 1);
    const shown = channels.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
    if (shown.length) {
      const remote = new StringSelectMenuBuilder()
        .setCustomId(`${REMOTE_CHANNEL_PREFIX}${tipo}`)
        .setPlaceholder(`Canal do servidor ${admin.name}...`.slice(0, 150))
        .addOptions(shown.map((channel) => ({ label: `#${channel.name}`.slice(0, 100), value: channel.id, description: (channel.parent?.name ?? "sem categoria").slice(0, 100), default: channel.id === current })));
      components.push(row(remote));
      lines.push(`Escolha um canal **deste servidor** (1º menu) ou do servidor administrativo **${admin.name}** (2º menu). A configuração é salva assim que você escolher.`);
      if (pages > 1) lines.push(`*Canais de ${admin.name}: página ${at + 1} de ${pages}.*`);
    } else {
      lines.push(`O bot não consegue escrever em nenhum canal de **${admin.name}**. Lá, dê a ele **Ver canal**, **Enviar mensagens** e **Inserir links** no canal dos logs.`);
    }
    const nav = [];
    if (pages > 1) {
      nav.push(
        new ButtonBuilder().setCustomId(`${REMOTE_PAGE_PREFIX}${tipo}:${at - 1}`).setLabel("◀ Anteriores").setStyle(ButtonStyle.Secondary).setDisabled(at === 0),
        new ButtonBuilder().setCustomId(`${REMOTE_PAGE_PREFIX}${tipo}:${at + 1}`).setLabel("Próximos ▶").setStyle(ButtonStyle.Secondary).setDisabled(at >= pages - 1),
      );
    }
    components.push(row(...nav, backButton()));
  }

  const embed = baseEmbed(cfg.communityName).setTitle(CHANNEL_LABELS[tipo]).setDescription(lines.join("\n"));
  return { embeds: [embed], components };
}

export async function handleRemoteChannelSelect(interaction) {
  const tipo = interaction.customId.slice(REMOTE_CHANNEL_PREFIX.length);
  const cfg = getGuildConfig(interaction.guildId);
  const admin = getAdminGuild(interaction.client, cfg);
  const channel = admin?.channels.cache.get(interaction.values[0]);
  if (!isLogChannelKey(tipo) || !channel || !canPostLogs(channel)) {
    return interaction.reply({ embeds: [errorEmbed("Esse canal não está mais disponível no servidor administrativo. Abra o `/painel` de novo.")], flags: MessageFlags.Ephemeral });
  }
  const updated = updateGuildConfig(interaction.guildId, (c) => {
    c.channels[tipo] = channel.id;
  });
  return interaction.update(buildMainPanel(updated, interaction));
}

export async function handleRemoteChannelPage(interaction) {
  const [tipo, page] = interaction.customId.slice(REMOTE_PAGE_PREFIX.length).split(":");
  if (!isLogChannelKey(tipo)) return;
  const cfg = getGuildConfig(interaction.guildId);
  return interaction.update(buildLogChannelView(tipo, cfg, interaction.client, interaction.guildId, Number(page) || 0));
}
