/* ============================================================
   AirPods Pro 2 — SQLite Admin Panel
   Talks to server.py APIs. No store data is kept only in the
   browser anymore (except a one-time legacy import helper).
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const state = {
    admin: null,
    dashboard: {},
    settings: {},
    product: {},
    features: [],
    reviews: [],
    promos: [],
    orders: [],
    subscribers: [],
    carts: [],
    system: {},
    activity: [],
    activeTab: "overview",
    expandedOrders: new Set(),
  };
  let legacyChecked = false;

  /* ---------------- API + toast ---------------- */
  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body !== undefined && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    if (method !== "GET") headers["X-Admin-Request"] = "1";
    const res = await window.fetch(path, { method, headers, body, credentials: "same-origin" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((json && json.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json || { ok: true };
  }

  const toastEl = $("#toast");
  let toastTimer = null;
  function toast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", isError);
    toastEl.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), 3400);
  }

  function money(value) {
    const symbol = state.settings.currency_symbol || "$";
    return `${symbol}${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function money0(value) {
    const n = Number(value || 0);
    const symbol = state.settings.currency_symbol || "$";
    return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
  }
  function fmtDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value || "—";
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function fmtBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
  function setMsg(id, text, isError = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", isError);
  }

  /* ---------------- Form schemas ---------------- */
  const F = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });

  const contentGroups = [
    {
      title: "General, SEO & theme",
      desc: "Store identity, search/social text, colour and maintenance mode.",
      fields: [
        F("site_name", "Site name"), F("brand_name", "Brand / logo text"),
        F("page_title", "Browser page title", "text", { full: true }),
        F("meta_description", "Meta description", "textarea", { full: true, rows: 3 }),
        F("accent_color", "Accent colour", "color"),
        F("store_open", "Store open", "checkbox", { help: "Turn off to block new orders." }),
        F("maintenance_message", "Maintenance message", "textarea", { full: true, rows: 2 }),
        F("track_page_views", "Track page views", "checkbox"),
      ],
    },
    {
      title: "Announcement & navigation",
      desc: "Top offer bar and menu labels. Tokens: {price}, {save}, {count}, {rating}, {product}.",
      fields: [
        F("show_announcement", "Show announcement bar", "checkbox"),
        F("countdown_enabled", "Show countdown", "checkbox"),
        F("announcement_tag", "Announcement tag"),
        F("announcement_text", "Announcement text", "text", { full: true, help: "Example: Save {save} + free engraving" }),
        F("announcement_link_text", "Announcement link text"), F("announcement_link", "Announcement link"),
        F("nav_features_label", "Features menu label"), F("nav_reviews_label", "Reviews menu label"), F("nav_buy_label", "Buy button label"),
      ],
    },
    {
      title: "Hero section",
      desc: "Main headline, copy, call-to-action and floating badges.",
      fields: [
        F("hero_eyebrow", "Hero eyebrow", "text", { full: true }),
        F("hero_title_1", "Headline line 1"), F("hero_title_2", "Headline highlighted line"),
        F("hero_subtitle", "Hero subtitle", "textarea", { full: true, rows: 3 }),
        F("hero_cta_text", "Hero button text", "text", { help: "Example: Buy from {price}" }),
        F("hero_badge_1_value", "Badge 1 value"), F("hero_badge_1_unit", "Badge 1 unit"), F("hero_badge_1_label", "Badge 1 label"),
        F("hero_badge_2_value", "Badge 2 value"), F("hero_badge_2_unit", "Badge 2 unit"), F("hero_badge_2_label", "Badge 2 label"),
        F("hero_meta_1", "Hero checklist 1"), F("hero_meta_2", "Hero checklist 2"), F("hero_meta_3", "Hero checklist 3"),
      ],
    },
    {
      title: "Features & reviews headings",
      desc: "Section visibility, headings and rating distribution bars.",
      fields: [
        F("show_features", "Show features section", "checkbox"), F("show_reviews", "Show reviews section", "checkbox"),
        F("features_eyebrow", "Features eyebrow"), F("features_title", "Features title"),
        F("features_subtitle", "Features subtitle", "textarea", { full: true, rows: 2 }),
        F("reviews_eyebrow", "Reviews eyebrow", "text", { help: "Supports {count}" }), F("reviews_title", "Reviews title"),
        F("rating_5_percent", "5-star %", "number", { min: 0, max: 100 }), F("rating_4_percent", "4-star %", "number", { min: 0, max: 100 }),
        F("rating_3_percent", "3-star %", "number", { min: 0, max: 100 }), F("rating_2_percent", "2-star %", "number", { min: 0, max: 100 }),
        F("rating_1_percent", "1-star %", "number", { min: 0, max: 100 }),
        F("review_tags", "Most-mentioned tags", "textarea", { full: true, rows: 2, help: "Separate tags with |" }),
      ],
    },
    {
      title: "Buy box",
      desc: "Product purchase panel text, engraving, stock messages and delivery estimate.",
      fields: [
        F("buy_eyebrow", "Buy eyebrow"), F("buy_finish_text", "Finish text"),
        F("stock_in_text", "In-stock text"), F("stock_low_text", "Low-stock text"), F("stock_out_text", "Out-of-stock text"),
        F("low_stock_threshold", "Low-stock threshold", "number", { min: 0 }),
        F("protection_title", "Protection heading"), F("standard_plan_name", "Standard plan name"), F("standard_plan_description", "Standard plan description"),
        F("care_badge", "Care plan badge"),
        F("engraving_enabled", "Engraving enabled", "checkbox"), F("engraving_title", "Engraving heading"),
        F("engraving_max_length", "Engraving max characters", "number", { min: 1, max: 40 }),
        F("add_to_bag_text", "Add-to-bag button"), F("buy_now_text", "Buy-now button"),
        F("delivery_cutoff_hour", "Order cutoff hour (0–23)", "number", { min: 0, max: 23 }),
        F("delivery_business_days", "Delivery estimate business days", "number", { min: 0 }),
        F("assurance_1", "Assurance 1"), F("assurance_2", "Assurance 2"), F("assurance_3", "Assurance 3"),
        F("buy_fineprint", "Buy fine print", "textarea", { full: true, rows: 2 }),
      ],
    },
    {
      title: "Footer, contact & social",
      desc: "Footer text, contact details, social links, newsletter and legal links.",
      fields: [
        F("footer_tagline", "Footer tagline"), F("support_email", "Support email", "email"), F("support_phone", "Support phone"),
        F("support_address", "Support address", "textarea", { rows: 3 }), F("support_hours", "Support hours"),
        F("social_x_url", "X URL", "url"), F("social_instagram_url", "Instagram URL", "url"),
        F("social_youtube_url", "YouTube URL", "url"), F("social_tiktok_url", "TikTok URL", "url"),
        F("show_newsletter", "Show newsletter form", "checkbox"), F("show_sticky_buy", "Show mobile sticky buy bar", "checkbox"),
        F("newsletter_title", "Newsletter title"), F("newsletter_text", "Newsletter text"),
        F("payments_text", "Payment methods", "text", { full: true, help: "Separate with commas" }),
        F("legal_note", "Legal/footer note", "textarea", { full: true, rows: 3 }),
        F("privacy_url", "Privacy URL"), F("terms_url", "Terms URL"), F("shipping_policy_url", "Shipping policy URL"), F("accessibility_url", "Accessibility URL"),
      ],
    },
    {
      title: "Checkout text",
      desc: "Messages shown on the checkout page.",
      fields: [
        F("checkout_note", "Checkout notice", "textarea", { full: true, rows: 3 }),
        F("checkout_help_text", "Checkout privacy/help text", "textarea", { full: true, rows: 2 }),
      ],
    },
  ];

  const productGroups = [
    {
      title: "Product basics",
      desc: "Name and identifiers used across the store, cart and orders.",
      fields: [
        F("name", "Product name"), F("subtitle", "Buy-box subtitle"), F("sku", "SKU"), F("slug", "Product slug / ID"),
        F("description", "Product / SEO description", "textarea", { full: true, rows: 3 }),
        F("active", "Product active", "checkbox"),
      ],
    },
    {
      title: "Pricing & protection plan",
      desc: "Live selling price, compare-at price and paid protection add-on.",
      fields: [
        F("price", "Selling price", "number", { step: "0.01", min: 0 }), F("compare_at_price", "Compare-at price", "number", { step: "0.01", min: 0 }),
        F("care_price", "Protection plan price", "number", { step: "0.01", min: 0 }),
        F("care_name", "Protection plan name"), F("care_description", "Protection plan description"),
      ],
    },
    {
      title: "Inventory & social proof",
      desc: "Stock is reduced when an order is placed and restored if that order is cancelled/deleted.",
      fields: [
        F("stock", "Stock quantity", "number", { step: "1", min: 0 }), F("track_inventory", "Track inventory", "checkbox"),
        F("max_qty", "Max quantity per cart line", "number", { step: "1", min: 1, max: 99 }),
        F("rating", "Displayed rating", "number", { step: "0.1", min: 0, max: 5 }), F("review_count", "Displayed review count", "number", { step: "1", min: 0 }),
      ],
    },
    {
      title: "Images",
      desc: "Paste an image path/URL or upload a PNG, JPG, WebP or GIF up to 3 MB.",
      fields: [
        F("hero_image", "Hero image", "image", { full: true }),
        F("image", "Buy / cart / checkout image", "image", { full: true }),
      ],
    },
  ];

  const commerceGroups = [
    {
      title: "Currency, shipping & tax",
      desc: "Used by the cart drawer, checkout totals and server-side order calculation.",
      fields: [
        F("currency_symbol", "Currency symbol", "text", { help: "Examples: $, ৳, €" }), F("currency_code", "Currency code", "text", { help: "Examples: USD, BDT, EUR" }),
        F("standard_shipping_fee", "Standard shipping fee", "number", { step: "0.01", min: 0 }),
        F("express_shipping_fee", "Express shipping fee", "number", { step: "0.01", min: 0 }),
        F("free_shipping_threshold", "Free shipping threshold", "number", { step: "0.01", min: 0, help: "0 disables the threshold" }),
        F("tax_percent", "Tax percent", "number", { step: "0.01", min: 0, max: 100 }),
      ],
    },
    {
      title: "Delivery estimates & returns",
      desc: "Checkout delivery date ranges.",
      fields: [
        F("standard_eta_min_days", "Standard ETA min days", "number", { min: 0 }), F("standard_eta_max_days", "Standard ETA max days", "number", { min: 0 }),
        F("express_eta_min_days", "Express ETA min days", "number", { min: 0 }), F("express_eta_max_days", "Express ETA max days", "number", { min: 0 }),
        F("return_days", "Return window days", "number", { min: 0 }),
      ],
    },
  ];

  const featureFields = [
    F("title", "Title", "text", { full: true }), F("description", "Description", "textarea", { full: true, rows: 4 }),
    F("tag", "Small tag (optional)"), F("visual_type", "Visual style", "select", { options: [["eq", "Animated EQ bars"], ["big", "Big text"], ["orbit", "Orbit animation"], ["icon", "Water/drop icon"], ["pills", "Pill labels"]] }),
    F("visual_text", "Visual text", "text", { help: "Big text: 2× or 6h. Pills: USB-C, MagSafe, Qi" }),
    F("size", "Card size", "select", { options: [["normal", "Normal"], ["large", "Large"]] }),
    F("sort_order", "Sort order", "number", { step: "1" }), F("active", "Visible on website", "checkbox"),
  ];
  const reviewFields = [
    F("author", "Customer name"), F("location", "Location"), F("rating", "Rating", "select", { options: [[5, "5 stars"], [4, "4 stars"], [3, "3 stars"], [2, "2 stars"], [1, "1 star"]] }),
    F("date_label", "Date label", "text", { help: "Example: 2 weeks ago" }), F("body", "Review text", "textarea", { full: true, rows: 4 }),
    F("color", "Avatar colour", "color"), F("verified", "Verified buyer", "checkbox"),
    F("sort_order", "Sort order", "number", { step: "1" }), F("active", "Visible on website", "checkbox"),
  ];
  const promoFields = [
    F("code", "Code", "text", { help: "Letters, numbers, - and _" }),
    F("type", "Type", "select", { options: [["percent", "Percent off subtotal"], ["fixed", "Fixed amount off"], ["shipping", "Free shipping"]] }),
    F("value", "Value", "number", { step: "0.01", min: 0, help: "Percent = 10 means 10%. Fixed = currency amount." }),
    F("min_subtotal", "Minimum subtotal", "number", { step: "0.01", min: 0 }),
    F("max_uses", "Max uses (0 = unlimited)", "number", { step: "1", min: 0 }),
    F("expires_at", "Expires at (optional)", "text", { help: "Example: 2026-12-31T23:59:00Z" }),
    F("active", "Active", "checkbox"),
  ];

  /* ---------------- Dynamic form builder ---------------- */
  function fieldHtml(field, prefix) {
    const id = `${prefix}-${field.key}`;
    const full = field.full ? " settings-field--full" : "";
    const help = field.help ? `<small>${esc(field.help)}</small>` : "";
    const attrs = `id="${esc(id)}" data-key="${esc(field.key)}" data-field-type="${esc(field.type)}"`;
    if (field.type === "checkbox") {
      return `<label class="settings-field check-field${full}"><span><span class="admin-label">${esc(field.label)}</span>${help}</span><input class="admin-check" type="checkbox" ${attrs} /></label>`;
    }
    if (field.type === "textarea") {
      return `<div class="settings-field${full}"><label class="admin-label" for="${esc(id)}">${esc(field.label)}</label><textarea class="admin-input" rows="${field.rows || 3}" ${attrs}></textarea>${help}</div>`;
    }
    if (field.type === "select") {
      const opts = (field.options || []).map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("");
      return `<div class="settings-field${full}"><label class="admin-label" for="${esc(id)}">${esc(field.label)}</label><select class="admin-input" ${attrs}>${opts}</select>${help}</div>`;
    }
    if (field.type === "image") {
      return `<div class="settings-field${full} image-field"><label class="admin-label" for="${esc(id)}">${esc(field.label)}</label>
        <div class="image-field__row"><img data-image-preview="${esc(field.key)}" alt="" />
          <div class="image-field__controls"><input class="admin-input" type="text" ${attrs} placeholder="assets/img/... or https://..." />
            <label class="btn btn--ghost btn--sm upload-btn">Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload-for="${esc(field.key)}" hidden /></label>
            <small data-upload-status="${esc(field.key)}">PNG, JPG, WebP or GIF · max 3 MB</small></div></div></div>`;
    }
    const numAttrs = field.type === "number" ? ` step="${esc(field.step || "1")}"${field.min !== undefined ? ` min="${field.min}"` : ""}${field.max !== undefined ? ` max="${field.max}"` : ""} inputmode="decimal"` : "";
    return `<div class="settings-field${full}"><label class="admin-label" for="${esc(id)}">${esc(field.label)}</label><input class="admin-input" type="${esc(field.type)}" ${attrs}${numAttrs} />${help}</div>`;
  }

  function buildGroups(container, groups, prefix) {
    if (!container) return;
    container.innerHTML = groups.map((group) => `
      <section class="form-group">
        <div class="form-group__head"><h3>${esc(group.title)}</h3><p>${esc(group.desc || "")}</p></div>
        <div class="settings-grid">${group.fields.map((f) => fieldHtml(f, prefix)).join("")}</div>
      </section>`).join("");
  }
  function buildFields(container, fields, prefix) {
    if (!container) return;
    container.innerHTML = `<div class="settings-grid">${fields.map((f) => fieldHtml(f, prefix)).join("")}</div>`;
  }
  function fillForm(container, values = {}) {
    if (!container) return;
    $$("[data-key]", container).forEach((input) => {
      const key = input.dataset.key;
      const value = values[key];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value === undefined || value === null ? "" : String(value);
      if (input.dataset.fieldType === "image") updateImagePreview(input);
    });
  }
  function collectForm(container) {
    const out = {};
    if (!container) return out;
    $$("[data-key]", container).forEach((input) => {
      const key = input.dataset.key;
      if (input.type === "checkbox") out[key] = input.checked;
      else if (input.dataset.fieldType === "number") out[key] = input.value === "" ? 0 : Number(input.value);
      else if (key === "rating" && input.tagName === "SELECT") out[key] = Number(input.value);
      else out[key] = input.value.trim();
    });
    return out;
  }
  function updateImagePreview(input) {
    const wrap = input.closest(".image-field");
    const img = wrap ? $("[data-image-preview]", wrap) : null;
    if (img) img.src = input.value || "";
  }

  /* ---------------- Auth / shell ---------------- */
  const loginView = $("#loginView");
  const dashView = $("#dashView");
  function showLogin() {
    if (loginView) loginView.hidden = false;
    if (dashView) dashView.hidden = true;
  }
  function showDash() {
    if (loginView) loginView.hidden = true;
    if (dashView) dashView.hidden = false;
  }

  function activateTab(name) {
    state.activeTab = name;
    $$(".admin-tab").forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !active;
    });
  }

  async function loadAll() {
    const data = await api("/api/admin/bootstrap");
    Object.assign(state, {
      admin: data.admin, dashboard: data.dashboard || {}, settings: data.settings || {}, product: data.product || {},
      features: data.features || [], reviews: data.reviews || [], promos: data.promos || [], orders: data.orders || [],
      subscribers: data.subscribers || [], carts: data.carts || [], system: data.system || {}, activity: data.activity || [],
    });
    renderAll();
    if (!legacyChecked) {
      legacyChecked = true;
      await importLegacy(true);
    }
  }

  function renderAll() {
    renderStats();
    renderOverview();
    fillForm($("#contentFields"), state.settings);
    fillForm($("#productFields"), state.product);
    fillForm($("#commerceFields"), state.settings);
    renderProductPreview();
    renderFeatures();
    renderReviews();
    renderOrders();
    renderPromos();
    renderSubscribers();
    renderCarts();
    renderSystem();
    activateTab(state.activeTab || "overview");
  }

  /* ---------------- Dashboard / overview ---------------- */
  function renderStats() {
    const d = state.dashboard || {};
    const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    set("#statRevenue", money(d.revenue)); set("#statOrders", d.orders || 0); set("#statPending", d.pending_orders || 0);
    set("#statItems", d.items_sold || 0); set("#statSubs", d.subscribers || 0); set("#statCarts", d.active_carts || 0);
    set("#statViews", d.page_views || 0); set("#statViewsToday", d.page_views_today || 0); set("#statStock", d.product_stock ?? state.product.stock ?? 0);
    set("#statContent", (d.features || state.features.length) + (d.reviews || state.reviews.length) + (d.promo_codes || state.promos.length));
  }

  function statusPill(status) {
    return `<span class="status-pill" data-status="${esc(status)}">${esc(status)}</span>`;
  }
  function renderOverview() {
    const recent = state.orders.slice(0, 6);
    const body = $("#recentOrdersBody");
    const empty = $("#recentOrdersEmpty");
    if (body) {
      body.innerHTML = recent.map((o) => `<tr><td class="cell-id">${esc(o.order_no)}</td><td>${esc(o.customer_name)}<span class="cell-sub">${esc(o.email)}</span></td><td class="cell-total">${money(o.total)}</td><td>${statusPill(o.status)}</td></tr>`).join("");
    }
    if (empty) empty.hidden = recent.length > 0;
    const wrap = body ? body.closest(".mini-table-wrap") : null;
    if (wrap) wrap.hidden = recent.length === 0;

    const quickStore = $("#quickStoreOpen"); if (quickStore) quickStore.checked = state.settings.store_open !== false;
    const quickAnn = $("#quickAnnouncement"); if (quickAnn) quickAnn.checked = state.settings.show_announcement !== false;
    const quickReviews = $("#quickReviews"); if (quickReviews) quickReviews.checked = state.settings.show_reviews !== false;

    const mini = $("#productMini");
    if (mini) {
      const p = state.product;
      mini.innerHTML = `<img src="${esc(p.image || "")}" alt="" /><div><b>${esc(p.name || "Product")}</b><span>${money0(p.price)} · Stock ${esc(p.stock ?? 0)} · ${p.active ? "Active" : "Hidden"}</span></div>`;
    }
    renderActivity($("#recentActivity"), state.activity.slice(0, 6));
  }
  function renderActivity(container, rows) {
    if (!container) return;
    container.innerHTML = rows.length
      ? rows.map((a) => `<li><span></span><div><b>${esc(a.action)}</b>${a.details ? `<small>${esc(a.details)}</small>` : ""}</div><time>${fmtDate(a.created_at)}</time></li>`).join("")
      : `<li class="activity-empty">No admin activity yet.</li>`;
  }

  function renderProductPreview() {
    const box = $("#productPreview");
    if (!box) return;
    const values = { ...state.product, ...collectForm($("#productFields")) };
    const save = Math.max(0, Number(values.compare_at_price || 0) - Number(values.price || 0));
    box.innerHTML = `<span>Store preview</span><b>${esc(values.name || "Product")}</b><small>${money0(values.price)}${save ? ` · Save ${money0(save)}` : ""} · Stock ${esc(values.stock ?? 0)}</small>`;
  }

  /* ---------------- Entity lists ---------------- */
  function entityButtons(kind, id) {
    return `<div class="entity-card__actions"><button class="btn btn--ghost btn--sm" type="button" data-edit="${kind}:${id}">Edit</button><button class="btn btn--sm admin-btn-danger" type="button" data-delete="${kind}:${id}">Delete</button></div>`;
  }
  function visiblePill(active) {
    return `<span class="pill ${active ? "pill--on" : "pill--off"}">${active ? "Visible" : "Hidden"}</span>`;
  }
  function renderFeatures() {
    const list = $("#featuresList");
    const count = $("#featureCount");
    if (count) count.textContent = `${state.features.length} feature${state.features.length === 1 ? "" : "s"}`;
    if (!list) return;
    list.innerHTML = state.features.length ? state.features.map((f) => `
      <article class="entity-card"><div class="entity-card__main"><div class="entity-card__top"><h3>${esc(f.title)}</h3>${visiblePill(f.active)}</div>
      <p>${esc(f.description)}</p><div class="entity-meta"><span>Visual: ${esc(f.visual_type)}</span><span>Size: ${esc(f.size)}</span><span>Order: ${esc(f.sort_order)}</span>${f.tag ? `<span>Tag: ${esc(f.tag)}</span>` : ""}</div></div>${entityButtons("feature", f.id)}</article>`).join("")
      : `<div class="admin-empty"><p><b>No features yet.</b></p><p>Add your first feature card.</p></div>`;
  }
  function stars(rating) {
    const r = Math.max(1, Math.min(5, Number(rating) || 5));
    return "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r);
  }
  function renderReviews() {
    const list = $("#reviewsList");
    const count = $("#reviewCount");
    if (count) count.textContent = `${state.reviews.length} review${state.reviews.length === 1 ? "" : "s"}`;
    if (!list) return;
    list.innerHTML = state.reviews.length ? state.reviews.map((r) => `
      <article class="entity-card"><div class="entity-card__main"><div class="entity-card__top"><h3>${esc(r.author)} <span class="review-stars">${stars(r.rating)}</span></h3>${visiblePill(r.active)}</div>
      <p>“${esc(r.body)}”</p><div class="entity-meta"><span>${esc(r.location || "—")}</span><span>${esc(r.date_label || "")}</span><span>${r.verified ? "Verified" : "Not verified"}</span><span>Order: ${esc(r.sort_order)}</span></div></div>${entityButtons("review", r.id)}</article>`).join("")
      : `<div class="admin-empty"><p><b>No reviews yet.</b></p><p>Add your first customer review.</p></div>`;
  }
  function promoLabel(p) {
    if (p.type === "percent") return `${Number(p.value) || 0}% off`;
    if (p.type === "fixed") return `${money(p.value)} off`;
    return "Free shipping";
  }
  function renderPromos() {
    const list = $("#promosList");
    const count = $("#promoCount");
    if (count) count.textContent = `${state.promos.length} code${state.promos.length === 1 ? "" : "s"}`;
    if (!list) return;
    list.innerHTML = state.promos.length ? state.promos.map((p) => `
      <article class="entity-card"><div class="entity-card__main"><div class="entity-card__top"><h3><code>${esc(p.code)}</code> <span class="promo-value">${esc(promoLabel(p))}</span></h3>${visiblePill(p.active)}</div>
      <div class="entity-meta"><span>Used: ${esc(p.used_count || 0)}${p.max_uses ? ` / ${esc(p.max_uses)}` : " (unlimited)"}</span><span>Min: ${money(p.min_subtotal)}</span>${p.expires_at ? `<span>Expires: ${esc(p.expires_at)}</span>` : ""}</div></div>${entityButtons("promo", p.id)}</article>`).join("")
      : `<div class="admin-empty"><p><b>No promo codes yet.</b></p><p>Create your first discount code.</p></div>`;
  }

  /* ---------------- Orders ---------------- */
  function itemsSummary(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return "—";
    const first = items[0];
    const extra = items.length > 1 ? ` +${items.length - 1} more` : "";
    return `${first.qty} × ${first.name}${extra}`;
  }
  function filteredOrders() {
    const q = ($("#orderSearch")?.value || "").trim().toLowerCase();
    const status = $("#orderFilter")?.value || "";
    return state.orders.filter((o) => {
      if (status && o.status !== status) return false;
      if (!q) return true;
      return [o.order_no, o.customer_name, o.email, o.phone].join(" ").toLowerCase().includes(q);
    });
  }
  function orderDetail(order) {
    const items = (order.items || []).map((i) => `<li>${esc(i.qty)} × <b>${esc(i.name)}</b> — ${money((i.price ?? i.unit_price) * i.qty)}${i.care ? " · Protection plan" : ""}${i.engraving ? ` · Engraved “${esc(i.engraving)}”` : ""}</li>`).join("");
    return `<div class="detail-box">
      <div><h4>Customer</h4><p><b>${esc(order.customer_name)}</b><br>${esc(order.email)}<br>${esc(order.phone || "—")}</p></div>
      <div><h4>Delivery address</h4><p>${esc(order.address || "—")}</p></div>
      <div><h4>Items</h4><ul class="detail-items">${items || "<li>No items</li>"}</ul></div>
      <div><h4>Totals</h4><p>Subtotal ${money(order.subtotal)}<br>Discount −${money(order.discount)}<br>Shipping ${money(order.shipping)}<br>Tax ${money(order.tax)}<br><b>Total ${money(order.total)}</b></p></div>
      <div><h4>Payment / delivery</h4><p>${esc(order.payment_label || order.payment_method || "—")}<br>${esc(order.shipping_method || "standard")} delivery${order.promo_code ? `<br>Promo: <b>${esc(order.promo_code)}</b>` : ""}</p></div>
      <div class="detail-notes"><h4>Admin notes</h4><textarea class="admin-input" rows="3" data-order-notes="${order.id}" placeholder="Internal order notes…">${esc(order.notes || "")}</textarea><button class="btn btn--ghost btn--sm" type="button" data-save-notes="${order.id}">Save notes</button></div>
    </div>`;
  }
  function renderOrders() {
    const body = $("#ordersBody");
    const empty = $("#ordersEmpty");
    const wrap = $("#ordersTableWrap");
    const count = $("#orderCount");
    const rows = filteredOrders();
    if (count) count.textContent = `${state.orders.length} order${state.orders.length === 1 ? "" : "s"}`;
    if (!body) return;
    body.innerHTML = rows.map((o) => {
      const expanded = state.expandedOrders.has(Number(o.id));
      const main = `<tr>
        <td class="cell-id">${esc(o.order_no)}${o.demo ? '<span class="demo-tag">Demo</span>' : ""}</td>
        <td>${fmtDate(o.created_at)}</td>
        <td><b>${esc(o.customer_name)}</b><span class="cell-sub">${esc(o.email)}</span></td>
        <td>${esc(itemsSummary(o))}</td><td class="cell-total">${money(o.total)}</td>
        <td>${esc(o.payment_label || o.payment_method || "—")}</td>
        <td><select class="status-select" data-order-status="${o.id}" data-status="${esc(o.status)}" aria-label="Order status">${["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"].map((s) => `<option${s === o.status ? " selected" : ""}>${s}</option>`).join("")}</select></td>
        <td class="cell-actions"><button class="btn btn--ghost btn--sm" type="button" data-order-details="${o.id}">${expanded ? "Hide" : "Details"}</button><button class="btn btn--sm admin-btn-danger" type="button" data-order-delete="${o.id}">Delete</button></td></tr>`;
      return expanded ? `${main}<tr class="detail-row"><td colspan="8">${orderDetail(o)}</td></tr>` : main;
    }).join("");
    if (empty) empty.hidden = rows.length > 0;
    if (wrap) wrap.hidden = rows.length === 0;
  }

  /* ---------------- Subscribers + carts ---------------- */
  function renderSubscribers() {
    const body = $("#subsBody");
    const empty = $("#subsEmpty");
    const wrap = $("#subsTableWrap");
    const count = $("#subCount");
    if (count) count.textContent = `${state.subscribers.length} subscriber${state.subscribers.length === 1 ? "" : "s"}`;
    if (!body) return;
    body.innerHTML = state.subscribers.map((s) => `<tr><td><b>${esc(s.email)}</b></td><td>${esc(s.source || "website")}</td><td>${fmtDate(s.created_at)}</td><td class="cell-actions"><button class="btn btn--sm admin-btn-danger" type="button" data-sub-delete="${s.id}">Delete</button></td></tr>`).join("");
    if (empty) empty.hidden = state.subscribers.length > 0;
    if (wrap) wrap.hidden = state.subscribers.length === 0;
  }
  function renderCarts() {
    const body = $("#cartsBody");
    const empty = $("#cartsEmpty");
    const wrap = $("#cartsTableWrap");
    const count = $("#cartCount");
    if (count) count.textContent = `${state.carts.length} cart${state.carts.length === 1 ? "" : "s"}`;
    if (!body) return;
    body.innerHTML = state.carts.map((c) => {
      const summary = (c.items || []).map((i) => `${i.qty} × ${i.name}`).join(", ") || "Empty";
      return `<tr><td><b>${esc(String(c.cart_id).slice(0, 18))}…</b><span class="cell-sub">${esc(summary)}</span></td><td>${esc(c.item_count)}</td><td class="cell-total">${money(c.subtotal)}</td><td>${statusPill(c.status === "converted" ? "Delivered" : "Pending")}<span class="cell-sub">${esc(c.status)}${c.converted_order_no ? ` · ${esc(c.converted_order_no)}` : ""}</span></td><td>${fmtDate(c.updated_at)}</td><td class="cell-actions"><button class="btn btn--sm admin-btn-danger" type="button" data-cart-delete="${esc(c.cart_id)}">Delete</button></td></tr>`;
    }).join("");
    if (empty) empty.hidden = state.carts.length > 0;
    if (wrap) wrap.hidden = state.carts.length === 0;
  }

  /* ---------------- System ---------------- */
  function renderSystem() {
    const sys = state.system || {};
    const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    set("#dbPath", sys.database || "data/site.db"); set("#dbSize", fmtBytes(sys.database_size_bytes));
    set("#sqliteVersion", sys.sqlite_version || "—"); set("#serverTime", fmtDate(sys.server_time));
    const counts = $("#tableCounts");
    if (counts) {
      counts.innerHTML = Object.entries(sys.table_counts || {}).map(([table, n]) => `<span><b>${esc(table)}</b>${esc(n)}</span>`).join("");
    }
    renderActivity($("#activityList"), state.activity);
  }

  /* ---------------- CSV / downloads ---------------- */
  function download(filename, text, type = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  function downloadCsv(filename, rows) {
    download(filename, rows.map((row) => row.map(csvCell).join(",")).join("\n"));
  }

  /* ---------------- Legacy localStorage import ---------------- */
  function legacyPayload() {
    const read = (key, fallback) => {
      try { return JSON.parse(window.localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
    };
    return {
      settings: read("airpods-pro2-settings/v1", {}),
      orders: read("airpods-pro2-orders/v1", []),
      subscribers: read("airpods-pro2-subscribers/v1", []),
    };
  }
  async function importLegacy(auto = false) {
    const payload = legacyPayload();
    const hasData = Object.keys(payload.settings || {}).length || (payload.orders || []).length || (payload.subscribers || []).length;
    const flag = "airpods-pro2-sqlite-migrated/v1";
    if (auto && window.localStorage.getItem(flag) === "1") return;
    if (!hasData) {
      if (!auto) toast("No old browser data found to import.", true);
      return;
    }
    try {
      const result = await api("/api/admin/import-legacy", { method: "POST", body: payload });
      window.localStorage.setItem(flag, "1");
      const imported = result.imported || {};
      const total = (imported.orders || 0) + (imported.subscribers || 0) + (imported.settings ? 1 : 0);
      if (total) {
        toast(`Imported old browser data into SQLite (${imported.orders || 0} orders, ${imported.subscribers || 0} subscribers).`);
        await loadAll();
      } else if (!auto) toast("Old data was already in SQLite.");
    } catch (err) {
      if (!auto) toast(err.message, true);
    }
  }

  /* ---------------- Editor helpers ---------------- */
  function resetEditor(kind) {
    const defaults = {
      feature: { title: "", description: "", tag: "", visual_type: "big", visual_text: "", size: "normal", sort_order: state.features.length + 1, active: true },
      review: { author: "", location: "", rating: 5, body: "", date_label: "Just now", color: "#0071e3", verified: true, sort_order: state.reviews.length + 1, active: true },
      promo: { code: "", type: "percent", value: 10, min_subtotal: 0, max_uses: 0, expires_at: "", active: true },
    }[kind];
    $(`#${kind}Id`).value = "";
    $(`#${kind}EditorTitle`).textContent = `Add ${kind === "promo" ? "promo code" : kind}`;
    fillForm($(`#${kind}FormFields`), defaults);
    setMsg(`#${kind}Msg`, "");
  }
  function editEntity(kind, id) {
    const source = { feature: state.features, review: state.reviews, promo: state.promos }[kind];
    const item = source.find((x) => Number(x.id) === Number(id));
    if (!item) return;
    $(`#${kind}Id`).value = item.id;
    $(`#${kind}EditorTitle`).textContent = `Edit ${kind === "promo" ? "promo code" : kind}`;
    fillForm($(`#${kind}FormFields`), item);
    $(`#${kind}Form`).scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function saveEntity(kind) {
    const id = $(`#${kind}Id`).value;
    const payload = collectForm($(`#${kind}FormFields`));
    const plural = { feature: "features", review: "reviews", promo: "promos" }[kind];
    await api(`/api/admin/${plural}${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: payload });
    toast(`${kind === "promo" ? "Promo code" : kind[0].toUpperCase() + kind.slice(1)} saved to SQLite.`);
    resetEditor(kind);
    await loadAll();
  }
  async function deleteEntity(kind, id) {
    if (!window.confirm("Delete this item from SQLite?")) return;
    const plural = { feature: "features", review: "reviews", promo: "promos" }[kind];
    await api(`/api/admin/${plural}/${id}`, { method: "DELETE" });
    toast("Deleted.");
    await loadAll();
  }

  /* ---------------- Events ---------------- */
  function bindEvents() {
    $$(".admin-tab").forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
    $$("[data-goto-tab]").forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.gotoTab)));
    $("#refreshBtn")?.addEventListener("click", async () => { try { await loadAll(); toast("Admin data refreshed."); } catch (e) { toast(e.message, true); } });

    $("#loginForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#loginSubmit");
      const err = $("#loginError");
      if (err) err.hidden = true;
      if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
      try {
        await api("/api/admin/login", { method: "POST", body: { username: $("#adminUsername").value.trim(), password: $("#adminPassword").value } });
        showDash();
        await loadAll();
        toast("Welcome back — SQLite admin is ready.");
      } catch (ex) {
        if (err) { err.textContent = ex.message || "Wrong username or password."; err.hidden = false; }
        const card = $("#loginCard");
        if (card) { card.classList.remove("is-shake"); void card.offsetWidth; card.classList.add("is-shake"); }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
      }
    });
    $("#logoutBtn")?.addEventListener("click", async () => {
      try { await api("/api/admin/logout", { method: "POST" }); } catch {}
      showLogin();
    });

    const quick = async (id, key) => {
      const input = $(id);
      if (!input) return;
      input.addEventListener("change", async () => {
        try {
          const result = await api("/api/admin/settings", { method: "PUT", body: { [key]: input.checked } });
          state.settings = result.settings;
          fillForm($("#contentFields"), state.settings);
          toast("Quick setting saved.");
        } catch (e) { input.checked = !input.checked; toast(e.message, true); }
      });
    };
    quick("#quickStoreOpen", "store_open"); quick("#quickAnnouncement", "show_announcement"); quick("#quickReviews", "show_reviews");

    $("#contentForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const result = await api("/api/admin/settings", { method: "PUT", body: collectForm($("#contentFields")) });
        state.settings = result.settings;
        setMsg("#contentMsg", "Website content saved in SQLite. Refresh the store to see changes.");
        toast("Website content saved.");
        await loadAll();
      } catch (err) { setMsg("#contentMsg", err.message, true); toast(err.message, true); }
    });
    $("#reloadContent")?.addEventListener("click", () => fillForm($("#contentFields"), state.settings));

    $("#productForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const result = await api("/api/admin/product", { method: "PUT", body: collectForm($("#productFields")) });
        state.product = result.product;
        setMsg("#productMsg", "Product saved in SQLite. New carts/checkouts will use it immediately.");
        toast("Product saved.");
        await loadAll();
      } catch (err) { setMsg("#productMsg", err.message, true); toast(err.message, true); }
    });
    $("#reloadProduct")?.addEventListener("click", () => { fillForm($("#productFields"), state.product); renderProductPreview(); });
    $("#productFields")?.addEventListener("input", renderProductPreview);

    $("#commerceForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const result = await api("/api/admin/settings", { method: "PUT", body: collectForm($("#commerceFields")) });
        state.settings = result.settings;
        setMsg("#commerceMsg", "Commerce settings saved in SQLite.");
        toast("Commerce settings saved.");
        await loadAll();
      } catch (err) { setMsg("#commerceMsg", err.message, true); toast(err.message, true); }
    });
    $("#reloadCommerce")?.addEventListener("click", () => fillForm($("#commerceFields"), state.settings));

    ["feature", "review", "promo"].forEach((kind) => {
      $(`#${kind}Form`)?.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await saveEntity(kind); } catch (err) { setMsg(`#${kind}Msg`, err.message, true); toast(err.message, true); }
      });
      $(`#cancel${kind[0].toUpperCase() + kind.slice(1)}`)?.addEventListener("click", () => resetEditor(kind));
    });

    document.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit]");
      if (edit) { const [kind, id] = edit.dataset.edit.split(":"); editEntity(kind, id); return; }
      const del = e.target.closest("[data-delete]");
      if (del) { const [kind, id] = del.dataset.delete.split(":"); try { await deleteEntity(kind, id); } catch (err) { toast(err.message, true); } return; }
      const details = e.target.closest("[data-order-details]");
      if (details) {
        const id = Number(details.dataset.orderDetails);
        state.expandedOrders.has(id) ? state.expandedOrders.delete(id) : state.expandedOrders.add(id);
        renderOrders(); return;
      }
      const deleteOrder = e.target.closest("[data-order-delete]");
      if (deleteOrder) {
        if (!window.confirm("Delete this order? Stock will be restored for non-cancelled orders.")) return;
        try { await api(`/api/admin/orders/${deleteOrder.dataset.orderDelete}`, { method: "DELETE" }); toast("Order deleted."); await loadAll(); } catch (err) { toast(err.message, true); }
        return;
      }
      const saveNotes = e.target.closest("[data-save-notes]");
      if (saveNotes) {
        const id = saveNotes.dataset.saveNotes;
        const order = state.orders.find((o) => Number(o.id) === Number(id));
        const notes = $(`[data-order-notes="${id}"]`)?.value || "";
        try { await api(`/api/admin/orders/${id}`, { method: "PATCH", body: { status: order?.status || "Pending", notes } }); toast("Order notes saved."); await loadAll(); } catch (err) { toast(err.message, true); }
        return;
      }
      const subDelete = e.target.closest("[data-sub-delete]");
      if (subDelete) {
        try { await api(`/api/admin/subscribers/${subDelete.dataset.subDelete}`, { method: "DELETE" }); toast("Subscriber deleted."); await loadAll(); } catch (err) { toast(err.message, true); }
        return;
      }
      const cartDelete = e.target.closest("[data-cart-delete]");
      if (cartDelete) {
        try { await api(`/api/admin/carts/${encodeURIComponent(cartDelete.dataset.cartDelete)}`, { method: "DELETE" }); toast("Cart deleted."); await loadAll(); } catch (err) { toast(err.message, true); }
      }
    });

    document.addEventListener("change", async (e) => {
      const select = e.target.closest("[data-order-status]");
      if (select) {
        const id = select.dataset.orderStatus;
        const order = state.orders.find((o) => Number(o.id) === Number(id));
        select.dataset.status = select.value;
        try {
          await api(`/api/admin/orders/${id}`, { method: "PATCH", body: { status: select.value, notes: order?.notes || "" } });
          toast("Order status updated.");
          await loadAll();
        } catch (err) { toast(err.message, true); await loadAll(); }
        return;
      }
      const upload = e.target.closest("[data-upload-for]");
      if (upload && upload.files && upload.files[0]) await handleUpload(upload);
    });
    document.addEventListener("input", (e) => {
      if (e.target.matches("[data-field-type='image']")) updateImagePreview(e.target);
    });

    $("#orderSearch")?.addEventListener("input", renderOrders);
    $("#orderFilter")?.addEventListener("change", renderOrders);
    $("#seedOrders")?.addEventListener("click", async () => {
      try { const r = await api("/api/admin/seed-orders", { method: "POST" }); toast(r.created ? `${r.created} demo orders added to SQLite.` : "Demo orders already exist."); await loadAll(); } catch (e) { toast(e.message, true); }
    });
    $("#clearOrders")?.addEventListener("click", async () => {
      if (!window.confirm("Clear ALL orders from SQLite? Stock will be restored.")) return;
      try { await api("/api/admin/orders", { method: "DELETE" }); state.expandedOrders.clear(); toast("All orders cleared."); await loadAll(); } catch (e) { toast(e.message, true); }
    });
    $("#exportOrders")?.addEventListener("click", () => {
      const rows = [["Order", "Date", "Customer", "Email", "Phone", "Items", "Subtotal", "Discount", "Shipping", "Tax", "Total", "Promo", "Payment", "Status"]];
      filteredOrders().forEach((o) => rows.push([o.order_no, o.created_at, o.customer_name, o.email, o.phone, itemsSummary(o), o.subtotal, o.discount, o.shipping, o.tax, o.total, o.promo_code, o.payment_label, o.status]));
      downloadCsv("orders.csv", rows);
    });

    $("#copySubs")?.addEventListener("click", async () => {
      const emails = state.subscribers.map((s) => s.email).join(", ");
      if (!emails) return toast("No subscriber emails to copy.", true);
      try { await navigator.clipboard.writeText(emails); toast("Subscriber emails copied."); } catch { download("subscriber-emails.txt", emails, "text/plain"); }
    });
    $("#exportSubs")?.addEventListener("click", () => downloadCsv("subscribers.csv", [["Email", "Source", "Subscribed"], ...state.subscribers.map((s) => [s.email, s.source, s.created_at])]));
    $("#clearSubs")?.addEventListener("click", async () => {
      if (!window.confirm("Clear all subscribers from SQLite?")) return;
      try { await api("/api/admin/subscribers", { method: "DELETE" }); toast("Subscribers cleared."); await loadAll(); } catch (e) { toast(e.message, true); }
    });

    $("#exportJson")?.addEventListener("click", async () => {
      try { const data = await api("/api/admin/export"); download("website-sqlite-export.json", JSON.stringify(data, null, 2), "application/json"); } catch (e) { toast(e.message, true); }
    });
    $("#importLegacy")?.addEventListener("click", () => importLegacy(false));
    $("#resetContent")?.addEventListener("click", async () => {
      if (!window.confirm("Reset website content, product, features, reviews and promo codes to defaults? Orders/subscribers stay saved.")) return;
      try { await api("/api/admin/reset-content", { method: "POST" }); setMsg("#systemMsg", "Content reset to defaults."); toast("Default content restored."); await loadAll(); } catch (e) { setMsg("#systemMsg", e.message, true); }
    });
    $("#passwordForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const current = $("#currentPassword").value; const next = $("#newPassword").value; const confirm = $("#confirmPassword").value;
      if (next.length < 8) return setMsg("#passwordMsg", "New password must be at least 8 characters.", true);
      if (next !== confirm) return setMsg("#passwordMsg", "New passwords do not match.", true);
      try {
        await api("/api/admin/change-password", { method: "POST", body: { current_password: current, new_password: next } });
        e.target.reset(); setMsg("#passwordMsg", "Admin password changed."); toast("Password changed.");
      } catch (err) { setMsg("#passwordMsg", err.message, true); }
    });
  }

  async function handleUpload(input) {
    const file = input.files[0];
    const key = input.dataset.uploadFor;
    const field = input.closest(".image-field");
    const textInput = field ? $(`[data-key="${key}"]`, field) : null;
    const status = field ? $(`[data-upload-status="${key}"]`, field) : null;
    if (!file || !textInput) return;
    if (file.size > 3 * 1024 * 1024) { toast("Image is larger than 3 MB.", true); input.value = ""; return; }
    if (status) status.textContent = "Uploading…";
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await api("/api/admin/upload", { method: "POST", body: { filename: file.name, data_url: reader.result } });
        textInput.value = result.path;
        updateImagePreview(textInput);
        if (status) status.textContent = `Uploaded: ${result.path}`;
        toast("Image uploaded. Save the product to use it.");
      } catch (err) {
        if (status) status.textContent = err.message;
        toast(err.message, true);
      } finally { input.value = ""; }
    };
    reader.onerror = () => toast("Could not read that image.", true);
    reader.readAsDataURL(file);
  }

  /* ---------------- Init ---------------- */
  function buildForms() {
    buildGroups($("#contentFields"), contentGroups, "content");
    buildGroups($("#productFields"), productGroups, "product");
    buildGroups($("#commerceFields"), commerceGroups, "commerce");
    buildFields($("#featureFormFields"), featureFields, "feature");
    buildFields($("#reviewFormFields"), reviewFields, "review");
    buildFields($("#promoFormFields"), promoFields, "promo");
    resetEditor("feature"); resetEditor("review"); resetEditor("promo");
  }

  async function init() {
    buildForms();
    bindEvents();
    try {
      const me = await api("/api/admin/me");
      state.admin = me.admin;
      showDash();
      await loadAll();
    } catch {
      showLogin();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
