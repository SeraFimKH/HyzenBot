import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { MAX_NAME_LENGTH } from "../database/betaGrants.js";
import { getNetworkStatus, isBetaAccessOpen, setBetaAccessOpen, StatusTableMissingError } from "../database/networkStatus.js";
import { addBetaTester, getBetaOverview, removeBetaTester } from "../services/betaTesters.js";
import { accessChangedText, accessLabel, BETA_TABLE_MISSING, buildBetaOverviewEmbed } from "../utils/betaViews.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin, isStaff } from "../utils/permissions.js";

// Os beta testers pelo lado da equipe: quem é (a tag de beta no jogo, ou aprovado e ainda sem entrar), adicionar sem
// pré-registro, tirar, e liberar ou bloquear a entrada deles na manutenção (a mesma chave do /manutencao beta).
const REASON_MAX_LENGTH = 300;

export const data = new SlashCommandBuilder()
  .setName("beta")
  .setDescription("Beta testers: lista, adicionar, remover e liberar a entrada na manutenção.")
  .addSubcommand((sub) => sub.setName("lista").setDescription("Quem é beta tester, quem foi aprovado e os pedidos aguardando (equipe)."))
  .addSubcommand((sub) =>
    sub
      .setName("adicionar")
      .setDescription("Torna um jogador beta tester sem pré-registro (administradores).")
      .addStringOption((opt) => opt.setName("nick").setDescription("O nick no Minecraft").setRequired(true).setMaxLength(MAX_NAME_LENGTH))
      .addUserOption((opt) => opt.setName("membro").setDescription("O membro do Discord, para ele receber o aviso no privado")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remover")
      .setDescription("Tira um jogador dos beta testers: a tag de beta e a aprovação (administradores).")
      .addStringOption((opt) => opt.setName("nick").setDescription("O nick no Minecraft").setRequired(true).setMaxLength(MAX_NAME_LENGTH))
      .addStringOption((opt) => opt.setName("motivo").setDescription("O membro recebe no privado").setMaxLength(REASON_MAX_LENGTH)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("acesso")
      .setDescription("Libera ou bloqueia a entrada dos beta testers na manutenção (administradores).")
      .addStringOption((opt) =>
        opt
          .setName("estado")
          .setDescription("Liberar ou bloquear")
          .setRequired(true)
          .addChoices({ name: "🔓 Liberar", value: "liberar" }, { name: "🔒 Bloquear", value: "bloquear" }),
      ),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const sub = interaction.options.getSubcommand();
  const allowed = sub === "lista" ? isStaff(interaction.member, cfg) : isAdmin(interaction.member, cfg);
  if (!allowed) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    if (sub === "lista") return await interaction.editReply({ embeds: [buildBetaOverviewEmbed(cfg, await getBetaOverview())], allowedMentions: { parse: [] } });
    if (sub === "adicionar") return await add(interaction);
    if (sub === "remover") return await remove(interaction);
    return await access(interaction);
  } catch (err) {
    if (err instanceof StatusTableMissingError) return interaction.editReply({ embeds: [errorEmbed(BETA_TABLE_MISSING)] });
    console.error("[beta] failed", err);
    return interaction.editReply({ embeds: [errorEmbed("Não consegui acessar o banco de dados. Tente de novo em instantes.")] });
  }
}

async function add(interaction) {
  const nick = interaction.options.getString("nick", true).trim().replace(/\s+/g, " ");
  if (!nick) return interaction.editReply({ embeds: [errorEmbed("Informe o nick do jogador.")] });
  const member = interaction.options.getUser("membro");
  const result = await addBetaTester(interaction.client, interaction.guildId, { name: nick, discordId: member?.id ?? null, staffTag: interaction.user.tag.slice(0, 64) });
  if (result.already) return interaction.editReply({ embeds: [errorEmbed(`**${result.name}** já é beta tester.`)] });

  const lines = [`**${result.name}** agora é beta tester: entra na manutenção (enquanto a entrada estiver liberada) e ganha a tag de beta ao entrar no servidor.`];
  if (!result.known) lines.push("⚠️ Esse nick nunca entrou no servidor — confira se está escrito igual ao do Minecraft.");
  if (result.dmSent === true) lines.push(`📬 ${member} foi avisado no privado.`);
  if (result.dmSent === false) lines.push(`📭 Não consegui avisar ${member} no privado (DM fechada).`);
  return interaction.editReply({ embeds: [successEmbed(lines.join("\n"))] });
}

async function remove(interaction) {
  const nick = interaction.options.getString("nick", true).trim();
  const reason = interaction.options.getString("motivo")?.trim() || null;
  const result = await removeBetaTester(interaction.client, interaction.guildId, { name: nick, staffId: interaction.user.id, reason });
  if (!result.found) return interaction.editReply({ embeds: [errorEmbed(`**${nick}** não é beta tester (sem a tag de beta e sem aprovação).`)] });

  const lines = [`**${result.name}** não é mais beta tester.`];
  if (result.tagTaken) lines.push("🏷️ A tag de beta foi tirada no jogo.");
  if (result.tagFailed) lines.push("⚠️ Não consegui tirar a tag de beta no jogo agora (Redis fora do ar) — tire com `/tagadmin revoke` no jogo.");
  if (result.dmSent === true) lines.push("📬 O membro foi avisado no privado.");
  if (result.dmSent === false) lines.push("📭 Não consegui avisar o membro no privado (DM fechada).");
  return interaction.editReply({ embeds: [successEmbed(lines.join("\n"))] });
}

async function access(interaction) {
  const open = interaction.options.getString("estado", true) === "liberar";
  if ((await isBetaAccessOpen()) === open) {
    return interaction.editReply({ embeds: [errorEmbed(`A entrada dos beta testers já está ${accessLabel(open)}.`)] });
  }
  await setBetaAccessOpen(open);
  return interaction.editReply({ embeds: [successEmbed(accessChangedText(open, await getNetworkStatus()))] });
}
