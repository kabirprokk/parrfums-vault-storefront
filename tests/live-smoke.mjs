// Read-only production smoke checks. No accounts, orders, stock or reviews are created.
import assert from "node:assert/strict";
const url = "https://lshwmudskeeknmcxlffe.supabase.co",
  key = "sb_publishable_wpkP3QTopRIY1V-yLUgx6Q_JNFC_p3B";
const headers = { apikey: key, "Content-Type": "application/json" };
const call = async (path, options = {}) =>
  fetch(url + path, {
    headers,
    ...options,
    signal: AbortSignal.timeout(15000),
  });
for (const table of [
  "products",
  "product_prices",
  "offers",
  "offer_components",
  "public_reviews",
  "product_review_summary",
  "product_popularity",
]) {
  const response = await call("/rest/v1/" + table + "?select=*&limit=1");
  assert.equal(response.status, 200, table + " public projection");
}
for (const table of [
  "customer_orders",
  "customer_order_items",
  "admin_users",
  "coupons",
  "payment_attempts",
  "payment_events",
  "stock_movements",
  "inventory_requests",
  "admin_audit_log",
]) {
  const response = await call("/rest/v1/" + table + "?select=*&limit=1");
  assert.ok(
    [401, 403].includes(response.status),
    table + " must not be anonymously readable",
  );
}
for (const name of ["admin_sales_summary", "is_admin"]) {
  const response = await call("/rest/v1/rpc/" + name, {
    method: "POST",
    body: "{}",
  });
  assert.ok([401, 403].includes(response.status), name + " rejects guest");
}
const settings = await (await call("/auth/v1/settings")).json();
console.log(
  "Google authentication configured:",
  settings.external?.google === true,
);
for (const name of ["payments", "payment-webhook"]) {
  const response = await call("/functions/v1/" + name, {
    method: "POST",
    body: "{}",
  });
  assert.equal(
    response.status,
    503,
    name + " fails closed without real provider configuration",
  );
  const body = await response.json();
  assert.equal(body.code, "CONFIGURATION_REQUIRED");
  assert.equal("secret" in body, false);
}
console.log(
  "PASS: live public catalogue/projections, private table denial, anonymous admin RPC denial, deployed payment functions safely report missing configuration. No production data changed.",
);
