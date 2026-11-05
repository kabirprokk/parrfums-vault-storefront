const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const base = "https://lshwmudskeeknmcxlffe.supabase.co";
const key = () => process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_wpkP3QTopRIY1V-yLUgx6Q_JNFC_p3B";
async function rows(table, query) {
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, {
    headers: { apikey: key() },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error("CATALOGUE_UNAVAILABLE");
  return response.json();
}
const price = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value));
const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");

module.exports = async function (_req, res) {
  const site = process.env.SITE_URL || "https://parrfumsvault.in";
  if (!/^https:\/\/[^/?#]+\/?$/.test(site))
    return res.status(503).send("Site URL is not configured.");
  const origin = site.replace(/\/$/, "");
  try {
    const [products, offers, prices] = await Promise.all([
      rows("products", "select=id,name,description,image_path&active=eq.true&order=sort_order"),
      rows("offers", "select=id,name,description,price_inr,image_path&active=eq.true&order=sort_order"),
      rows("product_prices", "select=product_id,size_ml,price_inr,active&active=eq.true&order=size_ml"),
    ]);
    const productCards = products.map((product) => {
      const variants = prices.filter((v) => v.product_id === product.id);
      const image = new URL(product.image_path, origin + "/").href;
      return `<article class="item-card"><a href="/product/${encodeURIComponent(product.id)}"><img src="${escape(image)}" alt="${escape(product.name)} perfume by Parrfums Vault" loading="lazy" width="720" height="900"><h3>${escape(product.name)} perfume</h3></a><p>${escape(product.description)}</p><p class="prices">${variants.map((v) => `${v.size_ml}ml ${price(v.price_inr)}`).join(" · ")}</p><a class="item-link" href="/product/${encodeURIComponent(product.id)}">Explore ${escape(product.name)} →</a></article>`;
    }).join("");
    const offerCards = offers.map((offer) => {
      const image = new URL(offer.image_path, origin + "/").href;
      return `<article class="offer-card"><a href="/product/${encodeURIComponent(offer.id)}"><img src="${escape(image)}" alt="${escape(offer.name)} fragrance gift set" loading="lazy" width="720" height="900"><h3>${escape(offer.name)}</h3></a><p>${escape(offer.description)}</p><p class="prices">${price(offer.price_inr)} · shipping extra</p><a class="item-link" href="/product/${encodeURIComponent(offer.id)}">View gift set →</a></article>`;
    }).join("");
    const collectionUrl = origin + "/perfumes-mumbai";
    const organization = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Parrfums Vault",
      url: origin + "/",
      logo: origin + "/assets/parrfums-vault-logo.png",
      sameAs: ["https://www.instagram.com/parrfums.vault/"],
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+91-85919-35352",
        contactType: "customer service",
        areaServed: "IN",
      },
    };
    const collection = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Perfumes in Mumbai | Parrfums Vault",
      description: "Explore signature fragrances and gift sets from Mumbai, with Pan-India delivery.",
      url: collectionUrl,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [...products, ...offers].map((item, index) => ({
          "@type": "ListItem", position: index + 1,
          name: item.name,
          url: `${origin}/product/${encodeURIComponent(item.id)}`,
        })),
      },
    };
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perfumes in Mumbai | Signature fragrances | Parrfums Vault</title><meta name="description" content="Explore signature perfumes from Mumbai: scent profiles, curated gift sets, prices from ₹400, and delivery across India."><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${escape(collectionUrl)}"><meta property="og:type" content="website"><meta property="og:title" content="Perfumes in Mumbai | Parrfums Vault"><meta property="og:description" content="Explore signature fragrances from Mumbai, with Pan-India delivery."><meta property="og:url" content="${escape(collectionUrl)}"><meta property="og:image" content="${escape(origin + "/assets/media/editorial-essentials-1080.webp")}"><meta property="og:locale" content="en_IN"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/parrfums-vault-logo.png"><link rel="stylesheet" href="/seo-landing.css"><script type="application/ld+json">${json([organization, collection])}</script></head><body><header><a class="brand" href="/">Parrfums <em>Vault</em></a><nav aria-label="Main navigation"><a href="/">Home</a><a href="#collection">Fragrances</a><a href="#gifts">Gift sets</a><a href="#delivery">Delivery</a></nav></header><main><section class="hero"><p class="eyebrow">Handmade in Mumbai · Worn everywhere</p><h1>Find your signature perfume in Mumbai</h1><p>Explore distinctive fragrances from Parrfums Vault: expressive scent profiles, clear prices, and delivery across India. Choose a scent for yourself or browse curated gift sets.</p><a class="button" href="#collection">Explore the collection</a></section><section id="collection" class="section"><p class="eyebrow">The fragrance collection</p><h2>Signature scents, different ways to stand out</h2><p>Start with the notes you enjoy. Sweet vanilla, fresh citrus, lavender, oud, leather and warm woods each create a different impression. Read each fragrance description and compare bottle sizes before choosing.</p><div class="grid">${productCards}</div></section><section id="gifts" class="section gifts"><p class="eyebrow">Ready-to-gift edits</p><h2>Fragrance gift sets</h2><p>Explore the current combinations. Gift set prices are shown below; shipping is calculated separately by delivery location.</p><div class="grid">${offerCards}</div></section><section class="section guide"><p class="eyebrow">A simple fragrance guide</p><h2>How to choose a perfume</h2><ol><li><strong>Begin with scent families.</strong> If you like fresh profiles, look for citrus or aromatic notes. For warmer scents, explore vanilla, amber, spice or woods.</li><li><strong>Consider when you will wear it.</strong> Choose a lighter-feeling profile for daily routines or a richer character for evenings and occasions.</li><li><strong>Compare sizes and price.</strong> Parrfums Vault bottles are available in 30ml, 50ml and 100ml sizes. Check the current product page for the exact variant and price.</li><li><strong>Give a fragrance time on skin.</strong> Scent can develop after application, so allow it to settle before deciding how it wears for you.</li></ol></section><section id="delivery" class="section delivery"><p class="eyebrow">From Mumbai, across India</p><h2>Ordering and delivery</h2><p>Parrfums Vault is based in Mumbai and offers Pan-India delivery. Shipping is ₹100 within Mumbai and ₹120 elsewhere in India. Order online or contact the team on WhatsApp to ask about fragrance choices and current availability.</p><p><a class="button" href="https://wa.me/918591935352?text=Hi%20Parrfums%20Vault%2C%20help%20me%20choose%20a%20perfume">Ask us on WhatsApp</a></p><h2>Common questions</h2><h3>What sizes are available?</h3><p>Most signature fragrances are offered in 30ml, 50ml and 100ml sizes. The product page lists the live options.</p><h3>Do you deliver outside Mumbai?</h3><p>Yes. Pan-India delivery is available; shipping outside Mumbai is ₹120.</p><h3>How much does delivery cost within Mumbai?</h3><p>Mumbai delivery is ₹100. Shipping is additional to the fragrance or gift-set price.</p></section></main><footer><a href="/">Parrfums Vault</a><span>Handmade in Mumbai · Pan-India delivery</span><a href="https://www.instagram.com/parrfums.vault/">Instagram</a></footer></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public,max-age=0,s-maxage=300,stale-while-revalidate=600");
    return res.status(200).send(html);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("The fragrance collection is temporarily unavailable.");
  }
};
