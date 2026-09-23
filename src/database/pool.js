import pg from "pg";
import { config } from "../config.js";

// Separate from jsonStore.js — this is the one domain (hyzen_auth_*) that lives in the same shared Postgres
// every Hyzen Java plugin uses (see plugins/java-powernukkitx/HyzenAuth), not in a local data/*.json file.
export const pool = new pg.Pool(config.pg);

pool.on("error", (err) => {
  console.error("[db] unexpected error on idle Postgres client", err);
});
