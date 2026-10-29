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
  ORDER_NOTIFICATION_TO: "store@example.invalid",
  SITE_URL: "https://parrfumsvault.in",
};
const env = (key) => envValues[key];
let paymentStatus = "unpaid",
  sent = [];
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
    sent.push({ options, body: JSON.parse(options.body) });
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
const customerPlaced = sent.find(({ body }) => body.to[0] === "buyer@example.invalid");
const merchantPlaced = sent.find(({ body }) => body.to[0] === "store@example.invalid");
assert.ok(customerPlaced);
assert.ok(merchantPlaced);
assert.equal(customerPlaced.body.reply_to, "quillsandcologne@gmail.com");
assert.match(customerPlaced.body.subject, /payment pending/i);
assert.equal(merchantPlaced.body.template.id, "parrfums-vault-order-and-payment-updates");
assert.match(merchantPlaced.body.template.variables.ITEM_ROWS, /Angel Share/);
assert.match(merchantPlaced.body.template.variables.CUSTOMER_NAME, /&lt;script&gt;/);
assert.match(merchantPlaced.body.template.variables.ITEM_ROWS_TEXT, /Angel Share/);
assert.equal(merchantPlaced.body.template.variables.TOTAL, "₹850");
assert.match(merchantPlaced.body.subject, /New order/);
assert.match(merchantPlaced.body.template.variables.EVENT_MESSAGE, /fulfillment|delivery and payment/i);
assert.equal(customerPlaced.options.headers["Idempotency-Key"], `pv-placed-${oid}`);
assert.equal(merchantPlaced.options.headers["Idempotency-Key"], `pv-merchant-placed-${oid}`);

sent = [];
await assert.rejects(
  sendOrderEmail({ env, fetcher, orderId: oid, event: "paid" }),
  /ORDER_EMAIL_NOT_PAID/,
);
assert.equal(sent.length, 0, "unpaid orders never receive a payment receipt");
paymentStatus = "paid";
sent = [];
assert.equal(await sendOrderEmail({ env, fetcher, orderId: oid, event: "paid" }), true);
const customerPaid = sent.find(({ body }) => body.to[0] === "buyer@example.invalid");
const merchantPaid = sent.find(({ body }) => body.to[0] === "store@example.invalid");
assert.match(customerPaid.body.subject, /Payment received/);
assert.equal(customerPaid.body.template.variables.EVENT_TITLE, "Payment received");
assert.equal(customerPaid.body.template.variables.PAYMENT_STATUS, "Paid");
assert.equal(customerPaid.options.headers["Idempotency-Key"], `pv-paid-${oid}`);
assert.match(merchantPaid.body.subject, /Order paid/);
assert.equal(merchantPaid.options.headers["Idempotency-Key"], `pv-merchant-paid-${oid}`);

sent = [];
delete envValues.ORDER_NOTIFICATION_TO;
assert.equal(await sendOrderEmail({ env, fetcher, orderId: oid, event: "paid" }), true);
assert.ok(
  sent.some(({ body }) => body.to[0] === "quillsandcologne@gmail.com"),
  "the documented store contact receives paid notices if the override is missing",
);
console.log("PASS: order email ownership scope, unpaid order receipt, verified-paid gating, escaping, idempotency and missing-provider behavior.");
