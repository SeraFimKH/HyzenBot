import { config } from "../config.js";
import { generateReply } from "../services/openai.js";

export function defaultSystemPrompt(communityName) {
  return `Você é o assistente de atendimento automático do servidor Discord "${communityName}". Responda de forma breve, educada e útil às dúvidas do membro enquanto a equipe humana ainda não assumiu o ticket. Se não tiver certeza da resposta, ou se o assunto exigir uma decisão humana (preços, pagamentos, disputas, prazos, etc.), diga claramente que vai aguardar um atendente confirmar. Nunca invente informações, políticas, preços ou prazos que você não tem certeza.`;
}

function resolveApiKey(cfg) {
  return cfg.aiApiKey || config.openaiApiKey || null;
}

/**
 * Gera uma resposta automática pra mensagem do membro no ticket ainda não assumido.
 * Usa só a mensagem atual (não o histórico do canal) — mantém simples e barato;
 * retorna null se a IA não estiver configurada/habilitada ou se a chamada falhar
 * (o chamador deve cair pro texto padrão de "aguarde" nesse caso).
 */
export async function generateTicketAiReply(message, ticket, cfg) {
  if (!cfg.aiEnabled) return null;

  const apiKey = resolveApiKey(cfg);
  if (!apiKey) return null;

  const systemPrompt = cfg.aiSystemPrompt || defaultSystemPrompt(cfg.communityName);
  const contextLine = ticket.type ? `\n\nTipo de suporte selecionado pelo membro: ${ticket.type}.` : "";

  try {
    return await generateReply({
      apiKey,
      baseUrl: cfg.aiBaseUrl || undefined,
      model: cfg.aiModel || undefined,
      systemPrompt: systemPrompt + contextLine,
      messages: [{ role: "user", content: message.content }],
    });
  } catch (err) {
    console.error("[ticketAi] Falha ao gerar resposta da IA:", err.message);
    return null;
  }
}
