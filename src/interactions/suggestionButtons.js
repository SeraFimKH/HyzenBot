import { ThreadAutoArchiveDuration } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { createSuggestion, discardSuggestion, lastSuggestionAt, updateSuggestion } from "../database/suggestions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isStaff } from "../utils/permissions.js";
import { formatPermissionList, missingPermissions } from "../utils/channelPermissions.js";
import { scheduleSuggestionPanel, SUGGESTION_CHANNEL_PERMISSIONS, SUGGESTION_THREAD_PERMISSIONS } from "../services/suggestionPanel.js";
import {
  buildSuggestionEmbed,
  buildSuggestionModal,
  buildSuggestionPoll,
  buildSuggestionText,
  threadName,
  TITLE_MIN_LENGTH,
} from "../utils/suggestionViews.js";

// Discord's "invalid form body": what it would answer if it ever refused an embed next to a poll.
const INVALID_FORM_BODY = 50035;
// Quanto tempo depois de publicar a sugestão o painel desce — o suficiente para o tópico já existir.
const PANEL_DELAY_MS = 1_500;

// Quando o membro pode mandar a próxima sugestão (0 = já pode). A equipe não espera.
function nextAllowedAt(cfg, interaction) {
  if (isStaff(interaction.member, cfg)) return 0;
  const minutes = cfg.suggestionCooldownMinutes ?? 10;
  const next = lastSuggestionAt(interaction.guildId, interaction.user.id) + minutes * 60_000;
  return next > Date.now() ? next : 0;
}

function cooldownEmbed(nextAt) {
  return errorEmbed(`Você mandou uma sugestão há pouco. Você pode mandar outra <t:${Math.ceil(nextAt / 1000)}:R>.`);
}

// O botão do painel: abre o formulário (ou explica por que ainda não dá).
export async function handleOpenSuggestion(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const nextAt = nextAllowedAt(cfg, interaction);
  if (nextAt) {
    return interaction.reply({ embeds: [cooldownEmbed(nextAt)], ephemeral: true });
  }
  await interaction.showModal(buildSuggestionModal());
}

// O formulário enviado: a sugestão vai para o canal com a enquete do Discord e um tópico para discussão, e o
// painel desce para baixo dela.
export async function handleSuggestionModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const cfg = getGuildConfig(interaction.guildId);
  const title = interaction.fields.getTextInputValue("titulo").trim().replace(/\s+/g, " ");
  const details = interaction.fields.getTextInputValue("detalhes").trim() || null;

  if (title.length < TITLE_MIN_LENGTH) {
    return interaction.editReply({ embeds: [errorEmbed(`Escreva a sugestão com pelo menos ${TITLE_MIN_LENGTH} letras.`)] });
  }
  const nextAt = nextAllowedAt(cfg, interaction);
  if (nextAt) {
    return interaction.editReply({ embeds: [cooldownEmbed(nextAt)] });
  }

  const channel = cfg.channels.sugestoes ? await interaction.client.channels.fetch(cfg.channels.sugestoes).catch(() => null) : null;
  if (!channel?.isTextBased()) {
    return interaction.editReply({ embeds: [errorEmbed("O canal de sugestões não está configurado. Avise a equipe!")] });
  }
  const me = interaction.guild.members.me;
  const missing = missingPermissions(channel, me, SUGGESTION_CHANNEL_PERMISSIONS);
  if (missing.length) {
    console.error(`[suggestions] missing permissions in #${channel.name}: ${missing.join(", ")}`);
    return interaction.editReply({ embeds: [errorEmbed(`O bot não consegue publicar em ${channel} (falta: ${formatPermissionList(missing)}). Avise a equipe!`)] });
  }

  const suggestion = createSuggestion(interaction.guildId, { authorId: interaction.user.id, title, details });
  const author = { name: interaction.member?.displayName || interaction.user.username, avatarUrl: interaction.user.displayAvatarURL() };

  let message;
  try {
    message = await postSuggestion(channel, cfg, suggestion, author, interaction.user.id);
  } catch (err) {
    discardSuggestion(interaction.guildId, suggestion.number);
    console.error("[suggestions] failed to post a suggestion", err);
    return interaction.editReply({ embeds: [errorEmbed("Não consegui publicar a sua sugestão agora. Tente de novo em instantes.")] });
  }

  // O tópico é um extra: sem permissão para criar, a sugestão continua valendo só com a enquete.
  let thread = null;
  if (!missingPermissions(channel, me, SUGGESTION_THREAD_PERMISSIONS).length) {
    thread = await message.startThread({ name: threadName(suggestion), autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek }).catch((err) => {
      console.error("[suggestions] failed to open the discussion thread", err.message);
      return null;
    });
    // Quem sugeriu acompanha a conversa sobre a ideia dele.
    await thread?.members.add(interaction.user.id).catch(() => {});
  }

  updateSuggestion(interaction.guildId, suggestion.number, (s) => {
    s.channelId = channel.id;
    s.messageId = message.id;
    s.threadId = thread?.id ?? null;
  });
  scheduleSuggestionPanel(interaction.client, interaction.guildId, PANEL_DELAY_MS);

  return interaction.editReply({
    embeds: [successEmbed(`Sua sugestão **#${suggestion.number}** foi publicada! Acompanhe a votação: ${message.url}`)],
  });
}

async function postSuggestion(channel, cfg, suggestion, author, authorId) {
  const poll = buildSuggestionPoll(cfg, suggestion);
  const allowedMentions = { parse: [] };
  try {
    return await channel.send({ embeds: [buildSuggestionEmbed(cfg, suggestion, author)], poll, allowedMentions });
  } catch (err) {
    if (err.code !== INVALID_FORM_BODY) throw err;
    console.warn("[suggestions] Discord refused the embed next to the poll, posting it as text:", err.message);
    return channel.send({ content: buildSuggestionText(suggestion, authorId), poll, allowedMentions });
  }
}
