module.exports = async function (req, res) {
  const site = process.env.SITE_URL || "https://parrfumsvault.in";
  if (!site || !/^https:\/\/[^/?#]+\/?$/.test(site)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("SITE_URL requires owner configuration.");
  }
  try {
    const headers = {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_wpkP3QTopRIY1V-yLUgx6Q_JNFC_p3B",
    };
    const [productsResponse, offersResponse] = await Promise.all([
      fetch("https://lshwmudskeeknmcxlffe.supabase.co/rest/v1/products?select=id&active=eq.true", {
        headers, signal: AbortSignal.timeout(5000),
      }),
      fetch("https://lshwmudskeeknmcxlffe.supabase.co/rest/v1/offers?select=id&active=eq.true", {
        headers, signal: AbortSignal.timeout(5000),
      }),
    ]);
    if (!productsResponse.ok || !offersResponse.ok) throw Error();
    const [products, offers] = await Promise.all([productsResponse.json(), offersResponse.json()]);
    const base = site.replace(/\/$/, "");
    const paths = [
      "/",
      "/perfumes-mumbai",
      ...[...products, ...offers]
        .filter((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id))
        .map((p) => "/product/" + p.id),
    ];
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public,max-age=300");
    res.send(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        paths
          .map(
            (p) =>
              "<url><loc>" +
              new URL(p, base).href.replaceAll("&", "&amp;") +
              "</loc></url>",
          )
          .join("") +
        "</urlset>",
    );
  } catch {
    res.status(503).send("Catalogue temporarily unavailable.");
  }
};
