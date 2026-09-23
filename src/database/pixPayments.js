import { JsonStore } from "./jsonStore.js";

const store = new JsonStore("pixPayments.json", {});

export function getPayment(paymentId) {
  return store.get(paymentId) || null;
}

export function setPayment(paymentId, payment) {
  store.set(paymentId, payment);
  return payment;
}

export function updatePayment(paymentId, mutator) {
  const payment = getPayment(paymentId);
  if (!payment) return null;
  mutator(payment);
  store.set(paymentId, payment);
  return payment;
}

export function allPendingPayments() {
  return Object.entries(store.all()).filter(([, p]) => p.status === "pending");
}
