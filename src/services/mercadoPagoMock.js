import crypto from "crypto";
import QRCode from "qrcode";

let counter = 0;

/**
 * Simula a API do Mercado Pago pra permitir testar o fluxo do /pix sem precisar
 * de credenciais reais. Usado automaticamente enquanto MERCADOPAGO_ACCESS_TOKEN
 * não estiver definido no .env — veja utils/pixCharge.js.
 */
export async function createPixPayment({ expiresInMinutes = 30 }) {
  counter += 1;
  const id = `TESTE-${Date.now()}-${counter}`;
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

  const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${crypto.randomUUID()}5204000053039865802BR5913HYZEN NETWORK TST6009SAO PAULO62070503***6304TEST`;
  const dataUrl = await QRCode.toDataURL(fakeCode, { margin: 1, width: 400 });
  const qrCodeBase64 = dataUrl.split(",")[1];

  return { id, status: "pending", qrCode: fakeCode, qrCodeBase64, expiresAt };
}

export async function getPaymentStatus() {
  // Modo teste: qualquer consulta de status já simula o pagamento como aprovado.
  return "approved";
}
