self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = String(data.title || "Parrfums Vault").slice(0, 80);
  const options = {
    body: String(data.body || "There is an update for your store.").slice(0, 180),
    icon: "/assets/parrfums-vault-logo.png",
    badge: "/assets/parrfums-vault-logo.png",
    tag: String(data.tag || "store-update").slice(0, 100),
    data: { url: "/admin" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate("/admin");
        return;
      }
    }
    await self.clients.openWindow("/admin");
  })());
});
