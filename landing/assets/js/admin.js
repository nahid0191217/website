/* ============================================================
   AirPods Pro 2 — admin panel (front-end demo)
   Data lives in localStorage, shared with the storefront:
     orders      → airpods-pro2-orders/v1     (written by checkout.js)
     settings    → airpods-pro2-settings/v1   (read by main.js pricing)
     subscribers → airpods-pro2-subscribers/v1 (written by main.js)
   Demo password: admin123 (client-side gate for demo purposes).
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ORDERS_KEY = "airpods-pro2-orders/v1";
  const SETTINGS_KEY = "airpods-pro2-settings/v1";
  const SUBS_KEY = "airpods-pro2-subscribers/v1";
  const SESSION_KEY = "airpods-pro2-admin/session";
  const ADMIN_PASSWORD = "admin123";
  const STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
  const DEFAULT_SETTINGS = { productName: "AirPods Pro 2", basePrice: 249, wasPrice: 279, carePrice: 49 };

  const escapeHtml = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) =>
    `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${fmtDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };

  function read(key, fallback) {
    try {
      const v = JSON.parse(window.localStorage.getItem(key) || "null");
      return v === null || v === undefined ? fallback : v;
    } catch (err) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }
  const loadOrders = () => {
    const o = read(ORDERS_KEY, []);
    return Array.isArray(o) ? o : [];
  };
  const loadSubs = () => {
    const s = read(SUBS_KEY, []);
    return Array.isArray(s) ? s : [];
  };
  const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY, {}) || {}) });

  /* ----------------------------------------------------------
     Toast
     ---------------------------------------------------------- */
  const toastEl = $("#toast");
  let toastTimer = null;
  function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", isError);
    toastEl.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), 3200);
  }

  /* ----------------------------------------------------------
     Auth
     ---------------------------------------------------------- */
  const loginView = $("#loginView");
  const dashView = $("#dashView");
  const loginForm = $("#loginForm");
  const pwInput = $("#adminPassword");
  const loginError = $("#loginError");
  const loginCard = $(".login-card");

  const isAuthed = () => {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (err) {
      return false;
    }
  };

  function showDash() {
    loginView.hidden = true;
    dashView.hidden = false;
    fillSettings();
    renderAll();
  }
  function showLogin() {
    dashView.hidden = true;
    loginView.hidden = false;
    if (pwInput) {
      pwInput.value = "";
      pwInput.focus({ preventScroll: true });
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (pwInput.value === ADMIN_PASSWORD) {
        try {
          window.sessionStorage.setItem(SESSION_KEY, "1");
        } catch (err) { /* private mode — still show dash for this view */ }
        loginError.hidden = true;
        showDash();
        showToast("Welcome back, Admin");
      } else {
        loginError.hidden = false;
        if (loginCard) {
          loginCard.classList.remove("is-shake");
          void loginCard.offsetWidth;
          loginCard.classList.add("is-shake");
        }
        pwInput.select();
      }
    });
  }

  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch (err) { /* ignore */ }
      showLogin();
    });
  }

  /* ----------------------------------------------------------
     Tabs
     ---------------------------------------------------------- */
  const tabs = $$(".admin-tab");
  const panels = { orders: $("#panel-orders"), settings: $("#panel-settings"), subs: $("#panel-subs") };
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      Object.entries(panels).forEach(([key, panel]) => {
        if (panel) panel.hidden = key !== tab.dataset.tab;
      });
    });
  });

  /* ----------------------------------------------------------
     Stats
     ---------------------------------------------------------- */
  function renderStats() {
    const orders = loadOrders();
    const live = orders.filter((o) => o.status !== "Cancelled");
    const revenue = live.reduce((n, o) => n + (Number(o.total) || 0), 0);
    const items = live.reduce((n, o) => n + (o.items || []).reduce((m, i) => m + (Number(i.qty) || 0), 0), 0);

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set("#statRevenue", money(revenue));
    set("#statOrders", String(orders.length));
    set("#statItems", String(items));
    set("#statSubs", String(loadSubs().length));
  }

  /* ----------------------------------------------------------
     Orders
     ---------------------------------------------------------- */
  const ordersBody = $("#ordersBody");
  const ordersEmpty = $("#ordersEmpty");
  const ordersWrap = $("#ordersTableWrap");
  const orderSearch = $("#orderSearch");
  const orderFilter = $("#orderFilter");

  function statusOptions(current) {
    return STATUSES.map(
      (s) => `<option value="${s}"${s === current ? " selected" : ""}>${s}</option>`
    ).join("");
  }

  function itemsSummary(order) {
    const items = order.items || [];
    const main = items.map((i) => `${i.qty} × ${escapeHtml(i.name)}`).join(", ") || "—";
    const opts = [];
    items.forEach((i) => {
      if (i.care) opts.push("AppleCare+");
      if (i.engraving) opts.push(`Engraved “${escapeHtml(i.engraving)}”`);
    });
    return opts.length ? `${main}<span class="cell-sub">${opts.join(" · ")}</span>` : main;
  }

  function detailBox(order) {
    const lines = (order.items || [])
      .map((i) => `${i.qty} × ${escapeHtml(i.name)} — <b>${money(i.price * i.qty)}</b>`)
      .join("<br />");
    const moneyRows = [
      `Subtotal <b>${money(order.subtotal)}</b>`,
      order.discount ? `Discount ${order.promo ? `(${escapeHtml(order.promo)}) ` : ""}<b>−${money(order.discount)}</b>` : null,
      `Shipping <b>${order.shipping ? money(order.shipping) : "Free"}</b>`,
      `Total <b>${money(order.total)}</b>`,
    ].filter(Boolean).join("<br />");
    return `
      <div class="detail-box">
        <div><h4>Contact</h4><p>${escapeHtml(order.phone || "—")}<br />${escapeHtml(order.email || "—")}</p></div>
        <div><h4>Delivery address</h4><p>${escapeHtml(order.address || "—")}</p></div>
        <div><h4>Items</h4><p>${lines || "—"}</p></div>
        <div><h4>Payment &amp; totals</h4><p>${escapeHtml(order.payment || "—")}${order.shippingMethod ? ` · ${escapeHtml(order.shippingMethod)} delivery` : ""}<br />${moneyRows}</p></div>
        <div><h4>Placed</h4><p>${escapeHtml(fmtDateTime(order.date))}</p></div>
      </div>`;
  }

  function getFilteredOrders() {
    const q = (orderSearch ? orderSearch.value : "").trim().toLowerCase();
    const st = orderFilter ? orderFilter.value : "";
    return loadOrders().filter((o) => {
      if (st && o.status !== st) return false;
      if (!q) return true;
      return [o.id, o.customer, o.email].join(" ").toLowerCase().includes(q);
    });
  }

  function renderOrders() {
    if (!ordersBody) return;
    const orders = getFilteredOrders();
    const hasAny = loadOrders().length > 0;

    ordersBody.innerHTML = orders
      .map((o) => `
        <tr>
          <td class="cell-id">${escapeHtml(o.id)}${o.demo ? '<span class="demo-tag">Demo</span>' : ""}</td>
          <td>${escapeHtml(fmtDate(o.date))}</td>
          <td>${escapeHtml(o.customer || "—")}<span class="cell-sub">${escapeHtml(o.email || "")}</span></td>
          <td>${itemsSummary(o)}</td>
          <td class="cell-total">${money(o.total)}</td>
          <td>${escapeHtml(o.payment || "—")}</td>
          <td>
            <select class="status-select" data-id="${escapeHtml(o.id)}" data-status="${escapeHtml(o.status)}" aria-label="Status for order ${escapeHtml(o.id)}">
              ${statusOptions(o.status)}
            </select>
          </td>
          <td class="cell-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-act="details" data-id="${escapeHtml(o.id)}" aria-expanded="false">Details</button>
            <button type="button" class="btn btn--sm admin-btn-danger" data-act="delete" data-id="${escapeHtml(o.id)}">Delete</button>
          </td>
        </tr>
        <tr class="detail-row" data-detail-for="${escapeHtml(o.id)}" hidden><td colspan="8">${detailBox(o)}</td></tr>`)
      .join("");

    if (ordersWrap) ordersWrap.style.display = orders.length ? "" : "none";
    if (ordersEmpty) {
      ordersEmpty.hidden = orders.length > 0;
      if (!orders.length && hasAny) {
        ordersEmpty.querySelector("p b, p").textContent = "No orders match your search.";
      }
    }
    renderStats();
  }

  if (ordersBody) {
    ordersBody.addEventListener("change", (e) => {
      const sel = e.target.closest(".status-select");
      if (!sel) return;
      const orders = loadOrders();
      const order = orders.find((o) => o.id === sel.dataset.id);
      if (!order) return;
      order.status = sel.value;
      sel.dataset.status = sel.value;
      write(ORDERS_KEY, orders);
      renderStats();
      showToast(`Order ${order.id} marked as ${sel.value}`);
    });

    ordersBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;

      if (btn.dataset.act === "details") {
        const row = ordersBody.querySelector(`[data-detail-for="${CSS.escape(id)}"]`);
        if (row) {
          row.hidden = !row.hidden;
          btn.setAttribute("aria-expanded", String(!row.hidden));
          btn.textContent = row.hidden ? "Details" : "Hide";
        }
      }

      if (btn.dataset.act === "delete") {
        if (!window.confirm(`Delete order ${id}? This cannot be undone.`)) return;
        write(ORDERS_KEY, loadOrders().filter((o) => o.id !== id));
        renderOrders();
        showToast(`Order ${id} deleted`);
      }
    });
  }

  if (orderSearch) orderSearch.addEventListener("input", renderOrders);
  if (orderFilter) orderFilter.addEventListener("change", renderOrders);

  /* demo seed */
  const seedBtn = $("#seedOrders");
  if (seedBtn) {
    seedBtn.addEventListener("click", () => {
      const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
      const mk = (qty, care, engraving) => ({
        name: loadSettings().productName || "AirPods Pro 2",
        qty,
        price: (Number(loadSettings().basePrice) || 249) + (care ? Number(loadSettings().carePrice) || 49 : 0),
        care,
        engraving: engraving || "",
      });
      const build = (customer, email, phone, address, items, hours, status, payment, promo, shipCost) => {
        const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
        const discount = promo ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
        return {
          id: `AP2-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`,
          date: hoursAgo(hours),
          customer, email, phone, address, items,
          subtotal, discount, shipping: shipCost || 0,
          total: Math.round((subtotal - discount + (shipCost || 0)) * 100) / 100,
          promo: promo || "", payment, shippingMethod: shipCost ? "express" : "standard",
          status, demo: true,
        };
      };
      const demo = [
        build("Ayesha R.", "ayesha@example.com", "+880 1711-223344", "House 8, Road 2, Uttara, Dhaka 1230, Dhaka Division, 1230, Bangladesh", [mk(1, false, "Ayesha ♪")], 3, "Pending", "Card ending 4242", "", 0),
        build("Ariful Islam", "arif@example.com", "+880 1812-556677", "GEC Circle, Chattogram 4000, Chattogram Division, 4000, Bangladesh", [mk(2, true, "")], 26, "Confirmed", "Cash on delivery", "", 0),
        build("Nusrat T.", "nusrat@example.com", "+880 1913-778899", "Mirpur 10, Dhaka 1216, Dhaka Division, 1216, Bangladesh", [mk(1, true, "Nusrat")], 50, "Shipped", "Card ending 1005", "QUIET10", 12),
        build("Farhan H.", "farhan@example.com", "+880 1614-334455", "Zindabazar, Sylhet 3100, Sylhet Division, 3100, Bangladesh", [mk(1, false, "")], 96, "Delivered", "Apple Pay", "", 0),
        build("Mahin K.", "mahin@example.com", "+880 1515-667788", "Sonadanga, Khulna 9100, Khulna Division, 9100, Bangladesh", [mk(3, false, "")], 150, "Delivered", "Card ending 4242", "", 0),
      ];
      write(ORDERS_KEY, [...demo, ...loadOrders()]);
      renderOrders();
      showToast("5 demo orders loaded");
    });
  }

  /* CSV export */
  const csvCell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  function downloadCsv(filename, rows) {
    try {
      const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 400);
    } catch (err) {
      showToast("Export is not available in this browser", true);
    }
  }

  const exportOrdersBtn = $("#exportOrders");
  if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener("click", () => {
      const orders = loadOrders();
      if (!orders.length) { showToast("No orders to export", true); return; }
      const rows = [["Order ID", "Date", "Customer", "Email", "Phone", "Address", "Items", "Subtotal", "Discount", "Shipping", "Total", "Promo", "Payment", "Status"]];
      orders.forEach((o) => {
        rows.push([
          o.id, o.date, o.customer, o.email, o.phone, o.address,
          (o.items || []).map((i) => `${i.qty} x ${i.name}${i.care ? " (AppleCare+)" : ""}${i.engraving ? ` (Engraved: ${i.engraving})` : ""}`).join("; "),
          o.subtotal, o.discount, o.shipping, o.total, o.promo, o.payment, o.status,
        ]);
      });
      downloadCsv("orders.csv", rows);
      showToast("Orders exported as CSV");
    });
  }

  const clearOrdersBtn = $("#clearOrders");
  if (clearOrdersBtn) {
    clearOrdersBtn.addEventListener("click", () => {
      if (!loadOrders().length) { showToast("There are no orders to clear", true); return; }
      if (!window.confirm("Delete ALL orders? This cannot be undone.")) return;
      write(ORDERS_KEY, []);
      renderOrders();
      showToast("All orders cleared");
    });
  }

  /* ----------------------------------------------------------
     Settings
     ---------------------------------------------------------- */
  const settingsForm = $("#settingsForm");
  const setName = $("#setName");
  const setBase = $("#setBase");
  const setWas = $("#setWas");
  const setCare = $("#setCare");
  const settingsPreview = $("#settingsPreview");
  const settingsMsg = $("#settingsMsg");

  function numOr(input, fallback) {
    const n = parseFloat(input && input.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function updatePreview() {
    if (!settingsPreview) return;
    const base = numOr(setBase, DEFAULT_SETTINGS.basePrice);
    const was = Math.max(numOr(setWas, DEFAULT_SETTINGS.wasPrice), base);
    const care = Math.max(0, numOr(setCare, DEFAULT_SETTINGS.carePrice));
    settingsPreview.innerHTML =
      `Customers see: <b>Buy from $${base}</b> · Save $${Math.max(0, was - base)} · AppleCare+ +$${care}`;
  }

  function fillSettings() {
    const s = loadSettings();
    if (setName) setName.value = s.productName;
    if (setBase) setBase.value = s.basePrice;
    if (setWas) setWas.value = s.wasPrice;
    if (setCare) setCare.value = s.carePrice;
    updatePreview();
  }

  [setBase, setWas, setCare].forEach((input) => {
    if (input) input.addEventListener("input", updatePreview);
  });

  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const base = numOr(setBase, NaN);
      if (!Number.isFinite(base) || base <= 0) {
        settingsMsg.textContent = "Selling price must be greater than 0.";
        settingsMsg.classList.add("is-error");
        setBase.focus();
        return;
      }
      const was = Math.max(numOr(setWas, base), base);
      const care = Math.max(0, numOr(setCare, DEFAULT_SETTINGS.carePrice));
      const name = (setName.value || "").trim().slice(0, 40) || DEFAULT_SETTINGS.productName;

      write(SETTINGS_KEY, { productName: name, basePrice: base, wasPrice: was, carePrice: care });
      if (setWas) setWas.value = was;
      updatePreview();
      settingsMsg.textContent = "Saved — refresh the store page to see the new prices.";
      settingsMsg.classList.remove("is-error");
      showToast("Store settings saved");
    });
  }

  const resetBtn = $("#resetSettings");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      try {
        window.localStorage.removeItem(SETTINGS_KEY);
      } catch (err) { /* ignore */ }
      fillSettings();
      settingsMsg.textContent = "Back to defaults: $249 / $279 / AppleCare+ $49.";
      settingsMsg.classList.remove("is-error");
      showToast("Settings reset to defaults");
    });
  }

  /* ----------------------------------------------------------
     Subscribers
     ---------------------------------------------------------- */
  const subsBody = $("#subsBody");
  const subsEmpty = $("#subsEmpty");
  const subsWrap = $("#subsTableWrap");

  function renderSubs() {
    if (!subsBody) return;
    const subs = loadSubs();
    subsBody.innerHTML = subs
      .map((s) => `
        <tr>
          <td><b>${escapeHtml(s.email)}</b></td>
          <td>${escapeHtml(fmtDateTime(s.date))}</td>
          <td class="cell-actions">
            <button type="button" class="btn btn--sm admin-btn-danger" data-sub-delete="${escapeHtml(s.email)}">Remove</button>
          </td>
        </tr>`)
      .join("");
    if (subsWrap) subsWrap.style.display = subs.length ? "" : "none";
    if (subsEmpty) subsEmpty.hidden = subs.length > 0;
    renderStats();
  }

  if (subsBody) {
    subsBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sub-delete]");
      if (!btn) return;
      write(SUBS_KEY, loadSubs().filter((s) => s.email !== btn.dataset.subDelete));
      renderSubs();
      showToast("Subscriber removed");
    });
  }

  const copySubsBtn = $("#copySubs");
  if (copySubsBtn) {
    copySubsBtn.addEventListener("click", async () => {
      const emails = loadSubs().map((s) => s.email);
      if (!emails.length) { showToast("No subscribers to copy", true); return; }
      const text = emails.join(", ");
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${emails.length} email(s) copied`);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); showToast(`${emails.length} email(s) copied`); }
        catch (e2) { showToast("Copy failed in this browser", true); }
        ta.remove();
      }
    });
  }

  const exportSubsBtn = $("#exportSubs");
  if (exportSubsBtn) {
    exportSubsBtn.addEventListener("click", () => {
      const subs = loadSubs();
      if (!subs.length) { showToast("No subscribers to export", true); return; }
      downloadCsv("subscribers.csv", [["Email", "Subscribed"], ...subs.map((s) => [s.email, s.date])]);
      showToast("Subscribers exported as CSV");
    });
  }

  const clearSubsBtn = $("#clearSubs");
  if (clearSubsBtn) {
    clearSubsBtn.addEventListener("click", () => {
      if (!loadSubs().length) { showToast("There are no subscribers to clear", true); return; }
      if (!window.confirm("Remove ALL subscribers? This cannot be undone.")) return;
      write(SUBS_KEY, []);
      renderSubs();
      showToast("All subscribers cleared");
    });
  }

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  function renderAll() {
    renderOrders();
    renderSubs();
    renderStats();
  }

  if (isAuthed()) showDash();
  else showLogin();
})();
