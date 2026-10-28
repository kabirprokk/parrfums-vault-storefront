import assert from "node:assert/strict";
import { sendOrderEmail } from "../supabase/functions/_shared/order-email.mjs";

const uid = "00000000-0000-4000-8000-000000000001";
const oid = "00000000-0000-4000-8000-000000000002";
const envValues = {
  SUPABASE_URL: "https://db.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  RESEND_API_KEY: "resend-test",
  ORDER_EMAIL_FROM: "Parrfums Vault <orders@example.invalid>",
  ORDER_EMAIL_REPLY_TO: "quillsandcologne@gmail.com",
  SITE_URL: "https://parrfumsvault.in",
};
const env = (key) => envValues[key];
let paymentStatus = "unpaid",
  sent;
const fetcher = async (url, options = {}) => {
  if (url.includes("/rest/v1/customer_orders?")) {
    if (url.includes("user_id=eq."))
      assert.match(url, new RegExp(`user_id=eq\\.${uid}`));
    return Response.json([{
      id: oid,
      order_number: "PV-TEST",
      user_id: uid,
      recipient_name: "Kabir <script>",
      email: "buyer@example.invalid",
      phone: "9999999999",
      address_line1: "123 Test Road",
      address_line2: null,
      city: "Mumbai",
      state: "Maharashtra",
      postal_code: "400080",
      subtotal_inr: 750,
      shipping_inr: 100,
      discount_inr: 0,
      total_inr: 850,
      payment_status: paymentStatus,
    }]);
  }
  if (url.includes("/rest/v1/customer_order_items?"))
    return Response.json([{
      item_name: "Angel Share",
      size_ml: 50,
      quantity: 1,
      line_total_inr: 750,
    }]);
  if (url === "https://api.resend.com/emails") {
    sent = { options, body: JSON.parse(options.body) };
    return Response.json({ id: "email-test" });
  }
  throw Error("Unexpected URL " + url);
};

assert.equal(await sendOrderEmail({
  env: () => undefined,
  fetcher,
  orderId: oid,
  event: "placed",
  userId: uid,
}), false, "missing Resend credentials safely disables mail");

assert.equal(await sendOrderEmail({ env, fetcher, orderId: oid, event: "placed", userId: uid }), true);
assert.deepEqual(sent.body.to, ["buyer@example.invalid"]);
assert.equal(sent.body.reply_to, "quillsandcologne@gmail.com");
assert.match(sent.body.subject, /payment pending/i);
assert.equal(sent.body.template.id, "parrfums-vault-order-and-payment-updates");
assert.match(sent.body.template.variables.ITEM_ROWS, /Angel Share/);
assert.match(sent.body.template.variables.CUSTOMER_NAME, /&lt;script&gt;/);
assert.match(sent.body.template.variables.ITEM_ROWS_TEXT, /Angel Share/);
assert.equal(sent.body.template.variables.TOTAL, "₹850");
assert.equal(sent.options.headers["Idempotency-Key"], `pv-placed-${oid}`);

sent = undefined;
await assert.rejects(
  sendOrderEmail({ env, fetcher, orderId: oid, event: "paid" }),
  /ORDER_EMAIL_NOT_PAID/,
);
assert.equal(sent, undefined, "unpaid orders never receive a payment receipt");
paymentStatus = "paid";
assert.equal(await sendOrderEmail({ env, fetcher, orderId: oid, event: "paid" }), true);
assert.match(sent.body.subject, /Payment received/);
assert.equal(sent.body.template.variables.EVENT_TITLE, "Payment received");
assert.equal(sent.body.template.variables.PAYMENT_STATUS, "Paid");
assert.equal(sent.options.headers["Idempotency-Key"], `pv-paid-${oid}`);
console.log("PASS: order email ownership scope, unpaid order receipt, verified-paid gating, escaping, idempotency and missing-provider behavior.");
