import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import { findDiscordIdByPlayerId } from "../database/auth.js";
import { JsonStore } from "../database/jsonStore.js";
import { findPlayerById } from "../database/players.js";
import {
  findGameReportsAfter,
  findJudgedWebReports,
  findResolvedGameReports,
  findWebReportsAfter,
  latestGameReportId,
  latestWebReportId,
  targetHistory,
} from "../database/reports.js";
import { broadcastLog } from "../utils/staffLog.js";

// Every report — from the game (/report, HyzenStaff) and from the site (/denunciar, HyzenWeb) — posted to the reports
// channel (/config canal → Denúncias, or /painel): who reported whom, both Discord accounts when linked, the reason,
// what happened and the proof, with the reported player's recent history. Once the staff decides it (on the site, or
// /reports in the game), the post is marked with the verdict. Same sweep as the punishment feed (punishmentFeed.js):
// new rows by id, every few seconds, a little late on purpose.

const CHANNEL = "reportLog";
const SWEEP_INTERVAL_MS = 15_000;
const SETTLE_SECONDS = 10;
const STALE_HOURS = 6;
const BATCH_SIZE = 25;
// How long a post is kept to be marked with its verdict.
const TRACK_DAYS = 30;

const GAME = "jogo";
const SITE = "site";

const OPEN_COLOR = 0xf0a020;
const VERDICTS = {
  resolved: { color: 0x57f287, title: "✅", label: "Resolvida" },
  accepted: { color: 0x57f287, title: "✅", label: "Procedente" },
  rejected: { color: 0x99aab5, title: "❌", label: "Improcedente" },
};
const PROOF = {
  video: { emoji: "🎬", label: "Vídeo" },
  image: { emoji: "🖼️", label: "Imagem" },
  link: { emoji: "🔗", label: "Link" },
};

// lastGameReportId/lastWebReportId: the id watermarks. posted: "<origem>:<id>" → { at, messages: [[channelId, messageId]] },
// the posts still waiting for their verdict.
const store = new JsonStore("reportFeed.json", { lastGameReportId: null, lastWebReportId: null, posted: {} });
let sweeping = false;

export function startReportFeed(client) {
  setInterval(() => {
    if (sweeping || !client.isReady()) return;
    sweeping = true;
    sweep(client)
      .catch((err) => console.error("[reportFeed] sweep failed", err.message))
      .finally(() => {
        sweeping = false;
      });
  }, SWEEP_INTERVAL_MS);
}

// The game's and the site's reports are read apart: one table failing (the bot's database user without access to the
// site's table, say) doesn't stop the other.
async function sweep(client) {
  const names = new Map();
  await safely("game reports", async () => {
    for (const row of await readNewRows("lastGameReportId", latestGameReportId, findGameReportsAfter)) {
      await safely(`game report #${row.id}`, () => announce(client, GAME, row, names));
    }
  });
  await safely("site reports", async () => {
    for (const row of await readNewRows("lastWebReportId", latestWebReportId, findWebReportsAfter)) {
      await safely(`site report #${row.id}`, () => announce(client, SITE, row, names));
    }
  });
  await markDecided(client, names);
}

async function announce(client, origin, row, names) {
  const [target, reporter, history] = await Promise.all([
    personOf(client, row.target_id, names),
    personOf(client, row.reporter_id, names),
    targetHistory(row.target_id),
  ]);
  const site = origin === SITE;
  const proof = site ? PROOF[row.evidence_type] : null;
  const proofUrl = site ? (row.evidence_type === "link" ? row.evidence_link : `${config.siteUrl}/denuncias/prova/${row.token}`) : null;

  const embed = new EmbedBuilder()
    .setColor(OPEN_COLOR)
    .setAuthor({ name: `Denúncia #${row.id} · ${site ? "pelo site" : "no jogo"}`, iconURL: reporter.avatar ?? undefined })
    .setTitle(`🚩 ${target.name} foi denunciado`)
    .setDescription(site ? quote(row.description) : "*Feita no jogo com /report: só o motivo, sem descrição nem prova.*")
    .addFields(
      { name: "Motivo", value: row.reason || "—", inline: true },
      { name: "Origem", value: site ? "🌐 Site" : `🎮 Jogo${row.server ? ` · ${row.server}` : ""}`, inline: true },
      { name: "Prova", value: proof ? `${proof.emoji} ${proof.label}${row.evidence_size ? ` · ${megabytes(row.evidence_size)}` : ""}` : "—", inline: true },
      { name: "Denunciado", value: target.text, inline: true },
      { name: "Denunciante", value: reporter.text, inline: true },
      {
        name: "Histórico do denunciado",
        value: `${plural(history.reports, "denúncia", "denúncias")} em 30 dias\n${plural(history.punishments, "punição ativa", "punições ativas")}`,
        inline: true,
      },
    )
    .setFooter({ text: "Hyzen Network · Denúncias" })
    .setTimestamp(new Date(row.created_at));
  if (target.avatar) embed.setThumbnail(target.avatar);
  if (site && row.evidence_type === "image") embed.setImage(proofUrl);

  const buttons = [];
  if (proofUrl && isHttpUrl(proofUrl)) {
    buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(row.evidence_type === "link" ? "Abrir o link da prova" : "Ver a prova").setURL(proofUrl));
  }
  buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Abrir no painel").setURL(`${config.siteUrl}/admin/denuncias/${origin}/${row.id}`));

  const payload = { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
  // A video file's address in the text makes Discord play it right in the channel.
  if (site && row.evidence_type === "video") payload.content = `🎬 Vídeo da prova: ${proofUrl}`;

  const messages = await broadcastLog(client, CHANNEL, payload);
  if (messages.length) {
    const posted = store.get("posted", {});
    posted[`${origin}:${row.id}`] = { at: Date.now(), messages: messages.map((m) => [m.channelId, m.id]) };
    store.set("posted", posted);
  }
}

