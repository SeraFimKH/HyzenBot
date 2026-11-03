import { SlashCommandBuilder } from "discord.js";
import { showMember, showOverview } from "../interactions/clockAdmin.js";
import { showMyClock } from "../interactions/clockMember.js";

// /ponto: the team's time clock. The panel with the buttons, and who has to clock, are set on /painel → Bate-ponto.
export const data = new SlashCommandBuilder()
  .setName("ponto")
  .setDescription("Bate-ponto da equipe.")
  .addSubcommand((sub) => sub.setName("meu").setDescription("Seus horários e horas, com os botões de iniciar e finalizar."))
  .addSubcommand((sub) => sub.setName("admin").setDescription("Presença da equipe, registros pendentes e inativos (administração)."))
  .addSubcommand((sub) =>
    sub
      .setName("membro")
      .setDescription("Os horários, as horas e as atividades de um membro (administração).")
      .addUserOption((opt) => opt.setName("membro").setDescription("De quem ver").setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName("semana")
          .setDescription("Qual semana (sem escolher, esta)")
          .addChoices({ name: "Esta semana", value: "0" }, { name: "Semana passada", value: "1" }),
      ),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "meu") return showMyClock(interaction);
  if (sub === "admin") return showOverview(interaction);
  return showMember(interaction, interaction.options.getUser("membro", true).id, Number(interaction.options.getString("semana") ?? 0));
}
