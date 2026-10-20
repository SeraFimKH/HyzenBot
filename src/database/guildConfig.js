import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("guildConfig.json", {});

const DEFAULT_RULES_TEXT = `Bem-vindo(a)! Para manter nosso servidor organizado, seguro e agradável para todos, leia atentamente as diretrizes abaixo.

Respeito
• Trate todos os membros com respeito e educação.
• Não serão tolerados insultos, preconceito, discriminação, ameaças ou qualquer tipo de assédio.

Comunicação
• Evite spam, flood e mensagens repetitivas.
• Utilize os canais corretos para cada assunto.
• Não divulgue outros servidores, links ou serviços sem autorização da equipe.

Atendimento
• Abra apenas um ticket por vez.
• Tenha paciência durante o atendimento; nossa equipe responderá o mais rápido possível.
• Não marque membros da equipe repetidamente.

Compras
• Leia atentamente a descrição de cada produto antes de efetuar qualquer compra.
• Tire todas as suas dúvidas antes de finalizar o pagamento.
• Após a entrega do produto, verifique imediatamente se tudo está conforme informado.

Pagamentos
• Envie comprovantes apenas pelo ticket correspondente.
• Não edite ou tente falsificar comprovantes. Qualquer tentativa resultará em banimento permanente.

Sorteios
• Siga as regras específicas de cada sorteio.
• Contas alternativas (alts) utilizadas para obter vantagem poderão ser desclassificadas.

Segurança
• Nunca compartilhe senhas, códigos de autenticação ou informações pessoais com outros membros.
• A equipe jamais solicitará dados sensíveis sem necessidade.

Penalidades
O descumprimento das regras poderá resultar em:
• Advertência.
• Silenciamento temporário.
• Suspensão.
• Banimento permanente, dependendo da gravidade da infração.

Alterações
Estas diretrizes poderão ser atualizadas a qualquer momento para melhorar a organização e a segurança da comunidade.

Ao permanecer neste servidor, você declara que leu e concorda com estas diretrizes.`;

function defaultConfig() {
  return {
    communityName: "Hyzen Network",
    adminRoles: [],
    staffRoles: [],
    channels: {
      ticket: null,
      feedback: null,
      changelog: null,
      sorteio: null,
      ticketLog: null,
      paymentLog: null,
      commands: null,
      rules: null,
      sorteioResultado: null,
      banLog: null,
      muteLog: null,
      warnLog: null,
      winLog: null,
      status: null,
      sugestoes: null,
      sugestoesLog: null,
      // /painel → Servidor do Jogo: the pre-registration panel, and where the staff approves the requests.
      preRegistro: null,
      preRegistroAprovacao: null,
    },
    // /painel → Servidor Administrativo: another Discord server the log channels may point at (utils/linkedGuilds.js).
    adminGuildId: null,
    preRegistroPanelChannelId: null,
    preRegistroPanelMessageId: null,
    ticketCategoryId: null,
    ticketPanelMessageId: null,
    ticketCounter: 0,
    raffleDefaultMaxEntries: 1,
    raffleDefaultEntryPrice: null,
    aiEnabled: false,
    aiApiKey: null,
    aiBaseUrl: null,
    aiModel: null,
    aiSystemPrompt: null,
    ticketTypes: [
      { label: "Compra", emoji: "🛒", description: "Suporte para compras na loja" },
      { label: "Venda", emoji: "💰", description: "Quer vender algo? Fale com a equipe" },
      { label: "Bug", emoji: "🐛", description: "Reporte bugs encontrados no servidor" },
      { label: "Dúvida", emoji: "❓", description: "Tire as suas dúvidas com a equipe" },
    ],
    mercadoPagoAccessToken: null,
    pixTestMode: false,
    rulesText: DEFAULT_RULES_TEXT,
    termsText: null,
    rulesPanelMessageId: null,
    verifiedRoleId: null,
    texts: {},
    announcePingRoleId: null,
    serverIp: null,
    serverPort: null,
    statusPanelMessageId: null,
    statusPanelChannelId: null,
    suggestionPanelMessageId: null,
    suggestionPanelChannelId: null,
    suggestionPollDays: 7,
    suggestionCooldownMinutes: 10,
    // /painel → Suporte — Permissões (see utils/supportPermissions.js). typeRoles: support type label → its team.
    support: {
      roles: { atender: [], fechar: [], pix: [] },
      typeRoles: {},
    },
  };
}

export function getGuildConfig(guildId) {
  const cfg = store.get(guildId);
  if (!cfg) {
    return defaultConfig();
  }
  // garante que configs antigas ganhem campos novos adicionados depois
  return {
    ...defaultConfig(),
    ...cfg,
    channels: { ...defaultConfig().channels, ...(cfg.channels || {}) },
    texts: { ...(cfg.texts || {}) },
    support: {
      roles: { ...defaultConfig().support.roles, ...(cfg.support?.roles || {}) },
      typeRoles: { ...(cfg.support?.typeRoles || {}) },
    },
  };
}

export function saveGuildConfig(guildId, cfg) {
  store.set(guildId, cfg);
  return cfg;
}

export function updateGuildConfig(guildId, mutator) {
  const cfg = getGuildConfig(guildId);
  mutator(cfg);
  saveGuildConfig(guildId, cfg);
  return cfg;
}
