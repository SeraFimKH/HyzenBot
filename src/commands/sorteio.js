import crypto from "crypto";
import { SlashCommandBuilder, ChannelType } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { getRaffle, setRaffle, updateRaffle } from "../database/raffles.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildRaffleEmbed, buildRaffleComponents } from "../utils/raffleEmbed.js";
import { finishRaffle } from "../utils/scheduler.js";
import { countKeys } from "../database/keyStock.js";
import { getPingMention } from "../utils/announcePing.js";

function parseDateHora(dataStr, horaStr) {
  const dataMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dataStr.trim());
  const horaMatch = /^(\d{1,2}):(\d{2})$/.exec(horaStr.trim());
  if (!dataMatch || !horaMatch) return null;

  const [, day, month, year] = dataMatch.map(Number);
  const [, hour, minute] = horaMatch.map(Number);

  if (hour > 23 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // garante que dia/mês informados batem com o calendário (evita "31/02" virar março)
  if (date.getDate() !== day || date.getMonth() !== month - 1) return null;

  return date;
}

export const data = new SlashCommandBuilder()
  .setName("sorteio")
  .setDescription("Gerencia sorteios da comunidade (apenas administradores).")
  .addSubcommand((sub) =>
    sub
      .setName("criar")
      .setDescription("Cria um novo sorteio.")
      .addStringOption((opt) => opt.setName("jogo").setDescription("Jogo que será sorteado").setRequired(true))
      .addStringOption((opt) => opt.setName("premio").setDescription("Prêmio do sorteio").setRequired(true))
      .addStringOption((opt) => opt.setName("data").setDescription("Data do sorteio (dd/mm/aaaa)").setRequired(true))
      .addStringOption((opt) => opt.setName("hora").setDescription("Hora do sorteio (HH:mm)").setRequired(true))
      .addChannelOption((opt) =>
        opt
          .setName("canal")
          .setDescription("Canal onde o sorteio será anunciado (padrão: canal configurado ou este canal)")
          .addChannelTypes(ChannelType.GuildText),
      )
      .addNumberOption((opt) =>
        opt
          .setName("preco")
          .setDescription("Valor da entrada em R$ (deixe vazio para usar o padrão de /config, ou 0 para gratuito)")
          .setMinValue(0),
      )
      .addStringOption((opt) =>
        opt
          .setName("tipo-premio")
          .setDescription("Tipo do prêmio (padrão: Físico)")
          .addChoices({ name: "Chave digital (Steam, jogo, etc.)", value: "key" }, { name: "Físico (retirada com a staff)", value: "physical" }),
      )
      .addStringOption((opt) => opt.setName("chave").setDescription("Chave/código único a entregar (use isto OU estoque, se tipo-premio = Chave digital)"))
      .addStringOption((opt) =>
        opt.setName("estoque").setDescription("Nome de um estoque de /chaves pra sortear automaticamente (use isto OU chave)"),
      )
      .addIntegerOption((opt) =>
        opt.setName("max-entradas").setDescription("Quantas vezes o mesmo membro pode participar (padrão: definido em /config)").setMinValue(1),
      )
      .addStringOption((opt) => opt.setName("descricao").setDescription("Descrição/regras do sorteio (opcional)").setMaxLength(500))
      .addAttachmentOption((opt) => opt.setName("imagem").setDescription("Imagem mostrando o prêmio (opcional)"))
      .addStringOption((opt) =>
        opt
          .setName("modo-entrada")
          .setDescription("Como o membro participa (padrão: Manual)")
          .addChoices(
            { name: "Manual (clique no botão ou pague pra entrar)", value: "manual" },
            { name: "Convite (ganha entrada convidando pessoas)", value: "convite" },
          ),
      ),
  )
  .addSubcommand((sub) => sub.setName("cancelar").setDescription("Cancela o sorteio ativo."))
  .addSubcommand((sub) =>
    sub
      .setName("reiniciar")
      .setDescription("Zera as entradas do sorteio ativo (mantém jogo, prêmio, data e preço)."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("finalizar")
      .setDescription("Encerra o sorteio ativo agora mesmo e sorteia o vencedor, sem esperar a data marcada."),
  )
  .addSubcommand((sub) => sub.setName("participantes").setDescription("Lista os participantes do sorteio ativo."));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "criar") {
    const existing = getRaffle(interaction.guildId);
    if (existing && existing.status === "open") {
      return interaction.reply({
        embeds: [errorEmbed("Já existe um sorteio ativo neste servidor. Use `/sorteio cancelar` antes de criar outro.")],
        ephemeral: true,
      });
    }

    const jogo = interaction.options.getString("jogo", true);
    const premio = interaction.options.getString("premio", true);
    const dataStr = interaction.options.getString("data", true);
    const horaStr = interaction.options.getString("hora", true);
    const canalOpt = interaction.options.getChannel("canal");
    const precoOpt = interaction.options.getNumber("preco");
    const preco = precoOpt !== null ? precoOpt : cfg.raffleDefaultEntryPrice;
    const tipoPremio = interaction.options.getString("tipo-premio") || "physical";
    const chave = interaction.options.getString("chave");
    const estoque = interaction.options.getString("estoque");
    const maxEntradasOpt = interaction.options.getInteger("max-entradas");
    const descricao = interaction.options.getString("descricao");
    const imagem = interaction.options.getAttachment("imagem");
    const entryMode = interaction.options.getString("modo-entrada") || "manual";

    const endDate = parseDateHora(dataStr, horaStr);
    if (!endDate) {
      return interaction.reply({
        embeds: [errorEmbed("Data ou hora inválida. Use o formato `dd/mm/aaaa` para data e `HH:mm` para hora.")],
        ephemeral: true,
      });
    }
    if (endDate.getTime() <= Date.now()) {
      return interaction.reply({ embeds: [errorEmbed("A data e hora do sorteio precisam estar no futuro.")], ephemeral: true });
    }

    if (tipoPremio === "key" && !chave && !estoque) {
      return interaction.reply({
        embeds: [errorEmbed('Informe `chave` (um código único) ou `estoque` (nome de um estoque de `/chaves`) quando `tipo-premio` for "Chave digital".')],
        ephemeral: true,
      });
    }

    if (estoque && countKeys(interaction.guildId, estoque) === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`O estoque **${estoque}** está vazio ou não existe. Use \`/chaves adicionar\` primeiro, ou \`/chaves listar\` pra ver os nomes disponíveis.`)],
        ephemeral: true,
      });
    }

    const targetChannelId = canalOpt?.id || cfg.channels.sorteio || interaction.channelId;
    const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel) {
      return interaction.reply({ embeds: [errorEmbed("Canal de destino do sorteio não encontrado.")], ephemeral: true });
    }

    const raffle = {
      id: crypto.randomUUID(),
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      messageId: null,
      game: jogo,
      prize: premio,
      endTimestamp: endDate.getTime(),
      participants: [],
      status: "open",
      winnerId: null,
      entryPrice: entryMode === "convite" ? null : preco || null,
      prizeType: tipoPremio,
      keyValue: tipoPremio === "key" ? chave || null : null,
      keyStockName: tipoPremio === "key" ? estoque || null : null,
      maxEntriesPerMember: maxEntradasOpt || cfg.raffleDefaultMaxEntries,
      description: descricao || null,
      imageUrl: imagem?.url || null,
      entryMode,
    };

    const mention = getPingMention(cfg);
    const message = await targetChannel.send({
      content: mention || undefined,
      embeds: [buildRaffleEmbed(raffle)],
      components: buildRaffleComponents(raffle),
    });
    raffle.messageId = message.id;
    setRaffle(interaction.guildId, raffle);

    return interaction.reply({
      embeds: [
        successEmbed(
          `Sorteio de **${jogo}** criado em ${targetChannel}! Ele será encerrado automaticamente em <t:${Math.floor(endDate.getTime() / 1000)}:F>.` +
            (entryMode === "convite" ? " Modo convite ativado — membros ganham bilhetes usando `/convite link`." : ""),
        ),
      ],
      ephemeral: true,
    });
  }

  if (sub === "cancelar") {
    const raffle = getRaffle(interaction.guildId);
    if (!raffle || raffle.status !== "open") {
      return interaction.reply({ embeds: [errorEmbed("Não há nenhum sorteio ativo para cancelar.")], ephemeral: true });
    }

    const updated = updateRaffle(interaction.guildId, (r) => {
      r.status = "cancelled";
    });

    const channel = await interaction.guild.channels.fetch(raffle.channelId).catch(() => null);
    if (channel) {
      const message = await channel.messages.fetch(raffle.messageId).catch(() => null);
      if (message) await message.edit({ embeds: [buildRaffleEmbed(updated)], components: buildRaffleComponents(updated) }).catch(() => {});
    }

    return interaction.reply({ embeds: [successEmbed("Sorteio cancelado com sucesso.")], ephemeral: true });
  }

  if (sub === "reiniciar") {
    const raffle = getRaffle(interaction.guildId);
    if (!raffle || raffle.status !== "open") {
      return interaction.reply({ embeds: [errorEmbed("Não há nenhum sorteio ativo para reiniciar.")], ephemeral: true });
    }

    const updated = updateRaffle(interaction.guildId, (r) => {
      r.participants = [];
      r.winnerId = null;
    });

    const channel = await interaction.guild.channels.fetch(raffle.channelId).catch(() => null);
    if (channel) {
      const message = await channel.messages.fetch(raffle.messageId).catch(() => null);
      if (message) await message.edit({ embeds: [buildRaffleEmbed(updated)], components: buildRaffleComponents(updated) }).catch(() => {});
    }

    return interaction.reply({
      embeds: [successEmbed(`Sorteio de **${raffle.game}** reiniciado — todas as entradas foram zeradas. O sorteio continua ativo até <t:${Math.floor(raffle.endTimestamp / 1000)}:F>.`)],
      ephemeral: true,
    });
  }

  if (sub === "finalizar") {
    const raffle = getRaffle(interaction.guildId);
    if (!raffle || raffle.status !== "open") {
      return interaction.reply({ embeds: [errorEmbed("Não há nenhum sorteio ativo para finalizar.")], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    await finishRaffle(interaction.client, interaction.guildId, raffle);

    return interaction.editReply({
      embeds: [successEmbed(`Sorteio de **${raffle.game}** finalizado agora! Confira o resultado no canal do sorteio.`)],
    });
  }

  if (sub === "participantes") {
    const raffle = getRaffle(interaction.guildId);
    if (!raffle || raffle.status !== "open") {
      return interaction.reply({ embeds: [errorEmbed("Não há nenhum sorteio ativo no momento.")], ephemeral: true });
    }

    if (!raffle.participants.length) {
      return interaction.reply({
        embeds: [successEmbed(`**0 participante(s)** no sorteio de **${raffle.game}**.`)],
        ephemeral: true,
      });
    }

    const ticketsByUser = new Map();
    raffle.participants.forEach((userId, index) => {
      const tickets = ticketsByUser.get(userId) || [];
      tickets.push(index + 1);
      ticketsByUser.set(userId, tickets);
    });

    const list = [...ticketsByUser.entries()]
      .map(([userId, tickets]) => `<@${userId}> — ${tickets.length} entrada(s) (bilhete${tickets.length > 1 ? "s" : ""} ${tickets.map((t) => `#${t}`).join(", ")})`)
      .join("\n");

    return interaction.reply({
      embeds: [
        successEmbed(
          `**${ticketsByUser.size} participante(s)**, **${raffle.participants.length} entrada(s)** no sorteio de **${raffle.game}**:\n\n${list}`,
        ),
      ],
      ephemeral: true,
    });
  }
}
