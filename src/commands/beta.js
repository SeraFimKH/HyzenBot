import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getBetaTester, isBetaAccessOpen, listBetaTesters, MAX_NAME_LENGTH, NameTakenError } from "../database/betaTesters.js";
import { findKnownPlayerName } from "../database/maintenanceAllowlist.js";
import { getNetworkStatus, StatusMode, StatusTableMissingError } from "../database/networkStatus.js";
import { canBeBetaTester, registerBetaTester, removeBetaTester, setBetaAccess } from "../services/betaTesters.js";
import { accessChangedText, accessLabel, BETA_TABLE_MISSING, buildBetaListEmbed } from "../utils/betaViews.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin, isStaff } from "../utils/permissions.js";

// Os beta testers: quem tem o cargo de beta tester (/painel → Beta Testers) registra o nick do jogo e entra no servidor
// durante a manutenção — enquanto a equipe deixar a entrada deles liberada (/beta acesso aqui, /manutencao beta no jogo).
export const data = new SlashCommandBuilder()
  .setName("beta")
  .setDescription("Beta testers: o nick para entrar no servidor durante a manutenção.")
  .addSubcommand((sub) =>
    sub
      .setName("nick")
      .setDescription("Registra (ou troca) o seu nick do jogo como beta tester.")
      .addStringOption((opt) => opt.setName("nick").setDescription("O seu nome no Minecraft").setRequired(true).setMaxLength(MAX_NAME_LENGTH)),
  )
  .addSubcommand((sub) => sub.setName("status").setDescription("Mostra o seu nick de beta tester e se a entrada está liberada agora."))
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
  )
  .addSubcommand((sub) => sub.setName("lista").setDescription("Os beta testers e os nicks registrados (equipe)."))
  .addSubcommand((sub) =>
    sub
      .setName("remover")
      .setDescription("Tira o nick de um beta tester (administradores).")
      .addUserOption((opt) => opt.setName("membro").setDescription("O beta tester").setRequired(true)),
  );

const ADMIN_ONLY = ["acesso", "remover"];
const STAFF_ONLY = ["lista"];

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const sub = interaction.options.getSubcommand();
  if ((ADMIN_ONLY.includes(sub) && !isAdmin(interaction.member, cfg)) || (STAFF_ONLY.includes(sub) && !isStaff(interaction.member, cfg))) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    if (sub === "nick") return await registerNick(interaction, cfg);
    if (sub === "status") return await showStatus(interaction, cfg);
    if (sub === "acesso") return await changeAccess(interaction);
    if (sub === "lista") return await interaction.editReply({ embeds: [buildBetaListEmbed(cfg, await listBetaTesters(), await isBetaAccessOpen())] });
    return await removeTester(interaction);
  } catch (err) {
    if (err instanceof StatusTableMissingError) return interaction.editReply({ embeds: [errorEmbed(BETA_TABLE_MISSING)] });
    console.error("[beta] failed", err);
    return interaction.editReply({ embeds: [errorEmbed("Não consegui acessar o banco de dados. Tente de novo em instantes.")] });
  }
}

async function registerNick(interaction, cfg) {
  if (!cfg.betaRoles.length) {
    return interaction.editReply({ embeds: [errorEmbed("Este servidor ainda não tem cargo de beta tester. Um administrador escolhe em `/painel` → 🧪 Beta Testers.")] });
  }
  if (!canBeBetaTester(interaction.member, cfg)) {
    return interaction.editReply({ embeds: [errorEmbed("Só quem tem o cargo de beta tester pode registrar o nick.")] });
  }
  const typed = interaction.options.getString("nick", true).trim().replace(/\s+/g, " ");
  if (!typed) return interaction.editReply({ embeds: [errorEmbed("Informe o seu nick do jogo.")] });

  // O nome como o jogador já entrou no servidor; um nome nunca visto também vale (pode ser a primeira vez), com o aviso.
  const known = await findKnownPlayerName(typed);
  const name = known ?? typed;
  const previous = await getBetaTester(interaction.user.id);
  try {
    await registerBetaTester(interaction.member, name, previous?.name ?? null);
  } catch (err) {
    if (err instanceof NameTakenError) return interaction.editReply({ embeds: [errorEmbed(`O nick **${name}** já está registrado por outro beta tester.`)] });
    throw err;
  }

  const lines = [
    `**${name}** está registrado como beta tester${previous && previous.name !== name ? ` (antes: **${previous.name}**)` : ""}.`,
    "Durante a manutenção você entra no servidor com esse nick, enquanto a entrada dos beta testers estiver liberada.",
    "",
    await situation(),
  ];
  if (!known) lines.push("", "⚠️ Esse nick nunca entrou no servidor — confira se está escrito igual ao do Minecraft.");
  return interaction.editReply({ embeds: [successEmbed(lines.join("\n"))] });
}

async function showStatus(interaction, cfg) {
  const tester = await getBetaTester(interaction.user.id);
  const mine = tester
    ? `Seu nick de beta tester: **${tester.name}**`
    : canBeBetaTester(interaction.member, cfg)
      ? "Você ainda não registrou o nick. Use `/beta nick`."
      : "Você não é beta tester neste servidor.";
  const embed = baseEmbed(cfg.communityName).setTitle("🧪 Beta testers").setDescription(`${mine}\n\n${await situation()}`);
  return interaction.editReply({ embeds: [embed] });
}

async function changeAccess(interaction) {
  const open = interaction.options.getString("estado", true) === "liberar";
  if ((await isBetaAccessOpen()) === open) {
    return interaction.editReply({ embeds: [errorEmbed(`A entrada dos beta testers já está ${accessLabel(open)}.`)] });
  }
  await setBetaAccess(interaction.client, interaction.guildId, open, interaction.user.id);
  return interaction.editReply({ embeds: [successEmbed(accessChangedText(open, await getNetworkStatus()))] });
}

async function removeTester(interaction) {
  const user = interaction.options.getUser("membro", true);
  const removed = await removeBetaTester(interaction.client, interaction.guildId, user.id, `Removido por <@${interaction.user.id}>.`);
  if (!removed) return interaction.editReply({ embeds: [errorEmbed(`${user} não tinha nick de beta tester registrado.`)] });
  return interaction.editReply({
    embeds: [successEmbed(`O nick **${removed.name}** de ${user} foi tirado dos beta testers.\nSe ele ainda tiver o cargo, pode registrar de novo — tire o cargo para tirar de vez.`)],
  });
}

// "Entrada agora: 🔓 liberada · Manutenção: 🛠️ ligada"
async function situation() {
  const [open, status] = await Promise.all([isBetaAccessOpen(), getNetworkStatus()]);
  const maintenance = status.mode === StatusMode.MAINTENANCE ? "🛠️ **ligada**" : "desligada (o servidor está aberto para todos)";
  return `Entrada dos beta testers: ${accessLabel(open)} · Manutenção: ${maintenance}`;
}
