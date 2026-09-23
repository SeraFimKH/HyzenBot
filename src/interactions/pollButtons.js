import { getPoll, updatePoll } from "../database/polls.js";
import { buildPollEmbed } from "../utils/pollEmbed.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";

export async function handleVote(interaction) {
  const poll = getPoll(interaction.message.id);

  if (!poll || poll.closed) {
    return interaction.reply({ embeds: [errorEmbed("Esta enquete não está mais ativa.")], ephemeral: true });
  }

  const index = Number(interaction.customId.split("_").pop());
  const option = poll.options[index];
  if (!option) {
    return interaction.reply({ embeds: [errorEmbed("Opção inválida.")], ephemeral: true });
  }

  const updated = updatePoll(interaction.message.id, (p) => {
    p.options.forEach((opt) => {
      opt.votes = opt.votes.filter((id) => id !== interaction.user.id);
    });
    p.options[index].votes.push(interaction.user.id);
  });

  await interaction.deferUpdate();
  await interaction.message.edit({ embeds: [buildPollEmbed(updated)] });
  await interaction.followUp({
    embeds: [successEmbed(`Voto registrado em **${option.label}**!`)],
    ephemeral: true,
  });
}
