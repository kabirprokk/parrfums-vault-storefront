/* All writes use database-authorized commands. Route visibility grants no privileges. */
Object.assign(
  Commerce,
  (() => {
    const model = {
      tab: "overview",
      adminView: "menu",
      rows: null,
      error: "",
      loading: false,
      editing: null,
      filter: "",
      mfa: null,
      stats: null,
      page: 0,
      ascending: false,
      status: "",
    };
    let generation=0;
    const tabs = [
      "overview",
      "products",
      "variants",
      "inventory",
      "offers",
      "coupons",
      "orders",
      "reviews",
    ];
    const resources = {
      products: "products",
      variants: "product_prices",
      inventory: "product_prices",
      offers: "offers",
      coupons: "coupons",
      orders: "customer_orders",
      reviews: "reviews",
    };
    const field = (name, label, value = "", type = "text", extra = "") =>
      `<div class="field"><label for="admin-${name}">${esc(label)}</label><input id="admin-${name}" name="${name}" type="${type}" value="${esc(value ?? "")}" ${extra}></div>`;
    const area = (name, label, value = "") =>
      `<div class="field full-field"><label for="admin-${name}">${esc(label)}</label><textarea id="admin-${name}" name="${name}" rows="3" maxlength="5000">${esc(Array.isArray(value) ? value.join("\n") : value || "")}</textarea></div>`;
    const check = (name, label, value) =>
      `<label class="admin-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}> ${esc(label)}</label>`;
    const select = (name, label, values, value) =>
      `<div class="field"><label for="admin-${name}">${esc(label)}</label><select id="admin-${name}" name="${name}" class="select">${values.map((v) => `<option ${v === value ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>`;
    async function load() {
      if (model.loading || !Commerce.cache.admin) return;
      model.loading = true;
      model.error = "";
      const tab=model.tab, ticket=++generation;
      try {
        if (model.tab === "overview") {
          const rows = await Commerce.rpc("admin_sales_summary");
          if (ticket === generation) model.rows = rows;
          // Extended admin stats: totals + recent orders with customer details.
          try {
            const [ordersRes, usersRes, recentRes] = await Promise.all([
              supabaseClient.from("customer_orders").select("id", { count: "exact", head: true }),
              supabaseClient.from("customer_profiles").select("user_id", { count: "exact", head: true }),
              supabaseClient.from("customer_orders").select("id,order_number,recipient_name,phone,total_inr,status,payment_status,created_at,user_id").order("created_at", { ascending: false }).limit(10),
            ]);
            if (ticket === generation) {
              model.stats = {
                totalOrders: ordersRes.count || 0,
                totalUsers: usersRes.count || 0,
                recentOrders: recentRes.data || [],
              };
            }
          } catch (e) {}
        }
        else {
          let q = supabaseClient
            .from(resources[tab])
            .select("*")
            .range(model.page*50,model.page*50+49);
          if (tab === "orders" || tab === "reviews")q=q.order("created_at",{ascending:model.ascending}).order("id");
          else if(tab==='variants'||tab==='inventory')q=q.order('product_id').order('size_ml');
          else q=q.order(tab==='coupons'?'code':'name',{ascending:!model.ascending});
          if(tab==='orders'){
            if(model.status)q=q.eq('status',model.status);
            if(model.filter){const term=model.filter.replace(/[^a-zA-Z0-9@+ ._-]/g,'').slice(0,120);if(/^[0-9a-f-]{36}$/i.test(term))q=q.eq('id',term);else if(term)q=q.or(['recipient_name','email','phone','order_number'].map(column=>column+'.ilike.%'+term+'%').join(','));}
          }
          const { data, error } = await q;
          if (error) throw error;
          if(ticket===generation)model.rows = data;
        }
      } catch (e) {
        if(ticket===generation)model.error = Commerce.safeError(e);
      } finally {
        if(ticket===generation){model.loading = false;
        if (currentPath === "admin") render("admin", { keepScroll: true });}
      }
    }
    function editor() {
      const e = model.editing;
      if (!e) return "";
      const t = model.tab;
      let fields = "";
      if (t === "products")
        fields =
          field(
            "id",
            "Product URL identifier",
            e.id,
            "text",
            `required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="100" ${e.id ? "readonly" : ""}`,
          ) +
          field("name", "Name", e.name, "text", 'required maxlength="120"') +
          field("category", "Catalogue mood", e.category) +
          field("gender", "Gender / audience", e.gender) +
          field("notes", "Notes summary", e.notes) +
          field(
            "image_path",
            "Main image path or uploaded image URL",
            e.image_path,
            "text",
            "required",
          ) +
          area(
            "gallery_paths",
            "Gallery paths (one per line)",
            e.gallery_paths,
          ) +
          area("description", "Description", e.description) +
          ["top_notes", "heart_notes", "base_notes", "occasion", "season"]
            .map((n) =>
              area(
                n,
                Commerce.statusLabel(n) +
                  " (one per line; leave unknown facts blank)",
                e[n],
              ),
            )
            .join("") +
          ["fragrance_family", "longevity", "projection", "usage_information"]
            .map((n) => field(n, Commerce.statusLabel(n), e[n]))
            .join("") +
          field("sort_order", "Display position", e.sort_order || 0, "number") +
          check("active", "Active (uncheck to archive)", e.active !== false) +
          `<div class="field full-field"><label for="admin-upload">Upload catalogue image</label><input id="admin-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><p class="sub">Uploads a high quality WebP, up to 1600px. Save the product after uploading. Removing a gallery path detaches that image without breaking historical references.</p></div>`;
      if (t === "variants")
        fields =
          field(
            "product_id",
            "Product identifier",
            e.product_id,
            "text",
            "required",
          ) +
          field(
            "size_ml",
            "Size (ml)",
            e.size_ml,
            "number",
            'required min="1" max="1000"',
          ) +
          field(
            "sku",
            "Unique SKU",
            e.sku,
            "text",
            'required maxlength="100"',
          ) +
          field(
            "price_inr",
            "Current price (₹)",
            e.price_inr,
            "number",
            'required min="1"',
          ) +
          field(
            "low_stock_threshold",
            "Low stock threshold",
            e.low_stock_threshold || 0,
            "number",
            'required min="0"',
          ) +
          check("active", "Available for sale", e.active !== false);
      if (t === "inventory")
        fields =
          field(
            "product_id",
            "Product identifier",
            e.product_id,
            "text",
            "required readonly",
          ) +
          field(
            "size_ml",
            "Size (ml)",
            e.size_ml,
            "number",
            "required readonly",
          ) +
          field(
            "quantity",
            "Actual available quantity",
            e.available_quantity,
            "number",
            'required min="0" max="1000000"',
          ) +
          field(
            "note",
            "Reason for adjustment",
            "",
            "text",
            'maxlength="500"',
          ) +
          '<p class="sub">Enter the actual counted quantity; increases and zero are supported. If Save is rejected, complete “Verify with authenticator” in Admin and retry. Unknown stock is never assumed.</p>';
      if (t === "offers")
        fields =
          field(
            "id",
            "Combo identifier",
            e.id,
            "text",
            `required ${e.id ? "readonly" : ""}`,
          ) +
          field("name", "Name", e.name, "text", 'required maxlength="120"') +
          field(
            "price_inr",
            "Combo price (₹)",
            e.price_inr,
            "number",
            'required min="1"',
          ) +
          field("badge", "Short offer label", e.badge) +
          field("notes", "Notes", e.notes) +
          area("description", "Description", e.description) +
          field(
            "image_path",
            "Image path or uploaded URL",
            e.image_path,
            "text",
            "required",
          ) +
          field("sort_order", "Display position", e.sort_order || 0, "number") +
          check("active", "Active", e.active !== false) +
          `<fieldset class="full-field"><legend>Actual bottles included</legend><p class="sub">Each line reserves its listed stock. Configure the actual recipe; variable-choice offers need separate explicit combinations.</p><div data-component-rows>${(e.components || []).map(componentRow).join("")}</div><button class="btn small" type="button" data-component-add>Add bottle</button></fieldset>`;
      if (t === "coupons")
        fields =
          field("id", "Coupon ID", e.id, "text", "readonly") +
          field(
            "code",
            "Coupon code",
            e.code,
            "text",
            'required maxlength="40"',
          ) +
          select("kind", "Discount type", ["percentage", "fixed"], e.kind) +
          field(
            "value",
            "Discount value",
            e.value,
            "number",
            'required min="1"',
          ) +
          field(
            "minimum_cart_inr",
            "Minimum cart value (₹)",
            e.minimum_cart_inr || 0,
            "number",
            'min="0"',
          ) +
          field(
            "maximum_discount_inr",
            "Maximum discount (₹, optional)",
            e.maximum_discount_inr,
            "number",
            'min="1"',
          ) +
          field(
            "starts_at",
            "Starts (optional)",
            e.starts_at?.slice(0, 16),
            "datetime-local",
          ) +
          field(
            "expires_at",
            "Expires (optional)",
            e.expires_at?.slice(0, 16),
            "datetime-local",
          ) +
          field(
            "usage_limit",
            "Total usage limit (optional)",
            e.usage_limit,
            "number",
            'min="1"',
          ) +
          field(
            "per_customer_limit",
            "Per-customer limit (optional)",
            e.per_customer_limit,
            "number",
            'min="1"',
          ) +
          area(
            "products",
            "Restricted product identifiers (one per line; empty = all)",
            e.products,
          ) +
          check("active", "Active", e.active === true);
      if (t === "orders")
        fields =
          `<p class="full-field">${esc(e.recipient_name)} · ${esc(e.phone)} · ${esc(e.email)}<br>${esc([e.address_line1, e.address_line2, e.city, e.state, e.postal_code].filter(Boolean).join(", "))}<br>${money(e.total_inr)} · Payment: ${esc(e.payment_status)}${e.reconciliation_required ? " · Requires payment reconciliation" : ""}</p><ul class="full-field">${(e.lines || []).map((l) => `<li>${esc(l.item_name)} · ${l.size_ml || "Combo"} × ${l.quantity} · ${money(l.line_total_inr)}</li>`).join("")}</ul>` +
          field("id", "Order ID", e.id, "text", "readonly") +
          select(
            "status",
            "Order status",
            [
              "pending",
              "confirmed",
              "packed",
              "shipped",
              "delivered",
              "cancelled",
              "refunded",
            ],
            e.status,
          ) +
          field(
            "tracking_number",
            "Tracking number",
            e.tracking_number,
            "text",
            'maxlength="120"',
          ) +
          field(
            "courier_name",
            "Courier name",
            e.courier_name,
            "text",
            'maxlength="120"',
          ) +
          field("tracking_url", "HTTPS tracking URL", e.tracking_url, "url") +
          field(
            "estimated_delivery",
            "Estimated delivery date (optional)",
            e.estimated_delivery,
            "date",
          ) +
          '<p class="sub">Payment status is controlled by verified provider events. Refunds must first be processed through the payment provider.</p>';
      if (t === "reviews")
        fields =
          field("id", "Review ID", e.id, "text", "readonly") +
          `<p class="full-field">${esc(e.display_name)} · ${e.rating}/5 · ${esc(e.product_id)}<br>${esc(e.body)}</p>` +
          select(
            "status",
            "Moderation status",
            ["approved", "rejected"],
            e.status,
          );
      return `<section class="admin-editor"><h2>${e.id || e.product_id ? "Edit" : "Add"} ${esc(t)}</h2><form id="admin-editor" class="form-grid">${fields}<p class="error full-field" data-admin-error role="alert"></p><div class="full-field"><button class="btn primary" type="submit">Save changes</button> <button class="btn ghost" type="button" data-admin-close>Close editor</button></div></form></section>`;
    }
    function editorMatches(row) {
      const e = model.editing;
      if (!e || !(e.id || e.product_id)) return false;
      const rowKey = row.id || row.product_id;
      const editKey = e.id || e.product_id;
      return rowKey === editKey && (!e.size_ml || Number(row.size_ml) === Number(e.size_ml));
    }
    function componentRow(c = {}) {
      return `<div class="component-row"><label>Product <select name="component_product">${products.map((p) => `<option value="${p.id}" ${p.id === c.product_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><label>Size (ml)<input name="component_size" type="number" min="1" max="1000" value="${c.size_ml || ""}" required></label><label>Quantity<input name="component_quantity" type="number" min="1" max="20" value="${c.quantity || 1}" required></label><button class="btn small" type="button" data-component-remove>Remove</button></div>`;
    }
    function admin() {
      if (!authReady)
        return '<section class="page-shell"><h1>Administration</h1><p role="status">Checking your session…</p></section>';
      if (!authUser)
        return '<section class="page-shell"><h1>Administration</h1><p>Sign in with an authorized administrator account.</p><button class="btn primary" data-auth-sign-in>Sign in</button></section>';
      if (!Commerce.cache.adminChecked)
        return '<section class="page-shell"><h1>Administration</h1><p role="status">Checking authorization…</p></section>';
      if (!Commerce.cache.admin)
        return `<section class="page-shell"><h1>Protected administration</h1><p>This area requires owner-granted database membership and an authenticated MFA session.</p><button class="btn" data-admin-mfa>Verify with authenticator</button><div data-mfa-panel></div><p class="error" data-admin-error role="alert"></p><a href="#account">Return to account</a></section>`;
      if (model.adminView === "menu")
        return `<section class="page-shell admin-page"><div class="section-head"><div><p class="eyebrow">Parrfums Vault</p><h1 class="page-title">Administration</h1></div></div><div class="stat-grid"><button class="btn primary" data-admin-website>Update website</button><button class="btn" data-admin-details>Update details</button></div><p class="sub">Update website opens the live site in edit mode. Update details opens the catalogue, orders, coupons and reviews console.</p></section>`;
      if (model.rows === null && !model.loading) queueMicrotask(load);
      const rows = Array.isArray(model.rows)
        ? model.rows.filter((r) =>
            Object.values(r).some(
              (v) =>
                typeof v === "string" &&
                v.toLowerCase().includes(model.filter.toLowerCase()),
            ),
          )
        : [];
      const columns =
        model.tab === "orders"
          ? [
              "order_number",
              "recipient_name",
              "phone",
              "email",
              "status",
              "payment_status",
              "total_inr",
            ]
          : model.tab === "products"
            ? ["id", "name", "category", "active"]
            : ["variants", "inventory"].includes(model.tab)
              ? [
                  "product_id",
                  "size_ml",
                  "sku",
                  "price_inr",
                  "available_quantity",
                  "low_stock_threshold",
                  "active",
                ]
              : model.tab === "offers"
                ? ["id", "name", "price_inr", "active"]
                : model.tab === "coupons"
                  ? ["code", "kind", "value", "active"]
                  : ["product_id", "display_name", "rating", "status"];
      const overview =
        (model.rows && !Array.isArray(model.rows)
          ? `<div class="stat-grid">${Object.entries(model.rows)
              .filter(
                ([k, v]) => typeof v === "number" || typeof v === "string",
              )
              .map(
                ([k, v]) =>
                  `<article class="summary"><h2>${esc(Commerce.statusLabel(k))}</h2><strong>${esc(v)}</strong></article>`,
              )
              .join("")}</div>`
          : "") + (model.stats ? `<div class="stat-grid" style="margin-top:16px"><article class="summary"><h2>Total orders</h2><strong>${esc(model.stats.totalOrders)}</strong></article><article class="summary"><h2>Total customers</h2><strong>${esc(model.stats.totalUsers)}</strong></article><article class="summary"><h2>Online now</h2><strong id="admin-online-count">—</strong></article></div>` : "");
      const addEditor = model.editing && !(model.editing.id || model.editing.product_id) ? editor() : "";
      return `<section class="page-shell admin-page"><div class="section-head"><div><p class="eyebrow">Parrfums Vault</p><h1 class="page-title">Administration</h1></div><button class="btn" data-admin-refresh>Refresh</button></div><nav class="admin-tabs" aria-label="Administration sections">${tabs.map((t) => `<button class="btn ${model.tab === t ? "primary" : ""}" data-admin-tab="${t}" aria-pressed="${model.tab === t}">${esc(Commerce.statusLabel(t))}</button>`).join("")}</nav>${model.error ? `<p class="error" role="alert">${esc(model.error)}</p>` : ""}${model.loading ? '<p role="status">Loading…</p>' : ""}${addEditor}${model.tab === "overview" ? overview : `<div class="admin-toolbar"><label for="admin-search">Search ${esc(model.tab)}</label><input id="admin-search" type="search" maxlength="120" value="${esc(model.filter)}">${model.tab==='orders'?`<label for="admin-order-status">Status</label><select id="admin-order-status" class="select"><option value="">All statuses</option>${['pending','confirmed','packed','shipped','delivered','cancelled','refunded'].map(v=>`<option value="${v}" ${model.status===v?'selected':''}>${Commerce.statusLabel(v)}</option>`).join('')}</select>`:''}<button class="btn" data-admin-search>Search</button><button class="btn" data-admin-sort>Reverse sort</button>${["products", "variants", "offers", "coupons"].includes(model.tab) ? '<button class="btn primary" data-admin-new>Add new</button>' : ""}</div><p class="sub">Page ${model.page+1} · Up to 50 records per page. Search orders across all pages by customer name, phone, email, order ID or reference.</p><div class="table-scroll"><table><thead><tr>${columns.map((c) => `<th scope="col">${esc(Commerce.statusLabel(c))}</th>`).join("")}<th scope="col">Manage</th></tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${esc(row[c] ?? (c === "available_quantity" ? "Not configured" : ""))}${c === "available_quantity" && row[c] !== null && row[c] <= row.low_stock_threshold ? " · Low stock" : ""}</td>`).join("")}<td><button class="btn small" data-admin-edit="${esc(row.id || row.product_id)}" data-admin-size="${row.size_ml || ""}">Manage</button></td></tr>${editorMatches(row) ? `<tr class="admin-inline-editor-row"><td colspan="${columns.length + 1}">${editor()}</td></tr>` : ""}`).join("")}</tbody></table><div class="offer-actions"><button class="btn" data-admin-page="-1" ${model.page===0?'disabled':''}>Previous page</button><button class="btn" data-admin-page="1" ${(model.rows?.length||0)<50?'disabled':''}>Next page</button></div>${!rows.length ? '<p role="status">No matching records.</p>' : ""}</div>`}<p class="sub">All administrative writes are authorized in PostgreSQL and recorded in an audit log.</p></section>`;
    }
    async function mfa() {
      try {
        const membership = await supabaseClient
          .from("admin_users")
          .select("user_id")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (membership.error || !membership.data) throw Error("ADMIN_REQUIRED");
        const { data, error } = await supabaseClient.auth.mfa.listFactors();
        if (error) throw error;
        let factor = data.totp.find((f) => f.status === "verified");
        let qr = "";
        if (!factor) {
          const result = await supabaseClient.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: "Parrfums Vault administrator",
          });
          if (result.error) throw result.error;
          factor = result.data;
          qr = result.data.totp.qr_code;
        }
        model.mfa = factor.id;
        const panel = document.querySelector("[data-mfa-panel]");
        panel.innerHTML = `${qr ? '<p>Scan the QR code in your authenticator, then enter its current code.</p><img class="mfa-qr" alt="Authenticator enrolment QR code">' : ""}<form id="admin-mfa"><label for="mfa-code">Six digit authenticator code</label><input id="mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button class="btn primary">Verify</button></form>`;
        if (qr)
          panel.querySelector("img").src = qr.startsWith("data:image/svg+xml")
            ? qr
            : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr);
      } catch (e) {
        document.querySelector("[data-admin-error]").textContent =
          Commerce.safeError(e);
      }
    }
    document.addEventListener("click", async (e) => {
      try {
        if (e.target.closest("[data-admin-mfa]")) return void mfa();
        if (e.target.closest("[data-admin-menu]")) { model.adminView = "menu"; render("admin"); return; }
        if (e.target.closest("[data-admin-website]")) { location.href = "/?edit=1"; return; }
        if (e.target.closest("[data-admin-details]")) { model.adminView = "details"; generation++; model.loading = false; model.page = 0; model.status = ""; model.tab = "overview"; model.rows = null; model.editing = null; model.filter = ""; render("admin"); return; }
        if (!e.target.closest(".admin-page")) return;
        const tab = e.target.closest("[data-admin-tab]");
        if (tab) {
          generation++;model.loading=false;model.page=0;model.status="";
          model.tab = tab.dataset.adminTab;
          model.rows = null;
          model.editing = null;
          model.filter = "";
          render("admin");
          return;
        }
        if (e.target.closest("[data-admin-refresh]")) {
          model.rows = null;
          return void load();
        }
        if (e.target.closest("[data-admin-close]")) {
          model.editing = null;
          render("admin", { keepScroll: true });
          return;
        }
        if (e.target.closest("[data-admin-new]")) {
          model.editing = {};
          render("admin", { keepScroll: true });
          return;
        }
        if (e.target.closest("[data-component-add]")) {
          document
            .querySelector("[data-component-rows]")
            .insertAdjacentHTML("beforeend", componentRow());
          return;
        }
        if (e.target.closest("[data-component-remove]")) {
          e.target.closest(".component-row").remove();
          return;
        }
        if (e.target.closest("[data-admin-sort]")) {
          model.ascending=!model.ascending;model.rows=null;void load();return;
        }
        const page=e.target.closest('[data-admin-page]');if(page){model.page=Math.max(0,model.page+Number(page.dataset.adminPage));model.rows=null;void load();return;}
        if (e.target.closest('[data-admin-search]')){
          model.filter=document.querySelector('#admin-search').value.trim();model.page=0;
          if(model.tab==='orders'){model.status=document.querySelector('#admin-order-status').value;model.rows=null;void load();}else render('admin',{keepScroll:true});return;
        }
        const edit = e.target.closest("[data-admin-edit]");
        if (edit) {
          const row = model.rows.find(
            (r) =>
              (r.id || r.product_id) === edit.dataset.adminEdit &&
              (!edit.dataset.adminSize ||
                r.size_ml === Number(edit.dataset.adminSize)),
          );
          model.editing = { ...row };
          if (model.tab === "orders") {
            const { data, error } = await supabaseClient
              .from("customer_order_items")
              .select("*")
              .eq("order_id", row.id);
            if (error) throw error;
            model.editing.lines = data;
          }
          if (model.tab === "offers") {
            const { data, error } = await supabaseClient
              .from("offer_components")
              .select("*")
              .eq("offer_id", row.id);
            if (error) throw error;
            model.editing.components = data;
          }
          if (model.tab === "coupons") {
            const { data, error } = await supabaseClient
              .from("coupon_products")
              .select("product_id")
              .eq("coupon_id", row.id);
            if (error) throw error;
            model.editing.products = data.map((p) => p.product_id);
          }
          render("admin", { keepScroll: true });
          requestAnimationFrame(() => document.querySelector(".admin-inline-editor-row")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
        }
      } catch (error) {
        model.error = Commerce.safeError(error);
        render("admin", { keepScroll: true });
      }
    });
    document.addEventListener("submit", async (e) => {
      if (e.target.getAttribute("id") === "admin-mfa") {
        e.preventDefault();
        try {
          const { error } = await supabaseClient.auth.mfa.challengeAndVerify({
            factorId: model.mfa,
            code: new FormData(e.target).get("code"),
          });
          if (error) throw error;
          await Commerce.onAuth(authUser);
          render("admin");
        } catch (error) {
          document.querySelector("[data-admin-error]").textContent =
            "Verification failed. Check the current code and try again.";
        }
        return;
      }
      if (e.target.getAttribute("id") !== "admin-editor") return;
      e.preventDefault();
      const form = e.target;
      if (form.dataset.busy) return;
      if (!form.reportValidity()) return;
      form.dataset.busy = "true";
      const b = form.querySelector('[type="submit"]');
      b.disabled = true;
      const f = new FormData(form),
        data = Object.fromEntries(f);
      for (const key of ["active"]) data[key] = f.has(key);
      for (const key of [
        "gallery_paths",
        "top_notes",
        "heart_notes",
        "base_notes",
        "occasion",
        "season",
        "products",
      ])
        if (key in data)
          data[key] = data[key]
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
      try {
        if (model.tab === "products")
          await Commerce.rpc("admin_save_product", { p_data: data });
        if (model.tab === "variants")
          await Commerce.rpc("admin_save_variant", { p_data: data });
        if (model.tab === "inventory") {
          model.editing.requestKey ||= crypto.randomUUID();
          await Commerce.rpc("admin_adjust_inventory", {
            p_product_id: data.product_id,
            p_size_ml: Number(data.size_ml),
            p_quantity: Number(data.quantity),
            p_request_key: model.editing.requestKey,
            p_note: data.note,
          });
        }
        if (model.tab === "offers") {
          const components = [...form.querySelectorAll(".component-row")].map(
            (row) => ({
              product_id: row.querySelector('[name="component_product"]').value,
              size_ml: Number(
                row.querySelector('[name="component_size"]').value,
              ),
              quantity: Number(
                row.querySelector('[name="component_quantity"]').value,
              ),
            }),
          );
          await Commerce.rpc("admin_save_offer", {
            p_data: data,
            p_components: components,
          });
        }
        if (model.tab === "coupons") {
          for (const key of ["starts_at", "expires_at"])
            if (data[key]) data[key] = new Date(data[key]).toISOString();
          await Commerce.rpc("admin_save_coupon", {
            p_data: data,
            p_products: data.products,
          });
        }
        if (model.tab === "orders")
          await Commerce.rpc("admin_update_order", {
            p_order_id: data.id,
            p_status: data.status,
            p_tracking: {
              tracking_number: data.tracking_number,
              courier_name: data.courier_name,
              tracking_url: data.tracking_url,
              estimated_delivery: data.estimated_delivery || null,
            },
          });
        if (model.tab === "reviews")
          await Commerce.rpc("admin_moderate_review", {
            p_id: data.id,
            p_status: data.status,
          });
        model.editing = null;
        model.rows = null;
        toast("Saved");
        await load();
        void loadCatalogue();
      } catch (error) {
        form.querySelector("[data-admin-error]").textContent =
          Commerce.safeError(error);
      } finally {
        delete form.dataset.busy;
        b.disabled = false;
      }
    });
    document.addEventListener("change", async (e) => {
      if (e.target.id !== "admin-upload") return;
      const file = e.target.files[0];
      if (!file) return;
      const error = document.querySelector("[data-admin-error]");
      try {
        if (
          !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
            file.type,
          ) ||
          file.size > 10 * 1024 * 1024
        )
          throw Error("INVALID_IMAGE");
        const image = await createImageBitmap(file);
        if (image.width * image.height > 40000000) {
          image.close();
          throw Error("INVALID_IMAGE");
        }
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        image.close();
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.9),
        );
        if (!blob) throw Error("INVALID_IMAGE");
        const path = authUser.id + "/" + crypto.randomUUID() + ".webp";
        const { error: uploadError } = await supabaseClient.storage
          .from("catalogue-media")
          .upload(path, blob, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { data } = supabaseClient.storage
          .from("catalogue-media")
          .getPublicUrl(path);
        formImage(data.publicUrl);
        toast("Image uploaded. Save the product to publish it.");
      } catch (ex) {
        error.textContent = Commerce.safeError(ex);
      }
    });
    function formImage(url) {
      document.querySelector("#admin-image_path").value = url;
      const gallery = document.querySelector("#admin-gallery_paths");
      if (gallery)
        gallery.value = [gallery.value, url].filter(Boolean).join("\n");
    }
    return {
      admin,
      resetAdmin: () => {
        generation++;model.loading=false;model.page=0;
        model.rows = null;
        model.editing = null;
        model.mfa = null;
        model.error = "";
      },
    };
  })(),
);
