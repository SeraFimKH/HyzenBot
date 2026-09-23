import { AttachmentBuilder } from "discord.js";
import { getGuildConfig } from "../database/guildConfig.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderContent(content) {
  return escapeHtml(content).replace(/\n/g, "<br>");
}

function renderAttachment(attachment) {
  if (attachment.contentType?.startsWith("image/")) {
    return `<div class="attachment"><img src="${attachment.url}" alt="${escapeHtml(attachment.name)}"></div>`;
  }
  return `<div class="attachment"><a href="${attachment.url}" target="_blank" rel="noopener">📎 ${escapeHtml(attachment.name)}</a></div>`;
}

function renderMessage(message) {
  const avatarUrl = message.author.displayAvatarURL({ extension: "png", size: 64 });
  const displayName = escapeHtml(message.member?.displayName || message.author.username);
  const color = message.member?.displayHexColor && message.member.displayHexColor !== "#000000" ? message.member.displayHexColor : "#f2f3f5";
  const time = new Date(message.createdTimestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const contentHtml = message.content ? `<div class="content">${renderContent(message.content)}</div>` : "";
  const attachmentsHtml = [...message.attachments.values()].map(renderAttachment).join("");
  const bodyHtml = contentHtml || attachmentsHtml ? `${contentHtml}${attachmentsHtml}` : '<div class="content empty-msg">[sem conteúdo]</div>';

  return `
  <div class="message">
    <img class="avatar" src="${avatarUrl}" alt="avatar" loading="lazy">
    <div class="body">
      <div class="msg-header"><span class="username" style="color:${color}">${displayName}</span><span class="timestamp">${time}</span></div>
      ${bodyHtml}
    </div>
  </div>`;
}

function buildTranscriptHtml(channelName, messages, communityName) {
  const rows = messages.map(renderMessage).join("\n");
  const generatedAt = new Date().toLocaleString("pt-BR");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transcrição — ${escapeHtml(channelName)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    background: #313338;
    color: #dbdee1;
    font-family: "gg sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 24px;
  }
  .header-bar {
    border-bottom: 1px solid #3f4147;
    padding-bottom: 16px;
    margin-bottom: 8px;
  }
  .header-bar h1 { font-size: 20px; margin: 0 0 4px; color: #fff; }
  .header-bar p { margin: 0; color: #949ba4; font-size: 13px; }
  .message {
    display: flex;
    gap: 16px;
    padding: 8px 12px;
    border-radius: 4px;
  }
  .message:hover { background: #2e3035; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
  .body { min-width: 0; flex: 1; }
  .msg-header { display: flex; align-items: baseline; gap: 8px; }
  .username { font-weight: 600; font-size: 15px; }
  .timestamp { font-size: 11px; color: #949ba4; }
  .content { white-space: pre-wrap; word-wrap: break-word; line-height: 1.4; font-size: 15px; }
  .content.empty-msg { color: #6d6f78; font-style: italic; }
  .attachment img { max-width: 400px; max-height: 300px; border-radius: 8px; margin-top: 4px; display: block; }
  .attachment a { color: #00a8fc; text-decoration: none; font-size: 14px; }
  .attachment a:hover { text-decoration: underline; }
  .empty { color: #949ba4; font-style: italic; padding: 16px 0; }
</style>
</head>
<body>
  <div class="header-bar">
    <h1>🎫 Transcrição do ticket — #${escapeHtml(channelName)}</h1>
    <p>Gerado em ${generatedAt} · ${escapeHtml(communityName)}</p>
  </div>
  ${rows || '<p class="empty">Nenhuma mensagem foi registrada neste ticket.</p>'}
</body>
</html>`;
}

export async function buildTranscriptAttachment(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const communityName = getGuildConfig(channel.guild.id).communityName;
  const html = buildTranscriptHtml(channel.name, sorted, communityName);
  return new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `${channel.name}-transcript.html` });
}
