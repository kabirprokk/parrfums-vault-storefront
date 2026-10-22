import { paymentProvider } from "./payment-provider.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function readBody(request, max) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw Error("BODY_TOO_LARGE");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return new TextDecoder().decode(bytes);
}
export function createPaymentHandler({
  env,
  fetcher = fetch,
  webhook = false,
}) {
  const rpc = async (name, args) => {
    const response = await fetcher(
      env("SUPABASE_URL") + "/rest/v1/rpc/" + name,
      {
        method: "POST",
        headers: {
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
          Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw Error("PAYMENT_STATE_CONFLICT");
    return response.json();
  };
  return async (request) => {
    const origin = request.headers.get("origin");
    const allowed = (env("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cors =
      origin && allowed.includes(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers":
              "authorization, apikey, content-type, x-client-info",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            Vary: "Origin",
          }
        : {};
    const respond = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...cors,
        },
      });
    if (origin && !allowed.includes(origin))
      return respond(403, {
        code: "ORIGIN_NOT_ALLOWED",
        message: "This website is not configured for payments yet.",
      });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST")
      return respond(405, { code: "METHOD_NOT_ALLOWED" });
    try {
      if (!env("SUPABASE_URL") || !env("SUPABASE_SERVICE_ROLE_KEY"))
        return respond(503, {
          code: "CONFIGURATION_REQUIRED",
          message: "Online payments are not configured yet.",
        });
      const provider = paymentProvider(env, fetcher);
      if (!provider)
        return respond(503, {
          code: "CONFIGURATION_REQUIRED",
          message:
            "Online payments are not configured yet. Your order remains unpaid.",
        });
      const raw = await readBody(request, webhook ? 262144 : 16384);
      if (webhook) {
        if (
          !(await provider.verifyWebhook(
            raw,
            request.headers.get("x-razorpay-signature"),
          ))
        )
          return respond(401, { code: "INVALID_SIGNATURE" });
        const event = JSON.parse(raw);
        const paymentId =
          event.payload?.payment?.entity?.id ||
          event.payload?.refund?.entity?.payment_id;
        if (!paymentId) return respond(200, { ignored: true });
        // Fetch current provider truth, including cumulative refunds, even for out-of-order events.
        const payment = await provider.fetchPayment(paymentId);
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(raw),
        );
        const hash = [...new Uint8Array(bytes)]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        const eventId = request.headers.get("x-razorpay-event-id") || hash;
        const result = await rpc("record_verified_payment", {
          p_provider: provider.name,
          p_event_id: eventId,
          p_provider_order_id: payment.providerOrderId,
          p_provider_payment_id: payment.paymentId,
          p_status: payment.status,
          p_amount_paise: payment.amount,
          p_currency: payment.currency,
          p_refunded_paise: payment.refunded,
          p_body_hash: hash,
        });
        return respond(200, result);
      }
      const token = request.headers.get("authorization");
      if (!token?.startsWith("Bearer "))
        return respond(401, {
          code: "AUTH_REQUIRED",
          message: "Please sign in again to continue.",
        });
      const auth = await fetcher(env("SUPABASE_URL") + "/auth/v1/user", {
        headers: {
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
          Authorization: token,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!auth.ok)
        return respond(401, {
          code: "AUTH_REQUIRED",
          message: "Your session has expired. Please sign in again.",
        });
      const user = await auth.json();
      const body = JSON.parse(raw);
      if (!uuid.test(user.id) || !uuid.test(body.order_id))
        return respond(400, { code: "INVALID_REQUEST" });
      const ordersResponse = await fetcher(
        env("SUPABASE_URL") +
          "/rest/v1/customer_orders?select=id,user_id,total_inr,payment_status,status&id=eq." +
          body.order_id +
          "&user_id=eq." +
          user.id,
        {
          headers: {
            apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
            Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"),
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!ordersResponse.ok) throw Error("PAYMENT_STATE_CONFLICT");
      const orders = await ordersResponse.json();
      if (orders.length !== 1) return respond(404, { code: "ORDER_NOT_FOUND" });
      if (body.action === "initiate") {
        if (!uuid.test(body.request_key))
          return respond(400, { code: "INVALID_REQUEST" });
        const attempt = await rpc("begin_payment_attempt", {
          p_order_id: body.order_id,
          p_user_id: user.id,
          p_request_key: body.request_key,
          p_provider: provider.name,
        });
        let providerOrderId = attempt.provider_order_id;
        if (!providerOrderId) {
          const claimed = await rpc("claim_payment_initialization", {
            p_attempt_id: attempt.id,
          });
          if (!claimed)
            return respond(409, {
              code: "PAYMENT_PENDING",
              message:
                "Your payment is being prepared. Check your order before trying again.",
            });
          const providerOrder = await provider.createOrder(attempt);
          if (
            providerOrder.amount !== Number(attempt.amount_paise) ||
            providerOrder.currency !== "INR" ||
            typeof providerOrder.id !== "string"
          )
            throw Error("INVALID_PROVIDER_RESPONSE");
          await rpc("attach_provider_order", {
            p_attempt_id: attempt.id,
            p_provider_order_id: providerOrder.id,
          });
          providerOrderId = providerOrder.id;
        }
        return respond(200, {
          provider: provider.name,
          key: provider.publicKey,
          provider_order_id: providerOrderId,
          amount: Number(attempt.amount_paise),
          currency: "INR",
          order_id: body.order_id,
        });
      }
      if (body.action === "verify") {
        if (
          typeof body.provider_order_id !== "string" ||
          !(await provider.verifyCheckout(
            body.provider_order_id,
            body.payment_id,
            body.signature,
          ))
        )
          return respond(401, {
            code: "INVALID_SIGNATURE",
            message:
              "We could not verify this payment. Please check your order status.",
          });
        const payment = await provider.fetchPayment(body.payment_id);
        if (
          payment.providerOrderId !== body.provider_order_id ||
          payment.amount !== Number(orders[0].total_inr) * 100 ||
          payment.currency !== "INR"
        )
          return respond(409, { code: "PAYMENT_MISMATCH" });
        // Bind the provider order to THIS customer's order; never verify another customer's attempt.
        const attempts = await fetcher(
          env("SUPABASE_URL") +
            "/rest/v1/payment_attempts?select=id&order_id=eq." +
            body.order_id +
            "&provider_order_id=eq." +
            encodeURIComponent(body.provider_order_id),
          {
            headers: {
              apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
              Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"),
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!attempts.ok || (await attempts.json()).length !== 1)
          return respond(404, { code: "PAYMENT_NOT_FOUND" });
        const result = await rpc("record_verified_payment", {
          p_provider: provider.name,
          p_event_id:
            "verification:" +
            payment.paymentId +
            ":" +
            payment.status +
            ":" +
            payment.refunded,
          p_provider_order_id: payment.providerOrderId,
          p_provider_payment_id: payment.paymentId,
          p_status: payment.status,
          p_amount_paise: payment.amount,
          p_currency: payment.currency,
          p_refunded_paise: payment.refunded,
        });
        return respond(200, result);
      }
      return respond(400, { code: "INVALID_ACTION" });
    } catch (error) {
      const bad =
        ["SyntaxError", "BODY_TOO_LARGE", "INVALID_PAYMENT_REFERENCE"].includes(
          error.name,
        ) ||
        ["BODY_TOO_LARGE", "INVALID_PAYMENT_REFERENCE"].includes(error.message);
      return respond(bad ? 400 : 503, {
        code: bad ? "INVALID_REQUEST" : "PAYMENT_UNAVAILABLE",
        message:
          "We could not confirm this payment. Your order status is the source of truth; please check it before retrying.",
      });
    }
  };
}
