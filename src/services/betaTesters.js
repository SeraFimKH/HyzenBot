import { getGuildConfig } from "../database/guildConfig.js";
import { findDiscordIdByPlayerId, findLinkedPlayerName } from "../database/auth.js";
import { findBetaGrant, getBetaTagKey, grantBetaAccess, hasBetaTag, listBetaGrants, listBetaTagHolders, revokeBetaGrant, takeBetaTag } from "../database/betaGrants.js";
import { findRegistrations, RegistrationStatus, updateRegistration } from "../database/betaRegistrations.js";
import { findKnownPlayerName } from "../database/maintenanceAllowlist.js";
import { isBetaAccessOpen } from "../database/networkStatus.js";
import { findPlayerByName } from "../database/players.js";
import { buildRegistrationButtons, buildRegistrationCard, buildRemovedDm, buildWelcomeDm } from "../utils/betaRegistrationViews.js";

// The beta testers from the staff's side (/beta, /painel, the pre-registration cards): everyone who is one, adding one
// without a pre-registration, and taking one out — the beta tag in the game, the approval still waiting to become it,
// and the pre-registration card, all at once.

export async function getBetaOverview() {
  const tagKey = await getBetaTagKey();
  const [open, tagged, waiting] = await Promise.all([isBetaAccessOpen(), listBetaTagHolders(tagKey), listBetaGrants()]);
  const pending = findRegistrations(RegistrationStatus.PENDING).map(({ registration }) => registration);
  return { open, tagKey, tagged, waiting, pending };
}

// Resolves to { name, known, already, dmSent }. dmSent is null without a member to tell.
export async function addBetaTester(client, guildId, { name, discordId, staffTag }) {
  const knownName = await findKnownPlayerName(name);
  const finalName = knownName ?? name.trim();
  const tagKey = await getBetaTagKey();
  const player = knownName ? await findPlayerByName(finalName) : null;
  if ((player && (await hasBetaTag(Number(player.id), tagKey))) || (await findBetaGrant(finalName))) {
    return { name: finalName, known: Boolean(knownName), already: true, dmSent: null };
  }

  await grantBetaAccess(finalName, discordId, staffTag);
  let dmSent = null;
  if (discordId) {
    const verified = Boolean(await findLinkedPlayerName(discordId).catch(() => null));
    const open = await isBetaAccessOpen().catch(() => true);
    dmSent = await sendDm(client, discordId, buildWelcomeDm(getGuildConfig(guildId), finalName, open, verified));
  }
  return { name: finalName, known: Boolean(knownName), already: false, dmSent };
}

// Takes the name out of the beta testers: the approval waiting for them, the beta tag in the game (through HyzenTags),
// and the approved pre-registration cards, which then say who removed it. The member hears it in a DM.
// Resolves to { found, name, tagTaken, tagFailed, dmSent }. guildId: the server the staff member acted in.
export async function removeBetaTester(client, guildId, { name, staffId, reason }) {
  const typed = name.trim();
  const tagKey = await getBetaTagKey();
  const grant = await revokeBetaGrant(typed);
  const player = await findPlayerByName(typed);
  const tagged = player ? await hasBetaTag(Number(player.id), tagKey) : false;
  const tagTaken = tagged ? await takeBetaTag(Number(player.id), tagKey) : false;
  const registrations = findRegistrations(RegistrationStatus.APPROVED, typed);
  if (!grant && !tagged && !registrations.length) return { found: false, name: typed };

  const finalName = player?.name ?? grant?.name ?? registrations[0]?.registration.name ?? typed;
  const discordIds = new Set([grant?.discordId, ...registrations.map(({ registration }) => registration.discordId)].filter(Boolean));
  if (player && !discordIds.size) {
    const linked = await findDiscordIdByPlayerId(Number(player.id)).catch(() => null);
    if (linked) discordIds.add(linked);
  }

  for (const { guildId: origin, registration } of registrations) {
    const updated = updateRegistration(origin, registration.number, (r) => {
      r.status = RegistrationStatus.REMOVED;
      r.removal = { staffId, at: Date.now(), reason };
    });
    await refreshCard(client, origin, updated);
  }

  const cfg = getGuildConfig(registrations[0]?.guildId ?? guildId);
  let dmSent = null;
  for (const discordId of discordIds) {
    dmSent = (await sendDm(client, discordId, buildRemovedDm(cfg, finalName, reason))) || dmSent;
  }
  return { found: true, name: finalName, tagTaken, tagFailed: tagged && !tagTaken, dmSent };
}

// The card in the approval channel, redrawn after the request changed outside of its own buttons.
export async function refreshCard(client, guildId, registration) {
  if (!registration?.channelId || !registration.messageId) return;
  const channel = await client.channels.fetch(registration.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(registration.messageId).catch(() => null) : null;
  const originName = client.guilds.cache.get(guildId)?.name ?? "?";
  await message
    ?.edit({ embeds: [buildRegistrationCard(getGuildConfig(guildId), registration, originName)], components: buildRegistrationButtons(guildId, registration), allowedMentions: { parse: [] } })
    .catch((err) => console.error(`[betaTesters] failed to update the card of #${registration.number}`, err.message));
}

// True when it got there, false with closed DMs (or the user gone).
async function sendDm(client, discordId, embed) {
  const user = await client.users.fetch(discordId).catch(() => null);
  if (!user) return false;
  return user
    .send({ embeds: [embed] })
    .then(() => true)
    .catch(() => false);
}
