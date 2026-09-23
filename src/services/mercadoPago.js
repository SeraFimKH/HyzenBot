import crypto from "crypto";

const API_BASE = "https://api.mercadopago.com";

// Mercado Pago exige um e-mail no payer, mas não precisa ser uma caixa real
// pra criar uma cobrança Pix via API — só precisa ter formato válido.
const PLACEHOLDER_PAYER_EMAIL = "pagamentos@hyzennetwork.gg";

function assertToken(accessToken) {
  if (!accessToken) {
    const err = new Error("Token do Mercado Pago não configurado.");
    err.notConfigured = true;
    throw err;
  }
}

async function mpFetch(accessToken, path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.message || body?.cause?.[0]?.description || `Erro HTTP ${res.status}`;
    const err = new Error(`Mercado Pago: ${message}`);
    err.mpResponse = body;
    throw err;
  }

  return body;
}

export async function createPixPayment({ accessToken, amount, description, expiresInMinutes = 30 }) {
  assertToken(accessToken);

  const expirationDate = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const body = await mpFetch(accessToken, "/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      transaction_amount: Math.round(amount * 100) / 100,
      description: description || "Pagamento",
      payment_method_id: "pix",
      date_of_expiration: expirationDate.toISOString(),
      payer: { email: PLACEHOLDER_PAYER_EMAIL },
    }),
  });

  const txData = body.point_of_interaction?.transaction_data;
  if (!txData?.qr_code) {
    throw new Error("Mercado Pago não retornou o QR Code do Pix.");
  }

  return {
    id: String(body.id),
    status: body.status,
    qrCode: txData.qr_code,
    qrCodeBase64: txData.qr_code_base64,
    expiresAt: expirationDate.getTime(),
  };
}

export async function getPaymentStatus(paymentId, accessToken) {
  assertToken(accessToken);
  const body = await mpFetch(accessToken, `/v1/payments/${paymentId}`, { method: "GET" });
  return body.status; // pending | approved | rejected | cancelled | refunded | ...
}
