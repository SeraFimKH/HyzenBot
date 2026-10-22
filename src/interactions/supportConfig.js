import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, RoleSelectMenuBuilder, StringSelectMenuBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../database/guildConfig.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/permissions.js";
import { attendingRoles, isSupportConfigured, SupportPermission } from "../utils/supportPermissions.js";

// /painel → Suporte — Permissões: which roles attend the tickets, close them, charge Pix, and each support type's team.
export const MENU_PREFIX = "suporte_";
export const ROLE_SELECT_PREFIX = "suporte_role:";
export const TYPE_SELECT_ID = "suporte_tipo";
const TYPE_ROLE_PREFIX = "tipo:";
const MAX_ROLES = 25;

const ROLE_KINDS = {
  [SupportPermission.ATTEND]: {
    title: "🙋 Cargos que atendem os tickets",
    description:
      "Quem tem um destes cargos vê os tickets, responde, assume e cria canal de voz — sem precisar dos comandos de moderação.\n\n" +
      "Deixe vazio para continuar usando os **Cargos Staff**. Um tipo com equipe própria (Equipe por tipo de ticket) fica só com ela.",
  },
  [SupportPermission.CLOSE]: {
    title: "🔒 Cargos que podem fechar tickets",
    description: "Deixe vazio para quem atende o ticket poder fechar. Quem tiver um destes cargos também vê todos os tickets.",
  },
  [SupportPermission.PIX]: {
    title: "💳 Cargos que podem gerar Pix",
    description: "O botão Gerar Pix dos tickets e o /pix. Deixe vazio para quem atende o ticket poder gerar. Quem tiver um destes cargos também vê todos os tickets.",
  },
};

const mentions = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(", ") : null);

function backRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("painel_back").setLabel("⬅️ Voltar ao painel").setStyle(ButtonStyle.Secondary));
}

// Who can do what in the tickets right now, with where each answer comes from.
export function buildSupportSummaryEmbed(cfg) {
  const general = cfg.support.roles.atender;
  const attend = mentions(general) || (cfg.staffRoles.length ? `*(nenhum — usando os Cargos Staff: ${mentions(cfg.staffRoles)})*` : "*(nenhum — só os administradores)*");
  const own = (permission) => mentions(cfg.support.roles[permission]) || "*(os mesmos que atendem o ticket)*";

  const types = cfg.ticketTypes.length
    ? cfg.ticketTypes
        .map((type) => {
          const team = cfg.support.typeRoles[type.label] || [];
          return `${type.emoji || "•"} **${type.label}** → ${team.length ? mentions(team) : "*equipe geral*"}`;
        })
        .join("\n")
    : "*(nenhum tipo de suporte cadastrado — em Tickets → Tipos de Suporte)*";

  return baseEmbed(cfg.communityName)
    .setTitle("🎧 Permissões do Suporte")
    .setDescription(
      "Os **administradores** sempre podem tudo. Os **Cargos Staff** são da moderação (/ban, /mute, /kick, /warn)" +
        (isSupportConfigured(cfg) ? " e não entram nos tickets por isso." : " e, enquanto o suporte não tiver cargos, também atendem os tickets."),
    )
    .addFields(
      { name: "🙋 Atendem os tickets", value: `${attend}\n*veem, respondem, assumem e criam canal de voz*` },
      { name: "🔒 Podem fechar", value: own(SupportPermission.CLOSE), inline: true },
      { name: "💳 Podem gerar Pix", value: own(SupportPermission.PIX), inline: true },
      { name: "🗂️ Equipe por tipo de ticket", value: types.slice(0, 1024) },
    );
}

function buildSummaryView(cfg) {
  return { embeds: [buildSupportSummaryEmbed(cfg)], components: [backRow()] };
}

function buildRoleView(kind, title, description, currentIds) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`${ROLE_SELECT_PREFIX}${kind}`)
    .setMinValues(0)
    .setMaxValues(MAX_ROLES)
    .setPlaceholder("Selecione um ou mais cargos (vazio = remover todos)...");
  if (currentIds.length) menu.setDefaultRoles(currentIds.slice(0, MAX_ROLES));
  return {
    embeds: [baseEmbed().setTitle(title).setDescription(`${description}\n\nA seleção substitui a lista atual. Vale para os tickets abertos a partir de agora.`)],
    components: [new ActionRowBuilder().addComponents(menu), backRow()],
  };
}

function buildTypesView(cfg) {
  if (!cfg.ticketTypes.length) {
    return { embeds: [errorEmbed("Cadastre os tipos de suporte primeiro: `/painel` → Tickets → Tipos de Suporte.")], components: [backRow()] };
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(TYPE_SELECT_ID)
    .setPlaceholder("Escolha o tipo de ticket...")
    .addOptions(
      cfg.ticketTypes.map((type) => {
        const team = cfg.support.typeRoles[type.label] || [];
        return { label: type.label, value: type.label, emoji: type.emoji || undefined, description: team.length ? `Equipe própria: ${team.length} cargo(s)` : "Usa a equipe geral" };
      }),
    );
  return {
    embeds: [
      baseEmbed()
        .setTitle("🗂️ Equipe por tipo de ticket")
        .setDescription(
          "Escolha um tipo para definir a equipe dele — ex: **Compra** só para o cargo de Vendas.\n" +
            "Com equipe própria, só ela (e os administradores) vê os tickets desse tipo. Sem, vale a equipe geral.",
        ),
    ],
    components: [new ActionRowBuilder().addComponents(select), backRow()],
  };
}

// The options of the "Suporte — Permissões" category (see utils/painelView.js).
export async function handleSupportMenu(interaction, value) {
  const cfg = getGuildConfig(interaction.guildId);
  if (value === "suporte_resumo") return interaction.update(buildSummaryView(cfg));
  if (value === "suporte_tipos") return interaction.update(buildTypesView(cfg));
  const kind = value.slice(MENU_PREFIX.length);
  const view = ROLE_KINDS[kind];
  if (!view) return interaction.update(buildSummaryView(cfg));
  return interaction.update(buildRoleView(kind, view.title, view.description, cfg.support.roles[kind]));
}

export async function handleTypeSelect(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const label = interaction.values[0];
  const type = cfg.ticketTypes.find((t) => t.label === label);
  if (!type) return interaction.update(buildTypesView(cfg));
  const fallback = mentions(attendingRoles(cfg, null)) || "só os administradores";
  return interaction.update(
    buildRoleView(
      `${TYPE_ROLE_PREFIX}${label}`,
      `${type.emoji || "🗂️"} Equipe do tipo ${label}`,
      `Só estes cargos (e os administradores) vão ver e atender os tickets de **${label}**. Deixe vazio para o tipo usar a equipe geral (${fallback}).`,
      cfg.support.typeRoles[label] || [],
    ),
  );
}

export async function handleRoleSelect(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  if (!isAdmin(interaction.member, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("Só administradores mudam as permissões do suporte.")], flags: MessageFlags.Ephemeral });
  }
  const kind = interaction.customId.slice(ROLE_SELECT_PREFIX.length);
  const roleIds = interaction.values;

  const updated = updateGuildConfig(interaction.guildId, (c) => {
    if (kind.startsWith(TYPE_ROLE_PREFIX)) {
      const label = kind.slice(TYPE_ROLE_PREFIX.length);
      if (roleIds.length) {
        c.support.typeRoles[label] = roleIds;
      } else {
        delete c.support.typeRoles[label];
      }
    } else if (ROLE_KINDS[kind]) {
      c.support.roles[kind] = roleIds;
    }
  });
  await interaction.update(buildSummaryView(updated));
}
