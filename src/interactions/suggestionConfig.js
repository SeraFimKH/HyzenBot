import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";
import { moveSuggestionPanel } from "../services/suggestionPanel.js";
import { MAX_POLL_DAYS } from "../utils/suggestionViews.js";

export const CONFIG_MODAL_ID = "sugestao_config_modal";
const MAX_COOLDOWN_MINUTES = 1440;

// /painel → Comunidade → Configurar Sugestões: quanto dura a votação e quanto cada membro espera entre uma
// sugestão e outra.
export async function handleOpenSuggestionConfigModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  const days = new TextInputBuilder()
    .setCustomId("dias")
    .setLabel(`Dias de votação (1 a ${MAX_POLL_DAYS})`)
    .setStyle(TextInputStyle.Short)
    .setValue(String(cfg.suggestionPollDays))
    .setMaxLength(2)
    .setRequired(true);

  const cooldown = new TextInputBuilder()
    .setCustomId("intervalo")
    .setLabel("Minutos entre sugestões do mesmo membro")
    .setStyle(TextInputStyle.Short)
    .setValue(String(cfg.suggestionCooldownMinutes))
    .setMaxLength(4)
    .setRequired(true);

  const modal = new ModalBuilder()
    .setCustomId(CONFIG_MODAL_ID)
    .setTitle("Configurar Sugestões")
    .addComponents(new ActionRowBuilder().addComponents(days), new ActionRowBuilder().addComponents(cooldown));
  await interaction.showModal(modal);
}

export async function handleSuggestionConfigModalSubmit(interaction) {
  const days = Number(interaction.fields.getTextInputValue("dias").trim());
  const cooldown = Number(interaction.fields.getTextInputValue("intervalo").trim());

  if (!Number.isInteger(days) || days < 1 || days > MAX_POLL_DAYS) {
    return interaction.reply({ embeds: [errorEmbed(`Os dias de votação precisam ser um número inteiro de 1 a ${MAX_POLL_DAYS} (o máximo do Discord).`)], ephemeral: true });
  }
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > MAX_COOLDOWN_MINUTES) {
    return interaction.reply({ embeds: [errorEmbed(`O intervalo precisa ser um número inteiro de 0 a ${MAX_COOLDOWN_MINUTES} minutos.`)], ephemeral: true });
  }

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.suggestionPollDays = days;
    c.suggestionCooldownMinutes = cooldown;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(cfg, interaction));
  }
  return interaction.reply({
    embeds: [baseEmbed().setDescription(`✅ Votação de **${days} dia(s)**, intervalo de **${cooldown} minuto(s)** entre sugestões.`)],
    ephemeral: true,
  });
}

// O resultado de (re)publicar o painel de sugestões, como embed para a staff.
export async function publishSuggestionPanel(client, guildId) {
  try {
    const result = await moveSuggestionPanel(client, guildId, { force: true });
    return result.ok
      ? baseEmbed().setDescription(`✅ Painel de sugestões publicado em ${result.channel}. Ele desce sozinho a cada sugestão nova, ficando sempre por último.`)
      : errorEmbed(result.reason);
  } catch (err) {
    console.error("[suggestionConfig] failed to publish the suggestion panel", err);
    return errorEmbed("Não consegui publicar o painel de sugestões. Confira as permissões do bot no canal.");
  }
}
