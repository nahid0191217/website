/* ============================================================
   AirPods Pro 2 — shared bag / cart store
   Tiny localStorage-backed store used by index.html and checkout.html
   ============================================================ */
(() => {
  "use strict";

  const KEY = "airpods-pro2-bag/v1";
  const MAX_QTY = 5;
  const subscribers = new Set();

  const money = (n) =>
    `$${Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const lineKey = (item) =>
    [item.id, item.care ? "care" : "std", item.engraving || ""].join("|");

  const isItem = (item) =>
    item &&
    typeof item.id === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    Number.isFinite(item.qty) &&
    item.qty > 0;

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isItem) : [];
    } catch (err) {
      return [];
    }
  }

  function write(items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch (err) {
      /* private mode / quota — the UI still works for this page view */
    }
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

  const Cart = {
    money,
    lineKey,
    items: read,
    count,
    subtotal,
    badges: updateBadges,

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

    clear() {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateBadges, { once: true });
  } else {
    updateBadges();
  }
})();
