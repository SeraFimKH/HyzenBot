const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

// Não é exclusivo da OpenAI de verdade — qualquer provedor com endpoint compatível com o formato
// "chat completions" da OpenAI funciona aqui (Groq, OpenRouter, DeepSeek, Together, um Ollama local, etc.),
// bastando trocar baseUrl + model em /config ia-chave (ou pelo /painel). O nome do arquivo ficou por histórico.
export async function generateReply({ apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL, systemPrompt, messages }) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 400,
      temperature: 0.4,
    }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.error?.message || `Erro HTTP ${res.status}`;
    throw new Error(`IA (${baseUrl}): ${message}`);
  }

  return body.choices?.[0]?.message?.content?.trim() || null;
}
