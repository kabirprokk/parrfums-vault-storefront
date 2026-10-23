/* Commerce extensions for the existing buildless storefront. No provider secrets. */
const Commerce = (() => {
  const pending = new Map(),
    recentKey = "pv-recent-v1";
  let authIdentity = null;
  const cache = {
    reviews: new Map(),
    orders: new Map(),
    summary: [],
    popularity: [],
    components: [],
    admin: false,
    adminChecked: false,
  };
  const messages = {
    AUTH_REQUIRED: "Please sign in again to continue.",
    ADMIN_REQUIRED: "Admin access or MFA verification is missing. In Admin, choose Verify with authenticator, complete the code, then retry.",
    AUTH_MFA_REQUIRED: "Verify your authenticator to complete this protected action, then try again.",
    INVALID_ADDRESS:
      "Check your name, email, mobile number and complete Indian delivery address.",
    INVALID_QUANTITY: "Choose a valid quantity, up to 20 per item.",
    INVALID_ITEMS: "Some items could not be validated. Please review your bag.",
    INVALID_VARIANT: "This size is unavailable.",
    PRODUCT_UNAVAILABLE:
      "An item is no longer available. Please review your bag.",
    STOCK_NOT_CONFIGURED:
      "Availability has not been confirmed for this item. Please contact the store.",
    INSUFFICIENT_STOCK:
      "There is not enough stock for this quantity. Please update your bag.",
    COMBO_NOT_CONFIGURED:
      "This combo needs personal confirmation. Please contact the store.",
    INVALID_COUPON: "This coupon is invalid, inactive or expired.",
    COUPON_MINIMUM: "Your bag does not meet this coupon’s minimum value.",
    COUPON_LIMIT: "This coupon’s usage limit has been reached.",
    COUPON_PRODUCTS: "This coupon does not apply to these products.",
    REQUEST_KEY_REUSED:
      "The order details changed. Review your bag before trying again.",
    PRICING_CHANGED:
      "Prices or discounts changed. Review the updated total before confirming.",
    TRY_LATER: "Please wait a moment before trying again.",
    PAYMENT_REQUIRED: "Payment must be verified before fulfilment.",
    INVALID_STATUS_TRANSITION: "That order status change is not allowed.",
    ORDER_EXPIRED:
      "This order reservation has expired. Review availability before ordering again.",
    ORDER_NOT_FOUND: "We could not find that order. Refresh your order history and try again.",
    ALREADY_PAID: "This order is already paid. Refresh your order status before taking another action.",
    PAYMENT_NOT_FOUND: "We could not find the payment attempt. Refresh the order and try again.",
    PAYMENT_AMOUNT_MISMATCH: "The payment total no longer matches this order. Refresh the order before retrying.",
    ORDER_LIMIT_EXCEEDED: "This order is above the online order limit. Contact the store for help.",
    INVALID_IMAGE: "That image could not be saved. Choose a supported image from the media library.",
    INVALID_PRODUCT: "Some product details are missing or invalid. Review the form and try again.",
    INVALID_OFFER: "Some combo details are missing or invalid. Review the form and try again.",
    INVALID_STATUS: "Choose a valid status and try again.",
    INVALID_STATUS_TRANSITION: "That order status change is not available. Refresh the order and try again.",
    NOT_FOUND: "That item could not be found. Refresh the page and try again.",
  };
  const safeError = (error) => {
    const text = String(error?.message || error || "");
    for (const [code, label] of Object.entries(messages))
      if (text.includes(code)) return label;
    if (
      error?.status === 401 ||
      text.includes("JWT") ||
      text.includes("session")
    )
      return messages.AUTH_REQUIRED;
    if (error?.status === 429 || text.includes("429")) return "Too many attempts in a short time. Please wait a moment and try again.";
    if (text.includes("Failed to fetch") || text.includes("NetworkError") || text.includes("Load failed")) return "We couldn’t reach the store securely. Check your connection and try again.";
    if (!navigator.onLine)
      return "You are offline. Reconnect and try again; your bag is still saved.";
    if (text.includes("Abort") || text.includes("timeout"))
      return "The request took too long. Check order history before retrying an order.";
    return "We could not complete that request. Please try again. Your order has not been marked as paid.";
  };
  async function rpc(name, args = {}) {
    if (!supabaseClient) throw Error("AUTH_REQUIRED");
    const key = name + JSON.stringify(args);
    if (pending.has(key)) return pending.get(key);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    const operation = (async () => {
      try {
        const result = await supabaseClient
          .rpc(name, args)
          .abortSignal(controller.signal);
        if (result.error) throw result.error;
        return result.data;
      } finally {
        clearTimeout(timer);
        pending.delete(key);
      }
    })();
    pending.set(key, operation);
    return operation;
  }
  async function read(table, select = "*", configure = (q) => q) {
    if (!supabaseClient) throw Error("AUTH_REQUIRED");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await configure(
        supabaseClient.from(table).select(select),
      ).abortSignal(controller.signal);
      if (result.error) throw result.error;
      return result.data || [];
    } finally {
      clearTimeout(timer);
    }
  }
  const variant = (p, size) =>
    p?.variants?.find((v) => v.size_ml === Number(size));
  function stock(p, size) {
    if (!p)
      return { available: false, label: "Product unavailable", quantity: 0 };
    if (isCombo(p)) {
      const components = cache.components.filter((c) => c.offer_id === p.id);
      if (!components.length)
        return {
          available: false,
          label: "Confirm combo availability with the store",
          quantity: null,
        };
      let count = Infinity;
      for (const c of components) {
        const v = variant(get(c.product_id), c.size_ml);
        if (
          !v?.active ||
          v.available_quantity === null ||
          !Number.isInteger(v.available_quantity)
        )
          return {
            available: false,
            label: "Availability awaiting confirmation",
            quantity: null,
          };
        count = Math.min(count, Math.floor(v.available_quantity / c.quantity));
      }
      return {
        available: count > 0,
        label: count > 0 ? "Available" : "Out of stock",
        quantity: count,
      };
    }
    const v = variant(p, size);
    if (!v || v.available_quantity === null)
      return {
        available: false,
        label: "Availability awaiting confirmation",
        quantity: null,
      };
    if (!v.active || v.available_quantity === 0)
      return { available: false, label: "Out of stock", quantity: 0 };
    return {
      available: true,
      label:
        v.available_quantity <= v.low_stock_threshold
          ? "Low stock"
          : "Available",
      quantity: v.available_quantity,
    };
  }
  const available = (p, size) =>
    !p
      ? false
      : size !== undefined
        ? stock(p, size).available
        : isCombo(p)
          ? stock(p, 0).available
          : (p.sizes || []).some((s) => stock(p, s).available);
  function badge(p, size = DEFAULT_SIZE) {
    const s = stock(p, size);
    return `<span class="stock-state ${s.available ? "available" : "unavailable"}">${esc(s.label)}</span>`;
  }
  function list(source) {
    const query = state.query.trim().toLowerCase(),
      f = state.filters || {};
    let rows = source.filter(
      (p) =>
        (state.category === "All" ||
          p.category === state.category ||
          p.fragrance_family === state.category) &&
        `${p.name} ${p.notes} ${p.category} ${p.fragrance_family || ""} ${p.gender}`
          .toLowerCase()
          .includes(query),
    );
    rows = rows.filter(
      (p) =>
        (!f.family || p.fragrance_family === f.family) &&
        (!f.size || p.sizes.includes(Number(f.size))) &&
        (!f.availability ||
          (f.availability === "available") === available(p)) &&
        (!f.maxPrice ||
          p.sizes.some(
            (s) =>
              (!f.size || s === Number(f.size)) &&
              priceFor(p, s) <= Number(f.maxPrice),
          )),
    );
    const price = (p) =>
      Math.min(
        ...p.sizes
          .filter((s) => !f.size || s === Number(f.size))
          .map((s) => priceFor(p, s)),
      );
    if (state.sort === "price-asc") rows.sort((a, b) => price(a) - price(b));
    if (state.sort === "price-desc") rows.sort((a, b) => price(b) - price(a));
    if (state.sort === "newest")
      rows.sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      );
    if (state.sort === "popular")
      rows.sort(
        (a, b) =>
          (Number(cache.popularity.find((x) => x.product_id === b.id)?.units) ||
            0) -
            (Number(
              cache.popularity.find((x) => x.product_id === a.id)?.units,
            ) || 0) || a.name.localeCompare(b.name),
      );
    if (state.sort === "name")
      rows.sort((a, b) => a.name.localeCompare(b.name));
    if (state.sort === "name-desc")
      rows.sort((a, b) => b.name.localeCompare(a.name));
    if (state.sort === "category")
      rows.sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      );
    return rows;
  }
  function filters() {
    const f = state.filters || {};
    return `<details class="commerce-filters-wrap" open><summary>Filters &amp; search</summary><div class="commerce-filters"><div class="field"><label for="catalogue-search">Search fragrance</label><input id="catalogue-search" type="search" value="${esc(state.query)}" maxlength="100" placeholder="Name, notes or family"></div><div class="field"><label for="filter-family">Fragrance family</label><select id="filter-family" class="select"><option value="">All families</option>${[
      ...new Set(products.map((p) => p.fragrance_family).filter(Boolean)),
    ]
      .sort()
      .map(
        (v) =>
          `<option value="${esc(v)}" ${f.family === v ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label for="filter-size">Bottle size</label><select id="filter-size" class="select"><option value="">All sizes</option>${[
      ...new Set(products.flatMap((p) => p.sizes)),
    ]
      .sort((a, b) => a - b)
      .map(
        (s) =>
          `<option value="${s}" ${Number(f.size) === s ? "selected" : ""}>${s}ml</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label for="filter-price">Maximum price (₹)</label><input id="filter-price" type="number" min="0" max="10000000" value="${esc(f.maxPrice || "")}" placeholder="Any price"></div><div class="field"><label for="filter-availability">Availability</label><select id="filter-availability" class="select"><option value="">Any availability</option><option value="available" ${f.availability === "available" ? "selected" : ""}>Available</option><option value="unavailable" ${f.availability === "unavailable" ? "selected" : ""}>Unavailable / unconfirmed</option></select></div><button class="btn ghost" data-apply-filters>Apply filters</button></div></details>`;
  }
  function recentIds() {
    try {
      const v = JSON.parse(localStorage.getItem(recentKey) || "[]");
      return Array.isArray(v)
        ? v.filter((id) => typeof id === "string").slice(0, 8)
        : [];
    } catch {
      return [];
    }
  }
  function remember(id) {
    const ids = [id, ...recentIds().filter((x) => x !== id)].slice(0, 8);
    try {
      localStorage.setItem(recentKey, JSON.stringify(ids));
    } catch {}
    analytics("product_viewed", { product_id: id });
  }
  function recent(exclude) {
    const rows = recentIds()
      .filter((id) => id !== exclude)
      .map(get)
      .filter((p) => p && !isCombo(p));
    return rows.length
      ? `<section class="related"><h2>Recently viewed</h2><div class="product-grid">${rows.slice(0, 3).map(card).join("")}</div></section>`
      : "";
  }
  function facts(p) {
    const labels = {
      top_notes: "Top notes",
      heart_notes: "Heart notes",
      base_notes: "Base notes",
      fragrance_family: "Fragrance family",
      longevity: "Longevity",
      projection: "Projection",
      occasion: "Occasion",
      season: "Season",
      usage_information: "Usage & storage",
    };
    const facts = Object.entries(labels).flatMap(([key, label]) => {
      const value = p[key];
      const text = Array.isArray(value) ? value.join(" · ") : value;
      return text ? `<div><dt>${label}</dt><dd>${esc(text)}</dd></div>` : [];
    });
    return facts.length
      ? `<dl class="perfume-facts">${facts.join("")}</dl>`
      : "";
  }
  function recommendations(p) {
    const related = products.filter(
      (x) =>
        x.id !== p.id &&
        ((p.fragrance_family && x.fragrance_family === p.fragrance_family) ||
          x.category === p.category),
    );
    const sets = combos.filter((c) =>
      cache.components.some(
        (component) =>
          component.offer_id === c.id && component.product_id === p.id,
      ),
    );
    return `${related.length ? `<section class="related"><h2>Related fragrances</h2><p class="sub">From the same ${p.fragrance_family ? "fragrance family" : "catalogue mood"}.</p><div class="product-grid">${related.slice(0, 3).map(card).join("")}</div></section>` : ""}${sets.length ? `<section class="related"><h2>Combos featuring ${esc(p.name)}</h2><div class="combo-grid">${sets.map(offerCard).join("")}</div></section>` : ""}${recent(p.id)}`;
  }
  function share(p) {
    return `<div class="share-actions" role="group" aria-label="Share ${esc(p.name)}"><button class="text-link" data-copy-product="${p.id}">Copy link</button><a class="text-link" href="https://wa.me/?text=${encodeURIComponent(p.name + " — " + productUrl(p.id))}" target="_blank" rel="noreferrer">Share on WhatsApp</a>${navigator.share ? `<button class="text-link" data-native-share="${p.id}">Share</button>` : ""}</div>`;
  }
  const productUrl = (id) =>
    `${location.origin}/product/${encodeURIComponent(id)}`;
  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
  const statusLabel = (status) =>
    String(status || "")
      .replaceAll("_", " ")
      .replace(/^./, (x) => x.toUpperCase());
  async function onAuth(user) {
    const uid = user?.id;
    const identityChanged = authIdentity !== (uid || null);
    authIdentity = uid || null;
    if (identityChanged) {
      Commerce.resetAdmin?.();
      cache.admin = false;
      cache.adminChecked = false;
    }
    cache.orders.clear();
    if (user) {
      try {
        const allowed = await rpc("is_admin");
        if (authUser?.id !== uid) return;
        cache.admin = allowed;
      } catch {}
    }
    cache.adminChecked = true;
    if (currentPath === "admin" && (identityChanged || !cache.admin))
      render("admin", { keepScroll: true });
    document
      .querySelector("[data-admin-link]")
      ?.toggleAttribute("hidden", !cache.admin);
  }
  function analytics(name, details = {}) {
    let enabled = false;
    try {
      enabled = localStorage.getItem("pv-analytics-consent") === "yes";
    } catch {}
    if (
      !enabled ||
      navigator.globalPrivacyControl ||
      navigator.doNotTrack === "1"
    )
      return;
    const allowed = [
      "product_viewed",
      "search",
      "add_to_cart",
      "remove_from_cart",
      "wishlist",
      "begin_checkout",
      "coupon_applied",
      "purchase_completed",
    ];
    if (!allowed.includes(name)) return;
    const safe = {};
    for (const key of [
      "product_id",
      "size_ml",
      "quantity",
      "result_count",
      "order_id",
    ])
      if (typeof details[key] === "string" || Number.isFinite(details[key]))
        safe[key] = details[key];
    window.dispatchEvent(
      new CustomEvent("pv:analytics", {
        detail: { name, properties: safe, timestamp: new Date().toISOString() },
      }),
    );
  }
  document.addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-copy-product]"),
      native = e.target.closest("[data-native-share]");
    if (copy || native) {
      const id = (copy || native).dataset[copy ? "copyProduct" : "nativeShare"];
      try {
        if (copy) {
          await navigator.clipboard.writeText(productUrl(id));
          toast("Product link copied");
        } else
          await navigator.share({ title: get(id)?.name, url: productUrl(id) });
      } catch (error) {
        if (error.name !== "AbortError")
          toast(
            "Sharing is unavailable in this browser. You can copy the page address.",
          );
      }
    }
    if (e.target.closest("[data-apply-filters]")) {
      state.query = document
        .querySelector("#catalogue-search")
        .value.slice(0, 100);
      state.filters = {
        family: document.querySelector("#filter-family").value,
        size: document.querySelector("#filter-size").value,
        maxPrice: document.querySelector("#filter-price").value,
        availability: document.querySelector("#filter-availability").value,
      };
      render("shop", { keepScroll: true });
      analytics("search", { result_count: list(products).length });
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "catalogue-search" && e.key === "Enter") {
      e.preventDefault();
      document.querySelector("[data-apply-filters]").click();
    }
  });
  window.addEventListener("offline", () => {
    announce("You are offline. Your bag is saved.");
    toast("You are offline. Your bag is saved.");
  });
  window.addEventListener("online", () => {
    announce("Connection restored.");
    toast("Connection restored");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "am-cart") {
      state.cart = readStore("am-cart", []);
      normalizeCart();
      Commerce.checkoutState.quote = null;
      updateCounts();
      if (["cart", "checkout"].includes(currentPath))
        render(currentPath, { keepScroll: true });
    }
    if (event.key === "am-wish" && !authUser) {
      state.wish = readStore("am-wish", []);
      if (currentPath === "wishlist") render("wishlist", { keepScroll: true });
      updateCounts();
    }
  });
  return {
    cache,
    rpc,
    read,
    safeError,
    variant,
    stock,
    available,
    badge,
    list,
    filters,
    remember,
    recent,
    facts,
    recommendations,
    share,
    productUrl,
    formatDate,
    statusLabel,
    onAuth,
    analytics,
  };
})();
