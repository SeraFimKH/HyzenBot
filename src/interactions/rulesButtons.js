import { MessageFlags } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";

function parseGuildId(interaction) {
  if (interaction.guildId) return interaction.guildId;
  const [, guildId] = interaction.customId.split(":");
  return guildId || null;
}

async function resolveMember(interaction, guildId) {
  if (interaction.member) return interaction.member;
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;
  return guild.members.fetch(interaction.user.id).catch(() => null);
}

export async function handleAccept(interaction) {
  const guildId = parseGuildId(interaction);
  if (!guildId) {
    return interaction.reply({ embeds: [errorEmbed("Não foi possível identificar o servidor de origem destas regras.")], flags: MessageFlags.Ephemeral });
  }

  const cfg = getGuildConfig(guildId);
  if (!cfg.verifiedRoleId) {
    return interaction.reply({
      embeds: [errorEmbed("O cargo de verificado ainda não foi configurado. Avise um administrador para rodar `/config cargo-verificado`.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = await resolveMember(interaction, guildId);
  if (!member) {
    return interaction.reply({
      embeds: [errorEmbed("Não encontrei você nesse servidor — você ainda faz parte dele?")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (member.roles.cache.has(cfg.verifiedRoleId)) {
    return interaction.reply({ embeds: [successEmbed("Você já aceitou as regras anteriormente!")], flags: MessageFlags.Ephemeral });
  }

  try {
    await member.roles.add(cfg.verifiedRoleId);
  } catch (err) {
    console.error("[rulesButtons] Falha ao atribuir cargo de verificado:", err);
    return interaction.reply({
      embeds: [errorEmbed("Não consegui te dar o cargo de verificado. Avise um administrador (o cargo do bot pode estar abaixo do cargo de verificado na hierarquia).")],
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    embeds: [successEmbed("✅ Regras aceitas! Você já tem acesso liberado ao servidor. Bem-vindo(a)!")],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleDecline(interaction) {
  return interaction.reply({
    embeds: [errorEmbed('Você precisa aceitar as regras para ter acesso ao servidor. Clique em "Aceitar" quando estiver pronto(a).')],
    flags: MessageFlags.Ephemeral,
  });
}
