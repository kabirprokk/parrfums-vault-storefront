const fs = require("node:fs"),
  path = require("node:path");
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const base = "https://atxvfmvhnidknnhgwgaq.supabase.co";
async function query(table, filter) {
  const r = await fetch(base + "/rest/v1/" + table + "?select=*&" + filter, {
    headers: {
      apikey:
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_fG_F6QyyAtg7hcSp9y2rMw_bJS2ZLYk",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw Error("CATALOGUE_UNAVAILABLE");
  return r.json();
}
module.exports = async function (req, res) {
  let html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const id = String(req.query.id || "");
  let product,
    prices = [],
    combo = false,
    ratings = [];
  try {
    if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 100) {
      product = (
        await query(
          "products",
          "id=eq." + encodeURIComponent(id) + "&active=eq.true",
        )
      )[0];
      if (!product) {
        product = (
          await query(
            "offers",
            "id=eq." + encodeURIComponent(id) + "&active=eq.true",
          )
        )[0];
        combo = !!product;
      }
      if (product) {
        [prices, ratings] = await Promise.all([
          combo
            ? []
            : query(
                "product_prices",
                "product_id=eq." + encodeURIComponent(id),
              ),
          query(
            "product_review_summary",
            "product_id=eq." + encodeURIComponent(id),
          ),
        ]);
      }
    }
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(503)
      .send("The catalogue is temporarily unavailable. Please try again.");
  }
  const title = product
    ? product.name + " | Parrfums Vault"
    : "Product unavailable | Parrfums Vault";
  html = html.replace(
    /<title>[^<]*<\/title>/,
    () => `<title>${escape(title)}</title>`,
  );
  const meta = (key, value) => {
    const re = new RegExp(
      '(<meta (?:name|property)="' + key + '" content=")[^"]*',
    );
    html = html.replace(re, (_, prefix) => prefix + escape(value));
  };
  if (product) {
    meta("description", product.description || product.name);
    meta("og:title", title);
    meta("og:description", product.description || product.name);
    const site = process.env.SITE_URL;
    if (site && /^https:\/\/[^/?#]+\/?$/.test(site)) {
      const origin = site.replace(/\/$/, "");
      const url = origin + "/product/" + id;
      const image = new URL(product.image_path, origin + "/").href;
      meta("og:image", image);
      const offers = combo
        ? [
            {
              "@type": "Offer",
              price: product.price_inr,
              priceCurrency: "INR",
              url,
            },
          ]
        : prices.map((v) => ({
            "@type": "Offer",
            price: v.price_inr,
            priceCurrency: "INR",
            sku: v.sku,
            url,
            ...(Number.isInteger(v.available_quantity)
              ? {
                  availability:
                    "https://schema.org/" +
                    (v.active && v.available_quantity > 0
                      ? "InStock"
                      : "OutOfStock"),
                }
              : {}),
          }));
      const rating = ratings[0];
      const data = [
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description,
          image,
          url,
          brand: { "@type": "Brand", name: "Parrfums Vault" },
          offers,
          ...(Number(rating?.review_count) > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: Number(rating.average_rating),
                  reviewCount: Number(rating.review_count),
                },
              }
            : {}),
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Parrfums Vault",
              item: origin + "/",
            },
            { "@type": "ListItem", position: 2, name: product.name, item: url },
          ],
        },
      ];
      html = html.replace(
        "</head>",
        () =>
          `<link rel="canonical" href="${escape(url)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(product.description || product.name)}"><meta name="twitter:image" content="${escape(image)}"><script type="application/ld+json" id="pv-structured">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script></head>`,
      );
    }
  } else
    html = html.replace(
      "</head>",
      '<meta name="robots" content="noindex"></head>',
    );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    product
      ? "public,max-age=0,s-maxage=60,stale-while-revalidate=300"
      : "no-store",
  );
  res.status(product ? 200 : 404).send(html);
};
