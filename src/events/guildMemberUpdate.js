import { onBetaMemberUpdate } from "../services/betaTesters.js";

export const name = "guildMemberUpdate";
export async function execute(oldMember, newMember) {
  await onBetaMemberUpdate(newMember);
}
