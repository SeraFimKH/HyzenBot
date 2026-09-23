import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { setPoll, getPoll, updatePoll, findLatestOpenPoll } from "../database/polls.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildPollEmbed, NUMBER_EMOJIS } from "../utils/pollEmbed.js";
import { getPingMention } from "../utils/announcePing.js";

function buildPollButtons(options, closed) {
  const rows = [];
  for (let start = 0; start < options.length; start += 5) {
    const row = new ActionRowBuilder();
    options.slice(start, start + 5).forEach((opt, offset) => {
      const i = start + offset;
      const button = new ButtonBuilder()
        .setCustomId(`poll_vote_${i}`)
        .setLabel(`${i + 1}. ${opt.label}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(closed);
      if (NUMBER_EMOJIS[i]) button.setEmoji(NUMBER_EMOJIS[i]);
      row.addComponents(button);
    });
    rows.push(row);
  }
  return rows;
}

export const data = new SlashCommandBuilder()
  .setName("enquete")
  .setDescription("Cria e gerencia enquetes para a comunidade (apenas administradores).")
  .addSubcommand((sub) =>
    sub
      .setName("criar")
      .setDescription("Cria uma nova enquete com até 20 opções.")
      .addStringOption((opt) => opt.setName("pergunta").setDescription("Pergunta da enquete").setRequired(true))
      .addStringOption((opt) => opt.setName("opcao1").setDescription("Opção 1").setRequired(true))
      .addStringOption((opt) => opt.setName("opcao2").setDescription("Opção 2").setRequired(true))
      .addStringOption((opt) => opt.setName("opcao3").setDescription("Opção 3").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao4").setDescription("Opção 4").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao5").setDescription("Opção 5").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao6").setDescription("Opção 6").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao7").setDescription("Opção 7").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao8").setDescription("Opção 8").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao9").setDescription("Opção 9").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao10").setDescription("Opção 10").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao11").setDescription("Opção 11").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao12").setDescription("Opção 12").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao13").setDescription("Opção 13").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao14").setDescription("Opção 14").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao15").setDescription("Opção 15").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao16").setDescription("Opção 16").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao17").setDescription("Opção 17").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao18").setDescription("Opção 18").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao19").setDescription("Opção 19").setRequired(false))
      .addStringOption((opt) => opt.setName("opcao20").setDescription("Opção 20").setRequired(false))
      .addStringOption((opt) => opt.setName("premio").setDescription("Prêmio para quem acertar/participar (opcional)").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("encerrar")
      .setDescription("Encerra uma enquete e mostra o resultado final.")
      .addStringOption((opt) =>
        opt.setName("mensagem_id").setDescription("ID da mensagem da enquete (padrão: a mais recente ativa)").setRequired(false),
      ),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "criar") {
    const pergunta = interaction.options.getString("pergunta", true);
    const premio = interaction.options.getString("premio");
    const options = Array.from({ length: 20 }, (_, i) => i + 1)
      .map((n) => interaction.options.getString(`opcao${n}`))
      .filter(Boolean)
      .map((label) => ({ label, votes: [] }));

    const poll = {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      question: pergunta,
      prize: premio || null,
      options,
      closed: false,
      createdAt: Date.now(),
    };

    const message = await interaction.channel.send({
      content: getPingMention(cfg) || undefined,
      embeds: [buildPollEmbed(poll)],
      components: buildPollButtons(options, false),
    });

    setPoll(message.id, poll);

    return interaction.reply({ embeds: [successEmbed("Enquete criada com sucesso!")], ephemeral: true });
  }

  if (sub === "encerrar") {
    const messageId = interaction.options.getString("mensagem_id");
    let entry;

    if (messageId) {
      const poll = getPoll(messageId);
      entry = poll ? { messageId, poll } : null;
    } else {
      entry = findLatestOpenPoll(interaction.guildId);
    }

    if (!entry) {
      return interaction.reply({ embeds: [errorEmbed("Nenhuma enquete ativa foi encontrada.")], ephemeral: true });
    }

    if (entry.poll.closed) {
      return interaction.reply({ embeds: [errorEmbed("Esta enquete já está encerrada.")], ephemeral: true });
    }

    const updated = updatePoll(entry.messageId, (p) => {
      p.closed = true;
    });

    const channel = await interaction.guild.channels.fetch(updated.channelId).catch(() => null);
    if (channel) {
      const message = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (message) {
        await message
          .edit({ embeds: [buildPollEmbed(updated)], components: buildPollButtons(updated.options, true) })
          .catch(() => {});
      }
    }

    return interaction.reply({ embeds: [successEmbed("Enquete encerrada.")], ephemeral: true });
  }
}
