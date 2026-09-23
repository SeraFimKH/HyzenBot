export const TEXT_FIELDS = [
  // Títulos
  { key: "ticket_panel_titulo", label: "Título do painel de ticket", group: "painel", style: "Short", maxLength: 100 },
  { key: "ticket_panel_desc", label: "Descrição do painel de ticket", group: "painel", style: "Paragraph", maxLength: 500 },
  { key: "ticket_abrir_botao", label: 'Texto do botão "Abrir Ticket"', group: "painel", style: "Short", maxLength: 80 },
  { key: "sorteio_titulo", label: "Título do painel de sorteio", group: "painel", style: "Short", maxLength: 100 },
  { key: "sorteio_participar_botao", label: 'Texto do botão "Participar"', group: "painel", style: "Short", maxLength: 80 },
  { key: "regras_titulo", label: "Título das diretrizes", group: "painel", style: "Short", maxLength: 100 },
  { key: "termos_titulo", label: "Título do termo de uso", group: "painel", style: "Short", maxLength: 100 },
  { key: "feedback_titulo", label: "Título do log de feedback", group: "painel", style: "Short", maxLength: 100 },
  { key: "aviso_autor", label: "Autor do embed de aviso/changelog", group: "painel", style: "Short", maxLength: 100 },
  { key: "enquete_titulo", label: "Título da enquete", group: "painel", style: "Short", maxLength: 100 },
  { key: "pix_titulo", label: "Título da cobrança Pix", group: "painel", style: "Short", maxLength: 100 },

  // Mensagens
  { key: "ticket_boasvindas_aberto", label: "Boas-vindas do ticket (no horário)", group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "ticket_boasvindas_fechado", label: "Boas-vindas (fora do horário)", group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "ticket_autoreply_aberto", label: "Auto-resposta do ticket (no horário)", group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "ticket_autoreply_fechado", label: "Auto-resposta do ticket (fora do horário)", group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "ajuda_detector_msg", label: 'Mensagem quando escreve "ajuda"', group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "sorteio_status_aberto", label: 'Status "inscrições abertas"', group: "mensagem", style: "Short", maxLength: 150 },
  { key: "sorteio_anuncio_vencedor", label: "Anúncio do vencedor do sorteio", group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "sorteio_anuncio_sem_participantes", label: "Anúncio de sorteio sem participantes", group: "mensagem", style: "Paragraph", maxLength: 500 },
  { key: "sorteio_dm_vencedor_chave", label: "DM ao vencedor (prêmio chave)", group: "mensagem", style: "Paragraph", maxLength: 1000 },
  { key: "sorteio_dm_vencedor_fisico", label: "DM ao vencedor (prêmio físico)", group: "mensagem", style: "Paragraph", maxLength: 1000 },
  { key: "feedback_sucesso_msg", label: "Mensagem de agradecimento pelo feedback", group: "mensagem", style: "Paragraph", maxLength: 300 },
];

export const DEFAULT_TEXTS = {
  ticket_panel_titulo: "🎫 Central de Atendimento",
  ticket_panel_desc:
    "Precisa de ajuda ou tem alguma dúvida? Clique no botão abaixo para abrir um ticket e nossa equipe irá te atender!",
  ticket_abrir_botao: "Abrir Ticket",
  sorteio_titulo: "🎉 Sorteio {comunidade}",
  sorteio_participar_botao: "🎟️ Participar",
  regras_titulo: "📜 Diretrizes da Comunidade",
  termos_titulo: "📄 Termo de Uso",
  feedback_titulo: "⭐ Novo Feedback",
  aviso_autor: "📢 Novo Aviso — {comunidade}",
  enquete_titulo: "📊 Enquete {comunidade}",
  pix_titulo: "💳 Cobrança Pix — {comunidade}",

  ticket_boasvindas_aberto:
    "**Nossa equipe já foi notificada e vai te responder em breve.** Descreva sua dúvida ou problema com o máximo de detalhes possível.",
  ticket_boasvindas_fechado:
    "🌙 **No momento estamos fora do horário de atendimento.** Descreva sua dúvida com detalhes — assim que o expediente abrir, alguém da equipe vem te atender. Aguarde!",
  ticket_autoreply_aberto: "📥 Já recebemos sua mensagem! Um atendente ainda vai assumir seu ticket, por favor aguarde.",
  ticket_autoreply_fechado:
    "🌙 Já recebemos sua mensagem! No momento estamos fora do horário de atendimento — aguarde o expediente que alguém vem te atender.",
  ajuda_detector_msg: "Basta abrir um ticket para ter seu atendimento e tirar suas dúvidas em {canal}!",
  sorteio_status_aberto: "🟢 Inscrições abertas — clique em Participar!",
  sorteio_anuncio_vencedor: "🏆 O sorteio de **{jogo}** terminou! Parabéns {vencedor}, fale com um administrador para receber seu prêmio: **{premio}**.",
  sorteio_anuncio_sem_participantes: "😢 O sorteio de **{jogo}** terminou sem participantes.",
  sorteio_dm_vencedor_chave: "🏆 Parabéns! Você ganhou o sorteio de **{jogo}** ({premio}) na {comunidade}!\n\nSua chave: ```{chave}```",
  sorteio_dm_vencedor_fisico:
    "🏆 Parabéns! Você ganhou o sorteio de **{jogo}** ({premio}) na {comunidade}!\n\nSeu prêmio é físico — abra um ticket no servidor pra combinar a entrega com a staff.",
  feedback_sucesso_msg: "Obrigado pelo seu feedback! Ele foi enviado para nossa equipe.",
};

function renderText(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? vars[name] : match));
}

export function getText(cfg, key, vars = {}) {
  const template = cfg.texts?.[key] ?? DEFAULT_TEXTS[key];
  return renderText(template, { comunidade: cfg.communityName, ...vars });
}

export { renderText };
