import webpush from "npm:web-push@3.6.7";

const env = (name: string) => Deno.env.get(name) || "";
const supabase = env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const allowed = new Set((env("ALLOWED_ORIGINS") || "")
  .split(",").map((origin) => origin.trim()).filter(Boolean));

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (origin && !allowed.has(origin)) return Response.json({ code: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
  const cors: Record<string, string> = origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } : {};
  const respond = (status: number, body: unknown) => Response.json(body, {
    status, headers: { ...cors, "Cache-Control": "no-store" },
  });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return respond(405, { code: "METHOD_NOT_ALLOWED" });
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return respond(400, { code: "INVALID_REQUEST" }); }

  if (body.action === "dispatch") {
    const expected = env("PUSH_DISPATCH_SECRET");
    const supplied = request.headers.get("x-push-dispatch-secret") || "";
    if (!expected || supplied.length !== expected.length) return respond(401, { code: "AUTH_REQUIRED" });
    const a = new TextEncoder().encode(supplied), b = new TextEncoder().encode(expected);
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
    if (mismatch) return respond(401, { code: "AUTH_REQUIRED" });
    if (!(["placed", "paid"].includes(body.event) && /^[0-9a-f-]{36}$/i.test(body.order_id || "")))
      return respond(400, { code: "INVALID_REQUEST" });
    const eventUrl = `${supabase}/rest/v1/admin_push_events?on_conflict=order_id,event_type`;
    const eventHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    };
    const claimResponse = await fetch(eventUrl, {
      method: "POST",
      headers: eventHeaders,
      body: JSON.stringify({ order_id: body.order_id, event_type: body.event }),
    });
    if (!claimResponse.ok) return respond(503, { code: "EVENT_CLAIM_FAILED" });
    if (!(await claimResponse.json()).length) return respond(200, { sent: false, duplicate: true });
    const releaseClaim = async () => {
      await fetch(`${supabase}/rest/v1/admin_push_events?order_id=eq.${body.order_id}&event_type=eq.${body.event}`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    };
    const rowsResponse = await fetch(`${supabase}/rest/v1/admin_push_subscriptions?select=subscription`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!rowsResponse.ok) { await releaseClaim(); return respond(503, { code: "SUBSCRIPTIONS_UNAVAILABLE" }); }
    const rows: Array<{ subscription: any }> = await rowsResponse.json();
    if (!rows.length) { await releaseClaim(); return respond(200, { sent: false }); }
    if (!env("VAPID_PUBLIC_KEY") || !env("VAPID_PRIVATE_KEY"))
      { await releaseClaim(); return respond(503, { code: "VAPID_NOT_CONFIGURED" }); }
    webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:quillsandcologne@gmail.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
    const payment = body.event === "paid";
    const payload = JSON.stringify({
      title: payment ? "Payment received" : "New order received",
      body: payment ? "An order payment was verified. Tap to review." : "A customer placed an order. Tap to review.",
      tag: `${body.event}-${body.order_id}`,
    });
    const results = await Promise.allSettled(rows.map(({ subscription }) =>
      webpush.sendNotification(subscription, payload)));
    const dead = results.flatMap((result, index) =>
      result.status === "rejected" && [404, 410].includes(Number(result.reason?.statusCode))
        ? [rows[index].subscription.endpoint] : []);
    for (const endpoint of dead) {
      await fetch(`${supabase}/rest/v1/admin_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    }
    const sent = results.some((result) => result.status === "fulfilled");
    if (!sent) await releaseClaim();
    return respond(200, { sent });
  }

  const token = request.headers.get("authorization") || "";
  if (!token.startsWith("Bearer ")) return respond(401, { code: "AUTH_REQUIRED" });
  const auth = await fetch(`${supabase}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: token },
  });
  if (!auth.ok) return respond(401, { code: "AUTH_REQUIRED" });
  const user = await auth.json();
  const admin = await fetch(`${supabase}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: token, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!admin.ok || await admin.json() !== true) return respond(403, { code: "ADMIN_REQUIRED" });
  if (body.action === "public-key")
    return env("VAPID_PUBLIC_KEY") ? respond(200, { publicKey: env("VAPID_PUBLIC_KEY") }) : respond(503, { code: "PUSH_NOT_CONFIGURED" });
  if (body.action === "subscribe") {
    const subscription = body.subscription;
    if (!subscription || typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") || !subscription.keys?.p256dh || !subscription.keys?.auth)
      return respond(400, { code: "INVALID_SUBSCRIPTION" });
    const saved = await fetch(`${supabase}/rest/v1/admin_push_subscriptions?on_conflict=endpoint`, {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ endpoint: subscription.endpoint, subscription, updated_at: new Date().toISOString() }),
    });
    return respond(saved.ok ? 200 : 503, saved.ok ? { saved: true } : { code: "SUBSCRIPTION_SAVE_FAILED" });
  }
  if (body.action === "unsubscribe") {
    const endpoint = body.endpoint;
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return respond(400, { code: "INVALID_SUBSCRIPTION" });
    const removed = await fetch(`${supabase}/rest/v1/admin_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    return respond(removed.ok ? 200 : 503, removed.ok ? { removed: true } : { code: "UNSUBSCRIBE_FAILED" });
  }
  return respond(400, { code: "INVALID_REQUEST" });
});
