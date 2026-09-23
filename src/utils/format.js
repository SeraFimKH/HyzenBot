export function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

// Discord renders <t:unix:style> as a live, client-side-updating timestamp — "R" counts down/up on its own
// ("em 58 segundos", "há 3 minutos") instead of a static string that looks frozen the moment it's sent.
export function discordTimestamp(date, style = "R") {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}
