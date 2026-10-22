// Provider boundary. No browser assertions are accepted as payment evidence.
// Protocol references: https://razorpay.com/docs/webhooks/validate-test/
const encoder = new TextEncoder();
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function constantTimeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    !/^[a-f0-9]{64}$/i.test(a) ||
    !/^[a-f0-9]{64}$/i.test(b)
  )
    return false;
  let result = 0;
  for (let i = 0; i < 64; i++)
    result |= a.toLowerCase().charCodeAt(i) ^ b.toLowerCase().charCodeAt(i);
  return result === 0;
}
export function paymentState(payment) {
  const amount = payment.amount,
    refunded = payment.amount_refunded || 0;
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(refunded) ||
    refunded < 0 ||
    refunded > amount
  )
    throw new Error("INVALID_PROVIDER_RESPONSE");
  let status = {
    created: "pending",
    authorized: "processing",
    captured: "paid",
    failed: "failed",
    cancelled: "cancelled",
    refunded: "refunded",
  }[payment.status];
  if (!status) throw new Error("INVALID_PROVIDER_RESPONSE");
  if (refunded > 0)
    status = refunded === amount ? "refunded" : "partially_refunded";
  return {
    status,
    amount,
    currency: payment.currency,
    refunded,
    providerOrderId: payment.order_id,
    paymentId: payment.id,
  };
}
export function paymentProvider(env, fetcher = fetch) {
  const provider = env("PAYMENT_PROVIDER");
  const id = env("RAZORPAY_KEY_ID"),
    secret = env("RAZORPAY_KEY_SECRET"),
    webhookSecret = env("RAZORPAY_WEBHOOK_SECRET");
  if (provider !== "razorpay" || !id || !secret) return null;
  const request = async (path, method = "GET", body) => {
    const response = await fetcher("https://api.razorpay.com/v1/" + path, {
      method,
      headers: {
        Authorization: "Basic " + btoa(id + ":" + secret),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("PROVIDER_UNAVAILABLE");
    return response.json();
  };
  return {
    name: provider,
    publicKey: id,
    createOrder: (attempt) =>
      request("orders", "POST", {
        amount: Number(attempt.amount_paise),
        currency: "INR",
        receipt: attempt.id,
        notes: { store_order_id: attempt.order_id, attempt_id: attempt.id },
      }),
    fetchPayment: async (paymentId) => {
      if (!/^pay_[a-zA-Z0-9]+$/.test(paymentId))
        throw new Error("INVALID_PAYMENT_REFERENCE");
      return paymentState(
        await request("payments/" + encodeURIComponent(paymentId)),
      );
    },
    verifyCheckout: async (orderId, paymentId, signature) =>
      constantTimeEqual(
        await hmac(secret, orderId + "|" + paymentId),
        signature,
      ),
    verifyWebhook: async (body, signature) =>
      !!webhookSecret &&
      constantTimeEqual(await hmac(webhookSecret, body), signature),
  };
}
