/* Parrfums Vault — admin edit mode.
 *
 * Lets the owner change any visible text and drag blocks into a new order.
 * Edits are published to every visitor: they are written to Supabase
 * (public.site_content) and re-applied after every storefront render.
 *
 * Interaction model
 *   single click  → the text under the cursor becomes editable
 *   double click  → the element behaves exactly like it does for a shopper
 *   drag & drop   → blocks are reordered inside their row/section
 *
 * The "Done / Save" button sits in the bottom-left corner the whole time
 * edit mode is on, so changes can be published from anywhere in the site.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "pv-site-content-v1";
  const EDITABLE_TAGS = "h1,h2,h3,h4,h5,h6,p,li,figcaption,blockquote,span,strong,em,small,b,i,label,a,button";
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "OPTION", "SVG", "IMG",
    "VIDEO", "CANVAS", "IFRAME", "PATH",
  ]);
  const ANCHOR_ATTRS = ["data-pv-anchor", "data-product", "data-id", "data-gallery", "data-wish", "data-add", "href"];

  const state = {
    on: false,
    acting: false,
    server: new Map(),
    pending: new Map(),
    originals: new WeakMap(),
    drag: null,
  };

  /* ------------------------------------------------------------ helpers */

  const app = () => document.getElementById("app");

  function safeValue(value) {
    return typeof value === "string" && value.length > 0 && value.length < 200 && !/["'\\]/.test(value);
  }

  function isEditableElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.closest("#edit-toolbar")) return false;
    if (el.closest("[contenteditable]")) return false;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) return true;
    }
    return false;
  }

  function ownAnchor(el) {
    for (const attr of ANCHOR_ATTRS) {
      const value = el.getAttribute && el.getAttribute(attr);
      if (safeValue(value)) return { attr, value };
    }
    return null;
  }

  function descendantAnchor(el) {
    for (const attr of ANCHOR_ATTRS) {
      const found = el.querySelector && el.querySelector("[" + attr + "]");
      if (!found) continue;
      const value = found.getAttribute(attr);
      if (safeValue(value)) return { attr, value, tag: found.tagName.toLowerCase() };
    }
    return null;
  }

  function uniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  /* A stable path to an element. Text nodes anchor on a distinctive
     attribute (a product link, for example) so an edit keeps pointing at the
     same copy after the catalogue changes. */
  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id) {
        parts.unshift("#" + node.id);
        break;
      }
      const own = ownAnchor(node);
      if (own) {
        parts.unshift(node.tagName.toLowerCase() + "[" + own.attr + '="' + own.value + '"]');
        break;
      }
      const desc = descendantAnchor(node);
      if (desc && node.children.length <= 3) {
        parts.unshift(node.tagName.toLowerCase() + ":has(" + desc.tag + "[" + desc.attr + '="' + desc.value + '"])');
        break;
      }
      let part = node.tagName.toLowerCase();
      const cls = Array.from(node.classList || []).find(c => c && !/^(is-|has-)/.test(c));
      if (cls) part += "." + cls;
      else {
        const parent = node.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter(c => c.tagName === node.tagName);
          if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
        }
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (cls && uniqueSelector(candidate)) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  /* Identity of a block inside a row, used to restore a custom order. */
  function signature(el) {
    const own = ownAnchor(el);
    if (own) return own.attr + "=" + own.value;
    const desc = descendantAnchor(el);
    if (desc) return "desc:" + desc.attr + "=" + desc.value;
    if (el.id) return "id=" + el.id;
    return "text=" + (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  /* -------------------------------------------------------- site content */

  function readPending() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw);
      if (!rows || typeof rows !== "object") return;
      for (const [key, row] of Object.entries(rows)) state.pending.set(key, row);
    } catch {}
  }

  function writePending() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state.pending)));
    } catch {}
  }

  function mergedRows() {
    const rows = new Map(state.server);
    for (const [key, row] of state.pending) rows.set(key, row);
    return rows;
  }

  function applyRow(row) {
    if (!row || typeof row.key !== "string") return;
    try {
      const el = document.querySelector(row.key);
      if (!el) return;
      if (row.kind === "html" && typeof row.content?.html === "string") {
        el.innerHTML = row.content.html;
        stripMarkers(el);
      } else if (row.kind === "order" && Array.isArray(row.content?.items)) restoreOrder(el, row.content.items);
    } catch {}
  }

  function restoreOrder(container, items) {
    const children = Array.from(container.children);
    const ranked = children.map((child, index) => {
      const position = items.indexOf(signature(child));
      return { child, position: position === -1 ? Number.MAX_SAFE_INTEGER : position, index };
    });
    ranked.sort((a, b) => a.position - b.position || a.index - b.index);
    for (const entry of ranked) container.appendChild(entry.child);
  }

  function apply() {
    for (const row of mergedRows().values()) applyRow(row);
  }

  async function loadSiteContent() {
    try {
      const url = CATALOGUE_API + "/site_content?select=key,kind,content";
      const res = await fetch(url, { headers: { apikey: CATALOGUE_KEY }, cache: "no-store" });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      state.server = new Map(rows.map(row => [row.key, { key: row.key, kind: row.kind, content: row.content || {} }]));
      apply();
    } catch {}
  }

  /* ----------------------------------------------------------- edit mode */

  function markElements() {
    const root = app();
    if (!root) return;
    root.querySelectorAll(EDITABLE_TAGS).forEach(el => {
      if (!isEditableElement(el)) return;
      if (!el.dataset.pvPath) el.dataset.pvPath = cssPath(el);
      el.dataset.pvEditable = "1";
    });
    /* Blocks inside a row or a grid can be dragged into a new order. */
    root.querySelectorAll("*").forEach(el => {
      const parent = el.parentElement;
      if (!parent || parent === root) return;
      const display = getComputedStyle(parent).display;
      const flowable = display === "grid" || display === "inline-grid" || display === "flex" || display === "inline-flex";
      if (!flowable || parent.children.length < 2) return;
      el.setAttribute("draggable", "true");
      el.dataset.pvDrag = "1";
      if (!el.dataset.pvPath) el.dataset.pvPath = cssPath(el);
    });
    // The originals are captured after the markers exist, so an element is only
    // reported as changed when its own copy was actually edited.
    root.querySelectorAll("[data-pv-editable]").forEach(el => {
      if (!state.originals.has(el)) state.originals.set(el, ownText(el));
    });
  }

  /* The text an element owns, ignoring the text of nested elements. */
  function ownText(el) {
    let text = "";
    for (const node of el.childNodes) if (node.nodeType === 3) text += node.textContent;
    return text;
  }

  /* Markers are for the editor only; they never reach the published copy. */
  function stripMarkers(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-pv-path],[data-pv-editable],[data-pv-editing]").forEach(el => {
      el.removeAttribute("data-pv-path");
      el.removeAttribute("data-pv-editable");
      el.removeAttribute("data-pv-editing");
    });
  }

  function cleanHTML(el) {
    const clone = el.cloneNode(true);
    stripMarkers(clone);
    return clone.innerHTML;
  }

  function beginEdit(el, event) {
    document.querySelectorAll("[data-pv-editing]").forEach(current => {
      if (current !== el) {
        current.removeAttribute("contenteditable");
        current.removeAttribute("data-pv-editing");
      }
    });
    el.setAttribute("contenteditable", "true");
    el.dataset.pvEditing = "1";
    el.focus();
    try {
      let range = null;
      if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);
      else if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (position) {
          range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
        }
      }
      if (range) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch {}
  }

  function endEdit() {
    document.querySelectorAll("[data-pv-editing]").forEach(el => {
      el.removeAttribute("contenteditable");
      el.removeAttribute("data-pv-editing");
    });
    if (document.activeElement?.hasAttribute("contenteditable")) document.activeElement.blur();
  }

  function onClick(event) {
    if (!state.on || state.acting) return;
    const target = event.target;
    if (!target || target.closest("#edit-toolbar")) return;
    const editable = target.closest?.("[data-pv-editable]");
    const current = document.querySelector("[data-pv-editing]");
    if (current && current !== editable) endEdit();
    const root = app();
    if (!root || !root.contains(target)) return;
    if (target.matches("input,textarea,select")) return;

    // Keep native caret placement when the owner clicks within the selected text.
    if (current && current === editable) return;

    event.preventDefault();
    event.stopPropagation();

    if (editable) beginEdit(editable, event);
  }

  function onDoubleClick(event) {
    if (!state.on || state.acting) return;
    const target = event.target;
    if (!target || target.closest("#edit-toolbar")) return;
    const link = target.closest("a[href]");
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      state.acting = true;
      try {
        location.href = link.getAttribute("href");
      } finally {
        state.acting = false;
      }
      return;
    }
    const button = target.closest("button");
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      state.acting = true;
      try {
        button.click();
      } finally {
        state.acting = false;
      }
    }
  }

  function onDragStart(event) {
    if (!state.on) return;
    const block = event.target && event.target.closest ? event.target.closest("[data-pv-drag]") : null;
    if (!block) {
      event.preventDefault();
      return;
    }
    state.drag = block;
    block.classList.add("is-dragging");
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", block.dataset.pvPath || "");
    } catch {}
  }

  /* Which way the row flows, so a drop lands before or after the target. */
  function isHorizontal(parent) {
    const style = getComputedStyle(parent);
    if (style.display === "grid" || style.display === "inline-grid") {
      const columns = (style.gridTemplateColumns || "").split(" ").filter(Boolean).length;
      return columns > 1;
    }
    return style.display === "flex" || style.display === "inline-flex"
      ? !/^column/.test(style.flexDirection)
      : false;
  }

  function onDragOver(event) {
    if (!state.on || !state.drag) return;
    event.preventDefault();
    const over = document.elementFromPoint(event.clientX, event.clientY);
    if (!over) return;
    const sibling = over.closest("[data-pv-drag]");
    if (!sibling || sibling === state.drag) return;
    const parent = sibling.parentNode;
    if (!parent || parent !== state.drag.parentNode) return;
    const rect = sibling.getBoundingClientRect();
    const horizontal = isHorizontal(parent);
    const middle = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const pointer = horizontal ? event.clientX : event.clientY;
    if (pointer < middle - 4) parent.insertBefore(state.drag, sibling);
    else parent.insertBefore(state.drag, sibling.nextSibling);
    parent.dataset.pvOrderDirty = "1";
  }

  function onDrop(event) {
    if (!state.on || !state.drag) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onDragEnd() {
    if (state.drag) state.drag.classList.remove("is-dragging");
    state.drag = null;
  }

  /* ------------------------------------------------------------- saving */

  function collectChanges() {
    const changes = [];
    const root = app();
    if (!root) return changes;
    root.querySelectorAll("[data-pv-path]").forEach(el => {
      const original = state.originals.get(el);
      const key = el.dataset.pvPath;
      const html = cleanHTML(el);
      const saved = state.pending.get(key) || state.server.get(key);
      if (saved?.kind === "html" && saved.content?.html === html) return;
      if ((original === undefined || original === ownText(el)) && !saved) return;
      changes.push({ key, kind: "html", content: { html } });
    });
    root.querySelectorAll("[data-pv-order-dirty]").forEach(container => {
      const items = Array.from(container.children).map(signature);
      changes.push({ key: cssPath(container), kind: "order", content: { items } });
    });
    return changes;
  }

  async function save(options) {
    const exit = !options || options.exit !== false;
    const changes = collectChanges();
    if (!changes.length) {
      try { toast("Nothing new to save"); } catch {}
      if (exit) toggle(false);
      return;
    }
    for (const change of changes) state.pending.set(change.key, change);
    writePending();
    apply();

    let saved = 0;
    let failed = false;
    for (const change of changes) {
      try {
        await Commerce.rpc("admin_save_site_content", {
          p_key: change.key,
          p_kind: change.kind,
          p_content: change.content,
        });
        state.server.set(change.key, change);
        state.pending.delete(change.key);
        saved += 1;
      } catch (error) {
        failed = true;
        break;
      }
    }
    writePending();
    if (failed) {
      const message = String((error && error.message) || "");
      try {
        toast(
          message.includes("ADMIN_REQUIRED")
            ? "Saved on this device only — verify with your authenticator to publish for everyone."
            : "Saved on this device only. The live publish could not be completed.",
        );
      } catch {}
    } else {
      try { toast(saved + " change" + (saved === 1 ? "" : "s") + " published to the site"); } catch {}
    }
    if (exit) toggle(false);
  }

  async function resetAll() {
    if (!window.confirm("Remove every published edit and restore the original copy?")) return;
    for (const key of Array.from(state.server.keys())) {
      try {
        await Commerce.rpc("admin_delete_site_content", { p_key: key });
      } catch {}
    }
    state.server.clear();
    state.pending.clear();
    writePending();
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    try { toast("All edits removed"); } catch {}
    location.reload();
  }

  /* ----------------------------------------------------------- toolbar */

  function buildToolbar() {
    if (document.getElementById("edit-toolbar")) return;
    const bar = document.createElement("div");
    bar.id = "edit-toolbar";
    bar.className = "edit-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Edit mode");
    bar.innerHTML =
      '<div class="edit-toolbar-actions">' +
      '<button class="btn small primary" type="button" id="edit-save">Done / Save</button>' +
      '<button class="btn small" type="button" id="edit-discard">Discard</button>' +
      '<button class="btn small ghost" type="button" id="edit-reset">Reset all</button>' +
      "</div>" +
      "<p>Click text to edit · Double-click to open · Drag to reorder</p>";
    document.body.append(bar);
    bar.querySelector("#edit-save").addEventListener("click", () => save({ exit: true }));
    bar.querySelector("#edit-discard").addEventListener("click", () => {
      state.pending.clear();
      writePending();
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      location.reload();
    });
    bar.querySelector("#edit-reset").addEventListener("click", resetAll);
  }

  function toggle(force) {
    if (!Commerce || !Commerce.cache || !Commerce.cache.admin) {
      try { toast("Admin access required"); } catch {}
      return false;
    }
    const next = typeof force === "boolean" ? force : !state.on;
    state.on = next;
    document.body.classList.toggle("is-edit-mode", next);
    if (next) {
      document.addEventListener("click", onClick, true);
      document.addEventListener("dblclick", onDoubleClick, true);
      document.addEventListener("dragstart", onDragStart, true);
      document.addEventListener("dragover", onDragOver, true);
      document.addEventListener("drop", onDrop, true);
      document.addEventListener("dragend", onDragEnd, true);
      buildToolbar();
      apply();
      markElements();
      try { toast("Edit mode on — click text to edit, double-click to open links, drag to reorder."); } catch {}
    } else {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDoubleClick, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragend", onDragEnd, true);
      document.getElementById("edit-toolbar")?.remove();
      document.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
      document.querySelectorAll("[data-pv-editable]").forEach(el => delete el.dataset.pvEditable);
    }
    return next;
  }

  function afterRender() {
    apply();
    if (state.on) markElements();
  }

  function onKeyDown(event) {
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if ((event.key === "e" || event.key === "E") && Commerce?.cache?.admin && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      toggle();
      return;
    }
    if ((event.key === "s" || event.key === "S") && state.on && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save({ exit: false });
    }
  }

  function init() {
    readPending();
    apply();
    loadSiteContent();
    document.addEventListener("keydown", onKeyDown);
    if (new URLSearchParams(location.search).get("edit") === "1") {
      // The admin flag resolves a moment after sign-in, so wait for it.
      let waited = 0;
      const timer = setInterval(() => {
        waited += 300;
        if (Commerce?.cache?.admin) {
          clearInterval(timer);
          toggle(true);
        } else if (waited > 12000) {
          clearInterval(timer);
        }
      }, 300);
    }
  }

  window.PVEdit = { init, toggle, apply, afterRender, refresh: loadSiteContent, save, collect: collectChanges, isOn: () => state.on };
})();
