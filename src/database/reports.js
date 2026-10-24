import { pool } from "./pool.js";

// The two places reports are made, read by the report feed (services/reportFeed.js):
// - hyzen_reports — the game's /report (HyzenStaff/migrations/V1__create_hyzen_staff_tables.sql): reason only.
// - hyzen_web_reports — the site's /denunciar (HyzenWeb's own migration): a description and a proof (a video or image
//   kept on the site, opened by its token, or a link). Its timestamps are UTC without a zone, as Laravel writes them.
// The site's table only exists once the site has migrated: until then it reads as empty.

const UNDEFINED_TABLE = "42P01";

async function webQuery(sql, params, fallback) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === UNDEFINED_TABLE) return fallback;
    throw err;
  }
}

export async function latestGameReportId() {
  const result = await pool.query(`SELECT COALESCE(max(id), 0)::text AS id FROM hyzen_reports`);
  return result.rows[0].id;
}

// Rows after `afterId`, oldest first. `settled` = old enough to read safely; `stale` = too old to still announce.
export async function findGameReportsAfter(afterId, { settleSeconds, staleHours, limit }) {
  const result = await pool.query(
    `SELECT id::text AS id, reporter_id, target_id, reason, server, created_at,
            created_at <= now() - make_interval(secs => $2) AS settled,
            created_at < now() - make_interval(hours => $3) AS stale
     FROM hyzen_reports
     WHERE id > $1
     ORDER BY id
     LIMIT $4`,
    [afterId, settleSeconds, staleHours, limit],
  );
  return result.rows;
}

// 0 while the table doesn't exist: once the site migrates, its first reports are still posted.
export async function latestWebReportId() {
  const result = await webQuery(`SELECT COALESCE(max(id), 0)::text AS id FROM hyzen_web_reports`, [], { rows: [{ id: "0" }] });
  return result.rows[0].id;
}

export async function findWebReportsAfter(afterId, { settleSeconds, staleHours, limit }) {
  const result = await webQuery(
    `SELECT id::text AS id, reporter_id, target_id, reason, description, evidence_type, evidence_size, evidence_link,
            token, created_at AT TIME ZONE 'UTC' AS created_at,
            created_at AT TIME ZONE 'UTC' <= now() - make_interval(secs => $2) AS settled,
            created_at AT TIME ZONE 'UTC' < now() - make_interval(hours => $3) AS stale
     FROM hyzen_web_reports
     WHERE id > $1
     ORDER BY id
     LIMIT $4`,
    [afterId, settleSeconds, staleHours, limit],
    { rows: [] },
  );
  return result.rows;
}

// Of these game reports, the ones resolved since (in the game's /reports or on the site).
export async function findResolvedGameReports(ids) {
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT id::text AS id, resolved_by FROM hyzen_reports WHERE id = ANY($1::bigint[]) AND resolved`,
    [ids],
  );
  return result.rows;
}

// Of these site reports, the ones the staff gave a verdict on.
export async function findJudgedWebReports(ids) {
  if (!ids.length) return [];
  const result = await webQuery(
    `SELECT id::text AS id, status, handled_by, staff_note FROM hyzen_web_reports WHERE id = ANY($1::bigint[]) AND status <> 'open'`,
    [ids],
    { rows: [] },
  );
  return result.rows;
}

// What the staff wants to know about the reported player: reports against them lately, from both places, and the
// punishments they're serving (a kick is over the moment it happens).
export async function targetHistory(targetId, days = 30) {
  const game = await pool.query(
    `SELECT count(*)::int AS n FROM hyzen_reports WHERE target_id = $1 AND created_at > now() - make_interval(days => $2)`,
    [targetId, days],
  );
  const web = await webQuery(
    `SELECT count(*)::int AS n FROM hyzen_web_reports WHERE target_id = $1 AND created_at AT TIME ZONE 'UTC' > now() - make_interval(days => $2)`,
    [targetId, days],
    { rows: [{ n: 0 }] },
  );
  const punishments = await pool.query(
    `SELECT count(*)::int AS n FROM hyzen_punishments
     WHERE player_id = $1 AND type <> 'KICK' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [targetId],
  );
  return { reports: game.rows[0].n + web.rows[0].n, punishments: punishments.rows[0].n };
}