// The posts whose report the staff decided since: their embed gets the verdict, and they stop being followed.
async function markDecided(client, names) {
  const posted = store.get("posted", {});
  const keys = Object.keys(posted);
  if (!keys.length) return;

  const oldest = Date.now() - TRACK_DAYS * 24 * 60 * 60 * 1000;
  const idsOf = (origin) => keys.filter((key) => key.startsWith(`${origin}:`)).map((key) => key.slice(origin.length + 1));
  const decided = [];
  await safely("resolved game reports", async () => {
    for (const row of await findResolvedGameReports(idsOf(GAME))) {
      decided.push({ key: `${GAME}:${row.id}`, verdict: VERDICTS.resolved, staffId: row.resolved_by });
    }
  });
  await safely("judged site reports", async () => {
    for (const row of await findJudgedWebReports(idsOf(SITE))) {
      decided.push({ key: `${SITE}:${row.id}`, verdict: VERDICTS[row.status] ?? VERDICTS.rejected, staffId: row.handled_by, note: row.staff_note });
    }
  });

  for (const { key, verdict, staffId, note } of decided) {
    await safely(`verdict ${key}`, async () => {
      const staff = staffId === null ? "alguém da equipe" : (await personOf(client, staffId, names, false)).name;
      for (const [channelId, messageId] of posted[key].messages) {
        await markMessage(client, channelId, messageId, verdict, staff, note);
      }
    });
    delete posted[key];
  }
  for (const key of Object.keys(posted)) {
    if (posted[key].at < oldest) delete posted[key];
  }
  store.set("posted", posted);
}

async function markMessage(client, channelId, messageId, verdict, staff, note) {
  try {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    const original = message.embeds[0];
    if (!original) return;
    const embed = EmbedBuilder.from(original)
      .setColor(verdict.color)
      .setTitle(`${verdict.title} ${original.title.replace(/^🚩\s*/, "")}`)
      .addFields({ name: "Veredito", value: `**${verdict.label}** por ${staff}${note ? `\n${quote(note)}` : ""}`.slice(0, 1024) });
    await message.edit({ embeds: [embed] });
  } catch (err) {
    // Deleted by someone, or the bot lost access to the channel: nothing to mark.
    console.error(`[reportFeed] could not mark message ${messageId}`, err.message);
  }
}

// Same as the punishment feed: rows written since the saved id, oldest first, stopping at the first one still too
// recent; the id moves before anything is posted, and the first run ever starts from the newest row.
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

// A player as the report shows them: the game name, and the Discord account they linked with /verificar.
async function personOf(client, playerId, cache, withDiscord = true) {
  const key = `${playerId}:${withDiscord}`;
  if (cache.has(key)) return cache.get(key);

  const player = await findPlayerById(playerId);
  const name = player ? player.name : `#${playerId}`;
  let text = `**${escape(name)}**\n*Discord não vinculado*`;
  let avatar = null;
  if (withDiscord) {
    const discordId = await findDiscordIdByPlayerId(playerId);
    if (discordId) {
      const user = await client.users.fetch(discordId).catch(() => null);
      text = `**${escape(name)}**\n<@${discordId}>${user ? ` · \`${user.username}\`` : ""}`;
      avatar = user?.displayAvatarURL({ size: 128 }) ?? null;
    }
  }
  const person = { name, text, avatar };
  cache.set(key, person);
  return person;
}

async function safely(label, handle) {
  try {
    await handle();
  } catch (err) {
    console.error(`[reportFeed] failed on ${label}`, err.message);
  }
}

// Each line as a Discord quote, within the description's limit.
function quote(text) {
  const clean = (text || "").trim().slice(0, 1500);
  return clean ? clean.split(/\r?\n/).map((line) => `> ${line}`).join("\n") : "—";
}

// Names can carry Discord markdown (an underscore in a nick).
function escape(text) {
  return text.replace(/([\\*_`~|>])/g, "\\$1");
}

function plural(n, one, many) {
  return `**${n}** ${n === 1 ? one : many}`;
}

function megabytes(bytes) {
  return `${(Number(bytes) / 1048576).toFixed(1).replace(".", ",")} MB`;
}

function isHttpUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
