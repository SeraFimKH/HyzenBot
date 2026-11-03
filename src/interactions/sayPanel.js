import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { config } from "../config.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { formatPermissionList, missingPermissions } from "../utils/channelPermissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";

// /say: a message from the bot, written by an admin. The form takes the text, and then a preview only they see shows it
// as it will look, where the color, the channel and who to ping are picked before anything is published.
//
// A draft lives in memory, one per admin in each server, so a restart loses what's on the preview: the buttons then say so.
// The channel names and emojis typed in the form become real ones, since the form doesn't do that like Discord's own box.

export const ID_PREFIX = "say_";
export const MODAL_ID = "say_modal";
export const COLOR_SELECT_ID = "say_color";
export const CHANNEL_SELECT_ID = "say_channel";
export const PING_SELECT_ID = "say_ping";
const PUBLISH_BUTTON_ID = "say_publish";
const EDIT_BUTTON_ID = "say_edit";
const CANCEL_BUTTON_ID = "say_cancel";

const { Flags } = PermissionsBitField;
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const EXPIRED = "Essa prévia expirou. Use `/say` de novo.";

const MAX_TITLE = 256;
const MAX_MESSAGE = 4000;
const MAX_FOOTER = 2048;
const MAX_IMAGE_LINK = 1000;
const MAX_DESCRIPTION = 4096;
const CUSTOM_COLOR = "personalizada";

// A color of 0 is "no color" to Discord: black is the nearest to it that still shows.
const COLORS = [
  { value: "roxo", label: "Roxo", emoji: "🟣", color: 0x8e24aa },
  { value: "azul", label: "Azul", emoji: "🔵", color: 0x1e88e5 },
  { value: "ciano", label: "Ciano", emoji: "💠", color: 0x00bcd4 },
  { value: "verde", label: "Verde", emoji: "🟢", color: 0x43a047 },
  { value: "amarelo", label: "Amarelo", emoji: "🟡", color: 0xfdd835 },
  { value: "laranja", label: "Laranja", emoji: "🟠", color: 0xfb8c00 },
  { value: "vermelho", label: "Vermelho", emoji: "🔴", color: 0xe53935 },
  { value: "rosa", label: "Rosa", emoji: "🌸", color: 0xec407a },
  { value: "branco", label: "Branco", emoji: "⚪", color: 0xffffff },
  { value: "cinza", label: "Cinza", emoji: "🔘", color: 0x9e9e9e },
  { value: "preto", label: "Preto", emoji: "⚫", color: 0x111111 },
  { value: "hyzen", label: "Cor da Hyzen", emoji: "⭐", color: config.brandColor },
];
const DEFAULT_COLOR = COLORS[0].color;

const drafts = new Map();
const draftKey = (interaction) => `${interaction.guildId}:${interaction.user.id}`;
const hexOf = (color) => `#${color.toString(16).padStart(6, "0")}`;

export async function startSay(interaction, { channel, image }) {
  const draft = newDraft(channel);
  if (image) draft.upload = { url: image.url, name: uploadName(image) };
  drafts.set(draftKey(interaction), draft);
  return interaction.showModal(buildModal(draft));
}

export async function handleModalSubmit(interaction) {
  if (denied(interaction)) return denyReply(interaction);
  const draft = drafts.get(draftKey(interaction)) ?? newDraft(interaction.channel);
  const notices = [];

  draft.title = interaction.fields.getTextInputValue("titulo").trim();
  draft.message = interaction.fields.getTextInputValue("mensagem");
  draft.footer = interaction.fields.getTextInputValue("rodape").trim();

  const colorText = interaction.fields.getTextInputValue("cor").trim();
  if (colorText) {
    const color = parseColor(colorText);
    if (color === null) notices.push(`Não entendi a cor "${colorText}". Escolha na lista abaixo ou use um código como #ff00aa.`);
    else draft.color = color;
  }

  const imageText = interaction.fields.getTextInputValue("imagem").trim();
  if (imageText !== draft.upload?.url) {
    if (imageText && !/^https?:\/\/\S+$/i.test(imageText)) {
      notices.push("O link da imagem precisa começar com https://. A imagem ficou como estava.");
    } else {
      draft.upload = null;
      draft.imageUrl = imageText;
    }
  }

  drafts.set(draftKey(interaction), draft);
  const view = buildView(interaction.guild, draft, notices);
  return interaction.isFromMessage() ? interaction.update(view) : interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}

export async function handleSelect(interaction) {
  if (denied(interaction)) return denyReply(interaction);
  const draft = drafts.get(draftKey(interaction));
  if (!draft) return expired(interaction);

  if (interaction.customId === COLOR_SELECT_ID) {
    const picked = COLORS.find((color) => color.value === interaction.values[0]);
    if (picked) draft.color = picked.color;
  } else if (interaction.customId === CHANNEL_SELECT_ID) {
    draft.channelId = interaction.values[0];
  } else {
    draft.pingRoleId = interaction.values[0] ?? null;
  }
  return interaction.update(buildView(interaction.guild, draft));
}

