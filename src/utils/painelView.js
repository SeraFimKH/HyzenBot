import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { buildConfigSummaryEmbed } from "./configEmbed.js";
import { TEXT_FIELDS } from "./textDefaults.js";

const CATEGORIES = [
  {
    id: "tickets",
    label: "Tickets",
    emoji: "🎫",
    description: "Canal, categoria, tipos de suporte e painel de abertura",
    options: [
      { label: "Canal de Ticket", description: "Onde o painel de abrir ticket é postado", value: "canal_ticket", emoji: "🎫" },
      { label: "Categoria de Ticket", description: "Onde os canais de ticket são criados", value: "categoria_ticket", emoji: "🗂️" },
      { label: "Canal de Logs de Ticket", description: "Onde a transcrição de tickets fechados é enviada", value: "canal_ticketLog", emoji: "📋" },
      { label: "Tipos de Suporte", description: "Compra, Venda, Bug, etc. — perguntado ao abrir um ticket", value: "tipos_ticket", emoji: "🗂️" },
      { label: "Publicar Painel de Ticket", description: 'Posta o botão "Abrir Ticket" no canal configurado', value: "publicar_painel", emoji: "📌" },
      { label: "Chave/URL/Modelo da IA", description: "Credenciais da IA (qualquer provedor compatível com OpenAI) usada pra responder tickets", value: "ia_chave", emoji: "🔑" },
      { label: "Contexto da IA", description: "Instruções/FAQ que a IA segue ao responder", value: "ia_contexto", emoji: "🧠" },
      { label: "Ativar/Desativar IA", description: "Liga ou desliga a resposta automática por IA nos tickets", value: "ia_toggle", emoji: "🤖" },
    ],
  },
  {
    id: "sorteios",
    label: "Sorteios",
    emoji: "🎉",
    description: "Canais, entradas por membro e preço padrão",
    options: [
      { label: "Canal de Sorteio", description: "Canal padrão usado pelo /sorteio", value: "canal_sorteio", emoji: "🎉" },
      { label: "Canal de Resultado de Sorteio", description: "Onde o resultado do sorteio é anunciado", value: "canal_sorteioResultado", emoji: "🏆" },
      { label: "Máx. de Entradas por Sorteio", description: "Quantas vezes um membro pode entrar no mesmo sorteio (padrão)", value: "sorteio_max_entradas", emoji: "🔁" },
      { label: "Preço Padrão do Sorteio", description: "Se novos sorteios são pagos por padrão", value: "sorteio_preco_padrao", emoji: "💵" },
    ],
  },
  {
    id: "pagamentos",
    label: "Pagamentos (Pix)",
    emoji: "💳",
    description: "Mercado Pago, modo teste e logs de pagamento",
    options: [
      { label: "Mercado Pago (Token)", description: "Access Token usado pelo /pix para cobranças reais", value: "pagamento_mp", emoji: "💳" },
      { label: "Modo Teste do Pix", description: "Ativa/desativa cobranças falsas no /pix", value: "teste_pix_toggle", emoji: "🧪" },
      { label: "Canal de Logs de Pagamento", description: "Onde as confirmações de Pix são registradas", value: "canal_paymentLog", emoji: "💰" },
    ],
  },
  {
    id: "regras",
    label: "Regras & Verificação",
    emoji: "📜",
    description: "Diretrizes, termo de uso e cargo de verificado",
    options: [
      { label: "Canal de Regras", description: "Onde as diretrizes/termo de uso são publicados", value: "canal_rules", emoji: "📜" },
      { label: "Editar Diretrizes", description: "Edita o texto das regras da comunidade", value: "editar_regras", emoji: "📜" },
      { label: "Editar Termo de Uso", description: "Edita o texto do termo de uso", value: "editar_termos", emoji: "📄" },
      { label: "Publicar Regras", description: "Posta as diretrizes/termo de uso no canal configurado", value: "publicar_regras", emoji: "📢" },
      { label: "Cargo de Verificado", description: 'Dado a quem clicar em "Aceitar" nas regras', value: "cargo_verificado", emoji: "✅" },
    ],
  },
  {
    id: "comunidade",
    label: "Comunidade",
    emoji: "⭐",
    description: "Feedback, changelog e canal de comandos dos membros",
    options: [
      { label: "Canal de Feedback", description: "Onde os feedbacks (/feed) são publicados", value: "canal_feedback", emoji: "⭐" },
      { label: "Canal de Changelog", description: "Onde os avisos (/aviso) são publicados", value: "canal_changelog", emoji: "📑" },
      { label: "Canal de Comandos", description: "Onde membros podem usar /participar e /feed", value: "canal_commands", emoji: "💬" },
      { label: "Cargo de Menção em Anúncios", description: "Cargo (ou @everyone) marcado em sorteio, enquete e aviso", value: "cargo_anuncio", emoji: "🔔" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    emoji: "🛡️",
    description: "Cargos com permissão de admin/staff do bot",
    options: [
      { label: "Cargos Administradores", description: "Quem pode usar /config, /sorteio, /enquete, /aviso", value: "cargo_admin", emoji: "🛡️" },
      { label: "Cargos Staff", description: "Quem pode assumir/fechar tickets", value: "cargo_staff", emoji: "🙋" },
      { label: "Nome do Bot no Servidor", description: "Muda o apelido do bot neste servidor", value: "bot_nome", emoji: "🏷️" },
      { label: "Nome da Comunidade", description: "Nome usado nos embeds públicos (rodapé, títulos, etc)", value: "nome_comunidade", emoji: "🏢" },
      { label: "IP do Servidor", description: "Usado pelo /ip e quando alguém pergunta o IP no chat", value: "server_ip", emoji: "🌐" },
    ],
  },
  {
    id: "moderacao",
    label: "Moderação",
    emoji: "🛡️",
    description: "Canais de log de banimento, mute, advertência e vitória",
    options: [
      { label: "Canal de Logs de Banimento", description: "Onde /ban, /tempban e /unban são registrados", value: "canal_banLog", emoji: "🔨" },
      { label: "Canal de Logs de Mute", description: "Onde /mute, /tempmute e /unmute são registrados", value: "canal_muteLog", emoji: "🔇" },
      { label: "Canal de Logs de Advertência", description: "Onde /warn é registrado", value: "canal_warnLog", emoji: "⚠️" },
      { label: "Canal de Logs de Vitória", description: "Onde vitórias de partidas no jogo são anunciadas", value: "canal_winLog", emoji: "🏆" },
    ],
  },
  {
    id: "textos_painel",
    label: "Textos — Títulos",
    emoji: "📝",
    description: "Títulos dos painéis públicos (ticket, sorteio, regras, etc)",
    options: TEXT_FIELDS.filter((f) => f.group === "painel").map((f) => ({
      label: f.label,
      description: "Editar este texto",
      value: `texto_${f.key}`,
      emoji: "📝",
    })),
  },
  {
    id: "textos_mensagem",
    label: "Textos — Mensagens",
    emoji: "💬",
    description: "Mensagens principais enviadas pelo bot aos membros",
    options: TEXT_FIELDS.filter((f) => f.group === "mensagem").map((f) => ({
      label: f.label,
      description: "Editar este texto",
      value: `texto_${f.key}`,
      emoji: "💬",
    })),
  },
];

export function findCategory(id) {
  return CATEGORIES.find((c) => c.id === id);
}

export function buildMainPanel(cfg) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("painel_categoria")
    .setPlaceholder("Escolha uma categoria...")
    .addOptions(CATEGORIES.map((c) => ({ label: c.label, description: c.description, value: c.id, emoji: c.emoji })));

  return {
    embeds: [buildConfigSummaryEmbed(cfg).setDescription("Selecione uma categoria abaixo para configurar. Este painel é visível só para você.")],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

export { CATEGORIES };
