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
const pages = {
  mumbai: {
    path: "/perfumes-mumbai",
    title: "Long-Lasting Perfumes in Mumbai | Parrfums Vault",
    description: "Shop long-lasting, affordable perfumes from Mumbai: distinctive scent profiles, gift sets, prices from ₹400, and delivery across India.",
    heading: "Find long-lasting, affordable perfumes in Mumbai",
    intro: "Explore distinctive, long-lasting fragrances from Parrfums Vault in Mumbai: expressive scent profiles, clear prices, and Pan-India delivery. Browse the current collection and curated gift sets.",
    productIds: () => true,
    priceLimit: Infinity,
    showOffers: true,
    productsHeading: "Signature scents, different ways to stand out",
    guide: "Start with the notes you enjoy. Sweet vanilla, fresh citrus, lavender, oud, leather and warm woods each create a different impression. Read each fragrance description and compare bottle sizes before choosing.",
  },
  best: {
    path: "/best-perfume-india",
    title: "How to Choose the Best Perfume in India | Parrfums Vault",
    description: "A practical perfume guide: compare scent notes, bottle sizes, real prices and gift options from a Mumbai fragrance brand shipping across India.",
    heading: "How to choose the best perfume for you",
    intro: "“Best” depends on the notes you enjoy, when you wear a fragrance, and what you want to spend. Compare real scent profiles and current bottle prices before choosing; explore Parrfums Vault's Mumbai collection and India-wide delivery.",
    productIds: () => true,
    priceLimit: Infinity,
    showOffers: true,
    productsHeading: "Compare the current fragrance collection",
    guide: "Try a scent family that matches your preference: fresh citrus and aromatics, sweet vanilla and fruit, or warmer oud, leather and woods. Check the product description and size options, then choose for your own taste rather than relying on a generic ranking.",
  },
  men: {
    path: "/perfumes-for-men",
    title: "Men’s Perfumes in India | Parrfums Vault",
    description: "Explore Guilty Man, a woody fresh-spicy perfume, alongside unisex fragrance options. Compare scent notes, sizes and prices with Pan-India delivery.",
    heading: "Men’s perfumes and unisex scents",
    intro: "The current men's-labelled fragrance is Guilty Man: woody and fresh-spicy, with citrus, lavender and white florals. The unisex collection offers more scent profiles to explore. Choose by notes and personal preference.",
    productIds: (p) => ["Men", "Unisex"].includes(p.gender),
    priceLimit: Infinity,
    showOffers: false,
    productsHeading: "Men’s-labelled and unisex fragrances",
    guide: "For a fresh-spicy character, compare the citrus, lavender and woods in Guilty Man. For other directions, browse the unisex profiles: citrus and oud, leather and vanilla, or sweet vanilla and warm woods. Product pages show current sizes and prices.",
  },
  women: {
    path: "/perfumes-for-women",
    title: "Perfumes for Women in India | Parrfums Vault",
    description: "Explore Candy, a playful fruit-and-vanilla perfume, plus unisex fragrance choices. Compare scent notes, bottle sizes and prices; delivery across India.",
    heading: "Perfumes for women and unisex fragrance choices",
    intro: "Candy is the current women's-labelled scent: playful fruit and vanilla, with amber, woods and a soft spicy finish. Unisex fragrances offer additional profiles for anyone who wants to explore beyond labels.",
    productIds: (p) => ["Women", "Unisex"].includes(p.gender),
    priceLimit: Infinity,
    showOffers: false,
    productsHeading: "Women’s-labelled and unisex fragrances",
    guide: "If you enjoy sweet profiles, start with Candy’s fruit, vanilla and amber notes. You can also compare the unisex fragrances: fresh citrus and oud, leather and vanilla, or warm vanilla woods. Choose based on the notes you personally enjoy.",
  },
  unisex: {
    path: "/unisex-perfumes",
    title: "Unisex Perfumes in India | Parrfums Vault",
    description: "Browse unisex perfumes from Parrfums Vault: Lavender Oud, Leather and Vanilla 28. Compare their notes, bottle sizes and live prices.",
    heading: "Unisex perfumes with distinct scent profiles",
    intro: "Explore three unisex fragrances in the current collection: citrus and oud in Lavender Oud, leather and vanilla in Leather, and sweet vanilla with warm woods in Vanilla 28. Each product page lists bottle sizes and current prices.",
    productIds: (p) => p.gender === "Unisex",
    priceLimit: Infinity,
    showOffers: false,
    productsHeading: "The unisex fragrance collection",
    guide: "Choose by character: Lavender Oud brings citrus, oud and warm spice; Leather pairs leather and vanilla with amber; Vanilla 28 layers sweet vanilla over warm woods. Read the individual descriptions to decide which profile fits your taste.",
  },
  under1000: {
    path: "/perfumes-under-1000",
    title: "Perfumes Under ₹1,000 in India | Parrfums Vault",
    description: "Compare 30ml perfumes at ₹400 and 50ml at ₹750 from Parrfums Vault. Browse real scent profiles and delivery options across India.",
    heading: "Perfumes under ₹1,000",
    intro: "Compare active 30ml and 50ml bottle options priced below ₹1,000. The current confirmed prices are ₹400 for 30ml and ₹750 for 50ml; 100ml options are priced separately. Shipping is extra.",
    productIds: () => true,
    priceLimit: 999,
    showOffers: false,
    productsHeading: "Current bottle options under ₹1,000",
    guide: "Start with a scent profile, then compare the eligible size and price shown on each card. The list is generated from active catalogue variants, so if prices or availability change, this page follows the current records.",
  },
  gifts: {
    path: "/perfume-gift-sets",
    title: "Perfume Gift Sets in India | Parrfums Vault",
    description: "Browse current Parrfums Vault perfume gift sets: The Duo Plus and The Festive Four. See what each set includes and current prices.",
    heading: "Perfume gift sets for sharing",
    intro: "Browse the current fragrance gift sets from Parrfums Vault. The Duo Plus and The Festive Four have different bottle combinations and prices; review each listing and confirm fragrance choices with the store.",
    productIds: () => false,
    priceLimit: Infinity,
    showOffers: true,
    productsHeading: "Gift-ready fragrance combinations",
    guide: "Compare the number and sizes of bottles included in each set, then check the listed price. Shipping is additional. For scent choices and current availability, contact Parrfums Vault before ordering.",
  },
};

