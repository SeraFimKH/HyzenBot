import { onBetaMemberLeave } from "../services/betaTesters.js";

export const name = "guildMemberRemove";
export async function execute(member) {
  await onBetaMemberLeave(member);
}
