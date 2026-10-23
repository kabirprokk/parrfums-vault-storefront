const assert = require("node:assert/strict");
const page = require("../api/page"),
  sitemap = require("../api/sitemap");
const originalFetch = global.fetch;
const response = () => ({
  headers: {},
  code: 200,
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(n) {
    this.code = n;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
});
(async () => {
  process.env.SITE_URL = "https://unit.example.invalid";
  let missing = false;
  global.fetch = async (url) =>
    new Response(
      JSON.stringify(
        url.includes("/products?")
          ? missing
            ? []
            : [
                {
                  id: "unit-product",
                  name: "Test $& <script>name</script>",
                  description:
                    "A description </script><script>alert(1)</script>",
                  image_path: "assets/media/angel-share-1080.webp",
                },
              ]
          : url.includes("/offers?")
            ? []
            : url.includes("/product_prices?")
              ? [
                  {
                    size_ml: 50,
                    price_inr: 750,
                    sku: "UNIT",
                    active: true,
                    available_quantity: null,
                  },
                ]
              : [],
      ),
      { status: 200 },
    );
  let r = response();
  await page({ query: { id: "unit-product" } }, r);
  assert.equal(r.code, 200);
  assert.ok(r.body.includes("Test $&amp; &lt;script&gt;name&lt;/script&gt;"));
  assert.ok(
    r.body.includes("https://unit.example.invalid/product/unit-product"),
  );
  assert.equal(
    r.body.includes("InStock"),
    false,
    "Unknown stock must not become InStock schema",
  );
  assert.equal(
    r.body.includes("aggregateRating"),
    false,
    "No fabricated rating",
  );
  const json = r.body.match(/id="pv-structured">([\s\S]*?)<\/script>/)[1];
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].offers[0].price, 750);
  assert.equal(parsed[0].name, "Test $& <script>name</script>");
  assert.equal(
    json.includes("</script>"),
    false,
    "JSON-LD cannot escape its script element",
  );
  missing = true;
  r = response();
  await page({ query: { id: "missing-product" } }, r);
  assert.equal(r.code, 404);
  assert.ok(r.body.includes("noindex"));
  r = response();
  await page({ query: { id: "x' or true--" } }, r);
  assert.equal(r.code, 404);
  r = response();
  await sitemap({}, r);
  assert.equal(r.code, 200);
  assert.ok(r.body.includes("<urlset"));
  delete process.env.SITE_URL;
  r = response();
  await sitemap({}, r);
  assert.equal(r.code, 200, "The confirmed production domain provides a sitemap fallback");
  assert.ok(r.body.includes("https://parrfums-vault.vercel.app/"));
  global.fetch = async () => {
    throw Error("offline");
  };
  r = response();
  await page({ query: { id: "unit-product" } }, r);
  assert.equal(r.code, 503);
  global.fetch = originalFetch;
  console.log(
    "PASS: server SEO, real price schema, unknown stock omission, no fake ratings, escaped metadata/JSON-LD, canonical configuration, sitemap, invalid IDs, 404 and API failure.",
  );
})().catch((e) => {
  global.fetch = originalFetch;
  console.error(e);
  process.exit(1);
});
