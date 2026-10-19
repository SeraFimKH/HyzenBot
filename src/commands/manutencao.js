import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { StatusTableMissingError } from "../database/networkStatus.js";
import { allowPlayer, disallowPlayer, findKnownPlayerName, listAllowedPlayers, MAX_NAME_LENGTH } from "../database/maintenanceAllowlist.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";

// Os jogadores que podem entrar no servidor durante a manutenção, além da equipe (quem tem
// hyzencore.maintenance.bypass): um testador, um criador de conteúdo. A mesma lista do /manutencao do jogo.
export const data = new SlashCommandBuilder()
  .setName("manutencao")
  .setDescription("Jogadores liberados para entrar no servidor durante a manutenção (administradores).")
  .addSubcommand((sub) =>
    sub
      .setName("adicionar")
      .setDescription("Libera um jogador para entrar durante a manutenção.")
      .addStringOption((opt) => opt.setName("jogador").setDescription("O nome do jogador no Minecraft").setRequired(true).setMaxLength(MAX_NAME_LENGTH)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remover")
      .setDescription("Tira um jogador da lista (se ele estiver no servidor durante a manutenção, é desconectado).")
      .addStringOption((opt) => opt.setName("jogador").setDescription("O nome do jogador no Minecraft").setRequired(true).setMaxLength(MAX_NAME_LENGTH)),
  )
  .addSubcommand((sub) => sub.setName("lista").setDescription("Mostra quem está liberado para entrar durante a manutenção."));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const sub = interaction.options.getSubcommand();
    if (sub === "lista") return await showList(interaction, cfg);

    const typed = interaction.options.getString("jogador", true).trim();
    if (!typed) return interaction.editReply({ embeds: [errorEmbed("Informe o nome do jogador.")] });

    if (sub === "adicionar") {
      // O nome como o jogador já entrou no servidor; um nome nunca visto também entra (pode ser a primeira vez dele),
      // mas com o aviso para conferir.
      const known = await findKnownPlayerName(typed);
      const name = known ?? typed;
      const added = await allowPlayer(name, interaction.user.tag.slice(0, 64));
      const note = known ? "" : "\n\n⚠️ Esse nome nunca entrou no servidor — confira se está escrito igual ao do Minecraft.";
      return interaction.editReply({
        embeds: [added ? successEmbed(`**${name}** pode entrar no servidor durante a manutenção.${note}`) : errorEmbed(`**${name}** já estava liberado.`)],
      });
    }

    const removed = await disallowPlayer(typed);
    return interaction.editReply({
      embeds: [removed ? successEmbed(`**${typed}** não pode mais entrar durante a manutenção.`) : errorEmbed(`**${typed}** não estava na lista.`)],
    });
  } catch (err) {
    if (err instanceof StatusTableMissingError) {
      return interaction.editReply({
        embeds: [errorEmbed("O banco ainda não tem a lista da manutenção. Ela é criada pelo **HyzenCore** atualizado quando o servidor liga — atualize o plugin, ligue o servidor uma vez e tente de novo.")],
      });
    }
    console.error("[manutencao] failed", err);
    return interaction.editReply({ embeds: [errorEmbed("Não consegui acessar a lista no banco de dados. Tente de novo em instantes.")] });
  }
}

async function showList(interaction, cfg) {
  const players = await listAllowedPlayers();
  const embed = baseEmbed(cfg.communityName).setTitle(`🛠️ Liberados na manutenção (${players.length})`);
  if (!players.length) {
    embed.setDescription("Ninguém além da equipe. Use `/manutencao adicionar` para liberar um jogador.");
  } else {
    const lines = players.map((p) => `• **${p.name}** — por ${p.addedBy ?? "?"}${p.addedAt ? ` <t:${Math.floor(p.addedAt / 1000)}:R>` : ""}`);
    embed.setDescription(`${lines.join("\n")}`.slice(0, 4096));
  }
  embed.setFooter({ text: `${cfg.communityName} · a equipe (hyzencore.maintenance.bypass) entra sempre` });
  return interaction.editReply({ embeds: [embed] });
}
