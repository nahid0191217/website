/* ============================================================
   AirPods Pro 2 — shared bag / cart store
   Tiny localStorage-backed store used by index.html and checkout.html
   ============================================================ */
(() => {
  "use strict";

  const KEY = "airpods-pro2-bag/v1";
  const MAX_QTY = Math.max(1, Math.min(99, Number(window.__SITE__ && window.__SITE__.product && window.__SITE__.product.max_qty) || 5));
  const CART_ID_KEY = "airpods-pro2-cart-id/v1";
  const subscribers = new Set();

  const money = (n) => {
    if (typeof window.SiteMoney === "function") return window.SiteMoney(n);
    const site = window.SiteData || window.__SITE__ || {};
    const symbol = (site.settings && site.settings.currency_symbol) || "$";
    return `${symbol}${Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const lineKey = (item) =>
    [item.id, item.care ? "care" : "std", item.engraving || ""].join("|");

  const isItem = (item) =>
    item &&
    typeof item.id === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    Number.isFinite(item.qty) &&
    item.qty > 0;

  function makeCartId() {
    return `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  let cartId = "";
  try {
    cartId = window.localStorage.getItem(CART_ID_KEY) || "";
    if (!cartId) {
      cartId = makeCartId();
      window.localStorage.setItem(CART_ID_KEY, cartId);
    }
  } catch (err) {
    cartId = makeCartId();
  }
  let syncTimer = null;
  function syncToServer(items) {
    if (!/^https?:$/.test(window.location.protocol) || typeof window.fetch !== "function") return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      window.fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart_id: cartId, items }),
        keepalive: true,
      }).catch(() => {});
    }, 250);
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isItem) : [];
    } catch (err) {
      return [];
    }
  }

  function write(items, options = {}) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch (err) {
      /* private mode / quota — the UI still works for this page view */
    }
    if (options.sync !== false) syncToServer(items);
    notify();
  }

  function notify() {
    const items = read();
    updateBadges();
    subscribers.forEach((fn) => {
      try {
        fn(items);
      } catch (err) {
        /* a subscriber must not break the store */
      }
    });
  }

  function count() {
    return read().reduce((n, item) => n + item.qty, 0);
  }

  function subtotal() {
    return read().reduce((n, item) => n + item.price * item.qty, 0);
  }

  /* ---- badge rendering on every page ---- */
  function updateBadges() {
    const n = count();
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
      el.dataset.empty = n === 0 ? "true" : "false";
    });
    document.querySelectorAll("[data-cart-link]").forEach((el) => {
      el.setAttribute(
        "aria-label",
        `Shopping bag, ${n} item${n === 1 ? "" : "s"}`
      );
    });
    document.querySelectorAll("[data-cart-has-items]").forEach((el) => {
      el.hidden = n === 0;
    });
  }

  function refreshProductPrices() {
    const site = window.SiteData || window.__SITE__ || {};
    const p = site.product;
    if (!p || !Number.isFinite(Number(p.price))) return;
    const items = read();
    if (!items.length) return;
    let changed = false;
    const next = items.map((item) => {
      const price = Number(p.price) + (item.care ? Number(p.care_price) || 0 : 0);
      const updated = { ...item, id: p.slug || item.id, name: p.name || item.name, price };
      if (updated.price !== item.price || updated.name !== item.name || updated.id !== item.id) changed = true;
      return updated;
    });
    if (changed) write(next);
    else syncToServer(items);
  }

  const Cart = {
    money,
    lineKey,
    items: read,
    count,
    subtotal,
    badges: updateBadges,
    cartId: () => cartId,
    sync: () => syncToServer(read()),
    refreshProductPrices,

    add(item) {
      const items = read();
      const key = lineKey(item);
      const existing = items.find((i) => lineKey(i) === key);

      if (existing) {
        existing.qty = Math.min(existing.qty + (item.qty || 1), MAX_QTY);
      } else {
        items.push({
          id: item.id,
          name: item.name || "AirPods Pro 2",
          price: item.price,
          qty: Math.min(item.qty || 1, MAX_QTY),
          care: Boolean(item.care),
          engraving: (item.engraving || "").slice(0, 14),
        });
      }
      write(items);
    },

    setQty(key, qty) {
      const next = read()
        .map((item) =>
          lineKey(item) === key
            ? { ...item, qty: Math.max(1, Math.min(Number(qty) || 1, MAX_QTY)) }
            : item
        )
        .filter((item) => item.qty > 0);
      write(next);
    },

    remove(key) {
      write(read().filter((item) => lineKey(item) !== key));
    },

    clear(options = {}) {
      if (options.converted) {
        write([], { sync: false });
        cartId = makeCartId();
        try { window.localStorage.setItem(CART_ID_KEY, cartId); } catch (err) {}
        return;
      }
      write([]);
    },

    onChange(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    init() {
      updateBadges();
    },
  };

  window.AirPodsCart = Cart;

  const initCart = () => { updateBadges(); refreshProductPrices(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCart, { once: true });
  } else {
    initCart();
  }
})();
