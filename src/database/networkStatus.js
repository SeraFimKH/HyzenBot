import { pool } from "./pool.js";
import { publishNetworkStatus } from "./redis.js";

// Mirrors HyzenCore/migrations/V2__create_hyzen_network_status.sql — one row (id 1) with the status the staff set
// for the whole network. The game writes the same row with /manutencao; only MAINTENANCE changes anything there
// (the servers turn away whoever isn't staff), the other modes are about what this bot shows.
export const StatusMode = {
  AUTO: "AUTO", // the bot shows what it detects
  ONLINE: "ONLINE",
  MAINTENANCE: "MAINTENANCE",
  OFFLINE: "OFFLINE",
};

const ROW_ID = 1;
// Postgres' "undefined_table": the HyzenCore that creates the table hasn't started against this database yet.
const UNDEFINED_TABLE = "42P01";
// What this bot writes in the hyzen:network-status message — the game writes its own server name there.
const DISCORD_ORIGIN = "Discord";

const DEFAULT_STATUS = Object.freeze({ mode: StatusMode.AUTO, reason: null, changedBy: null, changedAt: null });

let lastKnown = DEFAULT_STATUS;
// Whether the last read worked — when it didn't, the mode the bot has is a guess (see isNetworkStatusFresh).
let lastReadOk = false;
// Which read failure was already logged ("table" or "query") — this is polled every few seconds, one line is enough.
let loggedFailure = null;

function mapRow(row) {
  return {
    mode: StatusMode[row.mode] || StatusMode.AUTO,
    reason: row.reason || null,
    changedBy: row.changed_by || null,
    changedAt: row.changed_at ? new Date(row.changed_at).getTime() : null,
  };
}

export class StatusTableMissingError extends Error {
  constructor() {
    super("hyzen_network_status table not found");
    this.name = "StatusTableMissingError";
  }
}

// False after a failed read: the status getNetworkStatus gave is the last one known (AUTO before any read worked), so
// nothing should be thrown away because of it.
export function isNetworkStatusFresh() {
  return lastReadOk;
}

// The last status read or written, without touching the database — for places that can't wait on a query.
export function getCachedNetworkStatus() {
  return lastKnown;
}

// Never throws: on a failed read the last known status stands (AUTO before any read worked).
export async function getNetworkStatus() {
  try {
    const result = await pool.query("SELECT mode, reason, changed_by, changed_at FROM hyzen_network_status WHERE id = $1", [ROW_ID]);
    lastKnown = result.rows[0] ? mapRow(result.rows[0]) : DEFAULT_STATUS;
    lastReadOk = true;
    loggedFailure = null;
  } catch (err) {
    lastReadOk = false;
    const failure = err.code === UNDEFINED_TABLE ? "table" : "query";
    if (loggedFailure !== failure) {
      loggedFailure = failure;
      console.error(
        failure === "table"
          ? "[networkStatus] a tabela hyzen_network_status ainda não existe — ela é criada pelo HyzenCore atualizado quando o servidor liga. Até lá o status fica em modo automático."
          : `[networkStatus] failed to read the network status, keeping ${lastKnown.mode}: ${err.message}`,
      );
    }
  }
  return lastKnown;
}

// Throws StatusTableMissingError when the table isn't there yet, and whatever pg throws otherwise. The Redis
// message is what makes every server apply the change right away (they'd pick it up within ~30s anyway).
export async function setNetworkStatus(mode, reason, changedBy) {
  let result;
  try {
    result = await pool.query(
      `INSERT INTO hyzen_network_status (id, mode, reason, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, reason = EXCLUDED.reason,
         changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at
       RETURNING mode, reason, changed_by, changed_at`,
      [ROW_ID, mode, reason, changedBy],
    );
  } catch (err) {
    if (err.code === UNDEFINED_TABLE) throw new StatusTableMissingError();
    throw err;
  }

  lastKnown = mapRow(result.rows[0]);
  lastReadOk = true;
  await publishNetworkStatus({ mode, server: DISCORD_ORIGIN });
  return lastKnown;
}

// The beta testers' entry (HyzenCore/migrations/V4__add_hyzen_beta_open.sql): whether who has the beta tag in the game gets
// in during a maintenance. The game flips the same switch with /manutencao beta. Both throw StatusTableMissingError
// before the HyzenCore that adds the column has started against this database.
const UNDEFINED_COLUMN = "42703";

async function betaQuery(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === UNDEFINED_TABLE || err.code === UNDEFINED_COLUMN) throw new StatusTableMissingError();
    throw err;
  }
}

export async function isBetaAccessOpen() {
  const result = await betaQuery("SELECT beta_open FROM hyzen_network_status WHERE id = $1", [ROW_ID]);
  return result.rows[0]?.beta_open ?? true;
}

// Closing it mid-maintenance disconnects, on every server, the beta testers who are playing.
export async function setBetaAccessOpen(open) {
  await betaQuery("UPDATE hyzen_network_status SET beta_open = $1 WHERE id = $2", [open, ROW_ID]);
  await publishNetworkStatus({ beta: true, server: DISCORD_ORIGIN });
}
