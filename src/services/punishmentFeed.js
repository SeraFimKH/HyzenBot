import { JsonStore } from "../database/jsonStore.js";
import { findPlayerById } from "../database/players.js";
import {
  DISCORD_ORIGIN,
  PunishmentType,
  countActiveWarnings,
  findPunishmentsAfter,
  findRevokedPunishments,
  latestPunishmentId,
  wasRevokedHere,
} from "../database/punishments.js";
import { findIpBansAfter, findRevokedIpBans, latestIpBanId } from "../database/ipBans.js";
import { databaseTime } from "../database/databaseClock.js";
import { baseEmbed } from "../utils/embeds.js";
import { discordTimestamp } from "../utils/format.js";
import { broadcastStaffLog, punishmentLogEmbed } from "../utils/staffLog.js";

// Punishments applied in the game (HyzenStaff: /punir, /despunir and its forms) are written straight to Postgres —
// nothing ever told this bot about them, so the ban/mute/warn log channels only ever showed what was done through
// the bot's own commands (plus expiries, see expirySweep.js). This reads the new and the revoked rows every few
// seconds and posts them to the same channels, in the same format as /ban, /mute, /warn, /unban and /unmute.
// The bot's own actions are skipped — each command already logged it (see DISCORD_ORIGIN and wasRevokedHere).

const SWEEP_INTERVAL_MS = 15_000;
// A row is only read once it's this old: one written by a transaction that commits late can't be jumped over by
// the id watermark, and a revocation done by /unban has long been marked as the bot's own.
const SETTLE_SECONDS = 10;
// After a long downtime, rows older than this are skipped instead of flooding the channels.
const STALE_HOURS = 6;
const BATCH_SIZE = 25;

const REVOKED_COLOR = 0x57f287;

const APPLIED_LOGS = {
  [PunishmentType.BAN]: { channel: "banLog", title: "🔨 Banimento", color: 0xed4245 },
  [PunishmentType.TEMPBAN]: { channel: "banLog", title: "🔨 Banimento", color: 0xed4245 },
  [PunishmentType.MUTE]: { channel: "muteLog", title: "🔇 Mute", color: 0xfaa61a },
  [PunishmentType.TEMPMUTE]: { channel: "muteLog", title: "🔇 Mute", color: 0xfaa61a },
  [PunishmentType.WARN]: { channel: "warnLog", title: "⚠️ Advertência", color: 0xfee75c },
};

const REVOKED_LOGS = {
  [PunishmentType.BAN]: { channel: "banLog", title: "✅ Desbanimento" },
  [PunishmentType.TEMPBAN]: { channel: "banLog", title: "✅ Desbanimento" },
  [PunishmentType.MUTE]: { channel: "muteLog", title: "✅ Desmute" },
  [PunishmentType.TEMPMUTE]: { channel: "muteLog", title: "✅ Desmute" },
  [PunishmentType.WARN]: { channel: "warnLog", title: "✅ Advertência removida" },
};

const IP_BAN_LOG = { channel: "banLog", title: "🚫 Banimento de IP", color: 0xed4245 };
const IP_UNBAN_LOG = { channel: "banLog", title: "✅ Banimento de IP removido" };

// New rows are tracked by id, saved to data/punishmentFeed.json: a ban applied while the bot restarts still gets
// posted once it's back. Revocations are tracked by time and only in memory, on purpose: after a restart the bot
// no longer knows which rows its previous run revoked itself, so it only reads those from its own start on.
const store = new JsonStore("punishmentFeed.json", { lastPunishmentId: null, lastIpBanId: null });
let revokedAfter = null;
let sweeping = false;

export function startPunishmentFeed(client) {
  databaseTime()
    .then((now) => {
      revokedAfter ??= now;
    })
    .catch((err) => console.error("[punishmentFeed] could not read the database clock", err.message));

  setInterval(() => {
    if (sweeping || !client.isReady()) return;
    sweeping = true;
    sweep(client)
      .catch((err) => console.error("[punishmentFeed] sweep failed", err.message))
      .finally(() => {
        sweeping = false;
      });
  }, SWEEP_INTERVAL_MS);
}

async function sweep(client) {
  const names = new Map();
  await announceApplied(client, names);
  await announceIpBans(client, names);
  await announceRevoked(client, names);
}

