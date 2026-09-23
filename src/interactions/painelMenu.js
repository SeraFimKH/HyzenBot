import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { baseEmbed } from "../utils/embeds.js";
import { buildMainPanel, findCategory } from "../utils/painelView.js";
import { publishTicketPanel } from "../utils/ticketPanel.js";
import { addTicketType, removeTicketTypes, MAX_TYPES } from "../utils/ticketTypes.js";
import { handleOpenMpTokenModal } from "./pixButtons.js";
import { handleOpenRulesModal } from "./rulesModal.js";
import { publishRules } from "../utils/rulesPanel.js";
import { handleOpenAiKeyModal, handleOpenAiContextModal, buildAiToggleView } from "./aiConfig.js";
import { handleOpenTextModal } from "./textConfig.js";

const CHANNEL_TIPO_LABELS = {
  ticket: "🎫 Canal de Ticket",
  feedback: "⭐ Canal de Feedback",
  changelog: "📑 Canal de Changelog",
  sorteio: "🎉 Canal de Sorteio",
  ticketLog: "📋 Canal de Logs de Ticket",
  paymentLog: "💰 Canal de Logs de Pagamento",
  commands: "💬 Canal de Comandos",
  rules: "📜 Canal de Regras",
  categoria: "🗂️ Categoria de Ticket",
  sorteioResultado: "🏆 Canal de Resultado de Sorteio",
  banLog: "🔨 Canal de Logs de Banimento",
  muteLog: "🔇 Canal de Logs de Mute",
  warnLog: "⚠️ Canal de Logs de Advertência",
  winLog: "🏆 Canal de Logs de Vitória",
};

const CARGO_TIPO_LABELS = {
  admin: "🛡️ Cargos Administradores",
  staff: "🙋 Cargos Staff",
  verificado: "✅ Cargo de Verificado",
  anuncio: "🔔 Cargo de Menção em Anúncios",
};

function backButton() {
  return new ButtonBuilder().setCustomId("painel_back").setLabel("⬅️ Voltar ao painel").setStyle(ButtonStyle.Secondary);
}

function backRow() {
  return new ActionRowBuilder().addComponents(backButton());
}

function buildCategoryView(categoryId) {
  const category = findCategory(categoryId);

  const select = new StringSelectMenuBuilder()
    .setCustomId("painel_menu")
    .setPlaceholder("O que você quer configurar?")
    .addOptions(category.options);

  return {
    embeds: [baseEmbed().setTitle(`${category.emoji} ${category.label}`).setDescription(category.description)],
    components: [new ActionRowBuilder().addComponents(select), backRow()],
  };
}

export async function handleCategorySelect(interaction) {
  return interaction.update(buildCategoryView(interaction.values[0]));
}

function buildChannelSelectView(tipo, cfg) {
  const isCategoria = tipo === "categoria";
  const currentId = isCategoria ? cfg.ticketCategoryId : cfg.channels[tipo];

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`painel_channel_${tipo}`)
    .addChannelTypes(isCategoria ? ChannelType.GuildCategory : ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder("Selecione um canal...");

  if (currentId) menu.setDefaultChannels(currentId);

  return {
    embeds: [baseEmbed().setTitle(CHANNEL_TIPO_LABELS[tipo]).setDescription("Selecione o canal abaixo. A configuração é salva assim que você escolher.")],
    components: [new ActionRowBuilder().addComponents(menu), backRow()],
  };
}

function buildRoleSelectView(tipo, cfg) {
  const isSingleSelect = tipo === "verificado" || tipo === "anuncio";
  const currentIds =
    tipo === "verificado"
      ? cfg.verifiedRoleId
        ? [cfg.verifiedRoleId]
        : []
      : tipo === "anuncio"
        ? cfg.announcePingRoleId
          ? [cfg.announcePingRoleId]
          : []
        : tipo === "admin"
          ? cfg.adminRoles
          : cfg.staffRoles;

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`painel_role_${tipo}`)
    .setMinValues(0)
    .setMaxValues(isSingleSelect ? 1 : 25)
    .setPlaceholder(isSingleSelect ? "Selecione um cargo..." : "Selecione um ou mais cargos...");

  if (currentIds.length) menu.setDefaultRoles(currentIds);

  const descriptions = {
    verificado: 'Selecione o cargo que será dado a quem clicar em "Aceitar" nas regras. Configure as permissões desse cargo no Discord pra liberar os canais que quiser.',
    anuncio: "Selecione o cargo mencionado quando um sorteio, enquete ou aviso é publicado. Escolha o cargo @everyone pra marcar todo mundo. Deixe vazio pra não marcar ninguém.",
  };

  return {
    embeds: [
      baseEmbed()
        .setTitle(CARGO_TIPO_LABELS[tipo])
        .setDescription(descriptions[tipo] || "Selecione todos os cargos que devem ter essa permissão (a seleção substitui a lista atual). Deixe vazio para remover todos."),
    ],
    components: [new ActionRowBuilder().addComponents(menu), backRow()],
  };
}

