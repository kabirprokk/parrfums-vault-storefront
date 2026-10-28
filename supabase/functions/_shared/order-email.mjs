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
}) {
  if (!env("RESEND_API_KEY") || !env("ORDER_EMAIL_FROM")) return false;
  if (!uuid.test(orderId || "") || !["placed", "paid"].includes(event))
    throw Error("INVALID_EMAIL_EVENT");
  if (event === "placed" && !uuid.test(userId || ""))
    throw Error("EMAIL_AUTH_REQUIRED");

  const base = env("SUPABASE_URL"),
    serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) throw Error("EMAIL_CONFIGURATION_REQUIRED");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const orderQuery = new URLSearchParams({
    select:
      "id,order_number,user_id,recipient_name,email,phone,address_line1,address_line2,city,state,postal_code,subtotal_inr,shipping_inr,discount_inr,total_inr,payment_status,created_at",
    id: `eq.${orderId}`,
    ...(userId ? { user_id: `eq.${userId}` } : {}),
  });
  const orderResponse = await fetcher(
    `${base}/rest/v1/customer_orders?${orderQuery}`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!orderResponse.ok) throw Error("ORDER_EMAIL_LOOKUP_FAILED");
  const orders = await orderResponse.json();
  const order = orders[0];
  if (!order) throw Object.assign(Error("ORDER_EMAIL_ORDER_NOT_FOUND"), { code: "ORDER_EMAIL_ORDER_NOT_FOUND" });
  if (event === "paid" && order.payment_status !== "paid")
    throw Error("ORDER_EMAIL_NOT_PAID");
  if (!order.email) throw Object.assign(Error("ORDER_EMAIL_ADDRESS_MISSING"), { code: "ORDER_EMAIL_ADDRESS_MISSING" });

  const itemQuery = new URLSearchParams({
    select: "item_name,size_ml,quantity,line_total_inr",
    order_id: `eq.${orderId}`,
    order: "created_at.asc",
  });
  const itemResponse = await fetcher(
    `${base}/rest/v1/customer_order_items?${itemQuery}`,
    { headers, signal: AbortSignal.timeout(10000) },
  );
  if (!itemResponse.ok) throw Error("ORDER_EMAIL_ITEMS_FAILED");
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
  const status = paid ? "Paid" : "Payment pending";
  const template = {
    id: env("ORDER_EMAIL_TEMPLATE_ID") || "parrfums-vault-order-and-payment-updates",
    variables: {
      EVENT_TITLE: paid ? "Payment received" : "Order received",
      EVENT_MESSAGE: paid
        ? "is paid. Your receipt and order details are below."
        : "is placed and awaiting payment.",
      PAYMENT_STATUS: status,
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
  const send = async ({ to, subject, idempotencyKey, variables = template.variables }) => {
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
      template: { id: template.id, variables },
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
        code: `RESEND_${response.status}_${providerCode}`,
      });
    }
  };
  const sends = [send({
    to: order.email,
    subject: paid ? `Payment received for order ${reference}` : `Order ${reference} received — payment pending`,
    idempotencyKey: `pv-${event}-${order.id}`,
  })];
  const merchantEmail = env("ORDER_NOTIFICATION_TO");
  if (merchantEmail && merchantEmail.toLowerCase() !== order.email.toLowerCase()) {
    sends.push(send({
      to: merchantEmail,
      subject: `${paid ? "Order paid" : "New order"}: ${reference} — ${status}`,
      idempotencyKey: `pv-merchant-${event}-${order.id}`,
      variables: {
        ...template.variables,
        EVENT_TITLE: paid ? "Order payment confirmed" : "New order received",
        EVENT_MESSAGE: paid
          ? "has been paid. Prepare this order for fulfillment."
          : "was placed. Review the delivery and payment details below.",
      },
    }));
  }
  const results = await Promise.allSettled(sends);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return true;
}
