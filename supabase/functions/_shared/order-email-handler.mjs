import { sendOrderEmail } from "./order-email.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createOrderEmailHandler({ env, fetcher = fetch }) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const allowed = (env("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const cors = origin && allowed.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          Vary: "Origin",
        }
      : {};
    const respond = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
    });
    if (origin && !allowed.includes(origin))
      return respond(403, { code: "ORIGIN_NOT_ALLOWED" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return respond(405, { code: "METHOD_NOT_ALLOWED" });
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      return respond(401, { code: "AUTH_REQUIRED" });
    try {
      const auth = await fetcher(`${env("SUPABASE_URL")}/auth/v1/user`, {
        headers: {
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
          Authorization: authorization,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!auth.ok) return respond(401, { code: "AUTH_REQUIRED" });
      const user = await auth.json();
      const body = await request.json();
      if (!uuid.test(user.id || "") || !uuid.test(body.order_id || ""))
        return respond(400, { code: "INVALID_REQUEST" });
      if (!env("RESEND_API_KEY") || !env("ORDER_EMAIL_FROM"))
        return respond(503, { code: "EMAIL_NOT_CONFIGURED" });
      await sendOrderEmail({
        env,
        fetcher,
        orderId: body.order_id,
        event: "placed",
        userId: user.id,
      });
      return respond(202, { sent: true });
    } catch {
      return respond(503, { code: "EMAIL_DELIVERY_UNAVAILABLE" });
    }
  };
}
