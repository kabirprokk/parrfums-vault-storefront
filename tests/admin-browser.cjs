const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch(),
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await require("./catalogue-fixture.cjs")(page);
  const errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const uid = "00000000-0000-4000-8000-000000000001";
  const fixtures = {
    products: [
      {
        id: "angel-share",
        name: "Angel Share",
        category: "Soft",
        gender: "Unisex",
        image_path: "assets/media/angel-share-1080.webp",
        gallery_paths: ["assets/media/angel-share-1080.webp"],
        active: true,
      },
    ],
    product_prices: [
      {
        product_id: "angel-share",
        size_ml: 50,
        price_inr: 750,
        sku: "UNIT-ANGEL-50",
        available_quantity: 2,
        low_stock_threshold: 3,
        active: true,
      },
    ],
    offers: [],
    coupons: [],
    customer_orders: [],
    reviews: [],
  };
  // UI fixtures only. Database tests separately enforce owner membership + AAL2.
  await page.route("**/rest/v1/rpc/**", async (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop();
    if (name === "admin_sales_summary")
      return r.fulfill({
        json: { orders: 0, paid_revenue_inr: 0, low_stock: 1 },
      });
    writes.push({ name, args: r.request().postDataJSON() });
    return r.fulfill({ json: null });
  });
  await page.goto(
    (process.env.PV_TEST_URL || "http://127.0.0.1:8000") + "/admin",
    { waitUntil: "networkidle" },
  );
  assert.equal(new URL(page.url()).pathname, "/admin", "admin is a direct URL");
  assert.ok(await page.locator(".admin-console-header").isVisible());
  assert.equal(await page.locator("body").evaluate((el) => el.classList.contains("is-admin")), true);
  assert.equal(await page.locator(".site-header").isVisible(), false, "storefront header stays off the admin page");
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), new URL("/admin", page.url()).href);
  await page.goto(
    (process.env.PV_TEST_URL || "http://127.0.0.1:8000") + "/#home",
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction(() => catalogueReady);
  await page.route("**/rest/v1/**", async (r) => {
    const table = new URL(r.request().url()).pathname.split("/").pop();
    if (table.startsWith("admin_")) return r.fallback();
    if (table in fixtures) return r.fulfill({ json: fixtures[table] });
    return r.fallback();
  });
  await page.evaluate(() => {
    authUser = { id: "00000000-0000-4000-8000-000000000001" };
    authReady = true;
    Commerce.cache.admin = true;
    Commerce.cache.adminChecked = true;
    render("admin");
  });
  await page.locator("[data-admin-details]").click();
  await page.waitForSelector("[data-admin-tab=inventory]");
  await page.locator("[data-admin-tab=inventory]").click();
  await page.waitForSelector("[data-admin-edit]");
  await page.locator("[data-admin-edit]").click();
  await page.waitForSelector(".admin-inline-editor-row");
  assert.match(await page.locator(".admin-inline-editor-row").evaluate((el) => el.previousElementSibling.innerText), /Angel Share\s+50/i,
    "the inventory editor is placed immediately under the selected product row");
  await page.locator("#admin-quantity").fill("25");
  await page.locator("#admin-note").fill("Test-only inventory increase");
  await page.locator("#admin-editor [type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#admin-editor"));
  await page.waitForSelector("[data-admin-tab=variants]");
  assert.equal(writes.at(-1).name, "admin_adjust_inventory");
  assert.equal(writes.at(-1).args.p_quantity, 25, "inventory editor accepts a positive stock increase");
  assert.match(writes.at(-1).args.p_request_key, /^[0-9a-f-]{36}$/i);
  await page.locator("[data-admin-tab=variants]").click();
  await page.locator("[data-admin-edit]").click();
  await page.locator("#admin-price_inr").fill("800");
  await page.locator("#admin-low_stock_threshold").fill("4");
  await page.locator("#admin-editor [type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#admin-editor"));
  assert.equal(writes.at(-1).name, "admin_save_variant");
  assert.equal(writes.at(-1).args.p_data.price_inr, "800");
  await page.locator("[data-admin-tab=inventory]").click();
  await page.locator("[data-admin-edit]").click();
  await page.locator("#admin-quantity").fill("0");
  await page.locator("#admin-note").fill("Test-only zero stock case");
  await page.locator("#admin-editor [type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#admin-editor"));
  assert.equal(writes.at(-1).name, "admin_adjust_inventory");
  assert.equal(writes.at(-1).args.p_quantity, 0, "inventory editor supports zero stock too");
  await page.locator("[data-admin-tab=products]").click();
  await page.locator("[data-admin-edit]").click();
  await page.locator("[name=active]").uncheck();
  let archivePrompt = "";
  page.once("dialog", async (dialog) => {
    archivePrompt = dialog.message();
    await dialog.accept();
  });
  await page.locator("#admin-editor [type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#admin-editor"));
  assert.equal(writes.at(-1).name, "admin_save_product");
  assert.equal(writes.at(-1).args.p_data.active, false);
  assert.match(archivePrompt, /deactivate this item/i);
  for (const tab of ["offers", "coupons", "orders", "reviews"]) {
    await page.locator(`[data-admin-tab=${tab}]`).click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".admin-page [role=status]")
          ?.textContent.includes("Loading"),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      tab + " mobile overflow",
    );
  }
  await page.locator("[data-admin-tab=coupons]").click();
  await page.locator("[data-admin-new]").click();
  await page.locator("#admin-code").fill("UNITTEST");
  await page.locator("#admin-kind").selectOption("percentage");
  await page.locator("#admin-value").fill("10");
  await page.locator("#admin-usage_limit").fill("1");
  await page.locator("[name=active]").check();
  await page.locator("#admin-editor [type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#admin-editor"));
  assert.equal(writes.at(-1).name, "admin_save_coupon");
  assert.equal(writes.at(-1).args.p_data.usage_limit, "1");
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: admin overview, variant price/threshold changes, zero-stock control, archive, coupons, all management tabs and mobile layout (UI fixtures; authorization tested in PostgreSQL).",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
