import Redis from "ioredis";
import { config } from "../config.js";
import { baseEmbed } from "../utils/embeds.js";
import { broadcastStaffLog } from "../utils/staffLog.js";

const CHANNEL = "hyzen:game-events";

// BedwarsPNX (EndingStage, Game#reset) publishes one JSON message per match/reset event here — this is a
// dedicated connection because once ioredis issues SUBSCRIBE, that connection can't be reused for normal
// commands (the shared client in database/redis.js is for publish/getPresence, not this).
export function startGameEventsListener(client) {
  const subscriber = new Redis(config.redis);

  subscriber.on("error", (err) => {
    console.error("[gameEvents] redis connection error", err.message);
  });

  subscriber.subscribe(CHANNEL, (err) => {
    if (err) console.error("[gameEvents] failed to subscribe", err.message);
  });

  subscriber.on("message", async (channel, message) => {
    if (channel !== CHANNEL) return;
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      console.error("[gameEvents] ignoring malformed message:", message);
      return;
    }

    if (payload.type === "MATCH_WIN") {
      await announceMatchWin(client, payload);
    } else if (payload.type === "MATCH_RESET") {
      await announceMatchReset(client, payload);
    }
  });
}

async function announceMatchWin(client, payload) {
  const { mode, map, tie, winners } = payload;
  if (!Array.isArray(winners) || !winners.length) return;

  const embed = baseEmbed()
    .setColor(0xf1c40f)
    .setTitle(tie ? "🤝 Partida empatada" : "🏆 Vitória")
    .addFields(
      { name: "Modo", value: mode || "?", inline: true },
      { name: "Mapa", value: map || "?", inline: true },
      { name: tie ? "Jogadores" : "Vencedor(es)", value: winners.join(", ") },
    );

  await broadcastStaffLog(client, "winLog", embed);
}

async function announceMatchReset(client, payload) {
  const { mode, map } = payload;

  const embed = baseEmbed()
    .setColor(0x5865f2)
    .setTitle("🔄 Partida reiniciando")
    .addFields({ name: "Modo", value: mode || "?", inline: true }, { name: "Mapa", value: map || "?", inline: true });

  await broadcastStaffLog(client, "winLog", embed);
}
