import { StatusMode } from "../database/networkStatus.js";

export const ServerState = {
  ONLINE: "ONLINE",
  MAINTENANCE: "MAINTENANCE",
  OFFLINE: "OFFLINE",
  UNKNOWN: "UNKNOWN", // nothing could be asked: Redis didn't answer and there's no server address to ping
};

/**
 * What the server's state is, from what the staff set and what could be detected. Pure — the polling, the
 * "since" and the confirmation of an outage are services/serverStatus.js's job.
 *   network     the hyzen_network_status row ({ mode, reason, ... })
 *   heartbeats  the servers alive in Redis, [] when there are none, null when Redis couldn't be asked
 *   ping        the answer of a direct Bedrock ping, null when nobody answered, undefined when it wasn't tried
 */
export function resolveStatus({ network, heartbeats, ping }) {
  const servers = (heartbeats || []).map((server) => ({
    name: server.name,
    state: server.status === StatusMode.MAINTENANCE ? ServerState.MAINTENANCE : ServerState.ONLINE,
    players: server.players,
    maxPlayers: server.maxPlayers,
  }));

  const sum = (key) => servers.reduce((total, server) => total + (server[key] || 0), 0);
  let live = null;
  if (servers.length) {
    live = { players: sum("players"), maxPlayers: sum("maxPlayers") || null };
  } else if (ping) {
    live = { players: ping.players, maxPlayers: ping.maxPlayers };
  }
  const couldAsk = heartbeats !== null || ping !== undefined;

  let state;
  if (network.mode === StatusMode.MAINTENANCE) {
    state = ServerState.MAINTENANCE;
  } else if (network.mode === StatusMode.ONLINE) {
    state = ServerState.ONLINE;
  } else if (network.mode === StatusMode.OFFLINE) {
    state = ServerState.OFFLINE;
  } else if (live) {
    // Every server still reporting a maintenance the database no longer has: they haven't read the change yet.
    const allInMaintenance = servers.length > 0 && servers.every((server) => server.state === ServerState.MAINTENANCE);
    state = allInMaintenance ? ServerState.MAINTENANCE : ServerState.ONLINE;
  } else {
    state = couldAsk ? ServerState.OFFLINE : ServerState.UNKNOWN;
  }

  const showsPlayers = live !== null && state !== ServerState.OFFLINE;
  const showsReason = state === ServerState.MAINTENANCE || network.mode === StatusMode.OFFLINE;
  return {
    state,
    mode: network.mode,
    reason: showsReason ? network.reason : null,
    players: showsPlayers ? live.players : null,
    maxPlayers: showsPlayers ? live.maxPlayers : null,
    servers: state === ServerState.OFFLINE ? [] : servers,
  };
}
