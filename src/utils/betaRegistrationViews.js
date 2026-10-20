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
};

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
    embed.addFields({ name: registration.status === RegistrationStatus.APPROVED ? "🛡️ Aprovado por" : "🛡️ Recusado por", value: `<@${decision.staffId}> · ${relative(decision.at)}` });
    if (decision.reason) embed.addFields({ name: "💬 Motivo", value: quote(decision.reason).slice(0, 1024) });
    if (decision.dmSent === false) embed.addFields({ name: "📭 Aviso", value: "Não consegui avisar o membro no privado (DM fechada)." });
  }
  return embed;
}

export function buildRegistrationButtons(guildId, registration) {
  if (registration.status !== RegistrationStatus.PENDING) return [];
  const id = `${guildId}:${registration.number}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${APPROVE_PREFIX}${id}`).setLabel("Aprovar").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${REJECT_PREFIX}${id}`).setLabel("Recusar").setEmoji("✖️").setStyle(ButtonStyle.Danger),
    ),
  ];
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

// The answer in the member's DM. betaOpen: whether the beta testers get in right now.
export function buildRegistrationDm(cfg, registration, betaOpen) {
  if (registration.status === RegistrationStatus.APPROVED) {
    return baseEmbed(cfg.communityName)
      .setColor(STATUS_VIEW.APPROVED.color)
      .setTitle("✅ Seu pré-registro foi aprovado!")
      .setDescription(
        `Bem-vindo(a) aos beta testers da **${cfg.communityName}**! Nick: **${registration.name}**\n\n` +
          (betaOpen
            ? "Durante a manutenção você já pode entrar no servidor com esse nick."
            : "A entrada dos beta testers está fechada agora — assim que a equipe liberar, você entra no servidor com esse nick durante a manutenção.") +
          "\nNa primeira vez que entrar, você ganha a tag de beta.",
      );
  }
  const reason = registration.decision?.reason;
  return baseEmbed(cfg.communityName)
    .setColor(STATUS_VIEW.REJECTED.color)
    .setTitle("❌ Seu pré-registro não foi aprovado")
    .setDescription(`O pedido com o nick **${registration.name}** foi recusado pela equipe.${reason ? `\n\n${quote(reason)}` : ""}`);
}
