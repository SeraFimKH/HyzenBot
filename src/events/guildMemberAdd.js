import { getGuildConfig } from "../database/guildConfig.js";
import { buildRulesEmbeds, buildJoinRulesButtons } from "../utils/rulesPanel.js";
import { resolveUsedInvite } from "../utils/inviteTracker.js";
import { getOwnerByCode, addInviteCredit } from "../database/invites.js";
import { creditInviteRaffleEntry } from "../utils/raffleEntries.js";

async function handleInviteCredit(member) {
  const usedInvite = await resolveUsedInvite(member.guild);
  if (!usedInvite) return;

  // O dono do link (mapeado por /convite) tem prioridade — se o convite foi criado pelo
  // bot em nome de um membro, "usedInvite.inviter" seria o próprio bot, não o membro.
  const ownerFromMap = getOwnerByCode(member.guild.id, usedInvite.code);
  const inviterId = ownerFromMap || (usedInvite.inviter && !usedInvite.inviter.bot ? usedInvite.inviter.id : null);

  if (!inviterId || inviterId === member.id) return;

  addInviteCredit(member.guild.id, inviterId);
  await creditInviteRaffleEntry(member.client, member.guild.id, inviterId);
}

export const name = "guildMemberAdd";
export async function execute(member) {
  try {
    await handleInviteCredit(member);
  } catch (err) {
    console.error("[guildMemberAdd] Erro ao processar convite:", err);
  }

  try {
    const cfg = getGuildConfig(member.guild.id);
    if (!cfg.rulesText) return;

    await member
      .send({ embeds: buildRulesEmbeds(cfg), components: buildJoinRulesButtons(member.guild.id) })
      .catch((err) => console.warn(`[guildMemberAdd] Não foi possível enviar as regras no privado de ${member.id} (provavelmente DMs fechadas):`, err.message));
  } catch (err) {
    console.error("[guildMemberAdd] Erro:", err);
  }
}
