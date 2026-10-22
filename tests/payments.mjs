import assert from "node:assert/strict";
import {
  hmac,
  constantTimeEqual,
  paymentState,
  paymentProvider,
} from "../supabase/functions/_shared/payment-provider.mjs";
import { createPaymentHandler } from "../supabase/functions/_shared/payment-handler.mjs";
const settings = {
  SUPABASE_URL: "https://database.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "unit-test-service-only",
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "unit-public",
  RAZORPAY_KEY_SECRET: "unit-secret",
  RAZORPAY_WEBHOOK_SECRET: "unit-webhook",
  ALLOWED_ORIGINS: "https://store.example.invalid",
};
const env = (k) => settings[k];
const uid = "00000000-0000-4000-8000-000000000001",
  oid = "00000000-0000-4000-8000-000000000002";
const captured = {
  id: "pay_UNIT",
  order_id: "order_UNIT",
  amount: 85000,
  amount_refunded: 0,
  currency: "INR",
  status: "captured",
};
const signature = await hmac(
  settings.RAZORPAY_KEY_SECRET,
  "order_UNIT|pay_UNIT",
);
assert.equal(signature.length, 64);
assert.equal(constantTimeEqual(signature, signature), true);
assert.equal(constantTimeEqual(signature, "bad"), false);
assert.equal(constantTimeEqual(signature, "0".repeat(64)), false);
for (const [state, wanted] of [
  ["created", "pending"],
  ["authorized", "processing"],
  ["captured", "paid"],
  ["failed", "failed"],
  ["cancelled", "cancelled"],
])
  assert.equal(paymentState({ ...captured, status: state }).status, wanted);
assert.equal(
  paymentState({ ...captured, amount_refunded: 1 }).status,
  "partially_refunded",
);
assert.equal(
  paymentState({ ...captured, amount_refunded: 85000 }).status,
  "refunded",
);
for (const patch of [
  { amount: 0 },
  { amount: -1 },
  { amount_refunded: 85001 },
  { status: "invented" },
])
  assert.throws(() => paymentState({ ...captured, ...patch }));
assert.equal(
  paymentProvider(() => ""),
  null,
);
const req = (body, headers = {}) =>
  new Request("https://function.example.invalid", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer unit-auth",
      origin: "https://store.example.invalid",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
let calls = [],
  saved = [],
  seen = new Set(),
  state = { ...captured },
  authValid = true,
  owns = true,
  bound = true;
const fetcher = async (url, options = {}) => {
  calls.push(url);
  const json = (v) => new Response(JSON.stringify(v), { status: 200 });
  if (url.endsWith("/auth/v1/user"))
    return authValid ? json({ id: uid }) : new Response("", { status: 401 });
  if (url.includes("/customer_orders?"))
    return json(owns ? [{ id: oid, total_inr: 850 }] : []);
  if (url.includes("/payment_attempts?"))
    return json(bound ? [{ id: uid }] : []);
  if (url.includes("api.razorpay.com/v1/payments/")) return json(state);
  if (url.endsWith("/rpc/record_verified_payment")) {
    const event = JSON.parse(options.body);
    const duplicate = seen.has(event.p_event_id);
    seen.add(event.p_event_id);
    saved.push(event);
    return json({ duplicate, status: event.p_status });
  }
  if (url.endsWith("/rpc/begin_payment_attempt"))
    return json({
      id: uid,
      order_id: oid,
      provider_order_id: "order_UNIT",
      amount_paise: 85000,
    });
  throw Error("Unexpected URL " + url);
};
const handler = createPaymentHandler({ env, fetcher });
const verify = {
  action: "verify",
  order_id: oid,
  provider_order_id: "order_UNIT",
  payment_id: "pay_UNIT",
  signature,
};
assert.equal(
  (await createPaymentHandler({ env: () => "", fetcher })(req({}))).status,
  403,
);
assert.equal(
  (await handler(req({}, { origin: "https://evil.example.invalid" }))).status,
  403,
);
assert.equal((await handler(req(verify, { authorization: "" }))).status, 401);
authValid = false;
assert.equal((await handler(req(verify))).status, 401);
authValid = true;
assert.equal(
  (await handler(req({ ...verify, signature: "forged" }))).status,
  401,
);
assert.equal(saved.length, 0);
owns = false;
assert.equal((await handler(req(verify))).status, 404);
owns = true;
bound = false;
assert.equal((await handler(req(verify))).status, 404);
bound = true;
state.amount = 1;
assert.equal((await handler(req(verify))).status, 409);
state = { ...captured };
state.status = "authorized";
assert.equal((await handler(req(verify))).status, 200);
assert.equal(
  saved.at(-1).p_status,
  "processing",
  "Valid frontend signature alone cannot mark an uncaptured payment paid",
);
state = { ...captured };
assert.equal((await handler(req(verify))).status, 200);
assert.equal(saved.at(-1).p_status, "paid");
assert.equal(
  (await handler(req({ ...verify, action: "initiate", request_key: uid })))
    .status,
  200,
);
const webhook = createPaymentHandler({ env, fetcher, webhook: true });
const raw = JSON.stringify({
  payload: {
    payment: { entity: { id: "pay_UNIT", amount: 1, status: "captured" } },
  },
});
const signed = await hmac(settings.RAZORPAY_WEBHOOK_SECRET, raw);
assert.equal(
  (await webhook(req(raw, { "x-razorpay-signature": "fake" }))).status,
  401,
);
const headers = {
  "x-razorpay-signature": signed,
  "x-razorpay-event-id": "unit-event",
};
assert.equal((await webhook(req(raw, headers))).status, 200);
assert.equal(
  saved.at(-1).p_amount_paise,
  85000,
  "Webhook body prices are ignored; provider API is authoritative",
);
assert.equal((await (await webhook(req(raw, headers))).json()).duplicate, true);
assert.equal((await webhook(req(raw + " ", headers))).status, 401);
assert.equal((await handler(req("invalid json"))).status, 400);
assert.equal((await handler(req("x".repeat(17000)))).status, 400);
const unavailable = createPaymentHandler({
  env,
  fetcher: async () => {
    throw Error("network failure");
  },
});
assert.equal((await unavailable(req(verify))).status, 503);
console.log(
  "PASS: provider state mapping, HMAC, origin/auth/ownership, amount binding, uncaptured payments, verified provider reads, signed webhook, duplicate delivery, tampered body, bounded input and network failure. All provider responses are isolated test fixtures.",
);
