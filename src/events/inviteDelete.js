import { handleInviteDelete } from "../utils/inviteTracker.js";

export const name = "inviteDelete";
export function execute(invite) {
  handleInviteDelete(invite);
}
