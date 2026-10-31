import assert from "node:assert/strict";
import { sendOrderEmail } from "../supabase/functions/_shared/order-email.mjs";
import { createOrderEmailHandler } from "../supabase/functions/_shared/order-email-handler.mjs";

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
  orderStatus = "pending",
  adminAllowed = false,
  sent = [];
const fetcher = async (url, options = {}) => {
  if (url.endsWith("/auth/v1/user")) return Response.json({ id: uid });
  if (url.endsWith("/rest/v1/rpc/is_admin")) return Response.json(adminAllowed);
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
      status: orderStatus,
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
assert.equal(customerPlaced, undefined, "pending orders do not send a detailed customer email");
assert.ok(merchantPlaced);
assert.match(merchantPlaced.body.html, /New order needs review/);
assert.match(merchantPlaced.body.html, /Manage this order/);
assert.match(merchantPlaced.body.html, new RegExp(`/admin\\?order=${oid}`));
assert.doesNotMatch(merchantPlaced.body.html, /9999999999|buyer@example|123 Test Road|Kabir/,
  "pending store alert contains no customer contact/address details");
assert.match(merchantPlaced.body.subject, /Action needed: new order/);
assert.equal(merchantPlaced.options.headers["Idempotency-Key"], `pv-merchant-placed-${oid}`);

sent = [];
await assert.rejects(
  sendOrderEmail({ env, fetcher, orderId: oid, event: "status", status: "shipped" }),
  /ORDER_STATUS_NOT_CURRENT/,
  "status notification must match the current database status",
);
orderStatus = "confirmed";
assert.equal(await sendOrderEmail({ env, fetcher, orderId: oid, event: "status", status: "confirmed" }), true);
assert.equal(sent.length, 1, "status updates send one notification to the customer only");
assert.equal(sent[0].body.to[0], "buyer@example.invalid");
assert.match(sent[0].body.html, /confirmed by the store/);
assert.match(sent[0].body.html, /View order status/);
assert.doesNotMatch(sent[0].body.html, /9999999999|123 Test Road|Angel Share/,
  "status email gives a simple update without duplicating delivery or item details");
assert.equal(sent[0].options.headers["Idempotency-Key"], `pv-status-${oid}-confirmed`);

const handler = createOrderEmailHandler({ env, fetcher });
const statusRequest = () => new Request("https://project.example.invalid/functions/v1/order-email", {
  method: "POST",
  headers: { authorization: "Bearer browser-session", "content-type": "application/json" },
  body: JSON.stringify({ order_id: oid, event: "status", status: "packed" }),
});
orderStatus = "packed";
sent = [];
assert.equal((await handler(statusRequest())).status, 403,
  "regular customers cannot send privileged order-status notices");
assert.equal(sent.length, 0);
adminAllowed = true;
assert.equal((await handler(statusRequest())).status, 202,
  "MFA-verified admins can send the customer status notification after updating the order");
assert.equal(sent.length, 1);
assert.equal(sent[0].body.to[0], "buyer@example.invalid");

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
assert.match(customerPaid.body.template.variables.ITEM_ROWS, /Angel Share/);
assert.ok(merchantPaid);
assert.match(merchantPaid.body.html, /Payment confirmed/);
assert.match(merchantPaid.body.html, /Manage this order/);
assert.doesNotMatch(merchantPaid.body.html, /9999999999|buyer@example|123 Test Road|Kabir/,
  "merchant payment alert remains concise and minimizes customer data");
assert.equal(merchantPaid.options.headers["Idempotency-Key"], `pv-merchant-paid-${oid}`);

sent = [];
delete envValues.ORDER_NOTIFICATION_TO;
assert.equal(await sendOrderEmail({ env, fetcher, orderId: oid, event: "paid" }), true);
assert.ok(
  sent.some(({ body }) => body.to[0] === "quillsandcologne@gmail.com"),
  "the documented store contact receives paid notices if the override is missing",
);
console.log("PASS: order email ownership scope, unpaid order receipt, verified-paid gating, escaping, idempotency and missing-provider behavior.");
