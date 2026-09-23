import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";

const FIELD_META = {
  rules: { title: "Editar Diretrizes da Comunidade", label: "Texto das diretrizes", configKey: "rulesText" },
  terms: { title: "Editar Termo de Uso", label: "Texto do termo de uso (opcional)", configKey: "termsText" },
};

export async function handleOpenRulesModal(interaction, field) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para editar isso.")], ephemeral: true });
  }

  const meta = FIELD_META[field];
  const currentText = cfg[meta.configKey] || "";

  const modal = new ModalBuilder().setCustomId(`rules_edit_modal:${field}`).setTitle(meta.title);

  const textInput = new TextInputBuilder()
    .setCustomId("texto")
    .setLabel(meta.label)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(field === "rules");

  if (currentText) textInput.setValue(currentText);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

export async function handleRulesModalSubmit(interaction) {
  const field = interaction.customId.split(":")[1];
  const meta = FIELD_META[field];
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para editar isso.")], ephemeral: true });
  }

  const texto = interaction.fields.getTextInputValue("texto").trim();

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    c[meta.configKey] = texto || null;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(updated));
  }

  return interaction.reply({
    embeds: [successEmbed(`${field === "rules" ? "Diretrizes" : "Termo de uso"} salvo(a)! Use \`/config publicar-regras\` (ou o \`/painel\`) para publicar no canal configurado.`)],
    ephemeral: true,
  });
}