function buildTipoTicketView(cfg) {
  const embed = baseEmbed()
    .setTitle("🗂️ Tipos de Suporte")
    .setDescription(
      cfg.ticketTypes.length
        ? `Ao clicar em "Abrir Ticket", o membro escolhe um destes tipos:\n\n${cfg.ticketTypes.map((t, i) => `${i + 1}. ${t.emoji || "•"} ${t.label}`).join("\n")}`
        : "Nenhum tipo cadastrado ainda — o ticket é criado direto, sem perguntar o tipo. Use o botão abaixo para adicionar (ex: Compra, Venda, Bug).",
    );

  const components = [];

  if (cfg.ticketTypes.length) {
    const removeMenu = new StringSelectMenuBuilder()
      .setCustomId("painel_tipoticket_remover")
      .setPlaceholder("Selecione tipo(s) para remover...")
      .setMinValues(0)
      .setMaxValues(cfg.ticketTypes.length)
      .addOptions(cfg.ticketTypes.map((t) => ({ label: t.label, value: t.label, emoji: t.emoji || undefined })));
    components.push(new ActionRowBuilder().addComponents(removeMenu));
  }

  const addButton = new ButtonBuilder()
    .setCustomId("painel_tipoticket_add")
    .setLabel("➕ Adicionar tipo")
    .setStyle(ButtonStyle.Success)
    .setDisabled(cfg.ticketTypes.length >= MAX_TYPES);

  components.push(new ActionRowBuilder().addComponents(addButton, backButton()));

  return { embeds: [embed], components };
}

function buildPixTestToggleView(cfg) {
  const embed = baseEmbed()
    .setTitle("🧪 Modo Teste do Pix")
    .setDescription(
      `Estado atual: ${cfg.pixTestMode ? "🧪 **Ativado** (cobranças falsas, sem usar o Mercado Pago real)" : "✅ **Desativado** (usa o Mercado Pago real, se o token estiver configurado)"}\n\n` +
        "Enquanto não houver um token do Mercado Pago configurado, o `/pix` já funciona em modo teste automaticamente — esse botão força o modo teste mesmo com o token configurado, útil pra testar sem gerar cobranças reais.",
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("painel_pixtest_on").setLabel("🧪 Ativar Modo Teste").setStyle(ButtonStyle.Secondary).setDisabled(cfg.pixTestMode),
    new ButtonBuilder().setCustomId("painel_pixtest_off").setLabel("✅ Desativar Modo Teste").setStyle(ButtonStyle.Secondary).setDisabled(!cfg.pixTestMode),
  );

  return { embeds: [embed], components: [row, backRow()] };
}

function buildAiToggleFullView(cfg) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("painel_ia_on")
      .setLabel("🤖 Ativar IA")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(cfg.aiEnabled || !cfg.aiApiKey),
    new ButtonBuilder().setCustomId("painel_ia_off").setLabel("⚪ Desativar IA").setStyle(ButtonStyle.Secondary).setDisabled(!cfg.aiEnabled),
  );

  return { embeds: [buildAiToggleView(cfg)], components: [row, backRow()] };
}

export async function handleAiToggle(interaction) {
  const aiEnabled = interaction.customId === "painel_ia_on";
  const cfg = getGuildConfig(interaction.guildId);

  if (aiEnabled && !cfg.aiApiKey) {
    return interaction.reply({
      embeds: [baseEmbed().setColor(0xed4245).setDescription('❌ Configure a chave de API primeiro ("🔑 Chave de API da IA").')],
      ephemeral: true,
    });
  }

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    c.aiEnabled = aiEnabled;
  });
  await interaction.update(buildAiToggleFullView(updated));
}

async function handleOpenSorteioMaxModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  const modal = new ModalBuilder().setCustomId("sorteio_max_modal").setTitle("Máx. de Entradas por Sorteio");

  const quantidadeInput = new TextInputBuilder()
    .setCustomId("quantidade")
    .setLabel("Máximo de entradas por membro (padrão)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Atual: ${cfg.raffleDefaultMaxEntries}`)
    .setMaxLength(3)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(quantidadeInput));

  await interaction.showModal(modal);
}

export async function handleSorteioMaxModalSubmit(interaction) {
  const quantidade = Number(interaction.fields.getTextInputValue("quantidade").trim());

  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return interaction.reply({
      embeds: [baseEmbed().setColor(0xed4245).setDescription("❌ Informe um número inteiro maior ou igual a 1.")],
      ephemeral: true,
    });
  }

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.raffleDefaultMaxEntries = quantidade;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(cfg));
  }

  return interaction.reply({
    embeds: [baseEmbed().setDescription(`✅ Máximo de entradas por membro definido como **${quantidade}**.`)],
    ephemeral: true,
  });
}

async function handleOpenSorteioPrecoModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  const modal = new ModalBuilder().setCustomId("sorteio_preco_modal").setTitle("Preço Padrão do Sorteio");

  const valorInput = new TextInputBuilder()
    .setCustomId("valor")
    .setLabel("Valor da entrada em R$ (0 = gratuito)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.raffleDefaultEntryPrice > 0 ? `Atual: ${cfg.raffleDefaultEntryPrice}` : "Atual: gratuito (0)")
    .setMaxLength(12)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(valorInput));

  await interaction.showModal(modal);
}

function parseValorSorteio(raw) {
  const trimmed = raw.trim();
  if (trimmed.includes(",")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return Number(trimmed);
}

export async function handleSorteioPrecoModalSubmit(interaction) {
  const valor = parseValorSorteio(interaction.fields.getTextInputValue("valor"));

  if (!Number.isFinite(valor) || valor < 0) {
    return interaction.reply({
      embeds: [baseEmbed().setColor(0xed4245).setDescription("❌ Valor inválido. Use um número maior ou igual a 0, ex: 9,90.")],
      ephemeral: true,
    });
  }

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.raffleDefaultEntryPrice = valor > 0 ? valor : null;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(cfg));
  }

  return interaction.reply({
    embeds: [
      baseEmbed().setDescription(
        valor > 0 ? `✅ Sorteios agora são pagos por padrão (R$ ${valor.toFixed(2).replace(".", ",")}).` : "✅ Sorteios agora são gratuitos por padrão.",
      ),
    ],
    ephemeral: true,
  });
}

async function handleOpenBotNomeModal(interaction) {
  const modal = new ModalBuilder().setCustomId("bot_nome_modal").setTitle("Nome do Bot no Servidor");

  const nomeInput = new TextInputBuilder()
    .setCustomId("nome")
    .setLabel("Novo nome (deixe vazio para resetar)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(interaction.guild.members.me.nickname || interaction.client.user.username)
    .setMaxLength(32)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(nomeInput));

  await interaction.showModal(modal);
}

export async function handleBotNomeModalSubmit(interaction) {
  const nome = interaction.fields.getTextInputValue("nome").trim();

  try {
    await interaction.guild.members.me.setNickname(nome || null);
  } catch (err) {
    console.error("[painelMenu] Falha ao mudar o nome do bot:", err);
    return interaction.reply({
      embeds: [baseEmbed().setColor(0xed4245).setDescription('❌ Não consegui mudar o nome do bot. Verifique se ele tem a permissão "Alterar apelido".')],
      ephemeral: true,
    });
  }

  const cfg = getGuildConfig(interaction.guildId);
  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(cfg));
  }

  return interaction.reply({
    embeds: [baseEmbed().setDescription(nome ? `✅ Nome do bot alterado para **${nome}**.` : "✅ Nome do bot resetado para o padrão.")],
    ephemeral: true,
  });
}

async function handleOpenNomeComunidadeModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  const modal = new ModalBuilder().setCustomId("nome_comunidade_modal").setTitle("Nome da Comunidade");

  const nomeInput = new TextInputBuilder()
    .setCustomId("nome")
    .setLabel("Nome usado nos embeds públicos do bot")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Atual: ${cfg.communityName}`)
    .setMaxLength(50)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(nomeInput));

  await interaction.showModal(modal);
}

export async function handleNomeComunidadeModalSubmit(interaction) {
  const nome = interaction.fields.getTextInputValue("nome").trim();

  if (!nome) {
    return interaction.reply({
      embeds: [baseEmbed().setColor(0xed4245).setDescription("❌ Informe um nome.")],
      ephemeral: true,
    });
  }

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.communityName = nome;
  });

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(cfg));
  }

  return interaction.reply({
    embeds: [baseEmbed().setDescription(`✅ Nome da comunidade definido como **${nome}**.`)],
    ephemeral: true,
  });
}

async function handleOpenServerIpModal(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  const modal = new ModalBuilder().setCustomId("server_ip_modal").setTitle("Endereço do Servidor");

  const ipInput = new TextInputBuilder()
    .setCustomId("ip")
    .setLabel("IP usado pelo /ip e detector de chat")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.serverIp || "play.hyzennetwork.com")
    .setMaxLength(100)
    .setRequired(true);

  const portInput = new TextInputBuilder()
    .setCustomId("porta")
    .setLabel("Porta (deixe vazio para não mostrar)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(cfg.serverPort ? String(cfg.serverPort) : "19132")
    .setMaxLength(5)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(ipInput), new ActionRowBuilder().addComponents(portInput));

  await interaction.showModal(modal);
}

export async function handleServerIpModalSubmit(interaction) {
  const ip = interaction.fields.getTextInputValue("ip").trim();
  const portaRaw = interaction.fields.getTextInputValue("porta").trim();

  if (!ip) {
    return interaction.reply({
      embeds: [baseEmbed().setColor(0xed4245).setDescription("❌ Informe um IP.")],
      ephemeral: true,
    });
  }

  let porta = null;
  if (portaRaw) {
    const parsed = Number(portaRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return interaction.reply({
        embeds: [baseEmbed().setColor(0xed4245).setDescription("❌ Porta inválida — informe um número entre 1 e 65535, ou deixe vazio.")],
        ephemeral: true,
      });
    }
    porta = parsed;
  }

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.serverIp = ip;
    c.serverPort = porta;
  });

  const enderecoTexto = porta ? `${ip}:${porta}` : ip;

  if (interaction.isFromMessage()) {
    return interaction.update(buildMainPanel(cfg));
  }

  return interaction.reply({
    embeds: [baseEmbed().setDescription(`✅ Endereço do servidor definido como **${enderecoTexto}**.`)],
    ephemeral: true,
  });
}

export async function handleMenuSelect(interaction) {
  const value = interaction.values[0];
  const cfg = getGuildConfig(interaction.guildId);

  if (value.startsWith("canal_")) {
    const tipo = value.replace("canal_", "");
    return interaction.update(buildChannelSelectView(tipo, cfg));
  }

  if (value === "categoria_ticket") {
    return interaction.update(buildChannelSelectView("categoria", cfg));
  }

  if (value.startsWith("cargo_")) {
    const tipo = value.replace("cargo_", "");
    return interaction.update(buildRoleSelectView(tipo, cfg));
  }

  if (value === "tipos_ticket") {
    return interaction.update(buildTipoTicketView(cfg));
  }

  if (value === "pagamento_mp") {
    return handleOpenMpTokenModal(interaction);
  }

  if (value === "teste_pix_toggle") {
    return interaction.update(buildPixTestToggleView(cfg));
  }

  if (value === "sorteio_max_entradas") {
    return handleOpenSorteioMaxModal(interaction);
  }

  if (value === "sorteio_preco_padrao") {
    return handleOpenSorteioPrecoModal(interaction);
  }

  if (value === "bot_nome") {
    return handleOpenBotNomeModal(interaction);
  }

  if (value === "ia_chave") {
    return handleOpenAiKeyModal(interaction);
  }

  if (value === "ia_contexto") {
    return handleOpenAiContextModal(interaction);
  }

  if (value === "ia_toggle") {
    return interaction.update(buildAiToggleFullView(cfg));
  }

  if (value === "nome_comunidade") {
    return handleOpenNomeComunidadeModal(interaction);
  }

  if (value === "server_ip") {
    return handleOpenServerIpModal(interaction);
  }

  if (value.startsWith("texto_")) {
    return handleOpenTextModal(interaction, value.replace("texto_", ""));
  }

  if (value === "editar_regras") {
    return handleOpenRulesModal(interaction, "rules");
  }

  if (value === "editar_termos") {
    return handleOpenRulesModal(interaction, "terms");
  }

  if (value === "publicar_painel") {
    const result = await publishTicketPanel(interaction.guild, cfg);
    const embed = result.ok
      ? baseEmbed().setDescription(`✅ Painel de tickets publicado em ${result.channel}.`)
      : baseEmbed().setColor(0xed4245).setDescription(`❌ ${result.reason}`);

    return interaction.update({ embeds: [embed], components: [backRow()] });
  }

  if (value === "publicar_regras") {
    const result = await publishRules(interaction.guild, cfg);
    const embed = result.ok
      ? baseEmbed().setDescription(`✅ Diretrizes publicadas em ${result.channel}.`)
      : baseEmbed().setColor(0xed4245).setDescription(`❌ ${result.reason}`);

    return interaction.update({ embeds: [embed], components: [backRow()] });
  }
}

export async function handleChannelSelect(interaction) {
  const tipo = interaction.customId.replace("painel_channel_", "");
  const channelId = interaction.values[0];

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    if (tipo === "categoria") {
      c.ticketCategoryId = channelId;
    } else {
      c.channels[tipo] = channelId;
    }
  });

  await interaction.update(buildMainPanel(cfg));
}

export async function handleRoleSelect(interaction) {
  const tipo = interaction.customId.replace("painel_role_", "");
  const roleIds = interaction.values;

  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    if (tipo === "admin") {
      c.adminRoles = roleIds;
    } else if (tipo === "staff") {
      c.staffRoles = roleIds;
    } else if (tipo === "verificado") {
      c.verifiedRoleId = roleIds[0] || null;
    } else if (tipo === "anuncio") {
      c.announcePingRoleId = roleIds[0] || null;
    }
  });

  await interaction.update(buildMainPanel(cfg));
}

export async function handlePixTestToggle(interaction) {
  const pixTestMode = interaction.customId === "painel_pixtest_on";
  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    c.pixTestMode = pixTestMode;
  });
  await interaction.update(buildPixTestToggleView(cfg));
}

export async function handleBack(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  await interaction.update(buildMainPanel(cfg));
}

export async function handleTipoTicketRemoveSelect(interaction) {
  const labels = interaction.values;
  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    if (labels.length) removeTicketTypes(c, labels);
  });
  await interaction.update(buildTipoTicketView(cfg));
}

export async function handleTipoTicketAddButton(interaction) {
  const modal = new ModalBuilder().setCustomId("painel_tipoticket_add_modal").setTitle("Adicionar Tipo de Suporte");

  const nomeInput = new TextInputBuilder()
    .setCustomId("nome")
    .setLabel("Nome (ex: Compra, Bug, Venda)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setRequired(true);

  const emojiInput = new TextInputBuilder()
    .setCustomId("emoji")
    .setLabel("Emoji (opcional)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(8)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nomeInput),
    new ActionRowBuilder().addComponents(emojiInput),
  );

  await interaction.showModal(modal);
}

export async function handleTipoTicketAddModal(interaction) {
  const nome = interaction.fields.getTextInputValue("nome").trim();
  const emoji = interaction.fields.getTextInputValue("emoji").trim();

  let result;
  const cfg = updateGuildConfig(interaction.guildId, (c) => {
    result = addTicketType(c, nome, emoji);
  });

  if (!interaction.isFromMessage()) {
    return interaction.reply({ embeds: [baseEmbed().setDescription(result.ok ? "✅ Tipo adicionado! Abra `/painel` de novo para ver a lista." : `❌ ${result.reason}`)], ephemeral: true });
  }

  if (!result.ok) {
    return interaction.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription(`❌ ${result.reason}`)], ephemeral: true });
  }

  await interaction.update(buildTipoTicketView(cfg));
}
