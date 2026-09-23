import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";
import { TEXT_FIELDS, getText } from "../utils/textDefaults.js";

const FIELD_BY_KEY = Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, f]));

export async function handleOpenTextModal(interaction, key) {
  const cfg = getGuildConfig(interaction.guildId);
  const field = FIELD_BY_KEY[key];

  if (!field) {
    return interaction.reply({ embeds: [errorEmbed("Texto desconhecido.")], ephemeral: true });
  }

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem editar textos.")], ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId(`text_edit_modal:${key}`).setTitle(field.label);

  const textoInput = new TextInputBuilder()
    .setCustomId("texto")
    .setLabel(field.label)
    .setStyle(field.style === "Paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(field.maxLength)
    .setRequired(false)
    .setValue(getText(cfg, key));

  modal.addComponents(new ActionRowBuilder().addComponents(textoInput));

  await interaction.showModal(modal);
}

export async function handleTextModalSubmit(interaction) {
  const key = interaction.customId.split(":")[1];
  const field = FIELD_BY_KEY[key];
  const cfg = getGuildConfig(interaction.guildId);

  if (!field || !isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Não foi possível salvar esse texto.")], ephemeral: true });
  }

  const texto = interaction.fields.getTextInputValue("texto").trim();

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    if (texto) {
      c.texts[key] = texto;
    } else {
      delete c.texts[key];
    }
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(updated));
  }

  return interaction.reply({
    embeds: [successEmbed(texto ? `Texto **${field.label}** atualizado!` : `Texto **${field.label}** resetado para o padrão.`)],
    ephemeral: true,
  });
}

export function buildTextListEmbed(cfg, group) {
  const fields = TEXT_FIELDS.filter((f) => f.group === group);
  const groupLabel = group === "painel" ? "Títulos" : "Mensagens";

  const list = fields.map((f) => `${cfg.texts?.[f.key] ? "✏️" : "⚪"} **${f.label}**`).join("\n");

  return baseEmbed(cfg.communityName)
    .setTitle(`📝 Textos — ${groupLabel}`)
    .setDescription(`✏️ = customizado · ⚪ = padrão\n\n${list}`);
}
