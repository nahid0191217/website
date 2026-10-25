/* ============================================================
   AirPods Pro 2 — SQLite site data bridge
   Applies admin-managed content/product/features/reviews from
   window.__SITE__ (injected by server.py) to the storefront.
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let DATA = window.__SITE__ && typeof window.__SITE__ === "object" ? window.__SITE__ : null;

  const settings = () => (DATA && DATA.settings) || {};
  const product = () => (DATA && DATA.product) || {};
  const setting = (key, fallback = "") => {
    const value = settings()[key];
    return value === undefined || value === null || value === "" ? fallback : value;
  };
  const boolSetting = (key, fallback = true) => {
    const value = settings()[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    return Boolean(value);
  };
  const numberSetting = (key, fallback = 0) => {
    const n = Number(settings()[key]);
    return Number.isFinite(n) ? n : fallback;
  };

  function money(value, trimZero = false) {
    const n = Number(value) || 0;
    const symbol = String(setting("currency_symbol", "$") || "$");
    const decimals = trimZero && Number.isInteger(n) ? 0 : 2;
    return `${symbol}${n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  function tokens(text) {
    const p = product();
    const price = Number(p.price) || 0;
    const compare = Number(p.compare_at_price) || 0;
    const replacements = {
      price: money(price, true),
      save: money(Math.max(0, compare - price), true),
      count: Number(p.review_count || 0).toLocaleString("en-US"),
      rating: Number(p.rating || 0).toFixed(1),
      product: p.name || "AirPods Pro 2",
      currency: setting("currency_code", "USD"),
    };
    return String(text ?? "").replace(/\{(price|save|count|rating|product|currency)\}/g, (_, key) => replacements[key] || "");
  }

  function applyMetaAndTheme() {
    const isCheckout = document.body.classList.contains("checkout");
    const isAdmin = document.body.classList.contains("admin-page");
    if (!isAdmin && !isCheckout && setting("page_title")) document.title = tokens(setting("page_title"));
    if (isCheckout) document.title = `Checkout — ${product().name || "AirPods Pro 2"}`;
    const desc = $('meta[name="description"]');
    if (desc && setting("meta_description")) desc.setAttribute("content", tokens(setting("meta_description")));
    const ogTitle = $('meta[property="og:title"]');
    if (ogTitle && setting("page_title")) ogTitle.setAttribute("content", tokens(setting("page_title")));
    const ogDesc = $('meta[property="og:description"]');
    if (ogDesc && setting("meta_description")) ogDesc.setAttribute("content", tokens(setting("meta_description")));
    const accent = setting("accent_color", "#0071e3");
    if (/^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty("--accent", accent);
  }

  function applySettings() {
    $$("[data-setting], [data-setting-template]").forEach((el) => {
      const key = el.dataset.setting || el.dataset.settingTemplate;
      if (!key || settings()[key] === undefined) return;
      el.textContent = tokens(settings()[key]);
      if (el.hasAttribute("data-setting-multiline")) el.style.whiteSpace = "pre-line";
    });
    $$("[data-setting-href]").forEach((el) => {
      const key = el.dataset.settingHref;
      if (key && settings()[key] !== undefined) el.setAttribute("href", String(settings()[key] || "#"));
    });
    $$("[data-setting-src]").forEach((el) => {
      const key = el.dataset.settingSrc;
      if (key && settings()[key]) el.setAttribute("src", String(settings()[key]));
    });
    $$("[data-setting-mailto]").forEach((el) => {
      const email = setting(el.dataset.settingMailto);
      if (email) el.setAttribute("href", `mailto:${email}`);
    });
    $$("[data-setting-tel]").forEach((el) => {
      const phone = setting(el.dataset.settingTel);
      if (phone) el.setAttribute("href", `tel:${String(phone).replace(/[^+\d]/g, "")}`);
    });
    $$("[data-brand-name]").forEach((el) => {
      if (setting("brand_name")) el.textContent = setting("brand_name");
    });
  }

  function applyVisibility() {
    const announce = $(".announce");
    if (announce) announce.style.display = boolSetting("show_announcement", true) ? "" : "none";
    const countdown = $("[data-countdown-wrap]");
    if (countdown) countdown.style.display = boolSetting("countdown_enabled", true) ? "" : "none";

    const featuresVisible = boolSetting("show_features", true);
    const features = $("#features");
    if (features) features.style.display = featuresVisible ? "" : "none";
    $$('a[href="#features"]').forEach((a) => { a.style.display = featuresVisible ? "" : "none"; });

    const reviewsVisible = boolSetting("show_reviews", true);
    const reviews = $("#reviews");
    if (reviews) reviews.style.display = reviewsVisible ? "" : "none";
    $$('a[href="#reviews"]').forEach((a) => { a.style.display = reviewsVisible ? "" : "none"; });

    const newsletter = $("[data-newsletter-wrap]");
    if (newsletter) newsletter.style.display = boolSetting("show_newsletter", true) ? "" : "none";
    const sticky = $("#stickyBuy");
    if (sticky && !boolSetting("show_sticky_buy", true)) sticky.style.display = "none";
  }

  function visualHtml(feature) {
    const type = feature.visual_type || "big";
    const text = feature.visual_text || "";
    if (type === "eq") {
      return `<div class="bcard__visual bcard__visual--eq" aria-hidden="true">${"<span></span>".repeat(12)}</div>`;
    }
    if (type === "orbit") {
      return `<div class="bcard__visual bcard__visual--orbit" aria-hidden="true"><i></i><i></i><i></i><b></b></div>`;
    }
    if (type === "icon") {
      return `<div class="bcard__visual bcard__visual--icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3s6 6.6 6 11a6 6 0 1 1-12 0c0-4.4 6-11 6-11Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`;
    }
    if (type === "pills") {
      const pills = String(text).split(",").map((x) => x.trim()).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
      return `<div class="bcard__visual bcard__visual--pills" aria-hidden="true">${pills}</div>`;
    }
    return `<div class="bcard__visual bcard__visual--big" aria-hidden="true">${esc(text || "H2")}</div>`;
  }

  function renderFeatures() {
    const wrap = $(".bento");
    const features = DATA && Array.isArray(DATA.features) ? DATA.features : null;
    if (!wrap || !features) return;
    wrap.innerHTML = features.map((feature, index) => `
      <article class="bcard${feature.size === "large" ? " bcard--lg" : ""} reveal" data-delay="${index % 3}">
        ${visualHtml(feature)}
        <h3>${esc(feature.title)}</h3>
        <p>${esc(feature.description)}</p>
        ${feature.tag ? `<span class="bcard__tag">${esc(feature.tag)}</span>` : ""}
      </article>`).join("");
  }

  function initials(name) {
    const parts = String(name || "Customer").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "C";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function renderReviews() {
    const track = $("#carouselTrack");
    const reviews = DATA && Array.isArray(DATA.reviews) ? DATA.reviews : null;
    if (!track || !reviews) return;
    track.innerHTML = reviews.map((review) => {
      const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
      const stars = "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
      const rawBody = String(review.body || "").trim();
      const body = rawBody.startsWith("“") ? rawBody : `“${rawBody}”`;
      const label = `${review.verified === false || review.verified === 0 ? "Customer" : "Verified buyer"}${review.location ? ` · ${review.location}` : ""}`;
      const color = /^#[0-9a-f]{6}$/i.test(review.color || "") ? review.color : "#0071e3";
      return `
        <article class="review">
          <span class="stars" aria-label="${rating} out of 5 stars">${stars}</span>
          <p>${esc(body)}</p>
          <footer><span class="avatar" style="--a:${esc(color)}">${esc(initials(review.author))}</span><div><b>${esc(review.author)}</b><small>${esc(label)}</small></div><span class="review__date">${esc(review.date_label || "")}</span></footer>
        </article>`;
    }).join("");
  }

  function applyProduct() {
    const p = product();
    if (!p || !Object.keys(p).length) return;
    $$("[data-product-name]").forEach((el) => { el.textContent = p.name || el.textContent; });
    $$("[data-product-subtitle]").forEach((el) => { el.textContent = p.subtitle || ""; el.style.display = p.subtitle ? "" : "none"; });
    $$("[data-product-rating]").forEach((el) => { el.textContent = Number(p.rating || 0).toFixed(1); });
    $$("[data-product-review-count]").forEach((el) => {
      el.textContent = Number(p.review_count || 0).toLocaleString("en-US");
    });
    $$("[data-product-care-name]").forEach((el) => { el.textContent = p.care_name || "AppleCare+"; });
    $$("[data-product-care-description]").forEach((el) => { el.textContent = p.care_description || ""; });

    const heroImg = $("#heroImg");
    if (heroImg && p.hero_image) heroImg.setAttribute("src", p.hero_image);
    const heroPreload = $('link[rel="preload"][as="image"]');
    if (heroPreload && p.hero_image) heroPreload.setAttribute("href", p.hero_image);
    const ogImage = $('meta[property="og:image"]');
    if (ogImage && p.hero_image) ogImage.setAttribute("content", p.hero_image);
    $$("[data-product-image]").forEach((img) => { if (p.image) img.setAttribute("src", p.image); });

    const stockEl = $("[data-stock-text]");
    if (stockEl) {
      const out = p.active === false || (p.track_inventory && Number(p.stock) <= 0);
      const low = p.track_inventory && Number(p.stock) > 0 && Number(p.stock) <= numberSetting("low_stock_threshold", 5);
      stockEl.textContent = out ? setting("stock_out_text", "Out of stock") : low ? setting("stock_low_text", "Low stock — order soon") : setting("stock_in_text", "In stock");
    }

    const bars = $$(".summary__bars .bar");
    [5, 4, 3, 2, 1].forEach((stars, index) => {
      const row = bars[index];
      if (!row) return;
      const pct = Math.max(0, Math.min(100, numberSetting(`rating_${stars}_percent`, 0)));
      const fill = $("i[data-bar]", row);
      const label = $("b", row);
      if (fill) {
        fill.dataset.bar = String(pct);
        fill.style.setProperty("--w", `${pct}%`);
      }
      if (label) label.textContent = `${pct}%`;
    });

    const tagsWrap = $(".summary__tags");
    if (tagsWrap && setting("review_tags")) {
      const tags = String(setting("review_tags")).split("|").map((x) => x.trim()).filter(Boolean);
      if (tags.length) tagsWrap.innerHTML = tags.map((tag) => `<li>${esc(tag)}</li>`).join("");
    }

    const pays = $(".pays");
    if (pays && setting("payments_text")) {
      const methods = String(setting("payments_text")).split(",").map((x) => x.trim()).filter(Boolean);
      if (methods.length) pays.innerHTML = methods.map((m) => `<span>${esc(m)}</span>`).join("");
    }

    $$("[data-shipping-fee]").forEach((el) => {
      const method = el.dataset.shippingFee === "express" ? "express" : "standard";
      const fee = numberSetting(method === "express" ? "express_shipping_fee" : "standard_shipping_fee", 0);
      el.textContent = fee === 0 ? "Free" : money(fee);
    });
  }

  function applyStoreState() {
    const p = product();
    const closed = !boolSetting("store_open", true);
    const unavailable = p.active === false || (p.track_inventory && Number(p.stock) <= 0);
    if (!closed && !unavailable) return;
    document.body.classList.add("store-unavailable");
    const add = $("#addToBag");
    const buy = $("#buyNow");
    [add, buy].forEach((btn) => { if (btn) btn.disabled = true; });
    if (add) {
      const label = $("span", add) || add;
      label.textContent = closed ? "Store temporarily closed" : setting("stock_out_text", "Out of stock");
    }
    if (closed) {
      const announcementText = $("[data-setting='announcement_text']") || $("[data-setting-template='announcement_text']");
      if (announcementText) announcementText.textContent = setting("maintenance_message", "The store is temporarily closed.");
    }
  }

  function trackPageView() {
    if (!DATA || !boolSetting("track_page_views", true)) return;
    if (!/^https?:$/.test(window.location.protocol) || typeof window.fetch !== "function") return;
    if (document.body.classList.contains("admin-page")) return;
    window.fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname, referrer: document.referrer || "" }),
      keepalive: true,
    }).catch(() => {});
  }

  function apply() {
    if (!document.body) return;
    window.SiteData = DATA;
    applyMetaAndTheme();
    applySettings();
    applyVisibility();
    renderFeatures();
    renderReviews();
    applyProduct();
    applyStoreState();
    trackPageView();
  }

  window.SiteMoney = money;
  window.SiteSetting = setting;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }

  if (!DATA && typeof window.fetch === "function" && /^https?:$/.test(window.location.protocol)) {
    window.fetch("/api/site")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) return;
        DATA = json;
        window.__SITE__ = json;
        apply();
        window.dispatchEvent(new CustomEvent("site-data-ready", { detail: json }));
      })
      .catch(() => {});
  }
})();
