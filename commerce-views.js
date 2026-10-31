/* Customer interfaces share the existing account, cart, Supabase client and styles. */
Object.assign(
  Commerce,
  (() => {
    const checkoutState = {
      quote: null,
      payload: null,
      busy: false,
      error: "",
      notice: "",
      consented: false,
      orderId: null,
    };
    const tracking = new Map();
    const reviewStar = filled => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="m12 2.5 2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.11 1.13-6.58-4.78-4.66 6.6-.96L12 2.5Z"/></svg>`;
    let sdkPromise;
    function cartItems() {
      return state.cart.map((i) => ({
        kind: i.combo ? "offer" : "product",
        id: i.id,
        ...(i.combo ? {} : { size_ml: i.size }),
        quantity: i.qty,
      }));
    }
    function payload(form) {
      const f = new FormData(form),
        v = (name) => String(f.get(name) || "").trim();
      return {
        p_items: cartItems(),
        p_delivery: {
          recipient_name: [v("first"), v("last")].filter(Boolean).join(" "),
          email: v("email"),
          phone: v("phone"),
          address_line1: v("address"),
          address_line2: v("address2"),
          city: v("city"),
          state: v("state"),
          postal_code: v("pin"),
        },
        p_coupon: v("coupon").toUpperCase() || null,
      };
    }
    function checkout() {
      if (!state.cart.length)
        return `<section class="page-shell"><h1 class="page-title">Your bag is empty.</h1><p class="sub">Choose a fragrance before checkout.</p><a class="btn" href="#shop">Explore fragrance</a></section>`;
      Commerce.analytics("begin_checkout");
      if (!authUser)
      return `<section class="page-shell"><p class="eyebrow">Choose how to continue</p><h1 class="page-title">Your next signature.</h1><p class="page-intro">Sign in to check availability, apply a coupon and save a persistent order. Prefer to speak to us? Guest enquiries remain available on WhatsApp.</p><button class="btn primary" data-auth-sign-in>Sign in for checkout</button>${waLink(orderMessage(state.cart.reduce((n, i) => n + i.price * i.qty, 0)), "Enquire on WhatsApp", "btn ghost wa-btn")}<p class="sub">A WhatsApp enquiry does not automatically create an order or reserve stock.</p><a class="text-link" href="#cart">Return to bag</a></section>`;
      let draft = {};
      try {
        draft = JSON.parse(
          sessionStorage.getItem("pv-checkout-draft:" + authUser.id) || "{}",
        );
      } catch {}
      const a =
        savedAddresses.find((x) => x.is_default) || savedAddresses[0] || {};
      const name = String(
        draft.recipient_name ||
          a.recipient_name ||
          accountProfile?.full_name ||
          authUser.user_metadata?.full_name ||
          "",
      ).split(/\s+/);
      const fields = [
        ["first", "First name", name.shift() || "", "given-name", 60],
        ["last", "Last name (optional)", name.join(" "), "family-name", 60],
        ["email", "Email", draft.email || authUser.email || "", "email", 254],
        [
          "phone",
          "Mobile number",
          draft.phone || a.phone || accountProfile?.phone || "",
          "tel-national",
          10,
        ],
        [
          "address",
          "Street address",
          draft.address_line1 || a.address_line1 || "",
          "street-address",
          200,
        ],
        [
          "address2",
          "Apartment / area (optional)",
          draft.address_line2 || a.address_line2 || "",
          "address-line2",
          200,
        ],
        ["city", "City", draft.city || a.city || "", "address-level2", 80],
        ["state", "State", draft.state || a.state || "", "address-level1", 80],
        [
          "pin",
          "PIN code",
          draft.postal_code || a.postal_code || "",
          "postal-code",
          6,
        ],
      ];
      return `<section class="page-shell"><p class="eyebrow">Almost yours</p><h1 class="page-title">Checkout</h1><p class="page-intro">Review the server-confirmed price, availability and delivery total before placing your order. Payment is verified separately.</p><div class="checkout"><form id="checkout-form" novalidate><div class="field full-field location-tools"><button class="btn ghost small" type="button" data-use-location="checkout">Use my location to fill address</button><span class="sub" data-location-status role="status">Optional. Your browser will ask permission first.</span></div><div class="form-grid">${fields.map(([id, label, value, auto, max]) => `<div class="field ${["email", "phone", "address", "address2"].includes(id) ? "full-field" : ""}"><label for="${id}">${label}</label><input id="${id}" name="${id}" value="${esc(value)}" maxlength="${max}" autocomplete="${auto}" type="${id === "email" ? "email" : id === "phone" ? "tel" : "text"}" ${["last", "address2"].includes(id) ? "" : "required"} ${["phone", "pin"].includes(id) ? 'inputmode="numeric"' : ""} aria-describedby="err-${id}"><span id="err-${id}" class="field-error"></span></div>`).join("")}</div><div class="field coupon-field"><label for="coupon">Coupon (optional)</label><input id="coupon" name="coupon" maxlength="40" autocomplete="off" value="${esc(checkoutState.payload?.p_coupon || "")}"></div><label class="order-consent"><input type="checkbox" id="order-consent"> I agree to save these delivery details and this order to my account. <a href="#privacy">Privacy information</a>.</label><div id="form-error" class="error" role="alert">${esc(checkoutState.error)}</div><p class="sub" data-checkout-notice role="status">${esc(checkoutState.notice)}</p><div class="checkout-actions"><button class="btn ghost" type="button" data-quote-checkout ${!catalogueReady ? "disabled" : ""}>Review availability & total</button><button class="btn primary" type="submit" disabled ${!catalogueReady ? "disabled" : ""}>Review order</button></div>${!catalogueReady ? '<p class="error">Online checkout is temporarily unavailable. Your bag is saved; you can contact the store.</p>' : ""}<p class="sub">Shipping is extra: Mumbai ₹100 · Outside Mumbai ₹120.</p></form><aside class="summary" data-server-summary>${summary()}</aside></div></section>`;
    }
    function summary() {
      const q = checkoutState.quote;
      return `<h2>Order summary</h2>${(q?.items || state.cart.map((i) => ({ item_name: i.name, quantity: i.qty, size_ml: i.size, line_total_inr: i.price * i.qty }))).map((i) => `<div class="sum-line"><span>${esc(i.item_name)} × ${i.quantity}${i.size_ml ? `<small>${i.size_ml}ml</small>` : ""}</span><span>${money(i.line_total_inr)}</span></div>`).join("")}${q ? `<div class="sum-line"><span>Subtotal</span><span>${money(q.subtotal_inr)}</span></div><div class="sum-line"><span>Shipping</span><span>${money(q.shipping_inr)}</span></div><div class="sum-line"><span>Discount</span><span>−${money(q.discount_inr)}</span></div><div class="sum-line total"><span>Confirmed total</span><span>${money(q.total_inr)}</span></div>` : '<p class="sub">Review availability & total to confirm prices, shipping and any coupon on the server.</p>'}`;
    }
    function notice(text, error = false) {
      const el = document.querySelector(
        error ? "#form-error" : "[data-checkout-notice]",
      );
      if (el) el.textContent = text;
      checkoutState[error ? "error" : "notice"] = text;
    }
    function busy(value, label) {
      checkoutState.busy = value;
      document
        .querySelectorAll("#checkout-form button")
        .forEach((b) => (b.disabled = value || (b.matches('[type="submit"]') && !document.querySelector('#order-consent')?.checked)));
      const b = document.querySelector('#checkout-form [type="submit"]');
      if (b) b.textContent = value ? label : "Place order";
    }
    function validate(form) {
      const p = payload(form),
        d = p.p_delivery;
      let invalid = false;
      for (const id of [
        "first",
        "last",
        "email",
        "phone",
        "address",
        "address2",
        "city",
        "state",
        "pin",
      ]) {
        const el = form.elements[id],
          value = el.value.trim();
        let message = "";
        if (!["last", "address2"].includes(id) && !value) message = "Required";
        else if (id === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          message = "Enter a valid email";
        else if (id === "phone" && !/^[6-9]\d{9}$/.test(value))
          message = "Enter a valid 10-digit Indian mobile number";
        else if (id === "pin" && !/^[1-9]\d{5}$/.test(value))
          message = "Enter a valid 6-digit PIN code";
        else if (id === "address" && value.length < 4)
          message = "Enter a complete street address";
        if (value.length > el.maxLength) message = "This value is too long";
        document.getElementById("err-" + id).textContent = message;
        el.setAttribute("aria-invalid", String(!!message));
        if (message && !invalid) {
          el.focus();
          invalid = true;
        }
      }
      if (d.recipient_name.length > 120) {
        notice("Please shorten the recipient name to 120 characters.", true);
        return null;
      }
      return invalid ? null : p;
    }
    async function quote(form) {
      if (checkoutState.busy) return null;
      const p = validate(form);
      if (!p) return null;
      notice("", true);
      busy(true, "Checking availability…");
      window.PVLoader?.show("Confirming availability and shipping");
      try {
        const q = await Commerce.rpc("quote_checkout", p);
        checkoutState.quote = q;
        checkoutState.payload = p;
        try {
          sessionStorage.setItem(
            "pv-checkout-draft:" + authUser.id,
            JSON.stringify(p.p_delivery),
          );
        } catch {}
        document.querySelector("[data-server-summary]").innerHTML = summary();
        checkoutState.consented = Boolean(form.querySelector("#order-consent")?.checked);
        notice("Your total is confirmed. Review your delivery details and items next.");
        if (p.p_coupon) Commerce.analytics("coupon_applied");
        location.hash = "#checkout-review";
        return q;
      } catch (error) {
        checkoutState.quote = null;
        notice(Commerce.safeError(error), true);
        return null;
      } finally {
        busy(false);
        window.PVLoader?.hide();
      }
    }
    function checkoutReview() {
      const q = checkoutState.quote, p = checkoutState.payload;
      if (!q || !p) return `<section class="page-shell"><p class="eyebrow">Checkout</p><h1 class="page-title">Review your order</h1><p class="page-intro">Your checkout details need to be confirmed again.</p><a class="btn primary" href="#checkout">Return to checkout</a></section>`;
      const d = p.p_delivery;
      const lines = q.items || [];
      return `<section class="page-shell checkout-review-page"><p class="eyebrow">Before we wrap it</p><h1 class="page-title">Review your order.</h1><p class="page-intro">Check the delivery details and total. Your address determines the shipping fee.</p><div class="checkout-review-grid"><article class="summary"><h2>Your fragrances</h2>${lines.map(i=>`<div class="sum-line"><span>${esc(i.item_name)} × ${i.quantity}${i.size_ml?`<small>${i.size_ml}ml</small>`:''}</span><strong>${money(i.line_total_inr)}</strong></div>`).join('')}<div class="sum-line"><span>Subtotal</span><span>${money(q.subtotal_inr)}</span></div><div class="sum-line"><span>Shipping</span><span>${money(q.shipping_inr)}</span></div>${q.discount_inr?`<div class="sum-line"><span>Discount</span><span>−${money(q.discount_inr)}</span></div>`:''}<div class="sum-line total"><strong>Total</strong><strong>${money(q.total_inr)}</strong></div></article><article class="summary"><h2>Deliver to</h2><p>${esc(d.recipient_name)}<br>${esc(d.phone)}<br>${esc(d.email)}<br>${esc(d.address_line1)}${d.address_line2?`<br>${esc(d.address_line2)}`:''}<br>${esc(d.city)}, ${esc(d.state)} ${esc(d.postal_code)}</p><button type="button" class="text-link" data-edit-checkout>Change delivery details</button></article></div><label class="order-consent review-consent"><input type="checkbox" data-review-consent ${checkoutState.consented?'checked':''}> I agree to save these delivery details and this order to my account. <a href="#privacy">Privacy information</a>.</label><p class="sub" data-review-notice role="status"></p><div class="checkout-review-actions"><a class="btn ghost" href="#checkout">Back</a><button class="btn primary" type="button" data-place-order ${checkoutState.consented?'':'disabled'}>Place order &amp; pay securely</button></div><p class="payment-security-note"><strong>Secure payment with Razorpay.</strong> Your payment session is created for this order when you continue, so there is no fixed payment link to preview on hover. Enter your card or UPI details in Razorpay checkout; Parrfums Vault does not store those payment details.</p></section>`;
    }
    async function requestKey(p) {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(authUser.id + JSON.stringify(p)),
      );
      const hash = [...new Uint8Array(bytes)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const key = "pv-checkout-request:" + hash;
      let id;
      try {
        id = localStorage.getItem(key);
      } catch {}
      if (!/^[0-9a-f-]{36}$/i.test(id || "")) {
        id = crypto.randomUUID();
        try {
          localStorage.setItem(key, id);
        } catch {}
      }
      return id;
    }
    async function submit(form) {
      if (checkoutState.busy) return;
      if (!authUser) {
        location.hash = "#account";
        return;
      }
      const p = form ? validate(form) : checkoutState.payload;
      if (!p) return;
      const consented = form ? form.querySelector("#order-consent")?.checked : checkoutState.consented;
      if (!consented) {
        const reviewNotice = document.querySelector('[data-review-notice]');
        if (reviewNotice) reviewNotice.textContent = "Please agree before placing your order.";
        document.querySelector('[data-review-consent]')?.focus();
        return;
      }
      if (checkoutState.orderId) {
        const button = document.querySelector('[data-place-order]');
        if (button) void pay(checkoutState.orderId, button);
        return;
      }
      if (
        !checkoutState.quote ||
        JSON.stringify(p) !== JSON.stringify(checkoutState.payload)
      ) {
        await quote(form);
        return;
      }
      busy(true, "Placing order…");
      window.PVLoader?.show("Preparing your secure checkout");
      notice("", true);
      try {
        const nonce = await requestKey(p);
        const id = await Commerce.rpc("checkout_order", {
          ...p,
          p_request_key: nonce,
          p_quote_hash: checkoutState.quote.quote_hash,
        });
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("INVALID_ORDER_RESPONSE");
        checkoutState.orderId = id;
        let orderEmailSent = false;
        try {
          const { data } = await supabaseClient.auth.getSession();
          if (data.session) {
            const emailResponse = await fetch(
              SUPABASE_URL + "/functions/v1/order-email",
              {
                method: "POST",
                headers: {
                  Authorization: "Bearer " + data.session.access_token,
                  apikey: CATALOGUE_KEY,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ order_id: id }),
                signal: AbortSignal.timeout(8000),
              },
            );
            orderEmailSent = emailResponse.ok;
          }
        } catch {}
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (
              key.startsWith("pv-checkout-request:") &&
              localStorage.getItem(key) === nonce
            )
              localStorage.removeItem(key);
          }
        } catch {}
        state.cart = [];
        save();
        try {
          sessionStorage.removeItem("pv-checkout-draft:" + authUser.id);
        } catch {}
        checkoutState.quote = null;
        checkoutState.payload = null;
        checkoutState.notice = "";
        checkoutState.error = "";
        Commerce.cache.orders.delete(id);
        try { sessionStorage.setItem("pv-open-payment-after-order", id); } catch {}
        location.hash = "#orders/" + id;
        if (!orderEmailSent)
          toast("Order placed. Email confirmation is unavailable; your order is saved in your account.");
        void refreshAccountData(authUser);
      } catch (error) {
        const reviewNotice = document.querySelector('[data-review-notice]');
        if (reviewNotice) reviewNotice.textContent = Commerce.safeError(error);
        else notice(Commerce.safeError(error), true);
        if (String(error.message).includes("PRICING_CHANGED")) {
          checkoutState.quote = null;
          document.querySelector("[data-server-summary]").innerHTML = summary();
        }
      } finally {
        busy(false);
        window.PVLoader?.hide();
      }
    }
    function history(orders) {
      if (accountLoading)
        return '<p class="sub" role="status">Loading your orders…</p>';
      if (!orders.length)
        return '<div class="empty"><h3>No orders yet.</h3><p>Your saved orders and tracking updates will appear here.</p><a class="text-link" href="#shop">Explore fragrance</a></div>';
      return orders
        .map(
          (o) =>
            `<article class="history-order"><div class="section-head"><div><h3>${esc(Commerce.shortOrderReference(o.order_number || o.id.slice(0, 8).toUpperCase()))}</h3><p class="sub">${Commerce.formatDate(o.created_at)} · ${Commerce.statusLabel(o.status)} · ${Commerce.statusLabel(o.payment_status)}</p></div><strong>${money(o.total_inr)}</strong></div><ul>${(o.customer_order_items || []).map((i) => `<li>${esc(i.item_name)}${i.size_ml ? ` · ${i.size_ml}ml` : ""} × ${i.quantity} — ${money(i.line_total_inr)}</li>`).join("")}</ul><div class="offer-actions"><a class="btn" href="#orders/${o.id}">View order & tracking</a><a class="btn ghost" href="#shop">Continue shopping</a></div></article>`,
        )
        .join("");
    }
    function reorder(order) {
      let added = 0,
        skipped = 0;
      for (const line of order.customer_order_items || []) {
        const p = get(line.product_id || line.offer_id),
          size = line.size_ml || 0,
          s = Commerce.stock(p, size);
        const existing = state.cart.find(
          (x) => x.id === p?.id && x.size === size,
        );
        const room = Math.min(20, s.quantity || 0) - (existing?.qty || 0);
        const qty = Math.min(line.quantity, room);
        if (!p || !s.available || qty < 1) {
          skipped++;
          continue;
        }
        if (existing) {
          existing.qty += qty;
          existing.price = priceFor(p, size);
        } else
          state.cart.push({
            id: p.id,
            name: p.name,
            notes: p.notes,
            img: p.img,
            size,
            price: priceFor(p, size),
            qty,
            combo: isCombo(p),
            badge: p.badge || "",
          });
        added += qty;
      }
      save();
      toast(
        `${added} item${added === 1 ? "" : "s"} added at current prices${skipped ? `; ${skipped} unavailable item${skipped === 1 ? "" : "s"} skipped` : ""}`,
      );
      if (added) location.hash = "#cart";
    }
    async function fetchOrder(id) {
      const uid = authUser?.id;
      if (!uid) return;
      if (Commerce.cache.orders.has(id)) return;
      Commerce.cache.orders.set(id, { loading: true });
      try {
        const rows = await Commerce.read("customer_orders", "*", (q) =>
          q.eq("id", id).eq("user_id", uid).limit(1),
        );
        if (!rows.length) throw Error("ORDER_NOT_FOUND");
        const [items, events, payments] = await Promise.all([
          Commerce.read("customer_order_items", "*", (q) =>
            q.eq("order_id", id),
          ),
          Commerce.read("order_status_events", "status,created_at", (q) =>
            q.eq("order_id", id).order("created_at"),
          ),
          Commerce.read("payment_attempts", "status,created_at", (q) =>
            q
              .eq("order_id", id)
              .order("created_at", { ascending: false })
              .limit(5),
          ),
        ]);
        if (authUser?.id !== uid) return;
        Commerce.cache.orders.set(id, { ...rows[0], items, events, payments });
        if (rows[0].payment_status === "paid") {
          let seen = false;
          try {
            seen = sessionStorage.getItem("pv-purchase:" + id) === "yes";
            sessionStorage.setItem("pv-purchase:" + id, "yes");
          } catch {}
          if (!seen) Commerce.analytics("purchase_completed", { order_id: id });
        }
      } catch (error) {
        Commerce.cache.orders.set(id, {
          error: String(error.message).includes("ORDER_NOT_FOUND")
            ? "This order was not found in your account."
            : Commerce.safeError(error),
        });
      }
      if (currentPath === "orders/" + id) {
        render(currentPath, { keepScroll: true });
        let autoPay = false;
        try {
          autoPay = sessionStorage.getItem("pv-open-payment-after-order") === id;
          if (autoPay) sessionStorage.removeItem("pv-open-payment-after-order");
        } catch {}
        if (autoPay && Commerce.cache.orders.get(id)?.payment_status !== "paid")
          setTimeout(() => {
            const button = document.querySelector(`[data-pay-order="${id}"]`);
            if (button) void pay(id, button);
          }, 80);
      }
    }
    function orderPage(id) {
      if (!authReady)
        return `<section class="page-shell"><h1 class="page-title">Checking your session…</h1></section>`;
      if (!authUser)
        return `<section class="page-shell"><h1 class="page-title">Your orders, privately.</h1><p class="page-intro">Sign in to see your own order details and tracking updates.</p><button class="btn primary" data-auth-sign-in>Sign in to view orders</button></section>`;
      if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
      const o = Commerce.cache.orders.get(id);
      if (!o) {
        void fetchOrder(id);
        return `<section class="page-shell"><h1 class="page-title">Loading your order…</h1><p role="status">Checking the latest status.</p></section>`;
      }
      if (o.loading)
        return `<section class="page-shell"><h1 class="page-title">Loading your order…</h1></section>`;
      if (o.error)
        return `<section class="page-shell"><h1 class="page-title">Order unavailable</h1><p class="error" role="alert">${esc(o.error)}</p><button class="btn" data-refresh-order="${id}">Try again</button><a class="text-link" href="#account">Your account</a></section>`;
      const paymentClosed = ["paid", "partially_refunded", "refunded"].includes(o.payment_status) || ["cancelled", "refunded"].includes(o.status);
      const paymentHeading = {
        paid: "Payment confirmed",
        refunded: "Payment refunded",
        partially_refunded: "Partially refunded",
        cancelled: "Payment not completed",
      }[o.payment_status] || (paymentClosed ? "Payment unavailable" : "Complete your payment");
      const paymentDescription = o.payment_status === "paid"
        ? "Your payment has been confirmed by Razorpay."
        : ["refunded", "partially_refunded"].includes(o.payment_status) || paymentClosed
          ? `This order is ${esc(Commerce.statusLabel(o.payment_status).toLowerCase())}.`
          : o.payment_status === "cancelled"
            ? "The last payment attempt did not complete. You can try again securely. If money was deducted, refresh this order status before retrying."
            : "Continue to Razorpay to choose an available payment method. Your card and UPI details are entered securely with Razorpay, never stored by Parrfums Vault.";
      const paid = o.payment_status === "paid";
      const paymentPanel = `<section class="payment-panel ${paid ? "is-confirmed" : ""}" aria-labelledby="payment-heading"><div class="payment-panel-top"><div><p class="eyebrow">Secure checkout</p><h2 id="payment-heading">${paymentHeading}</h2></div><strong class="payment-total">${money(o.total_inr)}</strong></div><p class="payment-description">${paymentDescription}</p><p id="payment-notice" class="payment-notice" role="status" aria-live="polite"></p><div class="payment-panel-actions">${!paymentClosed ? `<button class="btn primary" data-pay-order="${id}">Continue to secure payment</button>` : ""}${paid ? `<button class="btn ghost" data-refresh-order="${id}">Refresh status</button><button class="btn ghost" data-email-order="${id}">Resend order details by email</button>` : ""}</div></section>`;
      return `<section class="page-shell order-page"><p class="eyebrow">Your order</p><h1 class="page-title order-reference" title="${esc(o.order_number)}">${esc(Commerce.shortOrderReference(o.order_number))}</h1><button class="text-link copy-order-reference" type="button" data-copy-order-ref="${esc(o.order_number)}">Copy order reference</button><p class="sub">Placed ${Commerce.formatDate(o.created_at)} · ${Commerce.statusLabel(o.payment_status)}</p>${["cancelled", "refunded"].includes(o.status) ? `<p class="shipping-notice">This order is ${Commerce.statusLabel(o.status).toLowerCase()}.</p>` : ""}<ol class="order-timeline">${[
        "pending",
        "confirmed",
        "packed",
        "shipped",
        "delivered",
      ]
        .map((status, index) => {
          const event = o.events.find((e) => e.status === status);
          return `<li class="${event ? "complete" : ""}"><strong>${index === 0 ? "Order placed" : Commerce.statusLabel(status)}</strong>${event ? `<time datetime="${esc(event.created_at)}">${Commerce.formatDate(event.created_at)}</time>` : "<span>Awaiting update</span>"}</li>`;
        })
        .join(
          "",
        )}</ol><div class="order-detail-grid"><div><h2>Delivery</h2><p>${esc(o.recipient_name)}<br>${esc(o.address_line1)}${o.address_line2 ? `<br>${esc(o.address_line2)}` : ""}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.postal_code)}</p>${o.courier_name ? `<p>Courier: ${esc(o.courier_name)}</p>` : ""}${o.tracking_number ? `<p>Tracking number: ${esc(o.tracking_number)}</p>` : ""}${/^https:\/\//.test(o.tracking_url || "") ? `<a class="text-link" href="${esc(o.tracking_url)}" target="_blank" rel="noreferrer">Courier tracking</a>` : ""}${o.estimated_delivery ? `<p>Estimated delivery: ${Commerce.formatDate(o.estimated_delivery)}</p>` : ""}</div><aside class="summary"><h2>Order summary</h2>${o.items.map((i) => `<div class="sum-line"><span>${esc(i.item_name)} × ${i.quantity}<small>${i.size_ml ? i.size_ml + "ml" : ""}</small></span><span>${money(i.line_total_inr)}</span></div>`).join("")}<div class="sum-line"><span>Subtotal</span><span>${money(o.subtotal_inr)}</span></div><div class="sum-line"><span>Shipping</span><span>${money(o.shipping_inr)}</span></div><div class="sum-line"><span>Discount</span><span>−${money(o.discount_inr)}</span></div><div class="sum-line total"><span>Total</span><span>${money(o.total_inr)}</span></div></aside></div>${paymentPanel}<div class="order-secondary-actions"><a class="btn ghost" href="#shop">Continue shopping</a><a class="text-link" href="#account">Order history</a></div><p class="sub payment-footnote">Only provider-verified payments are marked paid. If payment is pending, complete payment or refresh your order status before retrying.</p></section>`;
    }
    function trackingPage() {
      return `<section class="page-shell"><p class="eyebrow">Order tracking</p><h1 class="page-title">Follow your fragrance.</h1><p class="page-intro">Order details are private. Sign in to look up your own order reference.</p>${authUser ? '<form id="tracking-lookup" class="form-grid"><div class="field full-field"><label for="order-reference">Order reference</label><input id="order-reference" name="reference" required maxlength="80" placeholder="PV-…"></div><button class="btn primary">Find my order</button><p class="error" id="tracking-error" role="alert"></p></form>' : '<button class="btn primary" data-auth-sign-in>Sign in</button>'}</section>`;
    }
    async function edge(body) {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error || !data.session) throw Error("AUTH_REQUIRED");
      const response = await fetch(SUPABASE_URL + "/functions/v1/payments", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + data.session.access_token,
          apikey: CATALOGUE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw Error(
          "Online payments are not configured yet. Please contact the store.",
        );
      }
      if (!response.ok) {
        const error = Error(
          result.message ||
            "Payments are temporarily unavailable. Check your order status before retrying.",
        );
        error.customerMessage = true;
        throw error;
      }
      return result;
    }
    async function resendOrderEmail(id, button) {
      const notice = document.querySelector("#payment-notice");
      if (!notice) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      notice.textContent = "Sending order details…";
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (!data.session) throw Error("Sign in again to resend this email.");
        const order = Commerce.cache.orders.get(id);
        const response = await fetch(SUPABASE_URL + "/functions/v1/order-email", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + data.session.access_token,
            apikey: CATALOGUE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: id,
            event: order?.payment_status === "paid" ? "paid" : "placed",
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          let result = {};
          try { result = await response.json(); } catch {}
          throw Error(`Email could not be sent (${result.code || "EMAIL_DELIVERY_UNAVAILABLE"}).`);
        }
        notice.textContent = "Order details sent to your checkout email and the store.";
      } catch (error) {
        notice.textContent = Commerce.safeError(error);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
    async function pay(id, button) {
      const el = document.querySelector("#payment-notice");
      if (!el) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      el.textContent = "Preparing a secure payment…";
      const unlock = () => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      };
      try {
        let key;
        try {
          key = sessionStorage.getItem("pv-payment:" + id);
        } catch {}
        key ||= crypto.randomUUID();
        try {
          sessionStorage.setItem("pv-payment:" + id, key);
        } catch {}
        const config = await edge({
          action: "initiate",
          order_id: id,
          request_key: key,
        });
        if (!sdkPromise)
          sdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://checkout.razorpay.com/v1/checkout.js";
            script.onload = resolve;
            script.onerror = () => {
              sdkPromise = null;
              reject(Error("Payment window could not load."));
            };
            document.head.appendChild(script);
          });
        await sdkPromise;
        const checkout = new window.Razorpay({
          key: config.key,
          amount: config.amount,
          currency: config.currency,
          order_id: config.provider_order_id,
          name: "Parrfums Vault",
          description: "Secure payment for your fragrance order",
          image: new URL("assets/parrfums-vault-logo.png", location.origin)
            .href,
          prefill: config.prefill,
          method: { emi: false, paylater: false },
          theme: {
            color: document.documentElement.dataset.theme === "dark" ? "#e8c29e" : "#a86d43",
          },
          handler: async (result) => {
            el.textContent = "Verifying payment with the provider…";
            try {
              const verified = await edge({
                action: "verify",
                order_id: id,
                provider_order_id: result.razorpay_order_id,
                payment_id: result.razorpay_payment_id,
                signature: result.razorpay_signature,
              });
              el.textContent =
                verified.status === "paid"
                  ? verified.email_notification?.status === "failed" ||
                    verified.email_notification?.status === "not_configured"
                    ? "Payment verified. The email notification could not be sent; your payment is confirmed. Use “Resend order details by email” to retry."
                    : "Payment verified. Refreshing your order…"
                  : "Payment is pending verification. Refresh your order status before retrying.";
              Commerce.cache.orders.delete(id);
              await fetchOrder(id);
            } catch (error) {
              el.textContent = `${error.customerMessage ? error.message : Commerce.safeError(error)} Refresh your order status before retrying.`;
              unlock();
            }
          },
          modal: {
            ondismiss: () => {
              el.textContent =
                "Payment window closed. No payment has been assumed successful; refresh your order status before trying again.";
              unlock();
            },
          },
        });
        checkout.on("payment.failed", () => {
          el.textContent =
            "Payment was not completed. Refresh order status before retrying.";
          unlock();
        });
        checkout.open();
      } catch (error) {
        el.textContent = error.customerMessage
          ? error.message
          : Commerce.safeError(error);
        unlock();
      }
    }
    function reviews(p) {
      const data = Commerce.cache.reviews.get(p.id);
      if (!data) {
        Commerce.cache.reviews.set(p.id, { loading: true });
        void Commerce.read("public_reviews", "*", (q) =>
          q
            .eq("product_id", p.id)
            .order("created_at", { ascending: false })
            .limit(30),
        )
          .then((rows) => {
            Commerce.cache.reviews.set(p.id, { rows });
            if (currentPath === "product/" + p.id)
              render(currentPath, { keepScroll: true });
          })
          .catch(() => {
            Commerce.cache.reviews.set(p.id, { error: true });
            if (currentPath === "product/" + p.id)
              render(currentPath, { keepScroll: true });
          });
      }
      const rows = data?.rows || [],
        aggregate = Commerce.cache.summary.find((r) => r.product_id === p.id);
      return `<section class="related reviews"><h2>Customer reviews</h2>${aggregate ? `<p>${esc(aggregate.average_rating)} / 5 · ${aggregate.review_count} approved reviews</p>` : ""}${!data || data.loading ? '<p role="status">Loading reviews…</p>' : data.error ? `<p class="sub">Reviews are temporarily unavailable.</p><button class="text-link" data-retry-reviews="${p.id}">Try again</button>` : rows.length ? rows.map((r) => `<article class="review"><p class="review-stars" aria-label="${r.rating} out of 5 stars">${Array.from({length:5},(_,i)=>reviewStar(i<r.rating)).join("")}</p><p>${esc(r.body)}</p><small>${esc(r.display_name)} · ${Commerce.formatDate(r.created_at)}${r.verified_purchase ? " · Verified purchase" : ""}</small></article>`).join("") : '<p class="sub">No approved reviews yet.</p>'}${authUser ? `<form id="review-form" data-product-id="${p.id}" class="form-grid"><h3 class="full-field">Share your experience</h3><div class="field"><label for="review-name">Public display name</label><input id="review-name" name="display_name" maxlength="60" required></div><div class="field"><label for="review-rating">Rating</label><select id="review-rating" name="rating" class="select" required><option value="">Choose a rating</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} star${n === 1 ? "" : "s"}</option>`).join("")}</select></div><div class="field full-field"><label for="review-body">Your review</label><textarea id="review-body" name="body" minlength="10" maxlength="2000" required></textarea></div><button class="btn" type="submit">Submit for moderation</button><p class="sub" data-review-notice role="status">Reviews appear only after approval.</p></form>` : '<p class="sub">Sign in to leave a review.</p>'}</section>`;
    }
    const policies = {
      privacy: {
        title: "Privacy Policy",
        text: "Account identity, delivery details, saved addresses, wishlists, reviews and orders are processed through Supabase. Payment details are handled by the configured payment provider, not entered into this store’s database. Recently viewed items, theme preferences and the bag are stored in your browser. Analytics events are disabled unless you opt in; no customer contact or delivery details are included.",
        missing:
          "Owner approval required: confirm data retention, deletion handling, processors, legal entity and the privacy contact.",
      },
      terms: {
        title: "Terms & Conditions",
        text: "The store confirms product availability and order details. Payment and fulfilment states are shown separately in your account.",
        missing:
          "Owner approval required: supply the legal entity, governing terms, tax disclosures, dispute process and applicable business details.",
      },
      shipping: {
        title: "Shipping Policy",
        text: "Shipping is extra: Mumbai ₹100, outside Mumbai ₹120. The confirmed shipping charge is calculated on the server using the delivery city. Tracking details appear only after the store supplies them.",
        missing:
          "Owner approval required: supply dispatch timelines, serviceable areas, delivery estimates and lost/damaged shipment procedures.",
      },
      returns: {
        title: "Return & Refund Policy",
        text: "Refund states can be recorded only from verified payment-provider information. Contact the store about your order; eligibility is not automatically promised.",
        missing:
          "Owner approval required: supply return eligibility, time limits, product-condition requirements, refund processing times and return shipping responsibilities.",
      },
      cancellation: {
        title: "Cancellation Policy",
        text: "Contact the store with your order reference to request a cancellation. An order’s actual cancellation status is shown in your account.",
        missing:
          "Owner approval required: define cancellation eligibility, cutoff times and charges, if any.",
      },
      contact: {
        title: "Contact",
        text: "Parrfums Vault · Mumbai, India. Contact the store by phone, WhatsApp or Instagram using the verified links below.",
      },
      faq: {
        title: "Frequently Asked Questions",
        text: "Where are the fragrances made? Mumbai. What sizes are available? See each fragrance’s current size options. Is shipping included? No: Mumbai ₹100, outside Mumbai ₹120. How do I track an order? Sign in and open the order from your account. Is payment confirmed immediately by the browser? No. Only server-verified provider information can mark an order paid.",
        missing:
          "Owner approval required: add approved answers about dispatch, longevity, returns and cancellations; none are assumed here.",
      },
    };
    function policy(name) {
      const p = policies[name];
      if (!p) return notFound();
      return `<section class="page-shell policy-page"><p class="eyebrow">Parrfums Vault</p><h1 class="page-title">${p.title}</h1><p class="page-intro">${esc(p.text)}</p>${p.missing ? `<div class="policy-approval" role="note"><h2>Content awaiting owner approval</h2><p>${esc(p.missing)}</p></div>` : ""}${name === "privacy" ? '<div class="privacy-controls"><h2>Optional analytics</h2><p>Allow anonymous shopping events to be made available to a future analytics integration. No provider is connected by default.</p><button class="btn" data-analytics-choice="yes">Allow optional analytics</button><button class="btn ghost" data-analytics-choice="no">Keep analytics off</button><p id="analytics-notice" role="status"></p></div>' : ""}${name === "contact" ? contactStrip() : ""}<nav class="policy-links" aria-label="Policy navigation">${Object.entries(
        policies,
      )
        .map(([key, p]) => `<a class="text-link" href="#${key}">${p.title}</a>`)
        .join("")}</nav></section>`;
    }
    document.addEventListener("click", (e) => {
      const copyRef = e.target.closest('[data-copy-order-ref]');
      if (copyRef) {
        navigator.clipboard?.writeText(copyRef.dataset.copyOrderRef).then(() => {
          const old = copyRef.textContent;
          copyRef.textContent = 'Copied';
          setTimeout(() => { copyRef.textContent = old; }, 1400);
        }).catch(() => { copyRef.textContent = copyRef.dataset.copyOrderRef; });
      }
      const review = e.target.closest("[data-quote-checkout]");
      if (review) void quote(document.querySelector("#checkout-form"));
      const placeOrder = e.target.closest('[data-place-order]');
      if (placeOrder) void submit(null);
      const reviewConsent = e.target.closest('[data-review-consent]');
      if (reviewConsent) {
        checkoutState.consented = reviewConsent.checked;
        const button = document.querySelector('[data-place-order]');
        if (button) button.disabled = !reviewConsent.checked;
      }
      if (e.target.closest('[data-edit-checkout]')) location.hash = '#checkout';
      const refresh = e.target.closest("[data-refresh-order]");
      if (refresh) {
        Commerce.cache.orders.delete(refresh.dataset.refreshOrder);
        render("orders/" + refresh.dataset.refreshOrder, { keepScroll: true });
      }
      const again = e.target.closest("[data-reorder]");
      if (again) {
        const id = again.dataset.reorder;
        const cached = Commerce.cache.orders.get(id);
        const o =
          accountOrders.find((o) => o.id === id) ||
          (cached?.items ? { customer_order_items: cached.items } : null);
        if (o) reorder(o);
      }
      const payment = e.target.closest("[data-pay-order]");
      if (payment) void pay(payment.dataset.payOrder, payment);
      const emailOrder = e.target.closest("[data-email-order]");
      if (emailOrder) void resendOrderEmail(emailOrder.dataset.emailOrder, emailOrder);
      const retry = e.target.closest("[data-retry-reviews]");
      if (retry) {
        Commerce.cache.reviews.delete(retry.dataset.retryReviews);
        render(currentPath, { keepScroll: true });
      }
      const consent = e.target.closest("[data-analytics-choice]");
      if (consent) {
        try {
          localStorage.setItem(
            "pv-analytics-consent",
            consent.dataset.analyticsChoice,
          );
        } catch {}
        document.querySelector("#analytics-notice").textContent =
          consent.dataset.analyticsChoice === "yes"
            ? "Optional analytics enabled."
            : "Optional analytics are off.";
      }
    });
    document.addEventListener("submit", async (e) => {
      if (e.target.id === "review-form") {
        e.preventDefault();
        const form = e.target,
          f = new FormData(form),
          button = form.querySelector("button");
        button.disabled = true;
        try {
          await Commerce.rpc("submit_review", {
            p_product_id: form.dataset.productId,
            p_rating: Number(f.get("rating")),
            p_body: String(f.get("body")),
            p_display_name: String(f.get("display_name")),
          });
          form.reset();
          form.querySelector("[data-review-notice]").textContent =
            "Thank you. Your review is awaiting moderation.";
        } catch (error) {
          form.querySelector("[data-review-notice]").textContent =
            Commerce.safeError(error);
        } finally {
          button.disabled = false;
        }
      }
      if (e.target.id === "tracking-lookup") {
        e.preventDefault();
        const reference = String(
          new FormData(e.target).get("reference") || "",
        ).trim();
        try {
          const rows = await Commerce.read("customer_orders", "id", (q) =>
            /^[0-9a-f-]{36}$/i.test(reference)
              ? q.eq("id", reference).eq("user_id", authUser.id).limit(1)
              : q
                  .eq("order_number", reference.toUpperCase())
                  .eq("user_id", authUser.id)
                  .limit(1),
          );
          if (!rows.length) throw Error("Order not found");
          location.hash = "#orders/" + rows[0].id;
        } catch {
          document.querySelector("#tracking-error").textContent =
            "No matching order was found in your account.";
        }
      }
    });
    return {
      checkout,
      checkoutReview,
      checkoutState,
      validateCheckout: validate,
      submitCheckout: submit,
      quoteCheckout: quote,
      orderHistory: history,
      orderPage,
      trackingPage,
      policy,
      reviews,
    };
  })(),
);
