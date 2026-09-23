import { SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";
import { isStaff } from "../utils/permissions.js";
import { errorEmbed, baseEmbed } from "../utils/embeds.js";
import { findPlayerById } from "../database/players.js";
import { findHistory } from "../database/punishments.js";
import { resolveTargetPlayer } from "../utils/playerResolver.js";

const TYPE_LABEL = {
  BAN: "🔨 Ban",
  TEMPBAN: "🔨 Ban temporário",
  MUTE: "🔇 Mute",
  TEMPMUTE: "🔇 Mute temporário",
  KICK: "👢 Kick",
  WARN: "⚠️ Warn",
};

export const data = new SlashCommandBuilder()
  .setName("historico")
  .setDescription("Mostra o histórico de punições de um jogador.")
  .addStringOption((opt) => opt.setName("jogador").setDescription("Nome do jogador (IGN)").setRequired(false).setMaxLength(16))
  .addUserOption((opt) => opt.setName("membro").setDescription("Membro do Discord (precisa ter usado /verificar no jogo)").setRequired(false));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isStaff(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Você não tem permissão para usar este comando.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const { player, error } = await resolveTargetPlayer(interaction);
  if (!player) {
    return interaction.editReply({ embeds: [errorEmbed(error)] });
  }

  const history = await findHistory(player.id, 10);
  if (!history.length) {
    return interaction.editReply({ embeds: [baseEmbed().setTitle(`Histórico de ${player.name}`).setDescription("Nenhuma punição registrada.")] });
  }

  const staffNames = new Map();
  for (const row of history) {
    const ids = [row.staff_id, row.revoked_by].filter((id) => id !== null && !staffNames.has(id));
    for (const id of ids) {
      const staffPlayer = await findPlayerById(id);
      staffNames.set(id, staffPlayer ? staffPlayer.name : `#${id}`);
    }
  }

  const lines = history.map((row) => {
    const label = TYPE_LABEL[row.type] || row.type;
    const staff = row.staff_id ? staffNames.get(row.staff_id) : "Discord (não vinculado)";
    const date = new Date(row.created_at).toLocaleDateString("pt-BR");
    let status = "";
    if (row.revoked_at) {
      status = ` — removido por ${row.revoked_by ? staffNames.get(row.revoked_by) : "Discord"}`;
    } else if (row.expires_at) {
      status = new Date(row.expires_at) > new Date() ? ` — expira ${new Date(row.expires_at).toLocaleDateString("pt-BR")}` : " — expirado";
    }

    return `**${label}** (${date}) por **${staff}**\n> ${row.reason}${status}`;
  });

  return interaction.editReply({
    embeds: [baseEmbed().setTitle(`Histórico de ${player.name}`).setDescription(lines.join("\n\n"))],
  });
}
