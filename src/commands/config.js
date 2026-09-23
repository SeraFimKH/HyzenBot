import { SlashCommandBuilder, ChannelType } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { isAdmin } from "../utils/permissions.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { buildConfigSummaryEmbed, CHANNEL_LABELS } from "../utils/configEmbed.js";
import { publishTicketPanel } from "../utils/ticketPanel.js";
import { addTicketType, removeTicketTypes } from "../utils/ticketTypes.js";
import { handleOpenMpTokenModal } from "../interactions/pixButtons.js";
import { handleOpenRulesModal } from "../interactions/rulesModal.js";
import { publishRules } from "../utils/rulesPanel.js";
import { handleOpenAiKeyModal, handleOpenAiContextModal } from "../interactions/aiConfig.js";
import { handleOpenTextModal, buildTextListEmbed } from "../interactions/textConfig.js";
import { TEXT_FIELDS } from "../utils/textDefaults.js";

const TEXTO_PAINEL_CHOICES = TEXT_FIELDS.filter((f) => f.group === "painel").map((f) => ({ name: f.label, value: f.key }));
const TEXTO_MENSAGEM_CHOICES = TEXT_FIELDS.filter((f) => f.group === "mensagem").map((f) => ({ name: f.label, value: f.key }));

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configura o bot deste servidor (apenas administradores).")
  .addSubcommand((sub) =>
    sub.setName("ver").setDescription("Mostra a configuração atual do servidor."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("canal")
      .setDescription("Define o canal usado por uma funcionalidade do bot.")
      .addStringOption((opt) =>
        opt
          .setName("tipo")
          .setDescription("Qual canal configurar")
          .setRequired(true)
          .addChoices(
            { name: "Ticket", value: "ticket" },
            { name: "Feedback", value: "feedback" },
            { name: "Changelog / Avisos", value: "changelog" },
            { name: "Sorteio (padrão)", value: "sorteio" },
            { name: "Logs de Ticket", value: "ticketLog" },
            { name: "Logs de Pagamento", value: "paymentLog" },
            { name: "Comandos (membros)", value: "commands" },
            { name: "Regras / Termo de Uso", value: "rules" },
            { name: "Resultado de Sorteio", value: "sorteioResultado" },
            { name: "Logs de Banimento", value: "banLog" },
            { name: "Logs de Mute", value: "muteLog" },
            { name: "Logs de Advertência", value: "warnLog" },
            { name: "Logs de Vitória", value: "winLog" },
          ),
      )
      .addChannelOption((opt) =>
        opt
          .setName("canal")
          .setDescription("Canal de texto a ser usado")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("categoria-ticket")
      .setDescription("Define a categoria onde os canais de ticket serão criados.")
      .addChannelOption((opt) =>
        opt
          .setName("categoria")
          .setDescription("Categoria do servidor")
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo")
      .setDescription("Adiciona ou remove um cargo com permissão de admin/staff do bot.")
      .addStringOption((opt) =>
        opt
          .setName("tipo")
          .setDescription("Tipo de permissão")
          .setRequired(true)
          .addChoices(
            { name: "Administrador do bot (todos os comandos)", value: "admin" },
            { name: "Staff (pode assumir/fechar tickets)", value: "staff" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("acao")
          .setDescription("Adicionar ou remover")
          .setRequired(true)
          .addChoices(
            { name: "Adicionar", value: "adicionar" },
            { name: "Remover", value: "remover" },
          ),
      )
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo do servidor").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("painel-ticket")
      .setDescription("Posta (ou reposta) o painel de abertura de tickets no canal configurado."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("tipo-ticket")
      .setDescription("Gerencia os tipos de suporte perguntados ao abrir um ticket (ex: Compra, Bug, Venda).")
      .addStringOption((opt) =>
        opt
          .setName("acao")
          .setDescription("O que fazer")
          .setRequired(true)
          .addChoices(
            { name: "Adicionar", value: "adicionar" },
            { name: "Remover", value: "remover" },
            { name: "Listar", value: "listar" },
          ),
      )
      .addStringOption((opt) =>
        opt.setName("nome").setDescription("Nome do tipo de suporte (ex: Compra)").setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("emoji").setDescription("Emoji do tipo de suporte (opcional, só para adicionar)").setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("pagamento")
      .setDescription("Configura o Access Token do Mercado Pago usado pelo /pix."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("teste-pix")
      .setDescription("Ativa/desativa o modo teste do /pix (cobranças falsas, sem usar o Mercado Pago real).")
      .addStringOption((opt) =>
        opt
          .setName("estado")
          .setDescription("Ativado ou desativado")
          .setRequired(true)
          .addChoices(
            { name: "Ativado", value: "ativado" },
            { name: "Desativado", value: "desativado" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("regras")
      .setDescription("Edita o texto das Diretrizes da Comunidade (abre um formulário)."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-verificado")
      .setDescription('Define o cargo dado a quem clicar em "Aceitar" nas regras.')
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a ser concedido ao aceitar as regras").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-anuncio")
      .setDescription("Define o cargo (ou @everyone) mencionado em sorteio, enquete e aviso. Sem cargo = desativa.")
      .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo a mencionar (escolha @everyone pra marcar todo mundo)").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("termos")
      .setDescription("Edita o texto do Termo de Uso (abre um formulário)."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("publicar-regras")
      .setDescription("Publica (ou republica) as diretrizes/termo de uso no canal configurado."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("sorteio-entradas")
      .setDescription("Define quantas vezes um membro pode entrar em um sorteio por padrão (pode ser sobrescrito ao criar).")
      .addIntegerOption((opt) =>
        opt.setName("quantidade").setDescription("Máximo de entradas por membro").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("sorteio-preco")
      .setDescription("Define se sorteios são pagos por padrão (Pix/Mercado Pago). Pode ser sobrescrito ao criar.")
      .addNumberOption((opt) =>
        opt.setName("valor").setDescription("Valor padrão da entrada em R$ (0 = gratuito por padrão)").setRequired(true).setMinValue(0),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("nome-bot")
      .setDescription("Muda o apelido do bot neste servidor (deixe vazio para resetar ao nome padrão).")
      .addStringOption((opt) => opt.setName("nome").setDescription("Novo nome do bot neste servidor").setMaxLength(32)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("nome-comunidade")
      .setDescription("Nome usado nos embeds públicos do bot (rodapé, títulos, mensagens de sorteio/feedback/etc).")
      .addStringOption((opt) => opt.setName("nome").setDescription("Nome da comunidade").setRequired(true).setMaxLength(50)),
  )
  .addSubcommand((sub) =>
    sub.setName("ia-chave").setDescription("Configura a chave/URL/modelo da IA (qualquer provedor compatível com OpenAI)."),
  )
  .addSubcommand((sub) =>
    sub.setName("ia-contexto").setDescription("Edita as instruções/FAQ que a IA segue ao responder tickets (abre um formulário)."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("ia-ativar")
      .setDescription("Ativa/desativa a IA respondendo tickets automaticamente antes do staff assumir.")
      .addStringOption((opt) =>
        opt
          .setName("estado")
          .setDescription("Ativado ou desativado")
          .setRequired(true)
          .addChoices({ name: "Ativado", value: "ativado" }, { name: "Desativado", value: "desativado" }),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("texto-painel")
      .setDescription("Edita o título de um dos painéis públicos do bot (abre um formulário).")
      .addStringOption((opt) => opt.setName("tipo").setDescription("Qual título editar").setRequired(true).addChoices(...TEXTO_PAINEL_CHOICES)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("texto-mensagem")
      .setDescription("Edita uma das mensagens principais enviadas pelo bot (abre um formulário).")
      .addStringOption((opt) => opt.setName("tipo").setDescription("Qual mensagem editar").setRequired(true).addChoices(...TEXTO_MENSAGEM_CHOICES)),
  )
  .addSubcommand((sub) => sub.setName("texto-ver").setDescription("Lista os textos customizados e os que ainda usam o padrão."));

export async function execute(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({
      embeds: [errorEmbed("Você não tem permissão para usar este comando.")],
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "ver") {
    return interaction.reply({ embeds: [buildConfigSummaryEmbed(cfg)], ephemeral: true });
  }

  if (sub === "canal") {
    const tipo = interaction.options.getString("tipo", true);
    const canal = interaction.options.getChannel("canal", true);

    updateGuildConfig(interaction.guildId, (c) => {
      c.channels[tipo] = canal.id;
    });

    return interaction.reply({
      embeds: [successEmbed(`${CHANNEL_LABELS[tipo]} definido como ${canal}.`)],
      ephemeral: true,
    });
  }

  if (sub === "categoria-ticket") {
    const categoria = interaction.options.getChannel("categoria", true);

    updateGuildConfig(interaction.guildId, (c) => {
      c.ticketCategoryId = categoria.id;
    });

    return interaction.reply({
      embeds: [successEmbed(`Categoria de tickets definida como **${categoria.name}**.`)],
      ephemeral: true,
    });
  }

  if (sub === "cargo") {
    const tipo = interaction.options.getString("tipo", true);
    const acao = interaction.options.getString("acao", true);
    const cargo = interaction.options.getRole("cargo", true);
    const listKey = tipo === "admin" ? "adminRoles" : "staffRoles";

    const updated = updateGuildConfig(interaction.guildId, (c) => {
      const list = c[listKey];
      if (acao === "adicionar") {
        if (!list.includes(cargo.id)) list.push(cargo.id);
      } else {
        c[listKey] = list.filter((id) => id !== cargo.id);
      }
    });

    const verb = acao === "adicionar" ? "adicionado a" : "removido de";
    const tipoLabel = tipo === "admin" ? "administradores" : "staff";
    return interaction.reply({
      embeds: [successEmbed(`Cargo ${cargo} ${verb} **${tipoLabel}**. Lista atual: ${updated[listKey].length ? updated[listKey].map((id) => `<@&${id}>`).join(", ") : "*(vazia)*"}`)],
      ephemeral: true,
    });
  }

  if (sub === "painel-ticket") {
    const result = await publishTicketPanel(interaction.guild, cfg);
    if (!result.ok) {
      return interaction.reply({ embeds: [errorEmbed(result.reason)], ephemeral: true });
    }
    return interaction.reply({
      embeds: [successEmbed(`Painel de tickets publicado em ${result.channel}.`)],
      ephemeral: true,
    });
  }

  if (sub === "tipo-ticket") {
    const acao = interaction.options.getString("acao", true);
    const nome = interaction.options.getString("nome");
    const emoji = interaction.options.getString("emoji");

    if (acao === "listar") {
      const list = cfg.ticketTypes.length
        ? cfg.ticketTypes.map((t, i) => `${i + 1}. ${t.emoji || "•"} ${t.label}`).join("\n")
        : "*(nenhum tipo cadastrado — o ticket é criado direto, sem perguntar o tipo)*";
      return interaction.reply({ embeds: [successEmbed(`**Tipos de suporte:**\n${list}`)], ephemeral: true });
    }

    if (acao === "adicionar") {
      if (!nome) {
        return interaction.reply({ embeds: [errorEmbed("Informe o `nome` do tipo de suporte que deseja adicionar.")], ephemeral: true });
      }
      let result;
      updateGuildConfig(interaction.guildId, (c) => {
        result = addTicketType(c, nome, emoji);
      });
      if (!result.ok) {
        return interaction.reply({ embeds: [errorEmbed(result.reason)], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed(`Tipo de suporte **${emoji ? `${emoji} ` : ""}${nome}** adicionado.`)], ephemeral: true });
    }

    if (acao === "remover") {
      if (!nome) {
        return interaction.reply({ embeds: [errorEmbed("Informe o `nome` do tipo de suporte que deseja remover.")], ephemeral: true });
      }
      let removedCount;
      updateGuildConfig(interaction.guildId, (c) => {
        removedCount = removeTicketTypes(c, [nome]);
      });
      if (!removedCount) {
        return interaction.reply({ embeds: [errorEmbed(`Nenhum tipo de suporte chamado **${nome}** foi encontrado.`)], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed(`Tipo de suporte **${nome}** removido.`)], ephemeral: true });
    }
  }

  if (sub === "pagamento") {
    return handleOpenMpTokenModal(interaction);
  }

  if (sub === "teste-pix") {
    const estado = interaction.options.getString("estado", true);
    const pixTestMode = estado === "ativado";

    updateGuildConfig(interaction.guildId, (c) => {
      c.pixTestMode = pixTestMode;
    });

    return interaction.reply({
      embeds: [
        successEmbed(
          pixTestMode
            ? "🧪 Modo teste do Pix **ativado**. O `/pix` agora sempre gera cobranças falsas, mesmo com o Mercado Pago configurado."
            : "✅ Modo teste do Pix **desativado**. O `/pix` volta a usar o Mercado Pago real (se o token estiver configurado).",
        ),
      ],
      ephemeral: true,
    });
  }

  if (sub === "regras") {
    return handleOpenRulesModal(interaction, "rules");
  }

  if (sub === "termos") {
    return handleOpenRulesModal(interaction, "terms");
  }

  if (sub === "publicar-regras") {
    const result = await publishRules(interaction.guild, cfg);
    if (!result.ok) {
      return interaction.reply({ embeds: [errorEmbed(result.reason)], ephemeral: true });
    }
    return interaction.reply({
      embeds: [successEmbed(`Diretrizes publicadas em ${result.channel}.`)],
      ephemeral: true,
    });
  }

  if (sub === "cargo-verificado") {
    const cargo = interaction.options.getRole("cargo", true);

    updateGuildConfig(interaction.guildId, (c) => {
      c.verifiedRoleId = cargo.id;
    });

    return interaction.reply({
      embeds: [successEmbed(`Cargo de verificado definido como ${cargo}. Quem clicar em "Aceitar" nas regras vai receber esse cargo — use as permissões do Discord pra liberar os canais que quiser pra ele.`)],
      ephemeral: true,
    });
  }

  if (sub === "cargo-anuncio") {
    const cargo = interaction.options.getRole("cargo");

    updateGuildConfig(interaction.guildId, (c) => {
      c.announcePingRoleId = cargo?.id || null;
    });

    return interaction.reply({
      embeds: [
        successEmbed(
          cargo
            ? `Sorteio, enquete e aviso agora mencionam ${cargo}.`
            : "Menção em sorteio, enquete e aviso desativada.",
        ),
      ],
      ephemeral: true,
    });
  }

  if (sub === "sorteio-entradas") {
    const quantidade = interaction.options.getInteger("quantidade", true);

    updateGuildConfig(interaction.guildId, (c) => {
      c.raffleDefaultMaxEntries = quantidade;
    });

    return interaction.reply({
      embeds: [successEmbed(`Máximo de entradas por membro definido como **${quantidade}** (padrão para novos sorteios).`)],
      ephemeral: true,
    });
  }

  if (sub === "sorteio-preco") {
    const valor = interaction.options.getNumber("valor", true);

    updateGuildConfig(interaction.guildId, (c) => {
      c.raffleDefaultEntryPrice = valor > 0 ? valor : null;
    });

    return interaction.reply({
      embeds: [
        successEmbed(
          valor > 0
            ? `Sorteios agora são **pagos por padrão** (R$ ${valor.toFixed(2).replace(".", ",")}), a menos que \`preco\` seja sobrescrito ao criar. A cobrança usa o mesmo Mercado Pago/modo teste do \`/pix\`.`
            : "Sorteios agora são **gratuitos por padrão**, a menos que `preco` seja informado ao criar.",
        ),
      ],
      ephemeral: true,
    });
  }

  if (sub === "nome-bot") {
    const nome = interaction.options.getString("nome");

    try {
      await interaction.guild.members.me.setNickname(nome || null);
    } catch (err) {
      console.error("[config] Falha ao mudar o nome do bot:", err);
      return interaction.reply({
        embeds: [errorEmbed('Não consegui mudar o nome do bot. Verifique se ele tem a permissão "Alterar apelido".')],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [successEmbed(nome ? `Nome do bot neste servidor alterado para **${nome}**.` : "Nome do bot neste servidor resetado para o padrão.")],
      ephemeral: true,
    });
  }

  if (sub === "nome-comunidade") {
    const nome = interaction.options.getString("nome", true).trim();

    updateGuildConfig(interaction.guildId, (c) => {
      c.communityName = nome;
    });

    return interaction.reply({
      embeds: [successEmbed(`Nome da comunidade definido como **${nome}**. Ele já aparece nos próximos embeds públicos (sorteio, ticket, feedback, etc).`)],
      ephemeral: true,
    });
  }

  if (sub === "ia-chave") {
    return handleOpenAiKeyModal(interaction);
  }

  if (sub === "ia-contexto") {
    return handleOpenAiContextModal(interaction);
  }

  if (sub === "ia-ativar") {
    const estado = interaction.options.getString("estado", true);
    const aiEnabled = estado === "ativado";

    if (aiEnabled && !cfg.aiApiKey) {
      return interaction.reply({
        embeds: [errorEmbed("Configure a chave de API primeiro com `/config ia-chave` (ou pelo `/painel`) antes de ativar.")],
        ephemeral: true,
      });
    }

    updateGuildConfig(interaction.guildId, (c) => {
      c.aiEnabled = aiEnabled;
    });

    return interaction.reply({
      embeds: [
        successEmbed(
          aiEnabled
            ? "🤖 IA ativada! Ela vai responder as primeiras mensagens dos membros em tickets ainda não assumidos."
            : "✅ IA desativada. Os tickets voltam a usar só o aviso padrão de espera.",
        ),
      ],
      ephemeral: true,
    });
  }

  if (sub === "texto-painel" || sub === "texto-mensagem") {
    const tipo = interaction.options.getString("tipo", true);
    return handleOpenTextModal(interaction, tipo);
  }

  if (sub === "texto-ver") {
    return interaction.reply({
      embeds: [buildTextListEmbed(cfg, "painel"), buildTextListEmbed(cfg, "mensagem")],
      ephemeral: true,
    });
  }
}
