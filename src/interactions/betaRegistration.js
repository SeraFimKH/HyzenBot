import { getGuildConfig } from "../database/guildConfig.js";
import { findLinkedPlayerName } from "../database/auth.js";
import { grantBetaAccess } from "../database/betaGrants.js";
import {
  createRegistration,
  discardRegistration,
  findActiveRegistration,
  findRegistrationByName,
  getRegistration,
  RegistrationStatus,
  updateRegistration,
} from "../database/betaRegistrations.js";
import { findKnownPlayerName } from "../database/maintenanceAllowlist.js";
import { isBetaAccessOpen, StatusTableMissingError } from "../database/networkStatus.js";
import {
  APPROVE_PREFIX,
  buildReasonModal,
  buildRegistrationButtons,
  buildRegistrationCard,
  buildRegistrationDm,
  buildRegistrationModal,
  parseRegistrationId,
  REASON_MODAL_PREFIX,
  REJECT_PREFIX,
} from "../utils/betaRegistrationViews.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";
import { postLog } from "../utils/staffLog.js";

// The pre-registration: a member presses the panel's button, types the nick, and the request goes to the approval channel
// (/painel → Servidor do Jogo; it can be in the admin server). An admin there approves — the nick becomes a beta tester:
// it gets in during the maintenance and the beta tag on joining (database/betaGrants.js) — or refuses with a reason.
// The member hears it in a DM either way.

// Requests being answered right now: two admins clicking at once don't both answer.
const answering = new Set();

const notConfigured = () => errorEmbed("O pré-registro ainda não está configurado. Avise a equipe!");

function alreadyRegistered(registration) {
  return registration.status === RegistrationStatus.PENDING
    ? errorEmbed(`Você já tem um pedido aguardando a equipe (#${registration.number}, nick **${registration.name}**). A resposta chega no seu privado.`)
    : errorEmbed(`Você já foi aprovado com o nick **${registration.name}**. Para trocar o nick, fale com a equipe.`);
}

// The panel's button.
export async function handleOpen(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!cfg.channels.preRegistroAprovacao) return interaction.reply({ embeds: [notConfigured()], ephemeral: true });
  const active = findActiveRegistration(interaction.guildId, interaction.user.id);
  if (active) return interaction.reply({ embeds: [alreadyRegistered(active)], ephemeral: true });
  await interaction.showModal(buildRegistrationModal());
}

// The form: the request's card goes to the approval channel.
export async function handleModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const cfg = getGuildConfig(interaction.guildId);
  if (!cfg.channels.preRegistroAprovacao) return interaction.editReply({ embeds: [notConfigured()] });

  const typed = interaction.fields.getTextInputValue("nick").trim().replace(/\s+/g, " ");
  if (!typed) return interaction.editReply({ embeds: [errorEmbed("Escreva o seu nick do Minecraft.")] });
  const active = findActiveRegistration(interaction.guildId, interaction.user.id);
  if (active) return interaction.editReply({ embeds: [alreadyRegistered(active)] });

  // The name exactly as it joined the server, when it did; and the game account this member linked, for the staff.
  const knownName = await findKnownPlayerName(typed);
  const name = knownName ?? typed;
  if (findRegistrationByName(interaction.guildId, name)) {
    return interaction.editReply({ embeds: [errorEmbed(`O nick **${name}** já tem um pedido de outra pessoa. Se ele é seu, fale com a equipe.`)] });
  }
  const linkedName = await findLinkedPlayerName(interaction.user.id).catch((err) => {
    console.error("[betaRegistration] failed to look up the linked account", err.message);
    return null;
  });

  const registration = createRegistration(interaction.guildId, {
    discordId: interaction.user.id,
    userTag: interaction.user.tag,
    name,
    knownName: Boolean(knownName),
    linkedName,
  });
  const card = await postLog(interaction.client, interaction.guildId, "preRegistroAprovacao", {
    embeds: [buildRegistrationCard(cfg, registration, interaction.guild.name)],
    components: buildRegistrationButtons(interaction.guildId, registration),
    allowedMentions: { parse: [] },
  });
  if (!card) {
    discardRegistration(interaction.guildId, registration.number);
    return interaction.editReply({ embeds: [errorEmbed("Não consegui mandar o seu pedido para a equipe agora. Tente de novo em instantes ou avise a equipe.")] });
  }
  updateRegistration(interaction.guildId, registration.number, (r) => {
    r.channelId = card.channelId;
    r.messageId = card.id;
  });

  return interaction.editReply({
    embeds: [successEmbed(`Pedido enviado! Nick: **${name}**.\nA equipe vai analisar e a resposta chega no seu privado — deixe a DM aberta.`)],
  });
}

