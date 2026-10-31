const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>\"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      char
    ],
  );
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));

export async function sendOrderEmail({
  env,
  fetcher = fetch,
  orderId,
  event,
  userId,
  status,
}) {
  if (!env("RESEND_API_KEY") || !env("ORDER_EMAIL_FROM")) return false;
  if (!uuid.test(orderId || "") || !["placed", "paid", "status"].includes(event))
    throw Error("INVALID_EMAIL_EVENT");
  if (event === "placed" && !uuid.test(userId || ""))
    throw Error("EMAIL_AUTH_REQUIRED");
  const allowedStatuses = new Set(["confirmed", "packed", "shipped", "delivered", "cancelled", "refunded"]);
  if (event === "status" && !allowedStatuses.has(status || ""))
    throw Error("INVALID_EMAIL_STATUS");

  const base = env("SUPABASE_URL"),
    serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) throw Error("EMAIL_CONFIGURATION_REQUIRED");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const orderQuery = new URLSearchParams({
    select:
      "id,order_number,user_id,recipient_name,email,phone,address_line1,address_line2,city,state,postal_code,subtotal_inr,shipping_inr,discount_inr,total_inr,payment_status,status,created_at",
    id: `eq.${orderId}`,
    ...(userId ? { user_id: `eq.${userId}` } : {}),
  });
  const orderResponse = await fetcher(
    `${base}/rest/v1/customer_orders?${orderQuery}`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!orderResponse.ok) throw Object.assign(Error("ORDER_EMAIL_LOOKUP_FAILED"), { code: "ORDER_EMAIL_LOOKUP_FAILED" });
  const orders = await orderResponse.json();
  const order = orders[0];
  if (!order) throw Object.assign(Error("ORDER_EMAIL_ORDER_NOT_FOUND"), { code: "ORDER_EMAIL_ORDER_NOT_FOUND" });
  if (event === "paid" && order.payment_status !== "paid")
    throw Error("ORDER_EMAIL_NOT_PAID");
  if (event === "status" && order.status !== status)
    throw Error("ORDER_STATUS_NOT_CURRENT");
  if (!order.email) throw Object.assign(Error("ORDER_EMAIL_ADDRESS_MISSING"), { code: "ORDER_EMAIL_ADDRESS_MISSING" });

  const itemQuery = new URLSearchParams({
    select: "item_name,size_ml,quantity,line_total_inr",
    order_id: `eq.${orderId}`,
  });
  const itemResponse = await fetcher(
    `${base}/rest/v1/customer_order_items?${itemQuery}`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!itemResponse.ok) throw Object.assign(Error("ORDER_EMAIL_ITEMS_FAILED"), { code: "ORDER_EMAIL_ITEMS_FAILED" });
  const items = await itemResponse.json();
  const site = (env("SITE_URL") || "https://parrfumsvault.in").replace(/\/$/, "");
  const reference = order.order_number || order.id.slice(0, 8).toUpperCase();
  const address = [
    order.address_line1,
    order.address_line2,
    `${order.city}, ${order.state} ${order.postal_code}`,
  ].filter(Boolean).join(", ");
  const paid = event === "paid";
  const lines = items.map((item) => ({
    name: `${item.item_name}${item.size_ml ? ` · ${item.size_ml}ml` : ""}`,
    quantity: Number(item.quantity),
    total: Number(item.line_total_inr),
  }));
  const itemRows = lines
    .map(
      (item) =>
        `<tr><td style="padding-top:10px;padding-bottom:10px;border-bottom:1px solid #e7ded3;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#241d1a">${escapeHtml(item.name)} × ${item.quantity}</td><td align="right" style="padding-top:10px;padding-bottom:10px;border-bottom:1px solid #e7ded3;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#241d1a">${money(item.total)}</td></tr>`,
    )
    .join("");
  const itemRowsText = lines
    .map((item) => `${item.name} × ${item.quantity} — ${money(item.total)}`)
    .join("\n");
  const paymentStatusLabel = paid ? "Paid" : "Payment pending";
  const template = {
    id: env("ORDER_EMAIL_TEMPLATE_ID") || "parrfums-vault-order-and-payment-updates",
    variables: {
      EVENT_TITLE: paid ? "Payment received" : "Order received",
      EVENT_MESSAGE: paid
        ? "is paid. Your receipt and order details are below."
        : "is placed and awaiting payment.",
      PAYMENT_STATUS: paymentStatusLabel,
      CUSTOMER_NAME: escapeHtml(order.recipient_name),
      ORDER_NUMBER: escapeHtml(reference),
      ITEM_ROWS: itemRows,
      ITEM_ROWS_TEXT: escapeHtml(itemRowsText),
      SUBTOTAL: money(order.subtotal_inr),
      SHIPPING: money(order.shipping_inr),
      DISCOUNT: money(order.discount_inr),
      TOTAL: money(order.total_inr),
      PHONE_NUMBER: escapeHtml(order.phone),
      CONTACT_EMAIL: escapeHtml(order.email),
      DELIVERY_ADDRESS: escapeHtml(address),
      ORDER_URL: escapeHtml(`${site}/#orders/${encodeURIComponent(order.id)}`),
    },
  };
  const send = async ({ to, subject, idempotencyKey, variables = template.variables, html, text }) => {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: env("ORDER_EMAIL_FROM"),
        ...(env("ORDER_EMAIL_REPLY_TO")
          ? { reply_to: env("ORDER_EMAIL_REPLY_TO") }
          : {}),
        to: [to],
        subject,
        ...(html ? { html, text } : { template: { id: template.id, variables } }),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      let providerCode = "UNKNOWN";
      try {
        const result = await response.json();
        providerCode = String(result.name || result.code || "UNKNOWN").slice(0, 80);
      } catch {}
      throw Object.assign(Error("ORDER_EMAIL_DELIVERY_FAILED"), {
        code: `RESEND_${response.status}_${providerCode}`.replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase(),
      });
    }
  };
  // Never silently omit the fulfillment notice because an optional secret was
  // not configured. This fallback is the store contact documented in
  // EMAIL_SETUP.md; ORDER_NOTIFICATION_TO remains the preferred override.
  const merchantEmail = env("ORDER_NOTIFICATION_TO") ||
    env("ORDER_EMAIL_REPLY_TO") ||
    "quillsandcologne@gmail.com";
  const manageUrl = new URL("/admin", site);
  manageUrl.searchParams.set("order", order.id);
  const manageHref = escapeHtml(manageUrl.href);
  const merchantHtml = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;padding:28px;color:#241d1a"><p style="color:#a86d43;letter-spacing:.08em">PARRFUMS VAULT · ORDER DESK</p><h1>${paid ? "Payment confirmed" : "New order needs review"}</h1><p>Order <strong>${escapeHtml(reference)}</strong> · ${escapeHtml(order.status)}</p><p>Total: <strong>${money(order.total_inr)}</strong></p><p style="margin:28px 0"><a href="${manageHref}" style="display:inline-block;padding:14px 22px;background:#a86d43;color:#fff;text-decoration:none;font-weight:bold">Manage this order</a></p><p style="color:#746c65;font-size:13px">Sign in with the authorized store-admin account and complete MFA. This link opens only this order; it does not grant administrator access.</p></div>`;
  const merchantText = [
    paid ? "Payment confirmed" : "New order needs review",
    `Order ${reference} · ${paymentStatusLabel}`,
    `Total: ${money(order.total_inr)}`,
    `Manage this order: ${manageUrl.href}`,
    "Admin sign-in and MFA are required.",
  ].join("\n");
  const sends = [];
  if (event === "status") {
    const labels = {
      confirmed: "confirmed by the store",
      packed: "packed",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
      refunded: "refund processed",
    };
    const label = labels[status];
    const orderUrl = escapeHtml(`${site}/#orders/${encodeURIComponent(order.id)}`);
    sends.push(send({
      to: order.email,
      subject: `Order ${reference} update: ${label}`,
      idempotencyKey: `pv-status-${order.id}-${status}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;padding:28px;color:#241d1a"><p style="color:#a86d43;letter-spacing:.08em">PARRFUMS VAULT</p><h1>Your order status changed</h1><p>Order <strong>${escapeHtml(reference)}</strong> is now <strong>${escapeHtml(label)}</strong>.</p><p><a href="${orderUrl}" style="display:inline-block;padding:14px 22px;background:#a86d43;color:#fff;text-decoration:none;font-weight:bold">View order status</a></p><p style="color:#746c65;font-size:13px">This update contains no payment credentials. Payment status is confirmed separately by the payment provider.</p></div>`,
      text: `Order ${reference} is now ${label}. View status: ${site}/#orders/${encodeURIComponent(order.id)}`,
    }));
    const results = await Promise.allSettled(sends);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    return true;
  }
  if (merchantEmail.toLowerCase() !== order.email.toLowerCase())
    sends.push(send({
      to: merchantEmail,
      subject: `${paid ? "Payment confirmed" : "Action needed: new order"} ${reference} — ${paymentStatusLabel}`,
      idempotencyKey: `pv-merchant-${event}-${order.id}`,
      html: merchantHtml,
      text: merchantText,
    }));
  // The customer receives the itemized receipt only when provider verification
  // confirms payment. Pending-order notifications are store-only.
  if (paid) sends.push(send({
    to: order.email,
    subject: `Payment received for order ${reference}`,
    idempotencyKey: `pv-paid-${order.id}`,
  }));
  const results = await Promise.allSettled(sends);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return true;
}
