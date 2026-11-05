export async function dispatchPush({ env, fetcher = fetch, event, orderId }) {
  const secret = env("PUSH_DISPATCH_SECRET");
  if (!secret) return { status: "not_configured" };
  try {
    const response = await fetcher(`${env("SUPABASE_URL")}/functions/v1/push-notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Push-Dispatch-Secret": secret,
      },
      body: JSON.stringify({ action: "dispatch", event, order_id: orderId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { status: "failed" };
    const result = await response.json();
    return { status: result.sent ? "sent" : "no_subscriptions" };
  } catch (error) {
    console.error("Push delivery failed:", String(error?.message || "unavailable").slice(0, 100));
    return { status: "failed" };
  }
}
