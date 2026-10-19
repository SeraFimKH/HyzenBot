import { baseEmbed } from "./embeds.js";
import { describeChannel, getAdminGuild, LOG_CHANNEL_KEYS } from "./linkedGuilds.js";

export const CHANNEL_LABELS = {
  ticket: "🎫 Canal de tickets",
  feedback: "⭐ Canal de feedback",
  changelog: "📑 Canal de avisos/changelog",
  sorteio: "🎉 Canal padrão de sorteios",
  ticketLog: "📋 Canal de logs de ticket",
  paymentLog: "💰 Canal de logs de pagamento",
  commands: "💬 Canal de comandos (membros)",
  rules: "📜 Canal de regras",
  sorteioResultado: "🏆 Canal de resultado de sorteio",
  banLog: "🔨 Canal de logs de banimento",
  muteLog: "🔇 Canal de logs de mute",
  warnLog: "⚠️ Canal de logs de advertência",
  winLog: "🏆 Canal de logs de vitória",
  status: "📊 Canal do painel de status",
  sugestoes: "💡 Canal de sugestões",
  sugestoesLog: "🗳️ Canal de logs de sugestões",
};

const channelOrNone = (id) => (id ? `<#${id}>` : "*(não definido)*");

// context: anything with the client and the server's id (an interaction) — to show which log channels are in the admin
// server. Without it the channels are only mentioned.
export function buildConfigSummaryEmbed(cfg, context = null) {
  const logChannel = (key) => (context ? describeChannel(context.client, context.guildId, cfg.channels[key]) : null) ?? channelOrNone(cfg.channels[key]);
  const adminGuild = context && cfg.adminGuildId ? getAdminGuild(context.client, cfg) : null;
  const adminGuildText = !cfg.adminGuildId ? "*(nenhum — os logs ficam neste servidor)*" : adminGuild ? `**${adminGuild.name}**` : "⚠️ *o bot não está mais no servidor vinculado*";

  return baseEmbed(cfg.communityName)
    .setTitle(`⚙️ Configuração da ${cfg.communityName}`)
    .addFields(
      {
        name: "Cargos administradores",
        value: cfg.adminRoles.length ? cfg.adminRoles.map((id) => `<@&${id}>`).join(", ") : '*(nenhum, usando "Gerenciar Servidor")*',
      },
      {
        name: "Cargos staff (moderação)",
        value: cfg.staffRoles.length ? cfg.staffRoles.map((id) => `<@&${id}>`).join(", ") : "*(nenhum)*",
      },
      {
        name: "🎧 Atendem os tickets",
        value: cfg.support.roles.atender.length
          ? cfg.support.roles.atender.map((id) => `<@&${id}>`).join(", ") +
            (Object.keys(cfg.support.typeRoles).length ? ` · ${Object.keys(cfg.support.typeRoles).length} tipo(s) com equipe própria` : "")
          : "*(os cargos staff — /painel → Suporte — Permissões)*",
      },
      { name: CHANNEL_LABELS.ticket, value: cfg.channels.ticket ? `<#${cfg.channels.ticket}>` : "*(não definido)*", inline: true },
      { name: CHANNEL_LABELS.feedback, value: cfg.channels.feedback ? `<#${cfg.channels.feedback}>` : "*(não definido)*", inline: true },
      { name: CHANNEL_LABELS.changelog, value: cfg.channels.changelog ? `<#${cfg.channels.changelog}>` : "*(não definido)*", inline: true },
      { name: CHANNEL_LABELS.sorteio, value: cfg.channels.sorteio ? `<#${cfg.channels.sorteio}>` : "*(não definido)*", inline: true },
      {
        name: CHANNEL_LABELS.sorteioResultado,
        value: cfg.channels.sorteioResultado ? `<#${cfg.channels.sorteioResultado}>` : "*(usa o canal do painel do sorteio)*",
        inline: true,
      },
      { name: "🔁 Máx. de entradas por sorteio (padrão)", value: `${cfg.raffleDefaultMaxEntries}`, inline: true },
      {
        name: "💵 Preço padrão do sorteio",
        value: cfg.raffleDefaultEntryPrice > 0 ? `R$ ${cfg.raffleDefaultEntryPrice.toFixed(2).replace(".", ",")} (pago por padrão)` : "Gratuito por padrão",
        inline: true,
      },
      {
        name: CHANNEL_LABELS.commands,
        value: cfg.channels.commands ? `<#${cfg.channels.commands}>` : "*(sem restrição — comandos funcionam em qualquer canal)*",
        inline: true,
      },
      { name: "Categoria de tickets", value: cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : "*(não definida)*" },
      {
        name: "🗂️ Tipos de suporte",
        value: cfg.ticketTypes.length ? cfg.ticketTypes.map((t) => `${t.emoji || "•"} ${t.label}`).join(", ") : "*(nenhum, abre ticket direto sem perguntar o tipo)*",
      },
      {
        name: "💳 Mercado Pago",
        value: cfg.mercadoPagoAccessToken ? "✅ Configurado" : "❌ Não configurado (usando modo teste)",
        inline: true,
      },
      {
        name: "🧪 Modo teste do Pix",
        value: cfg.pixTestMode ? "🧪 Ativado (forçado)" : "✅ Desativado",
        inline: true,
      },
      {
        name: CHANNEL_LABELS.rules,
        value: cfg.channels.rules ? `<#${cfg.channels.rules}>` : "*(não definido)*",
        inline: true,
      },
      {
        name: "📄 Termo de uso",
        value: cfg.termsText ? "✅ Configurado" : "❌ Não configurado",
        inline: true,
      },
      {
        name: "✅ Cargo de verificado",
        value: cfg.verifiedRoleId ? `<@&${cfg.verifiedRoleId}>` : "*(não definido)*",
        inline: true,
      },
      {
        name: "🤖 IA no ticket",
        value: cfg.aiEnabled ? "🟢 Ativada" : cfg.aiApiKey ? "⚪ Desativada (chave configurada)" : "⚪ Desativada (sem chave)",
        inline: true,
      },
      { name: "🔗 Servidor administrativo", value: adminGuildText, inline: true },
      {
        name: "📋 Canais de log",
        value: LOG_CHANNEL_KEYS.map((key) => `${CHANNEL_LABELS[key]}: ${logChannel(key)}`).join("\n").slice(0, 1024),
      },
      { name: CHANNEL_LABELS.status, value: channelOrNone(cfg.channels.status), inline: true },
      {
        name: CHANNEL_LABELS.sugestoes,
        value: cfg.channels.sugestoes
          ? `<#${cfg.channels.sugestoes}> · votação de ${cfg.suggestionPollDays} dia(s), ${cfg.suggestionCooldownMinutes} min entre sugestões`
          : "*(não definido)*",
        inline: true,
      },
    );
}
