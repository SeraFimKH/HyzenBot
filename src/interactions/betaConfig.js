import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getNetworkStatus, isBetaAccessOpen, setBetaAccessOpen, StatusTableMissingError } from "../database/networkStatus.js";
import { accessChangedText, BETA_OPEN_BUTTON_ID, BETA_TABLE_MISSING, buildBetaAccessView } from "../utils/betaViews.js";
import { errorEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";

// /painel → Servidor do Jogo → Entrada dos Beta Testers: the switch, with a button each way.
export const MENU_VALUES = ["beta_acesso"];

function backButton() {
  return new ButtonBuilder().setCustomId("painel_back").setLabel("⬅️ Voltar ao painel").setStyle(ButtonStyle.Secondary);
}

const backRow = () => new ActionRowBuilder().addComponents(backButton());

function databaseError(err) {
  if (err instanceof StatusTableMissingError) return errorEmbed(BETA_TABLE_MISSING);
  console.error("[betaConfig] failed", err);
  return errorEmbed("Não consegui acessar o banco de dados. Tente de novo em instantes.");
}

export async function handleBetaMenu(interaction) {
  await interaction.deferUpdate();
  try {
    return await interaction.editReply(buildBetaAccessView(getGuildConfig(interaction.guildId), await isBetaAccessOpen(), backButton()));
  } catch (err) {
    return interaction.editReply({ embeds: [databaseError(err)], components: [backRow()] });
  }
}

export async function handleBetaAccessButton(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para fazer isso.")], ephemeral: true });
  }
  const open = interaction.customId === BETA_OPEN_BUTTON_ID;
  await interaction.deferUpdate();
  try {
    await setBetaAccessOpen(open);
    const notice = `✅ ${accessChangedText(open, await getNetworkStatus())}`;
    return await interaction.editReply(buildBetaAccessView(cfg, open, backButton(), notice));
  } catch (err) {
    return interaction.editReply({ embeds: [databaseError(err)], components: [backRow()] });
  }
}
