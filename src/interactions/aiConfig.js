import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildMainPanel } from "../utils/painelView.js";
import { defaultSystemPrompt } from "../utils/ticketAi.js";

export async function handleOpenAiKeyModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem configurar a IA.")], ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId("ai_key_modal").setTitle("Configurar IA (qualquer provedor)");

  const keyInput = new TextInputBuilder()
    .setCustomId("chave")
    .setLabel("API Key")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.aiApiKey ? "Já configurada — digite uma nova pra substituir" : "sk-...")
    .setMaxLength(300)
    .setRequired(true);

  // Não é exclusivo da OpenAI — qualquer provedor com endpoint compatível com o formato "chat completions"
  // funciona (Groq, OpenRouter, DeepSeek, Together, um Ollama local, etc.), bastando trocar a URL base + modelo.
  const urlInput = new TextInputBuilder()
    .setCustomId("url")
    .setLabel("URL base da API (opcional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.aiBaseUrl || "Padrão: https://api.openai.com/v1")
    .setMaxLength(200)
    .setRequired(false);

  const modeloInput = new TextInputBuilder()
    .setCustomId("modelo")
    .setLabel("Modelo (opcional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.aiModel || "Padrão: gpt-4o-mini")
    .setMaxLength(100)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(keyInput),
    new ActionRowBuilder().addComponents(urlInput),
    new ActionRowBuilder().addComponents(modeloInput),
  );

  await interaction.showModal(modal);
}

export async function handleAiKeyModalSubmit(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem configurar a IA.")], ephemeral: true });
  }

  const chave = interaction.fields.getTextInputValue("chave").trim();
  const url = interaction.fields.getTextInputValue("url").trim();
  const modelo = interaction.fields.getTextInputValue("modelo").trim();

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    c.aiApiKey = chave || null;
    c.aiBaseUrl = url || null;
    c.aiModel = modelo || null;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(updated));
  }

  return interaction.reply({
    embeds: [successEmbed("Configuração de IA salva! Ative com `/config ia-ativar` (ou pelo `/painel`) pra começar a responder os tickets automaticamente.")],
    ephemeral: true,
  });
}

export async function handleOpenAiContextModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem configurar a IA.")], ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId("ai_context_modal").setTitle("Contexto da IA no Ticket");

  const textoInput = new TextInputBuilder()
    .setCustomId("texto")
    .setLabel("Instruções/FAQ que a IA deve seguir")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Ex: preços, prazos, políticas, tom de voz, quando encaminhar pro humano...")
    .setMaxLength(3000)
    .setRequired(false);

  // Pré-preenche com o texto atual, ou com o padrão (pra o admin ver e editar) se ainda não configurou nada.
  textoInput.setValue(cfg.aiSystemPrompt || defaultSystemPrompt(cfg.communityName));

  modal.addComponents(new ActionRowBuilder().addComponents(textoInput));

  await interaction.showModal(modal);
}

export async function handleAiContextModalSubmit(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Somente administradores podem configurar a IA.")], ephemeral: true });
  }

  const texto = interaction.fields.getTextInputValue("texto").trim();

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    c.aiSystemPrompt = texto || null;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(updated));
  }

  return interaction.reply({
    embeds: [successEmbed("Contexto da IA salvo! Ele já vale pras próximas respostas automáticas.")],
    ephemeral: true,
  });
}

export function buildAiToggleView(cfg) {
  const embed = baseEmbed(cfg.communityName)
    .setTitle("🤖 IA no Ticket")
    .setDescription(
      `Estado atual: ${cfg.aiEnabled ? "🟢 **Ativada**" : "⚪ **Desativada**"}\n\n` +
        `Quando ativada, a IA responde automaticamente as primeiras mensagens do membro em tickets ainda não assumidos por um staff (respeitando o mesmo intervalo de 1 minuto do aviso padrão). Precisa de uma chave de API configurada (\`/config ia-chave\` ou pelo \`/painel\`) — funciona com qualquer provedor compatível com o formato "chat completions" da OpenAI (OpenAI, Groq, OpenRouter, DeepSeek, Ollama local, etc).\n\n` +
        `Chave de API: ${cfg.aiApiKey ? "✅ Configurada" : "❌ Não configurada"}\n` +
        `Modelo: ${cfg.aiModel ? `\`${cfg.aiModel}\`` : "*(padrão: gpt-4o-mini)*"}`,
    );

  return embed;
}
