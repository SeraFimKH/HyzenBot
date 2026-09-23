import { handleInviteCreate } from "../utils/inviteTracker.js";

export const name = "inviteCreate";
export function execute(invite) {
  handleInviteCreate(invite);
}