export async function handleButton(interaction) {
  if (denied(interaction)) return denyReply(interaction);
  const draft = drafts.get(draftKey(interaction));
  if (!draft) return expired(interaction);

  if (interaction.customId === EDIT_BUTTON_ID) return interaction.showModal(buildModal(draft));
  if (interaction.customId === CANCEL_BUTTON_ID) {
    drafts.delete(draftKey(interaction));
    return interaction.update({ content: "", embeds: [successEmbed("Mensagem cancelada. Nada foi publicado.")], components: [] });
  }
  if (interaction.customId === PUBLISH_BUTTON_ID) return publish(interaction, draft);
}

async function publish(interaction, draft) {
  const guild = interaction.guild;
  // Sending an uploaded image can take longer than Discord waits for an answer.
  await interaction.deferUpdate();

  const channel = draft.channelId ? await guild.channels.fetch(draft.channelId).catch(() => null) : null;
  if (!channel?.isTextBased()) {
    return interaction.editReply(buildView(guild, draft, ["Escolha o canal onde publicar."]));
  }
  const missing = missingPermissions(channel, guild.members.me, neededPermissions(guild, draft));
  if (missing.length) {
    return interaction.editReply(buildView(guild, draft, [`O bot precisa de ${formatPermissionList(missing)} em ${channel} para publicar. Nada foi publicado.`]));
  }

  try {
    const message = await channel.send(buildMessage(guild, draft));
    drafts.delete(draftKey(interaction));
    console.log(`[say] ${interaction.user.tag} (${interaction.user.id}) publicou em #${channel.name} de ${guild.name}`);
    return await interaction.editReply({ content: "", embeds: [successEmbed(`Publicado em ${channel}. [Ver a mensagem](${message.url})`)], components: [], allowedMentions: { parse: [] } });
  } catch (err) {
    console.error("[say] failed to publish", err.message);
    return interaction.editReply(buildView(guild, draft, [`Não consegui publicar: ${err.message}. O texto continua aqui.`]));
  }
}

function neededPermissions(guild, draft) {
  const flags = [Flags.ViewChannel, Flags.SendMessages, Flags.EmbedLinks];
  if (draft.upload) flags.push(Flags.AttachFiles);
  if (draft.pingRoleId && (draft.pingRoleId === guild.id || !guild.roles.cache.get(draft.pingRoleId)?.mentionable)) flags.push(Flags.MentionEveryone);
  return flags;
}

// What goes to the channel. Only the role picked on the preview is pinged: an @everyone typed in the text never is.
function buildMessage(guild, draft) {
  const payload = { embeds: [buildEmbed(guild, draft)], allowedMentions: { parse: [] } };
  if (draft.pingRoleId === guild.id) {
    payload.content = "@everyone";
    payload.allowedMentions = { parse: ["everyone"] };
  } else if (draft.pingRoleId) {
    payload.content = `<@&${draft.pingRoleId}>`;
    payload.allowedMentions = { parse: [], roles: [draft.pingRoleId] };
  }
  // Sent as a file of the message: the link of what was attached to the command stops working after a while.
  if (draft.upload) {
    payload.files = [{ attachment: draft.upload.url, name: draft.upload.name }];
    payload.embeds[0].setImage(`attachment://${draft.upload.name}`);
  }
  return payload;
}

function buildEmbed(guild, draft) {
  const embed = new EmbedBuilder().setColor(draft.color).setDescription(fit(expandMentions(guild, draft.message), draft.message, MAX_DESCRIPTION));
  if (draft.title) embed.setTitle(fit(expandEmojis(guild, draft.title), draft.title, MAX_TITLE));
  if (draft.footer) embed.setFooter({ text: draft.footer });
  const image = draft.upload?.url ?? draft.imageUrl;
  if (image) embed.setImage(image);
  return embed;
}

// Real mentions take more characters than what was typed: past the limit, it goes as typed rather than not at all.
function fit(expanded, typed, max) {
  return expanded.length <= max ? expanded : typed;
}

