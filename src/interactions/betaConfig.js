import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isBetaAccessOpen, listBetaTesters } from "../database/betaTesters.js";
import { getNetworkStatus, StatusTableMissingError } from "../database/networkStatus.js";
import { setBetaAccess } from "../services/betaTesters.js";
import { accessChangedText, BETA_OPEN_BUTTON_ID, BETA_TABLE_MISSING, buildBetaAccessView, buildBetaListEmbed } from "../utils/betaViews.js";
import { errorEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";

// /painel → Beta Testers: the entry switch and the list. The roles are a role picker in painelMenu (cargo_beta).
export const MENU_VALUES = ["beta_acesso", "beta_lista"];

function backButton() {
  return new ButtonBuilder().setCustomId("painel_back").setLabel("⬅️ Voltar ao painel").setStyle(ButtonStyle.Secondary);
}

const backRow = () => new ActionRowBuilder().addComponents(backButton());

function databaseError(err) {
  if (err instanceof StatusTableMissingError) return errorEmbed(BETA_TABLE_MISSING);
  console.error("[betaConfig] failed", err);
  return errorEmbed("Não consegui acessar o banco de dados. Tente de novo em instantes.");
}

export async function handleBetaMenu(interaction, value) {
  await interaction.deferUpdate();
  const cfg = getGuildConfig(interaction.guildId);
  try {
    if (value === "beta_acesso") return await interaction.editReply(buildBetaAccessView(cfg, await isBetaAccessOpen(), backButton()));
    const embed = buildBetaListEmbed(cfg, await listBetaTesters(), await isBetaAccessOpen());
    return await interaction.editReply({ embeds: [embed], components: [backRow()] });
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
    await setBetaAccess(interaction.client, interaction.guildId, open, interaction.user.id);
    const notice = `✅ ${accessChangedText(open, await getNetworkStatus())}`;
    return await interaction.editReply(buildBetaAccessView(cfg, open, backButton(), notice));
  } catch (err) {
    return interaction.editReply({ embeds: [databaseError(err)], components: [backRow()] });
  }
}
