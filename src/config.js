import "dotenv/config";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] Variável de ambiente ausente: ${key}. Copie .env.example para .env e preencha os valores.`);
    process.exit(1);
  }
}

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID || null,
  brandColor: 0x1f6f63,
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  pg: {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "hyzen_network",
    user: process.env.PGUSER || "hyzen",
    password: process.env.PGPASSWORD || "hyzen",
  },
  // Same Redis every HyzenCore instance writes cross-server presence to (see RedisManager#writePresence) —
  // used for /perfil's online/offline status. Not the same purpose as the JSON files in data/.
  redis: {
    host: process.env.REDISHOST || "localhost",
    port: Number(process.env.REDISPORT || 6379),
    password: process.env.REDISPASSWORD || undefined,
  },
};
