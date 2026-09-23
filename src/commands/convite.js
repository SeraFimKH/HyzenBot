import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getRaffle } from "../database/raffles.js";
import { getPersonalCode, setPersonalCode, getInviteCount, getGuildInviteCounts } from "../database/invites.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { enforceCommandsChannel } from "../utils/commandsChannel.js";

export const data = new SlashCommandBuilder()
  .setName("convite")
  .setDescription("Pegue seu link pessoal de convite e ganhe entradas em sorteios convidando pessoas.")
  .addSubcommand((sub) => sub.setName("link").setDescription("Mostra (ou cria) seu link pessoal de convite."))
  .addSubcommand((sub) => sub.setName("ranking").setDescription("Mostra quem mais convidou pessoas pro servidor."));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!(await enforceCommandsChannel(interaction, cfg))) return;

  const sub = interaction.options.getSubcommand();

  if (sub === "link") {
    await interaction.deferReply({ ephemeral: true });

    const existingCode = getPersonalCode(interaction.guildId, interaction.user.id);
    let invite = existingCode ? await interaction.guild.invites.fetch(existingCode).catch(() => null) : null;

    if (!invite) {
      try {
        invite = await interaction.channel.createInvite({ maxAge: 0, maxUses: 0, unique: true });
        setPersonalCode(interaction.guildId, interaction.user.id, invite.code);
      } catch (err) {
        console.error("[convite] Falha ao criar convite:", err);
        return interaction.editReply({
          embeds: [errorEmbed('Não consegui criar um link de convite aqui. Verifique se o bot tem permissão "Criar Convite" neste canal.')],
        });
      }
    }

    const raffle = getRaffle(interaction.guildId);
    const raffleNote =
      raffle && raffle.status === "open" && raffle.entryMode === "convite"
        ? `\n\n🎉 Tem um sorteio de **${raffle.game}** rolando em modo convite! Cada pessoa nova que entrar pelo seu link = **1 bilhete automático** (até ${raffle.maxEntriesPerMember} por pessoa). Ex: convidou 3 amigos → 3 bilhetes, sem precisar clicar em nada.`
        : "\n\n_No momento não há sorteio em modo convite ativo, mas seu link já fica valendo pra quando tiver um._";

    const count = getInviteCount(interaction.guildId, interaction.user.id);

    return interaction.editReply({
      embeds: [
        successEmbed(
          `🔗 Seu link pessoal: **https://discord.gg/${invite.code}**\n\nVocê já convidou **${count}** pessoa(s) com sucesso pra cá.${raffleNote}`,
        ),
      ],
    });
  }

  if (sub === "ranking") {
    const counts = getGuildInviteCounts(interaction.guildId);
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (!top.length) {
      return interaction.reply({ embeds: [successEmbed("Ninguém convidou ninguém ainda por aqui.")], ephemeral: true });
    }

    const list = top.map(([userId, count], i) => `${i + 1}. <@${userId}> — ${count} convite(s)`).join("\n");

    return interaction.reply({ embeds: [successEmbed(`**🏆 Ranking de Convites**\n\n${list}`)], ephemeral: true });
  }
}
