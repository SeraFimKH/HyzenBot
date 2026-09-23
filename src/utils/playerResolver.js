import { findPlayerByName, findPlayerById } from "../database/players.js";
import { findLinkByDiscordId } from "../database/auth.js";

// Every punishment/profile command takes either a "jogador" (IGN string) or a "membro" (Discord user) option —
// this resolves whichever one was actually given, going through hyzen_auth_links for the Discord path.
export async function resolveTargetPlayer(interaction) {
  const nome = interaction.options.getString("jogador");
  const membro = interaction.options.getUser("membro");

  if (membro) {
    const link = await findLinkByDiscordId(membro.id);
    if (!link) {
      return { player: null, error: `${membro} ainda não vinculou a conta do jogo (use \`/verificar\` no jogo).` };
    }
    const player = await findPlayerById(link.player_id);
    return { player, error: player ? null : "A conta vinculada a esse membro não foi encontrada." };
  }

  if (nome) {
    const trimmed = nome.trim();
    const player = await findPlayerByName(trimmed);
    return { player, error: player ? null : `Nenhum jogador chamado **${trimmed}** foi encontrado.` };
  }

  return { player: null, error: "Informe o nome do jogador (`jogador`) ou marque o membro do Discord vinculado (`membro`)." };
}

// Same resolution as resolveTargetPlayer, but for read-only self-service commands (/perfil, /stats) — when
// neither option is given, falls back to the invoking user's own linked account instead of erroring. Not used
// by punishment commands on purpose: a staff member who forgets to specify a target should get an error, not
// accidentally punish themselves.
export async function resolveTargetPlayerOrSelf(interaction) {
  const nome = interaction.options.getString("jogador");
  const membro = interaction.options.getUser("membro");

  if (!nome && !membro) {
    const link = await findLinkByDiscordId(interaction.user.id);
    if (!link) {
      return { player: null, error: "Você ainda não vinculou sua conta do jogo (use `/verificar` no jogo), ou informe `jogador`/`membro`." };
    }
    const player = await findPlayerById(link.player_id);
    return { player, error: player ? null : "Sua conta vinculada não foi encontrada." };
  }

  return resolveTargetPlayer(interaction);
}
