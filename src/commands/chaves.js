import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { listStocks, addKeys, takeKey, removeStock, countKeys } from "../database/keyStock.js";

function parseKeys(raw) {
  return raw
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export const data = new SlashCommandBuilder()
  .setName("chaves")
  .setDescription("Gerencia o estoque de chaves de resgate — Steam, gift card, etc. (apenas administradores).")
  .addSubcommand((sub) =>
    sub
      .setName("adicionar")
      .setDescription("Adiciona uma ou mais chaves a um estoque.")
      .addStringOption((opt) => opt.setName("nome").setDescription("Nome do estoque (ex: Steam - Elden Ring)").setRequired(true).setMaxLength(100))
      .addStringOption((opt) =>
        opt.setName("chaves").setDescription("Chave(s), separadas por vírgula ou quebra de linha").setRequired(true).setMaxLength(4000),
      ),
  )
  .addSubcommand((sub) => sub.setName("listar").setDescription("Lista os estoques de chaves e quantas restam em cada um."))
  .addSubcommand((sub) =>
    sub
      .setName("remover")
      .setDescription("Remove um estoque de chaves inteiro (inclusive as chaves não usadas).")
      .addStringOption((opt) => opt.setName("nome").setDescription("Nome do estoque a remover").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("entregar")
      .setDescription("Entrega manualmente uma chave do estoque a um membro por DM (sem precisar de ticket).")
      .addStringOption((opt) => opt.setName("nome").setDescription("Nome do estoque").setRequired(true))
      .addUserOption((opt) => opt.setName("membro").setDescription("Membro que vai receber a chave").setRequired(true)),
  );

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "adicionar") {
    const nome = interaction.options.getString("nome", true).trim();
    const chaves = parseKeys(interaction.options.getString("chaves", true));

    if (!chaves.length) {
      return interaction.reply({ embeds: [errorEmbed("Nenhuma chave válida encontrada.")], ephemeral: true });
    }

    const total = addKeys(interaction.guildId, nome, chaves);

    return interaction.reply({
      embeds: [successEmbed(`**${chaves.length}** chave(s) adicionada(s) ao estoque **${nome}**. Total disponível: **${total}**.`)],
      ephemeral: true,
    });
  }

  if (sub === "listar") {
    const stocks = listStocks(interaction.guildId);
    const nomes = Object.keys(stocks);

    if (!nomes.length) {
      return interaction.reply({ embeds: [successEmbed("Nenhum estoque de chaves cadastrado ainda. Use `/chaves adicionar` pra criar um.")], ephemeral: true });
    }

    const list = nomes.map((nome) => `• **${nome}** — ${stocks[nome].length} disponível(is)`).join("\n");

    return interaction.reply({ embeds: [successEmbed(`**Estoques de chaves:**\n${list}`)], ephemeral: true });
  }

  if (sub === "remover") {
    const nome = interaction.options.getString("nome", true).trim();
    const removed = removeStock(interaction.guildId, nome);

    if (!removed) {
      return interaction.reply({ embeds: [errorEmbed(`Nenhum estoque chamado **${nome}** foi encontrado.`)], ephemeral: true });
    }

    return interaction.reply({ embeds: [successEmbed(`Estoque **${nome}** removido.`)], ephemeral: true });
  }

  if (sub === "entregar") {
    const nome = interaction.options.getString("nome", true).trim();
    const membro = interaction.options.getUser("membro", true);

    if (countKeys(interaction.guildId, nome) === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`O estoque **${nome}** está vazio ou não existe. Use \`/chaves adicionar\` primeiro.`)],
        ephemeral: true,
      });
    }

    const chave = takeKey(interaction.guildId, nome);

    try {
      await membro.send({
        embeds: [successEmbed(`Você recebeu uma chave da ${cfg.communityName}!\n\n**${nome}**\n\`\`\`${chave}\`\`\``)],
      });
    } catch {
      return interaction.reply({
        embeds: [
          errorEmbed(
            `A chave foi retirada do estoque, mas não consegui enviar por DM (o membro pode estar com as mensagens diretas desativadas). Chave: \`${chave}\` — envie manualmente.`,
          ),
        ],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [successEmbed(`Chave do estoque **${nome}** entregue a ${membro} por DM. Restam **${countKeys(interaction.guildId, nome)}**.`)],
      ephemeral: true,
    });
  }
}
