import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { MAX_NAME_LENGTH } from "../database/betaGrants.js";
import { RegistrationStatus } from "../database/betaRegistrations.js";
import { baseEmbed } from "./embeds.js";
import { getText } from "./textDefaults.js";

// The pre-registration: the panel with the button (in the players' or the beta server), the form with the nick, the
// request's card in the staff's approval channel (with Aprovar / Recusar) and the answer in the member's DM.
export const PANEL_BUTTON_ID = "prereg_open";
export const MODAL_ID = "prereg_modal";
export const APPROVE_PREFIX = "prereg_ok:";
export const REJECT_PREFIX = "prereg_no:";
export const REASON_MODAL_PREFIX = "prereg_motivo:";

const REASON_MAX_LENGTH = 300;

const STATUS_VIEW = {
  [RegistrationStatus.PENDING]: { emoji: "⏳", label: "Aguardando aprovação", color: 0xfaa61a },
  [RegistrationStatus.APPROVED]: { emoji: "✅", label: "Aprovado", color: 0x57f287 },
  [RegistrationStatus.REJECTED]: { emoji: "❌", label: "Recusado", color: 0xed4245 },
  [RegistrationStatus.REMOVED]: { emoji: "🗑️", label: "Removido dos beta testers", color: 0x99aab5 },
};

export const REMOVE_PREFIX = "prereg_rm:";
export const REMOVE_MODAL_PREFIX = "prereg_rmmotivo:";

const quote = (text) => `> ${text.replace(/\n/g, "\n> ")}`;
const relative = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;
// "<guildId>:<number>" after a prefix, from a button's or a form's id.
export const parseRegistrationId = (customId, prefix) => {
  const [guildId, number] = customId.slice(prefix.length).split(":");
  return { guildId, number: Number(number) };
};

export function buildRegistrationPanel(cfg) {
  const embed = baseEmbed(cfg.communityName).setTitle(getText(cfg, "preregistro_panel_titulo")).setDescription(getText(cfg, "preregistro_panel_desc"));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(PANEL_BUTTON_ID).setLabel(getText(cfg, "preregistro_botao")).setEmoji("📝").setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

export function buildRegistrationModal() {
  const nick = new TextInputBuilder()
    .setCustomId("nick")
    .setLabel("Seu nick no Minecraft")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Exatamente como aparece no jogo")
    .setMinLength(1)
    .setMaxLength(MAX_NAME_LENGTH)
    .setRequired(true);
  return new ModalBuilder().setCustomId(MODAL_ID).setTitle("🧪 Pré-registro Beta").addComponents(new ActionRowBuilder().addComponents(nick));
}

function linkedText(registration) {
  if (!registration.linkedName) return "❌ não vinculado (`/verificar`)";
  if (registration.linkedName.toLowerCase() === registration.name.toLowerCase()) return "✅ vinculado a esse nick";
  return `⚠️ vinculado a **${registration.linkedName}** (outro nick)`;
}

// The card the staff answers on. originName: the Discord server the request came from.
export function buildRegistrationCard(cfg, registration, originName) {
  const view = STATUS_VIEW[registration.status];
  const embed = baseEmbed(cfg.communityName)
    .setColor(view.color)
    .setTitle(`🧪 Pré-registro #${registration.number} — ${view.emoji} ${view.label}`)
    .addFields(
      { name: "👤 Membro", value: `<@${registration.discordId}> · ${registration.userTag}`, inline: true },
      { name: "🎮 Nick", value: `**${registration.name}**`, inline: true },
      { name: "​", value: "​", inline: true },
      { name: "🖥️ No servidor", value: registration.knownName ? "✅ já entrou com esse nick" : "⚠️ nunca entrou com esse nick", inline: true },
      { name: "🔗 Discord vinculado", value: linkedText(registration), inline: true },
      { name: "🕒 Pedido", value: relative(registration.requestedAt), inline: true },
    )
    .setFooter({ text: `${cfg.communityName} · pedido feito em ${originName}` });

  const decision = registration.decision;
  if (decision) {
    embed.addFields({ name: registration.status === RegistrationStatus.REJECTED ? "🛡️ Recusado por" : "🛡️ Aprovado por", value: `<@${decision.staffId}> · ${relative(decision.at)}` });
    if (decision.reason) embed.addFields({ name: "💬 Motivo", value: quote(decision.reason).slice(0, 1024) });
    if (decision.dmSent === false) embed.addFields({ name: "📭 Aviso", value: "Não consegui avisar o membro no privado (DM fechada)." });
  }
  const removal = registration.removal;
  if (removal) {
    embed.addFields({ name: "🗑️ Removido por", value: `<@${removal.staffId}> · ${relative(removal.at)}` });
    if (removal.reason) embed.addFields({ name: "💬 Motivo da remoção", value: quote(removal.reason).slice(0, 1024) });
  }
  return embed;
}

// Waiting: Aprovar / Recusar. Approved: Remover dos beta testers. Refused or removed: nothing.
export function buildRegistrationButtons(guildId, registration) {
  const id = `${guildId}:${registration.number}`;
  if (registration.status === RegistrationStatus.PENDING) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${APPROVE_PREFIX}${id}`).setLabel("Aprovar").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${REJECT_PREFIX}${id}`).setLabel("Recusar").setEmoji("✖️").setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  if (registration.status === RegistrationStatus.APPROVED) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${REMOVE_PREFIX}${id}`).setLabel("Remover dos beta testers").setEmoji("🗑️").setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  return [];
}

export function buildRemoveReasonModal(guildId, number, name) {
  const reason = new TextInputBuilder()
    .setCustomId("motivo")
    .setLabel("Motivo (o membro recebe no privado)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(REASON_MAX_LENGTH)
    .setRequired(false);
  return new ModalBuilder()
    .setCustomId(`${REMOVE_MODAL_PREFIX}${guildId}:${number}`)
    .setTitle(`Remover ${name} dos beta testers`.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(reason));
}

export function buildReasonModal(guildId, number) {
  const reason = new TextInputBuilder()
    .setCustomId("motivo")
    .setLabel("Motivo (o membro recebe no privado)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(REASON_MAX_LENGTH)
    .setRequired(false);
  return new ModalBuilder()
    .setCustomId(`${REASON_MODAL_PREFIX}${guildId}:${number}`)
    .setTitle(`Recusar o pré-registro #${number}`)
    .addComponents(new ActionRowBuilder().addComponents(reason));
}

