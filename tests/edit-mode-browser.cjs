// Owner edit mode: click to edit, double-click to behave normally, drag to
// reorder and a fixed bottom-left toolbar that publishes the change.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch(),
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [],
    writes = [],
    server = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await require("./catalogue-fixture.cjs")(page);
  await page.route("**/rest/v1/rpc/admin_save_site_content", async (r) => {
    const body = r.request().postDataJSON();
    writes.push(body);
    server.push({ key: body.p_key, kind: body.p_kind, content: body.p_content });
    return r.fulfill({ json: null });
  });
  await page.route("**/rest/v1/site_content**", async (r) => {
    return r.fulfill({ json: server });
  });
  const base = process.env.PV_TEST_URL || "http://127.0.0.1:8000";
  // The admin flag resolves after sign-in; tests grant it directly.
  const asAdmin = () =>
    page.evaluate(() => {
      Commerce.cache.admin = true;
      Commerce.cache.adminChecked = true;
    });
  const enterEdit = async () => {
    await asAdmin();
    await page.evaluate(() => {
      if (!window.PVEdit.isOn()) window.PVEdit.toggle(true);
    });
  };
  await page.goto(base + "/#home", { waitUntil: "networkidle" });
  await page.waitForFunction(() => catalogueReady);
  await asAdmin();

  /* toolbar stays in the bottom-left corner */
  await page.evaluate(() => window.PVEdit.toggle(true));
  const toolbar = page.locator("#edit-toolbar");
  await toolbar.waitFor({ state: "visible" });
  const box = await toolbar.boundingBox();
  assert.ok(box.y > 500, "toolbar sits at the bottom of the screen");
  assert.ok(box.x < 60, "toolbar sits on the left of the screen");
  assert.match(await page.locator("#edit-save").innerText(), /done \/ save/i);

  /* a single click makes the text editable */
  const headline = page.locator(".intro-copy h1");
  await headline.click();
  assert.equal(await headline.getAttribute("contenteditable"), "true");
  await page.locator(".intro-art img").click();
  assert.equal(await headline.getAttribute("contenteditable"), null,
    "clicking outside the selected text deselects it");
  await headline.click();
  assert.equal(await headline.getAttribute("contenteditable"), "true");
  await page.evaluate(() => {
    document.querySelector(".intro-copy h1").textContent = "A headline the owner changed";
  });

  /* saving publishes the change and keeps it on the device */
  await page.locator("#edit-save").click();
  await page.waitForTimeout(400);
  assert.equal(writes.length, 1, "the change is published through the admin RPC");
  assert.equal(writes[0].p_kind, "html");
  assert.match(writes[0].p_content.html, /A headline the owner changed/);

  /* the published copy is restored on the next visit */
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => catalogueReady);
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator(".intro-copy h1").innerText(),
    "A headline the owner changed",
    "the owner edit is live for every visitor",
  );
  await page.evaluate(() => localStorage.removeItem("pv-site-content-v1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => catalogueReady);

  /* a double click behaves exactly like it does for a shopper */
  await enterEdit();
  await page.locator(".intro-actions a.btn").first().dblclick();
  await page.waitForFunction(() => location.hash === "#shop");
  assert.equal(new URL(page.url()).hash, "#shop", "double click follows the link");

  /* blocks can be dragged into a new order and the order is published */
  await page.goto(base + "/#shop", { waitUntil: "networkidle" });
  await page.waitForFunction(() => catalogueReady);
  await enterEdit();
  const names = await page.locator(".product-card .product-meta h3").allInnerTexts();
  assert.ok(names.length > 2, "the grid has enough cards to reorder");
  const targetBox = await page.locator(".product-grid .product-card:nth-of-type(2)").boundingBox();
  await page.dragAndDrop(".product-grid .product-card:nth-of-type(1)", ".product-grid .product-card:nth-of-type(2)", {
    targetPosition: { x: Math.round(targetBox.width - 12), y: 20 },
  });
  const after = await page.locator(".product-card .product-meta h3").allInnerTexts();
  assert.notDeepEqual(after, names, "dragging reorders the cards");
  await page.locator("#edit-save").click();
  await page.waitForTimeout(400);
  const orderWrite = writes.find((w) => w.p_kind === "order");
  assert.ok(orderWrite, "the new order is published");
  assert.ok(Array.isArray(orderWrite.p_content.items) && orderWrite.p_content.items.length > 1);

  assert.deepEqual(errors, [], "no page errors");
  await browser.close();
  console.log("PASS: edit mode toolbar, click to edit, double click to follow, drag to reorder and publish.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
