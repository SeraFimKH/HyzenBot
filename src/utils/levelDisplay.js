// xp = floor(85 * (0.5 + 0.6 * level)) — mirrors HyzenCore's own LevelManager#getXpToNextLevel exactly, so any
// bar built from this always matches what the player sees on their in-game XP bar.
export function xpToNextLevel(level) {
  return Math.floor(85 * (0.5 + 0.6 * level));
}

export function xpBar(current, max, length = 14) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 1;
  const filled = Math.round(ratio * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

// Loose translation of LevelManager's own 12-tier in-game color palette into a single representative Discord
// embed color per bracket — purely decorative, doesn't need to match 1:1.
const LEVEL_TIER_COLORS = [
  { max: 19, color: 0x99aab5 },
  { max: 49, color: 0xf1c40f },
  { max: 99, color: 0x2ecc71 },
  { max: 149, color: 0x27ae60 },
  { max: 199, color: 0xe74c3c },
  { max: 299, color: 0x1abc9c },
  { max: 399, color: 0x3498db },
  { max: 499, color: 0x9b59b6 },
  { max: 599, color: 0x2980b9 },
  { max: 699, color: 0x8e44ad },
  { max: 799, color: 0x2c2f33 },
  { max: 899, color: 0xeb459e },
  { max: 999, color: 0xff73fa },
  { max: 1000, color: 0xffd700 },
];

export function colorForLevel(level) {
  return (LEVEL_TIER_COLORS.find((tier) => level <= tier.max) || LEVEL_TIER_COLORS.at(-1)).color;
}

export function levelProgressLine(level, xp) {
  const isMaxLevel = level >= 1000;
  if (isMaxLevel) {
    return `**${level}** ⭐ (nível máximo)`;
  }
  const needed = xpToNextLevel(level);
  return `**${level}**\n${xpBar(xp, needed)}\n${xp} / ${needed} XP`;
}
