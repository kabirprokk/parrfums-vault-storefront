const { chromium } = require("playwright"),
  { default: AxeBuilder } = require("@axe-core/playwright"),
  assert = require("node:assert/strict");
const base = process.env.PV_TEST_URL || "http://127.0.0.1:8000";
(async () => {
  const browser = await chromium.launch(),
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await context.newPage();
  await require("./catalogue-fixture.cjs")(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/#shop", { waitUntil: "networkidle" });
  await page.waitForFunction(() => catalogueReady);
  await page.locator("#catalogue-search").fill("no-such-fragrance");
  await page.locator("[data-apply-filters]").click();
  assert.equal(await page.locator(".product-card").count(), 0);
  assert.match(await page.locator("#app").innerText(), /No fragrances found/);
  await page.locator("[data-reset]").click();
  assert.equal(await page.locator(".product-card").count(), 6);
  await page.locator("#filter-size").selectOption("30");
  await page.locator("#filter-price").fill("450");
  await page.locator("[data-apply-filters]").click();
  assert.equal(await page.locator(".product-card").count(), 6);
  await page.locator("#filter-price").fill("1");
  await page.locator("[data-apply-filters]").click();
  assert.equal(await page.locator(".product-card").count(), 0);
  await page.locator("[data-reset]").click();
  for (const sort of ["price-asc", "price-desc", "newest", "popular"])
    await page.locator("#sort").selectOption(sort);
  await page.locator(".product-card").first().locator("a").first().click();
  assert.match(page.url(), /\/product\//);
  assert.equal(await page.locator(".detail h1").count(), 1);
  assert.equal(await page.locator("link[rel=canonical]").count(), 1);
  assert.equal(await page.locator("#pv-structured").count(), 1);
  assert.match(
    await page.locator('meta[property="og:title"]').getAttribute("content"),
    /Parrfums Vault/,
  );
  await page.goBack();
  assert.equal(await page.locator("#sort").count(), 1);
  await page.goForward();
  assert.equal(await page.locator(".detail h1").count(), 1);
  const a11y = async (label) => {
    const scan = await new AxeBuilder({ page })
      .include("#app")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      label,
    );
  };
  await a11y("Product accessibility");
  // Actual catalogue strings are rendered as text, including malicious HTML fixtures.
  await page.evaluate(() => {
    const p = get("angel-share");
    p.name = "<img src=x onerror=alert(1)>";
    p.desc = "<script>window.pvInjected=true</script>";
    render("product/angel-share");
  });
  assert.equal(await page.locator(".detail h1 img").count(), 0);
  assert.equal(await page.evaluate(() => window.pvInjected), undefined);
  await page.goto(base + "/#product/angel-share", { waitUntil: "networkidle" });
  await page.locator(".detail [data-wish]").click();
  await page.goto(base + "/#wishlist", { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-move-wishlist]").count(), 1);
  await page.locator("[data-move-wishlist]").click();
  assert.equal(await page.locator("[data-move-wishlist]").count(), 0);
  await page.goto(base + "/#cart");
  assert.equal(await page.locator(".cart-item").count(), 1);
  // Auth is a browser-only fixture. Database authorization is tested against PostgreSQL separately.
  await page.evaluate(() => {
    authUser = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "unit@example.invalid",
      user_metadata: {},
    };
    authReady = true;
    render("checkout");
  });
  await a11y("Checkout accessibility");
  const fill = {
    first: "Unit",
    last: "Customer",
    email: "unit@example.invalid",
    phone: "9876543210",
    address: "123 Test Street",
    city: "Mumbai",
    state: "Maharashtra",
    pin: "400001",
  };
  for (const [id, value] of Object.entries(fill))
    await page.locator("#" + id).fill(value);
  await page.locator("#order-consent").check();
  const uid = "00000000-0000-4000-8000-000000000001",
    oid = "00000000-0000-4000-8000-000000000099";
  let checkouts = 0,
    keys = [],
    quoteCalls = 0;
  await page.route("**/rest/v1/rpc/quote_checkout", async (r) => {
    quoteCalls++;
    await r.fulfill({
      json: {
        quote_hash: "unit-quote",
        items: [
          {
            item_name: "Angel Share",
            quantity: 1,
            size_ml: 50,
            line_total_inr: 750,
          },
        ],
        subtotal_inr: 750,
        shipping_inr: 100,
        discount_inr: 0,
        total_inr: 850,
      },
    });
  });
  await page.route("**/rest/v1/rpc/checkout_order", async (r) => {
    const body = r.request().postDataJSON();
    assert.equal(body.p_quote_hash, "unit-quote");
    assert.equal("total_inr" in body, false);
    keys.push(body.p_request_key);
    checkouts++;
    if (checkouts === 1)
      return r.fulfill({
        status: 503,
        json: { message: "temporary database failure" },
      });
    await r.fulfill({ json: oid });
  });
  await page.route("**/rest/v1/customer_orders?**", (r) =>
    r.fulfill({
      json: [
        {
          id: oid,
          user_id: uid,
          order_number: "PV-UNIT",
          status: "pending",
          payment_status: "unpaid",
          recipient_name: "Unit Customer",
          address_line1: "123 Test Street",
          city: "Mumbai",
          state: "Maharashtra",
          postal_code: "400001",
          subtotal_inr: 750,
          shipping_inr: 100,
          discount_inr: 0,
          total_inr: 850,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  );
  for (const table of [
    "customer_order_items",
    "order_status_events",
    "payment_attempts",
    "wishlist_items",
    "customer_profiles",
    "customer_addresses",
  ])
    await page.route(`**/rest/v1/${table}?**`, (r) => r.fulfill({ json: [] }));
  await page.locator("[data-quote-checkout]").click();
  await page.waitForFunction(() => Commerce.checkoutState.quote);
  assert.match(
    await page.locator("[data-server-summary]").textContent(),
    /850/,
  );
  await page.locator("#checkout-form [type=submit]").click();
  await page.waitForFunction(
    () => !!document.querySelector("#form-error")?.textContent,
  );
  assert.equal(
    await page.evaluate(() => state.cart.length),
    1,
    "Failed checkout preserves bag",
  );
  await page.locator("#checkout-form [type=submit]").click();
  await page.waitForFunction(() => currentPath.startsWith("orders/"));
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], "Retry uses the same idempotency key");
  assert.equal(await page.evaluate(() => state.cart.length), 0);
  assert.equal(await page.locator(".order-timeline li").count(), 5);
  assert.match(await page.locator("#app").textContent(), /unpaid/i);
  await page.evaluate(() => {
    authUser = null;
    Commerce.cache.admin = false;
    Commerce.cache.adminChecked = true;
    render("admin");
  });
  assert.equal(await page.locator("#admin-editor").count(), 0);
  assert.match(await page.locator("#app").textContent(), /Sign in/);
  await page.evaluate(() => {
    authUser = { id: "00000000-0000-4000-8000-000000000001" };
    render("admin");
  });
  assert.match(await page.locator("#app").textContent(), /MFA/);
  assert.equal(await page.locator("#admin-editor").count(), 0);
  for (const route of [
    "privacy",
    "terms",
    "shipping",
    "returns",
    "cancellation",
    "contact",
    "faq",
  ]) {
    await page.evaluate((route) => render(route), route);
    await a11y(route + " accessibility");
  }
  await page.evaluate(() => render("unknown-route"));
  assert.match(await page.locator("#app").textContent(), /Page not found/);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: search/filter/sort, product URL/history/metadata, XSS text escaping, wishlist move, server quote, retry-safe checkout, unpaid order tracking, admin guards, policy routes and axe accessibility.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