function buildView(guild, draft, notices = []) {
  const where = draft.channelId ? `em <#${draft.channelId}>` : "no canal que você escolher";
  const lines = [`👀 **Prévia:** é assim que vai aparecer ${where}. Só você está vendo.`];
  if (draft.pingRoleId) lines.push(`🔔 Vai marcar ${draft.pingRoleId === guild.id ? "@everyone" : `<@&${draft.pingRoleId}>`}.`);
  for (const notice of notices) lines.push(`⚠️ ${notice}`);

  const named = COLORS.some((color) => color.color === draft.color);
  const options = COLORS.map(({ value, label, emoji, color }) => ({ value, label, emoji, default: color === draft.color }));
  if (!named) options.unshift({ value: CUSTOM_COLOR, label: `Cor do código ${hexOf(draft.color)}`, emoji: "🎨", default: true });

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(CHANNEL_SELECT_ID)
    .setChannelTypes(TEXT_TYPES)
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder("Canal onde publicar");
  if (draft.channelId) channelSelect.setDefaultChannels(draft.channelId);

  const pingSelect = new RoleSelectMenuBuilder().setCustomId(PING_SELECT_ID).setMinValues(0).setMaxValues(1).setPlaceholder("Marcar um cargo (opcional)");
  if (draft.pingRoleId) pingSelect.setDefaultRoles(draft.pingRoleId);

  return {
    content: lines.join("\n"),
    embeds: [buildEmbed(guild, draft)],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(COLOR_SELECT_ID).setPlaceholder("Cor da barra").addOptions(options)),
      new ActionRowBuilder().addComponents(channelSelect),
      new ActionRowBuilder().addComponents(pingSelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(PUBLISH_BUTTON_ID).setLabel("Publicar").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(EDIT_BUTTON_ID).setLabel("Editar texto").setEmoji("✏️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(CANCEL_BUTTON_ID).setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function buildModal(draft) {
  const named = COLORS.find((color) => color.color === draft.color);
  const inputs = [
    input("titulo", "Título (opcional)", TextInputStyle.Short, MAX_TITLE, draft.title, "🚫 | REGRAS | 🚫"),
    input("mensagem", "Mensagem", TextInputStyle.Paragraph, MAX_MESSAGE, draft.message, "**negrito**, *itálico*, #canal, @cargo e :emoji: funcionam.").setRequired(true),
    input("cor", "Cor: nome ou código (ou escolha depois)", TextInputStyle.Short, 20, named?.value ?? hexOf(draft.color), "roxo, azul, verde, vermelho... ou #ff00aa"),
    input("imagem", "Link da imagem (opcional)", TextInputStyle.Short, MAX_IMAGE_LINK, draft.upload?.url ?? draft.imageUrl, "https://..."),
    input("rodape", "Rodapé (opcional)", TextInputStyle.Short, MAX_FOOTER, draft.footer, "Texto pequeno no fim da mensagem"),
  ];
  return new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle("Mensagem do bot")
    .addComponents(inputs.map((field) => new ActionRowBuilder().addComponents(field)));
}

function input(id, label, style, max, value, placeholder) {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(false).setPlaceholder(placeholder);
  if (value) field.setValue(value.slice(0, max));
  return field;
}

function newDraft(channel) {
  return {
    title: "",
    message: "",
    footer: "",
    color: DEFAULT_COLOR,
    imageUrl: "",
    upload: null,
    channelId: TEXT_TYPES.includes(channel?.type) ? channel.id : null,
    pingRoleId: null,
  };
}

// A plain name: it goes in the attachment:// link, which a space or an accent would break.
function uploadName(image) {
  const extension = image.contentType?.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "png";
  return `imagem.${extension}`;
}

function parseColor(text) {
  const key = normalize(text);
  const named = COLORS.find((color) => color.value === key || normalize(color.label) === key);
  if (named) return named.color;
  const hex = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  return parseInt(hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex, 16);
}

// "📢・Avisos" and "avisos" are the same name here: what's typed can leave out the decoration a channel has.
function normalize(name) {
  return name.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// A custom emoji of the server, typed as :name:. One already in full (<:name:id>) stays.
function expandEmojis(guild, text) {
  return text.replace(/<a?:\w+:\d+>|:(\w{2,32}):/g, (typed, name) => {
    const emoji = name ? guild.emojis.cache.find((candidate) => candidate.name === name) : null;
    return emoji ? emoji.toString() : typed;
  });
}

// Also #channel and @role, at the start of a word only: "# Title" is a heading, and "<#123>" is already a mention.
function expandMentions(guild, text) {
  return expandEmojis(guild, text)
    .replace(/(^|[\s(])#([\p{L}\p{N}_-]+)/gu, (typed, before, name) => {
      const key = normalize(name);
      const channel = key ? guild.channels.cache.find((candidate) => candidate.type !== ChannelType.GuildCategory && normalize(candidate.name) === key) : null;
      return channel ? `${before}<#${channel.id}>` : typed;
    })
    .replace(/(^|[\s(])@([\p{L}\p{N}_-]+)/gu, (typed, before, name) => {
      const key = normalize(name);
      const role = key ? guild.roles.cache.find((candidate) => candidate.id !== guild.id && normalize(candidate.name) === key) : null;
      return role ? `${before}<@&${role.id}>` : typed;
    });
}

function denied(interaction) {
  return !isAdmin(interaction.member, getGuildConfig(interaction.guildId));
}

function denyReply(interaction) {
  return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para fazer isso.")], flags: MessageFlags.Ephemeral });
}

function expired(interaction) {
  return interaction.update({ content: "", embeds: [errorEmbed(EXPIRED)], components: [] });
}
