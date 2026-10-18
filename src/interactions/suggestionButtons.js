import { ThreadAutoArchiveDuration } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { createSuggestion, discardSuggestion, getSuggestion, lastSuggestionAt, updateSuggestion } from "../database/suggestions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin, isStaff } from "../utils/permissions.js";
import { formatPermissionList, missingPermissions } from "../utils/channelPermissions.js";
import { runInSuggestionChannel, scheduleSuggestionPanel, SUGGESTION_CHANNEL_PERMISSIONS, SUGGESTION_THREAD_PERMISSIONS } from "../services/suggestionPanel.js";
import { setSuggestionStatus } from "../services/suggestionStatus.js";
import {
  buildReasonModal,
  buildSuggestionCard,
  buildSuggestionCardComponents,
  buildSuggestionModal,
  buildSuggestionPoll,
  NEXT_STATUSES,
  REASON_MODAL_PREFIX,
  STATUS_BUTTON_PREFIX,
  SuggestionStatus,
  threadName,
  TITLE_MIN_LENGTH,
} from "../utils/suggestionViews.js";

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

// O formulário enviado: a sugestão vai para o canal — o cartão (com a situação e os botões da equipe) e, colada
// nele, a enquete do Discord —, ganha um tópico para discussão, e o painel desce para baixo dela.
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

  const suggestion = createSuggestion(interaction.guildId, {
    authorId: interaction.user.id,
    authorName: interaction.member?.displayName || interaction.user.username,
    authorAvatarUrl: interaction.user.displayAvatarURL(),
    title,
    details,
  });

  let posted;
  try {
    posted = await runInSuggestionChannel(interaction.guildId, () => postSuggestion(channel, cfg, suggestion));
  } catch (err) {
    discardSuggestion(interaction.guildId, suggestion.number);
    console.error("[suggestions] failed to post a suggestion", err);
    return interaction.editReply({ embeds: [errorEmbed("Não consegui publicar a sua sugestão agora. Tente de novo em instantes.")] });
  }

  // O tópico é um extra: sem permissão para criar, a sugestão continua valendo com o cartão e a enquete.
  let thread = null;
  if (!missingPermissions(channel, me, SUGGESTION_THREAD_PERMISSIONS).length) {
    thread = await posted.card.startThread({ name: threadName(suggestion), autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek }).catch((err) => {
      console.error("[suggestions] failed to open the discussion thread", err.message);
      return null;
    });
    // Quem sugeriu acompanha a conversa sobre a ideia dele.
    await thread?.members.add(interaction.user.id).catch(() => {});
  }

  updateSuggestion(interaction.guildId, suggestion.number, (s) => {
    s.channelId = channel.id;
    s.cardMessageId = posted.card.id;
    s.messageId = posted.poll.id;
    s.threadId = thread?.id ?? null;
  });
  scheduleSuggestionPanel(interaction.client, interaction.guildId, PANEL_DELAY_MS);

  return interaction.editReply({
    embeds: [successEmbed(`Sua sugestão **#${suggestion.number}** foi publicada! Acompanhe a votação: ${posted.card.url}`)],
  });
}

// O cartão e a enquete, um logo depois do outro (o Discord junta as duas mensagens seguidas do bot num bloco só).
// Se a enquete falhar, o cartão sozinho não fica no canal.
async function postSuggestion(channel, cfg, suggestion) {
  const card = await channel.send({
    embeds: [buildSuggestionCard(cfg, suggestion)],
    components: buildSuggestionCardComponents(suggestion),
    allowedMentions: { parse: [] },
  });
  try {
    const poll = await channel.send({ poll: buildSuggestionPoll(cfg, suggestion) });
    return { card, poll };
  } catch (err) {
    await card.delete().catch(() => {});
    throw err;
  }
}

// Os botões da equipe no cartão. "Analisar" vale na hora; aprovar, recusar e implementar abrem antes um campo para
// a resposta à comunidade (opcional).
export async function handleStatusButton(interaction) {
  const [number, status] = parseTarget(interaction.customId, STATUS_BUTTON_PREFIX);
  const refusal = checkStatusChange(interaction, number, status);
  if (refusal) return interaction.reply({ embeds: [errorEmbed(refusal)], ephemeral: true });

  if (SuggestionStatus[status].final) {
    return interaction.showModal(buildReasonModal(number, status));
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply({ embeds: [await applyStatus(interaction, number, status, null)] });
}

export async function handleReasonModalSubmit(interaction) {
  const [number, status] = parseTarget(interaction.customId, REASON_MODAL_PREFIX);
  const refusal = checkStatusChange(interaction, number, status);
  if (refusal) return interaction.reply({ embeds: [errorEmbed(refusal)], ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue("motivo").trim() || null;
  await interaction.editReply({ embeds: [await applyStatus(interaction, number, status, reason)] });
}

function parseTarget(customId, prefix) {
  const [number, status] = customId.slice(prefix.length).split(":");
  return [Number(number), status];
}

// Por que esta mudança não pode ser feita (ou null se pode): só administradores, e só para uma situação para onde a
// sugestão ainda pode ir — um botão antigo, clicado depois de outra pessoa já ter respondido, não desfaz nada.
function checkStatusChange(interaction, number, status) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) return "Só administradores podem mudar a situação de uma sugestão.";
  const suggestion = getSuggestion(interaction.guildId, number);
  if (!suggestion || !SuggestionStatus[status]) return "Essa sugestão não existe mais.";
  if (!(NEXT_STATUSES[suggestion.status] || []).includes(status)) {
    const current = SuggestionStatus[suggestion.status];
    return `A sugestão #${number} já está como ${current.emoji} **${current.label}**. Para mudar mesmo assim, use \`/sugestao responder\`.`;
  }
  return null;
}

async function applyStatus(interaction, number, status, reason) {
  const result = await setSuggestionStatus(interaction.client, interaction.guildId, number, status, interaction.user.id, reason);
  if (!result.ok) return errorEmbed(result.reason);
  return successEmbed(
    `Sugestão **#${number}** marcada como ${result.view.emoji} **${result.view.label}**.` +
      (result.view.final ? " A votação foi encerrada." : "") +
      (result.dmSent ? " Quem sugeriu foi avisado no privado." : " Não deu para avisar quem sugeriu no privado."),
  );
}