// Approved, or added straight away by the staff. betaOpen: whether the beta testers get in right now; verified: whether
// their Discord is already linked to the game — if not, they're told to, as the game will tell them when they join.
export function buildWelcomeDm(cfg, name, betaOpen, verified, title = "✅ Você agora é beta tester!") {
  const lines = [
    `Bem-vindo(a) aos beta testers da **${cfg.communityName}**! Nick: **${name}**`,
    "",
    betaOpen
      ? "Durante a manutenção você já pode entrar no servidor com esse nick."
      : "A entrada dos beta testers está fechada agora — assim que a equipe liberar, você entra no servidor com esse nick durante a manutenção.",
    "Na primeira vez que entrar, você ganha a tag de beta.",
  ];
  if (!verified) {
    lines.push("", "📌 **Falta vincular a sua conta:** use `/verificar` aqui no Discord para pegar o código e digite `/verificar <código>` no jogo. Sem isso você não consegue usar `/tags`.");
  }
  return baseEmbed(cfg.communityName).setColor(STATUS_VIEW.APPROVED.color).setTitle(title).setDescription(lines.join("\n"));
}

export function buildRemovedDm(cfg, name, reason) {
  return baseEmbed(cfg.communityName)
    .setColor(STATUS_VIEW.REMOVED.color)
    .setTitle("🗑️ Você saiu dos beta testers")
    .setDescription(`O nick **${name}** não faz mais parte dos beta testers da **${cfg.communityName}**.${reason ? `\n\n${quote(reason)}` : ""}`);
}

// The answer in the member's DM.
export function buildRegistrationDm(cfg, registration, betaOpen, verified) {
  if (registration.status === RegistrationStatus.APPROVED) {
    return buildWelcomeDm(cfg, registration.name, betaOpen, verified, "✅ Seu pré-registro foi aprovado!");
  }
  const reason = registration.decision?.reason;
  return baseEmbed(cfg.communityName)
    .setColor(STATUS_VIEW.REJECTED.color)
    .setTitle("❌ Seu pré-registro não foi aprovado")
    .setDescription(`O pedido com o nick **${registration.name}** foi recusado pela equipe.${reason ? `\n\n${quote(reason)}` : ""}`);
}