async function announceApplied(client, names) {
  const rows = await readNewRows("lastPunishmentId", latestPunishmentId, findPunishmentsAfter);
  for (const row of rows) {
    const log = APPLIED_LOGS[row.type];
    if (!log || row.server === DISCORD_ORIGIN) continue;

    await announce(client, log.channel, async () => {
      const extraFields = [];
      if (row.expires_at) {
        extraFields.push({ name: "Expira em", value: discordTimestamp(row.expires_at, "F"), inline: true });
      }
      if (row.type === PunishmentType.WARN) {
        extraFields.push({ name: "Total ativo", value: `${await countActiveWarnings(row.player_id)}`, inline: true });
      }
      extraFields.push(serverField(row.server));
      return punishmentLogEmbed({
        title: log.title,
        color: log.color,
        player: { name: await nameOf(row.player_id, names) },
        staffTag: await staffNameOf(row.staff_id, names),
        reason: reasonOf(row),
        extraFields,
      });
    });
  }
}

async function announceIpBans(client, names) {
  const rows = await readNewRows("lastIpBanId", latestIpBanId, findIpBansAfter);
  for (const row of rows) {
    await announce(client, IP_BAN_LOG.channel, async () =>
      punishmentLogEmbed({
        title: IP_BAN_LOG.title,
        color: IP_BAN_LOG.color,
        player: { name: row.player_id !== null ? await nameOf(row.player_id, names) : "Desconhecido" },
        staffTag: await staffNameOf(row.staff_id, names),
        reason: reasonOf(row),
        extraFields: row.expires_at ? [{ name: "Expira em", value: discordTimestamp(row.expires_at, "F"), inline: true }] : [],
      }),
    );
  }
}

async function announceRevoked(client, names) {
  if (revokedAfter === null) {
    revokedAfter = await databaseTime();
    return;
  }
  const after = revokedAfter;
  const upTo = await databaseTime(SETTLE_SECONDS, after);
  revokedAfter = upTo;

  for (const row of await findRevokedPunishments(after, upTo)) {
    const log = REVOKED_LOGS[row.type];
    if (!log || wasRevokedHere(row.id)) continue;

    await announce(client, log.channel, async () =>
      punishmentLogEmbed({
        title: log.title,
        color: REVOKED_COLOR,
        player: { name: await nameOf(row.player_id, names) },
        staffTag: await staffNameOf(row.revoked_by, names),
        reason: reasonOf(row),
        extraFields: [serverField(row.server)],
      }),
    );
  }

  // hyzen_ip_bans has no revoked_by column — who lifted it isn't recorded.
  for (const row of await findRevokedIpBans(after, upTo)) {
    await announce(client, IP_UNBAN_LOG.channel, async () =>
      baseEmbed()
        .setColor(REVOKED_COLOR)
        .setTitle(IP_UNBAN_LOG.title)
        .addFields(
          { name: "Jogador", value: row.player_id !== null ? await nameOf(row.player_id, names) : "Desconhecido", inline: true },
          { name: "Motivo original", value: reasonOf(row) },
        ),
    );
  }
}

// The rows written since the saved id, oldest first. Stops at the first one still too recent to read (it's read
// on the next sweep), and moves the saved id before anything is posted: a failure costs that log line instead of
// repeating it on every sweep. The first run ever starts from the newest row, not the whole history.
async function readNewRows(storeKey, latestId, findAfter) {
  const lastId = store.get(storeKey, null);
  if (lastId === null) {
    store.set(storeKey, await latestId());
    return [];
  }

  const rows = await findAfter(lastId, { settleSeconds: SETTLE_SECONDS, staleHours: STALE_HOURS, limit: BATCH_SIZE });
  const settled = [];
  for (const row of rows) {
    if (!row.settled) break;
    settled.push(row);
  }
  if (settled.length) {
    store.set(storeKey, settled[settled.length - 1].id);
  }
  return settled.filter((row) => !row.stale);
}

// Each log line is built and posted on its own, so one failure (a lookup, Discord) only costs that line.
async function announce(client, channelKey, buildEmbed) {
  try {
    await broadcastStaffLog(client, channelKey, await buildEmbed());
  } catch (err) {
    console.error(`[punishmentFeed] failed to announce on ${channelKey}`, err.message);
  }
}

async function nameOf(playerId, names) {
  const key = String(playerId);
  if (!names.has(key)) {
    const player = await findPlayerById(playerId);
    names.set(key, player ? player.name : `#${playerId}`);
  }
  return names.get(key);
}

// The game writes no staff id for the console.
function staffNameOf(staffId, names) {
  return staffId === null ? "Console" : nameOf(staffId, names);
}

function serverField(server) {
  return { name: "Servidor", value: server || "Jogo", inline: true };
}

// Discord rejects an empty field value.
function reasonOf(row) {
  return row.reason?.trim() || "—";
}
