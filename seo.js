/* Metadata reflects current catalogue records; no synthetic ratings or stock. */
Object.assign(
  Commerce,
  (() => {
    const labels = {
      landing: "Handmade fragrance from Mumbai",
      home: "Explore the vault",
      shop: "Shop fragrance",
      combos: "Fragrance combos",
      collections: "Fragrance collections",
      finder: "Find your fragrance",
      about: "About Parrfums Vault",
      cart: "Your bag",
      wishlist: "Your wishlist",
      account: "Your account",
      checkout: "Checkout",
      tracking: "Track your order",
      admin: "Administration",
      privacy: "Privacy Policy",
      terms: "Terms & Conditions",
      shipping: "Shipping Policy",
      returns: "Return & Refund Policy",
      cancellation: "Cancellation Policy",
      contact: "Contact",
      faq: "Frequently asked questions",
    };
    function meta(key, value, property = false) {
      let el = document.head.querySelector(
        `meta[${property ? "property" : "name"}="${key}"]`,
      );
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(property ? "property" : "name", key);
        document.head.append(el);
      }
      el.content = value;
    }
    function seo(route) {
      const p = route.startsWith("product/") ? get(route.split("/")[1]) : null;
      const label = p
        ? p.name
        : labels[route] ||
          (route.startsWith("orders/") ? "Your order" : "Page not found");
      const description = p
        ? String(p.desc || p.notes || p.name).slice(0, 180)
        : `${label}. Discover Parrfums Vault fragrances and the current collection.`;
      document.title = label + " | Parrfums Vault";
      meta("description", description);
      meta("og:title", document.title, true);
      meta("og:description", description, true);
      meta("og:type", p ? "product" : "website", true);
      const url = p
        ? Commerce.productUrl(p.id)
        : route === "admin"
          ? location.origin + "/admin"
          : location.origin +
          "/" +
          (["landing", "home"].includes(route) ? "" : "#" + route);
      meta("og:url", url, true);
      meta(
        "og:image",
        new URL(
          p?.img || "assets/media/editorial-essentials-1080.webp",
          location.origin + "/",
        ).href,
        true,
      );
      meta("twitter:card", "summary_large_image");
      meta("twitter:title", document.title);
      meta("twitter:description", description);
      meta(
        "twitter:image",
        document.head.querySelector('[property="og:image"]').content,
      );
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.append(canonical);
      }
      canonical.href = url;
      meta(
        "robots",
        [
          "cart",
          "checkout",
          "account",
          "admin",
          "wishlist",
          "tracking",
        ].includes(route) || route.startsWith("orders/")
          ? "noindex,nofollow"
          : "index,follow",
      );
      document.querySelector("#pv-structured")?.remove();
      if (!p) return;
      const offers = isCombo(p)
        ? [{ price: p.price, priceCurrency: "INR", url }]
        : p.sizes.map((size) => {
            const v = Commerce.variant(p, size),
              s = Commerce.stock(p, size);
            return {
              "@type": "Offer",
              price: priceFor(p, size),
              priceCurrency: "INR",
              url,
              ...(v?.sku ? { sku: v.sku } : {}),
              ...(v?.available_quantity !== null &&
              v?.available_quantity !== undefined
                ? {
                    availability:
                      "https://schema.org/" +
                      (s.available ? "InStock" : "OutOfStock"),
                  }
                : {}),
            };
          });
      const rating = Commerce.cache.summary.find((r) => r.product_id === p.id);
      const product = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.desc,
        image: new URL(p.img, location.origin + "/").href,
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
      };
      const data = [
        product,
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Parrfums Vault",
              item: location.origin + "/",
            },
            { "@type": "ListItem", position: 2, name: p.name, item: url },
          ],
        },
      ];
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "pv-structured";
      script.textContent = JSON.stringify(data);
      document.head.append(script);
    }
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#product/"]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const route = a.getAttribute("href").slice(1);
      history.pushState(null, "", "/" + route);
      render(route);
    });
    window.addEventListener("popstate", () =>
      render(location.hash.slice(1) || location.pathname.slice(1) || "landing"),
    );
    return { seo };
  })(),
);