module.exports = async function (req, res) {
  const site = process.env.SITE_URL || "https://parrfumsvault.in";
  if (!/^https:\/\/[^/?#]+\/?$/.test(site))
    return res.status(503).send("Site URL is not configured.");
  const origin = site.replace(/\/$/, "");
  const page = pages[req?.query?.page] || pages.mumbai;
  try {
    const [products, offers, prices] = await Promise.all([
      rows("products", "select=id,name,gender,description,image_path&active=eq.true&order=sort_order"),
      rows("offers", "select=id,name,description,price_inr,image_path&active=eq.true&order=sort_order"),
      rows("product_prices", "select=product_id,size_ml,price_inr,active&active=eq.true&order=size_ml"),
    ]);
    const selectedProducts = products
      .filter(page.productIds)
      .filter((product) => prices.some((v) => v.product_id === product.id && v.price_inr <= page.priceLimit));
    const productCards = selectedProducts.map((product) => {
      const variants = prices.filter((v) => v.product_id === product.id && v.price_inr <= page.priceLimit);
      const image = new URL(product.image_path, origin + "/").href;
      return `<article class="item-card"><a href="/product/${encodeURIComponent(product.id)}"><img src="${escape(image)}" alt="${escape(product.name)} perfume by Parrfums Vault" loading="lazy" width="720" height="900"><h3>${escape(product.name)} perfume</h3></a><p>${escape(product.description)}</p><p class="prices">${variants.map((v) => `${v.size_ml}ml ${price(v.price_inr)}`).join(" · ")}</p><a class="item-link" href="/product/${encodeURIComponent(product.id)}">Explore ${escape(product.name)} →</a></article>`;
    }).join("");
    const offerCards = offers.map((offer) => {
      const image = new URL(offer.image_path, origin + "/").href;
      return `<article class="offer-card"><a href="/product/${encodeURIComponent(offer.id)}"><img src="${escape(image)}" alt="${escape(offer.name)} fragrance gift set" loading="lazy" width="720" height="900"><h3>${escape(offer.name)}</h3></a><p>${escape(offer.description)}</p><p class="prices">${price(offer.price_inr)} · shipping extra</p><a class="item-link" href="/product/${encodeURIComponent(offer.id)}">View gift set →</a></article>`;
    }).join("");
    const collectionUrl = origin + page.path;
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
      name: page.title,
      description: page.description,
      url: collectionUrl,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [...selectedProducts, ...(page.showOffers ? offers : [])].map((item, index) => ({
          "@type": "ListItem", position: index + 1,
          name: item.name,
          url: `${origin}/product/${encodeURIComponent(item.id)}`,
        })),
      },
    };
    const giftsSection = page.showOffers ? `<section id="gifts" class="section gifts"><p class="eyebrow">Ready-to-gift edits</p><h2>Fragrance gift sets</h2><p>Explore the current combinations. Gift set prices are shown below; shipping is calculated separately by delivery location.</p><div class="grid">${offerCards}</div></section>` : "";
    const productSection = selectedProducts.length
      ? `<div class="grid">${productCards}</div>`
      : `<p>No current products match this filter. Please browse the full <a href="/">fragrance collection</a>.</p>`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${escape(collectionUrl)}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${escape(collectionUrl)}"><meta property="og:image" content="${escape(origin + "/assets/media/editorial-essentials-1080.webp")}"><meta property="og:locale" content="en_IN"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/parrfums-vault-logo.png"><link rel="stylesheet" href="/seo-landing.css"><script type="application/ld+json">${json([organization, collection])}</script></head><body><header><a class="brand" href="/">Parrfums <em>Vault</em></a><nav aria-label="Main navigation"><a href="/">Home</a><a href="#collection">Fragrances</a><a href="/perfumes-for-men">Men</a><a href="/perfumes-for-women">Women</a><a href="/unisex-perfumes">Unisex</a><a href="/perfumes-under-1000">Under \u20b91,000</a><a href="/best-perfume-india">Choosing guide</a><a href="/perfume-gift-sets">Gift sets</a><a href="#delivery">Delivery</a></nav></header><main><section class="hero"><p class="eyebrow">Handmade in Mumbai \u00b7 Worn everywhere</p><h1>${escape(page.heading)}</h1><p>${escape(page.intro)}</p><a class="button" href="#collection">Explore the collection</a></section><section id="collection" class="section"><p class="eyebrow">The fragrance collection</p><h2>${escape(page.productsHeading)}</h2><p>${escape(page.guide)}</p>${productSection}</section>${giftsSection}<section class="section guide"><p class="eyebrow">A simple fragrance guide</p><h2>How to choose the right perfume for you</h2><p>${escape(page.guide)}</p></section><section id="delivery" class="section delivery"><p class="eyebrow">From Mumbai, across India</p><h2>Ordering and delivery</h2><p>Parrfums Vault is based in Mumbai and offers Pan-India delivery. Shipping is \u20b9100 within Mumbai and \u20b9120 elsewhere in India. Check current product details for prices and availability.</p><p><a class="button" href="https://wa.me/918591935352?text=Hi%20Parrfums%20Vault%2C%20help%20me%20choose%20a%20perfume">Ask us on WhatsApp</a></p></section></main><footer><a href="/">Parrfums Vault</a><span>Handmade in Mumbai \u00b7 Pan-India delivery</span><a href="https://www.instagram.com/parrfums.vault/">Instagram</a></footer></body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public,max-age=0,s-maxage=300,stale-while-revalidate=600");
    return res.status(200).send(html);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("The fragrance collection is temporarily unavailable.");
  }
};
