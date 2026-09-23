import Redis from "ioredis";
import { config } from "../config.js";

// Lazy connect — most commands never touch Redis at all (only /perfil's online-status check does), so there's
// no reason to hold the connection open (or fail startup) if Redis happens to be down.
export const redis = new Redis({ ...config.redis, lazyConnect: true, maxRetriesPerRequest: 1 });

redis.on("error", (err) => {
  console.error("[redis] connection error", err.message);
});

// Mirrors HyzenCore's RedisManager#getPresence (hyzen:presence:{playerId}, a hash with server/world/status/
// since) — a missing/expired key means offline, the same 60s TTL safety net the Java side relies on.
export async function getPresence(playerId) {
  try {
    if (redis.status === "wait") await redis.connect();
    const presence = await redis.hgetall(`hyzen:presence:${playerId}`);
    return Object.keys(presence).length ? presence : null;
  } catch (err) {
    console.error("[redis] failed to read presence", err.message);
    return null;
  }
}

// No aggregate counter exists on the Java side (HyzenCore only ever writes one hyzen:presence:{playerId} hash
// per online player, see getPresence above) — SCAN (not KEYS) so this never blocks Redis even with thousands
// of players online. Returns null (not 0) on failure so callers can tell "nobody online" apart from
// "couldn't ask" and word the reply accordingly.
export async function getOnlinePlayerCount() {
  try {
    if (redis.status === "wait") await redis.connect();
    let cursor = "0";
    let count = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "hyzen:presence:*", "COUNT", 200);
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== "0");
    return count;
  } catch (err) {
    console.error("[redis] failed to count online players", err.message);
    return null;
  }
}

const STAFF_ACTIONS_CHANNEL = "hyzen:staff-actions";

// HyzenStaff (Java) subscribes to this same channel (RedisStaffActionListener) so a punishment issued here
// takes effect immediately on whichever server the target happens to already be online on — without this,
// /ban, /mute, /kick and /warn only ever take effect on the target's NEXT login (the join-time DB check
// HyzenStaff already does). A publish failure (e.g. Redis down) is logged, not thrown — the punishment is
// still recorded in Postgres either way, just without the live kick/message.
export async function publishStaffAction(payload) {
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.publish(STAFF_ACTIONS_CHANNEL, JSON.stringify(payload));
  } catch (err) {
    console.error("[redis] failed to publish staff action", err.message);
  }
}
