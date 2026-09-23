import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createVerificationCode, findLinkByDiscordId } from "../database/auth.js";

// HyzenAuth's own hyzen_auth_codes.expires_at (see plugins/java-powernukkitx/HyzenAuth/src/main/resources/
// config.yml's code-expiry-minutes) — kept in sync manually since the bot has no dependency on the Java side's
// config file.
const CODE_EXPIRY_MINUTES = 5;

// Shared by /verificar, the persistent panel's "Verificar conta" button, and the "Já verifiquei" recheck —
// same code-gen + embed regardless of which one triggered it.
export async function buildVerificationResponse(discordId) {
  const existing = await findLinkByDiscordId(discordId);
  if (existing) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x1f6f63)
          .setTitle("Já vinculado")
          .setDescription("Sua conta do Discord já está vinculada a um jogador na Hyzen Network."),
      ],
      components: [],
    };
  }

  const code = await createVerificationCode(discordId, CODE_EXPIRY_MINUTES);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x1f6f63)
        .setTitle("Vincule sua conta")
        .setDescription(
          `Seu código: **${code}**\n\n` +
            `No jogo, digite:\n\`/verificar ${code}\`\n\n` +
            `O código expira em ${CODE_EXPIRY_MINUTES} minutos.`,
        )
        .setFooter({ text: 'Clique em "Já verifiquei" depois de rodar o comando no jogo.' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("auth:check").setLabel("Já verifiquei").setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

// O painel persistente (ver commands/painel-verificacao.js).
export function buildAuthPanelMessage() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x1f6f63)
        .setTitle("Verificação de conta")
        .setDescription(
          "Vincule sua conta do Discord ao servidor na Hyzen Network.\n\n" +
            "Clique no botão abaixo pra gerar seu código de verificação.",
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("auth:start").setLabel("Verificar conta").setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

// O botão "Verificar conta" do painel persistente — mesmo fluxo do /verificar, só que disparado pelo clique
// em vez do comando. Sempre responde de forma efêmera, pra a mensagem do painel continuar genérica/reutilizável
// pela próxima pessoa que clicar.
export async function handleAuthStart(interaction) {
  const response = await buildVerificationResponse(interaction.user.id);
  await interaction.reply({ ...response, ephemeral: true });
}

// O botão "Já verifiquei" da resposta efêmera acima — reconfere hyzen_auth_links em vez do usuário ter que
// adivinhar se o /verificar <código> já foi processado no jogo.
export async function handleAuthCheck(interaction) {
  const link = await findLinkByDiscordId(interaction.user.id);
  if (link) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x1f6f63)
          .setTitle("Conta vinculada!")
          .setDescription("Sua conta do Discord foi vinculada com sucesso à Hyzen Network."),
      ],
      components: [],
    });
    return;
  }
  await interaction.reply({
    content: "Ainda não vinculado — rode `/verificar <código>` no jogo primeiro.",
    ephemeral: true,
  });
}
