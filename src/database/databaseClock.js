import { pool } from "./pool.js";

// Time windows over rows the game writes are measured on the database's clock (the rows' own now()), not this
// machine's — the bot and the database can run on different hosts with clocks apart. Returned as text so the
// microseconds survive the round trip (a JS Date keeps only milliseconds, which would re-read a boundary row).

// `secondsAgo` before the database's now(), never earlier than `notBefore` (a window must never move backwards).
export async function databaseTime(secondsAgo = 0, notBefore = null) {
  const result = await pool.query(
    `SELECT GREATEST($1::timestamptz, now() - make_interval(secs => $2))::text AS at`,
    [notBefore, secondsAgo],
  );
  return result.rows[0].at;
}