// What every answer checks first: an admin of the server the card is in, and a request still waiting.
async function openRequest(interaction, prefix) {
  const { guildId, number } = parseRegistrationId(interaction.customId, prefix);
  const reply = (embed) => interaction.reply({ embeds: [embed], ephemeral: true }).then(() => null);
  if (!isAdmin(interaction.member, getGuildConfig(interaction.guildId))) return reply(errorEmbed("Só os administradores aprovam ou recusam o pré-registro."));
  const registration = getRegistration(guildId, number);
  if (!registration) return reply(errorEmbed(`Não encontrei o pré-registro #${number}.`));
  if (registration.status !== RegistrationStatus.PENDING || answering.has(`${guildId}:${number}`)) {
    return reply(errorEmbed(`O pré-registro #${number} já foi respondido.`));
  }
  return { guildId, number, registration };
}

export async function handleApprove(interaction) {
  const request = await openRequest(interaction, APPROVE_PREFIX);
  if (!request) return;
  const { guildId, number, registration } = request;
  await oneAnswerAtATime(guildId, number, async () => {
    // The database and the DM take a moment: the click is acknowledged now and the card edited when it's done.
    await interaction.deferUpdate();
    try {
      await grantBetaAccess(registration.name, registration.discordId, interaction.user.tag.slice(0, 64));
    } catch (err) {
      const message =
        err instanceof StatusTableMissingError
          ? "O banco ainda não tem a parte do pré-registro. Ela é criada pelo **HyzenCore** atualizado quando o servidor liga — atualize o plugin, ligue o servidor uma vez e tente de novo."
          : "Não consegui liberar o nick no banco de dados. Tente de novo em instantes.";
      if (!(err instanceof StatusTableMissingError)) console.error("[betaRegistration] failed to grant", err);
      return interaction.followUp({ embeds: [errorEmbed(message)], ephemeral: true });
    }
    await answer(interaction, guildId, number, RegistrationStatus.APPROVED, null);
  });
}

// Recusar asks for the reason first.
export async function handleReject(interaction) {
  const request = await openRequest(interaction, REJECT_PREFIX);
  if (!request) return;
  await interaction.showModal(buildReasonModal(request.guildId, request.number));
}

export async function handleReasonSubmit(interaction) {
  const request = await openRequest(interaction, REASON_MODAL_PREFIX);
  if (!request) return;
  const reason = interaction.fields.getTextInputValue("motivo").trim() || null;
  await oneAnswerAtATime(request.guildId, request.number, async () => {
    await interaction.deferUpdate();
    await answer(interaction, request.guildId, request.number, RegistrationStatus.REJECTED, reason);
  });
}

async function oneAnswerAtATime(guildId, number, work) {
  const key = `${guildId}:${number}`;
  answering.add(key);
  try {
    await work();
  } finally {
    answering.delete(key);
  }
}

// Records the answer, tells the member in a DM, and edits the card (no buttons anymore). The interaction was deferred.
async function answer(interaction, guildId, number, status, reason) {
  const cfg = getGuildConfig(guildId);
  let registration = updateRegistration(guildId, number, (r) => {
    r.status = status;
    r.decision = { staffId: interaction.user.id, at: Date.now(), reason, dmSent: null };
  });

  const betaOpen = status === RegistrationStatus.APPROVED ? await isBetaAccessOpen().catch(() => true) : null;
  const member = await interaction.client.users.fetch(registration.discordId).catch(() => null);
  const dmSent = member
    ? await member
        .send({ embeds: [buildRegistrationDm(cfg, registration, betaOpen)] })
        .then(() => true)
        .catch(() => false)
    : false;
  registration = updateRegistration(guildId, number, (r) => {
    r.decision.dmSent = dmSent;
  });

  const originName = interaction.client.guilds.cache.get(guildId)?.name ?? "?";
  await interaction.editReply({ embeds: [buildRegistrationCard(cfg, registration, originName)], components: [], allowedMentions: { parse: [] } });
}
