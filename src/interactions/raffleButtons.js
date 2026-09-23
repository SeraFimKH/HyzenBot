import { joinRaffle } from "../utils/raffleEntries.js";

export async function handleParticipar(interaction) {
  return joinRaffle(interaction);
}
