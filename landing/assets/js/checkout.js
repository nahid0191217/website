/* ============================================================
   AirPods Pro 2 — checkout page
   Depends on assets/js/cart.js (window.AirPodsCart)
   ============================================================ */
(() => {
  "use strict";

  const Cart = window.AirPodsCart;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (n) => (Cart ? Cart.money(n) : `$${Number(n).toFixed(2)}`);
  const SITE = window.SiteData || window.__SITE__ || {};
  const siteSettings = SITE.settings || {};
  const siteProduct = SITE.product || {};
  const siteNumber = (key, fallback) => {
    const n = Number(siteSettings[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const money0 = (n) => (typeof window.SiteMoney === "function" ? window.SiteMoney(n, true) : money(n).replace(/\.00$/, ""));
  const PRODUCT_IMAGE = siteProduct.image || "assets/img/case.jpg";
  const STORE_OPEN = siteSettings.store_open !== false;

  const form = $("#checkoutForm");
  if (!form) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const els = {
    list: $("#summaryItems"),
    empty: $("#summaryEmpty"),
    count: $("#summaryCount"),
    subtotal: $("#subtotalValue"),
    shipping: $("#shippingValue"),
    discountRow: $("#discountRow"),
    discount: $("#discountValue"),
    discountLabel: $("#discountLabel"),
    taxRow: $("#taxRow"),
    tax: $("#taxValue"),
    taxLabel: $("#taxLabel"),
    total: $("#totalValue"),
    place: $("#placeOrder"),
    placeLabel: $("#placeOrderLabel"),
    status: $("#orderStatus"),
    promoForm: $("#promoForm"),
    promoInput: $("#promoInput"),
    promoMsg: $("#promoMsg"),
    promoApplied: $("#promoApplied"),
    promoAppliedLabel: $("#promoAppliedLabel"),
    cardPanel: $("#cardPanel"),
    applePanel: $("#applePayPanel"),
    codPanel: $("#codPanel"),
    cardNumber: $("#co-cardnumber"),
    cardBrand: $("#cardBrand"),
    expiry: $("#co-expiry"),
    cvc: $("#co-cvc"),
    terms: $("#co-terms"),
    termsWrap: $("#termsWrap"),
    success: $("#successView"),
    grid: $("#coGrid"),
    steps: $("#coSteps"),
    demoNote: $(".demo-note"),
  };

  /* ----------------------------------------------------------
     State
     ---------------------------------------------------------- */
  const PROMOS = {
    QUIET10: { type: "percent", value: 10, label: "QUIET10 · 10% off" },
    FREESHIP: { type: "shipping", value: 0, label: "FREESHIP · free delivery" },
  };
  const SHIPPING_COST = {
    standard: Math.max(0, siteNumber("standard_shipping_fee", 0)),
    express: Math.max(0, siteNumber("express_shipping_fee", 12)),
  };
  const FREE_SHIPPING_THRESHOLD = Math.max(0, siteNumber("free_shipping_threshold", 200));
  const TAX_PERCENT = Math.max(0, Math.min(100, siteNumber("tax_percent", 0)));

  const state = {
    shipping: "standard",
    payment: "card",
    promo: null, // { code, type, value, label }
    placing: false,
  };

  const today = new Date();

  function addDays(days) {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  }

  const shortDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const longDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const ETAS = {
    standard: { min: siteNumber("standard_eta_min_days", 4), max: siteNumber("standard_eta_max_days", 6), label: "3–5 business days" },
    express: { min: siteNumber("express_eta_min_days", 1), max: siteNumber("express_eta_max_days", 2), label: "1–2 business days" },
  };

  const etaText = (method) => {
    const eta = ETAS[method];
    return `${shortDate.format(addDays(eta.min))} – ${shortDate.format(addDays(eta.max))}`;
  };
  const etaLong = (method) => {
    const eta = ETAS[method];
    return `${longDate.format(addDays(eta.min))} – ${longDate.format(addDays(eta.max))}`;
  };

  $$("[data-eta]").forEach((el) => {
    el.textContent = etaText(el.dataset.eta);
  });

  /* ----------------------------------------------------------
     Totals
     ---------------------------------------------------------- */
  function totals() {
    const subtotal = Cart ? Cart.subtotal() : 0;
    const freeShip = Boolean(
      (state.promo && state.promo.type === "shipping") ||
      (FREE_SHIPPING_THRESHOLD > 0 && subtotal >= FREE_SHIPPING_THRESHOLD)
    );
    const shipping = freeShip ? 0 : SHIPPING_COST[state.shipping] || 0;
    let discount = 0;
    if (state.promo && state.promo.type === "percent") {
      discount = Math.round(subtotal * Number(state.promo.value)) / 100;
    } else if (state.promo && state.promo.type === "fixed") {
      discount = Math.min(subtotal, Math.max(0, Number(state.promo.value) || 0));
    }
    const tax = Math.round(Math.max(0, subtotal - discount) * TAX_PERCENT) / 100;
    const total = Math.round((subtotal + shipping + tax - discount) * 100) / 100;
    return { subtotal, shipping, discount, tax, total, freeShip };
  }

  /* ----------------------------------------------------------
     Render summary
     ---------------------------------------------------------- */
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function renderLine(item) {
    const key = Cart.lineKey(item);
    const li = el("li", "line");
    li.dataset.key = key;

    const thumb = el("div", "line__thumb");
    const img = document.createElement("img");
    img.src = PRODUCT_IMAGE;
    img.alt = "";
    img.loading = "lazy";
    img.width = 120;
    img.height = 120;
    thumb.appendChild(img);

    const body = el("div", "line__body");
    body.appendChild(el("p", "line__title", item.name));

    const opts = el("div", "line__opts");
    if (item.care) opts.appendChild(el("span", null, `${siteProduct.care_name || "AppleCare+"} · ${siteProduct.care_description || "2 years"}`));
    if (item.engraving) {
      const span = el("span");
      span.append("Engraved ");
      const em = el("em", null, `“${item.engraving}”`);
      span.appendChild(em);
      opts.appendChild(span);
    }
    if (!opts.childNodes.length) opts.appendChild(el("span", null, "USB-C charging case"));
    body.appendChild(opts);

    const qty = el("div", "line__qty");
    const minus = el("button", null, "−");
    minus.type = "button";
    minus.dataset.action = "minus";
    minus.setAttribute("aria-label", `Decrease quantity of ${item.name}`);
    minus.disabled = item.qty <= 1;
    const qtyText = el("span", null, String(item.qty));
    qtyText.setAttribute("aria-live", "polite");
    const plus = el("button", null, "+");
    plus.type = "button";
    plus.dataset.action = "plus";
    plus.setAttribute("aria-label", `Increase quantity of ${item.name}`);
    plus.disabled = item.qty >= 5;
    qty.append(minus, qtyText, plus);
    body.appendChild(qty);

    const right = el("div", "line__right");
    right.appendChild(el("span", "line__price", money(item.price * item.qty)));
    const remove = el("button", "line__remove", "Remove");
    remove.type = "button";
    remove.dataset.action = "remove";
    remove.setAttribute("aria-label", `Remove ${item.name} from bag`);
    right.appendChild(remove);

    li.append(thumb, body, right);
    return li;
  }

  function renderCart() {
    const items = Cart ? Cart.items() : [];
    const isEmpty = items.length === 0;

    els.list.innerHTML = "";
    items.forEach((item) => els.list.appendChild(renderLine(item)));

    els.empty.hidden = !isEmpty;
    els.list.hidden = isEmpty;
    els.promoForm.closest(".promo").hidden = isEmpty;
    els.place.disabled = isEmpty || state.placing || !STORE_OPEN;
    if (!STORE_OPEN) {
      els.status.textContent = siteSettings.maintenance_message || "The store is temporarily closed.";
      els.status.classList.add("is-error");
    }
    if (isEmpty) state.promo = null;

    const t = totals();
    els.count.textContent = isEmpty
      ? ""
      : `· ${items.reduce((n, i) => n + i.qty, 0)} item${Cart.count() === 1 ? "" : "s"}`;
    els.subtotal.textContent = money(t.subtotal);
    els.shipping.textContent =
      t.shipping === 0 ? "Free" : money(t.shipping);

    const hasDiscount = t.discount > 0;
    els.discountRow.hidden = !hasDiscount;
    if (hasDiscount) {
      els.discount.textContent = `−${money(t.discount)}`;
      els.discountLabel.textContent = state.promo ? `(${state.promo.code})` : "";
    }

    if (els.taxRow && els.tax) {
      els.taxRow.hidden = !(t.tax > 0);
      els.tax.textContent = money(t.tax);
      if (els.taxLabel) els.taxLabel.textContent = TAX_PERCENT ? `(${TAX_PERCENT}%)` : "";
    }
    $$("[data-shipping-fee]").forEach((node) => {
      const method = node.dataset.shippingFee === "express" ? "express" : "standard";
      const fee = FREE_SHIPPING_THRESHOLD > 0 && t.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST[method];
      node.textContent = fee === 0 ? "Free" : money(fee);
    });
    els.total.textContent = money(t.total);
    els.placeLabel.textContent = isEmpty
      ? "Place order"
      : `Place order · ${money(t.total)}`;

    /* promo UI */
    if (state.promo) {
      els.promoForm.hidden = true;
      els.promoApplied.hidden = false;
      els.promoAppliedLabel.textContent = state.promo.label;
    } else {
      els.promoForm.hidden = false;
      els.promoApplied.hidden = true;
    }
  }

  function refreshBadges() {
    if (Cart) Cart.badges();
  }

  /* ----------------------------------------------------------
     Summary interactions (delegated)
     ---------------------------------------------------------- */
  els.list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const li = btn.closest(".line");
    const key = li.dataset.key;
    const item = Cart.items().find((i) => Cart.lineKey(i) === key);
    if (!item) return;

    const action = btn.dataset.action;
    if (action === "remove") {
      Cart.remove(key);
      toast(`${item.name} removed from your bag.`);
      refreshBadges();
    } else if (action === "minus") {
      Cart.setQty(key, item.qty - 1);
      focusQty(key, "minus");
    } else if (action === "plus") {
      Cart.setQty(key, item.qty + 1);
      focusQty(key, "plus");
    }
  });

  function focusQty(key, action) {
    const rows = $$(".line", els.list);
    const row = rows.find((r) => r.dataset.key === key);
    if (!row) return;
    const btn = $(`[data-action="${action}"]`, row);
    if (btn && !btn.disabled) btn.focus();
    else {
      const other = $('[data-action="plus"]', row) || $('[data-action="minus"]', row);
      if (other) other.focus();
    }
  }

  const demoItemBtn = $("#addDemoItem");
  if (demoItemBtn) {
    const demoName = siteProduct.name || "AirPods Pro 2";
    const demoPrice = Number(siteProduct.price) || 249;
    demoItemBtn.textContent = `Add ${demoName} — ${money0(demoPrice)}`;
    demoItemBtn.addEventListener("click", () => {
      Cart.add({ id: siteProduct.slug || "airpods-pro-2", name: demoName, price: demoPrice, qty: 1 });
      toast(`${demoName} added to your bag.`);
      refreshBadges();
      els.promoInput.focus({ preventScroll: true });
    });
  }

  /* ----------------------------------------------------------
     Promo codes
     ---------------------------------------------------------- */
  async function applyPromo(code) {
    const clean = String(code || "").trim().toUpperCase();
    els.promoMsg.classList.remove("is-error");

    if (!clean) {
      els.promoMsg.classList.add("is-error");
      els.promoMsg.textContent = "Enter a promo code first.";
      return;
    }

    const applyLocal = () => {
      if (!PROMOS[clean]) return false;
      state.promo = { code: clean, ...PROMOS[clean] };
      return true;
    };

    els.promoMsg.textContent = "Checking code…";
    try {
      if (typeof window.fetch !== "function" || !/^https?:$/.test(window.location.protocol)) throw new Error("offline");
      const res = await window.fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean, items: Cart ? Cart.items() : [], shipping_method: state.shipping }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.promo) {
        els.promoMsg.classList.add("is-error");
        els.promoMsg.textContent = (json && json.error) || `“${clean}” isn’t a valid code.`;
        return;
      }
      state.promo = json.promo;
    } catch (err) {
      if (!applyLocal()) {
        els.promoMsg.classList.add("is-error");
        els.promoMsg.textContent = `“${clean}” isn’t a valid code. Try QUIET10.`;
        return;
      }
    }

    els.promoMsg.textContent =
      state.promo.type === "percent"
        ? `${state.promo.value}% off applied to your subtotal.`
        : state.promo.type === "fixed"
          ? "Discount applied to your subtotal."
          : "Delivery is on us.";
    els.promoInput.value = "";
    renderCart();
    toast(`${clean} applied.`);
  }

  els.promoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    applyPromo(els.promoInput.value);
  });

  $("#promoRemove").addEventListener("click", () => {
    state.promo = null;
    els.promoMsg.textContent = "";
    els.promoMsg.classList.remove("is-error");
    renderCart();
    toast("Promo code removed.");
  });

  $$("[data-code]").forEach((btn) =>
    btn.addEventListener("click", () => applyPromo(btn.dataset.code))
  );

  /* ----------------------------------------------------------
     Shipping + payment selection
     ---------------------------------------------------------- */
  $$('input[name="shipping"]').forEach((input) =>
    input.addEventListener("change", () => {
      state.shipping = input.value;
      renderCart();
    })
  );

  function paymentChanged(value) {
    state.payment = value;
    els.cardPanel.hidden = value !== "card";
    els.applePanel.hidden = value !== "applepay";
    els.codPanel.hidden = value !== "cod";

    /* clear card errors when card fields are no longer in play */
    if (value !== "card") {
      ["co-cardname", "co-cardnumber", "co-expiry", "co-cvc"].forEach((id) =>
        setError(id, "")
      );
    }
  }

  $$('input[name="payment"]').forEach((input) =>
    input.addEventListener("change", () => paymentChanged(input.value))
  );

  /* ----------------------------------------------------------
     Card input formatting
     ---------------------------------------------------------- */
  function detectBrand(digits) {
    if (/^4/.test(digits)) return "VISA";
    if (/^3[47]/.test(digits)) return "AMEX";
    if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "MASTERCARD";
    if (/^6/.test(digits)) return "DISCOVER";
    return "";
  }

  els.cardNumber.addEventListener("input", () => {
    const elNum = els.cardNumber;
    const digits = elNum.value.replace(/\D/g, "").slice(0, 19);
    elNum.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
    const brand = detectBrand(digits);
    els.cardBrand.textContent = brand;
    els.cardBrand.classList.toggle("is-visible", Boolean(brand));
    clearError("co-cardnumber");
  });

  els.expiry.addEventListener("input", () => {
    const digits = els.expiry.value.replace(/\D/g, "").slice(0, 4);
    els.expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    clearError("co-expiry");
  });

  els.cvc.addEventListener("input", () => {
    els.cvc.value = els.cvc.value.replace(/\D/g, "").slice(0, 4);
    clearError("co-cvc");
  });

  /* ----------------------------------------------------------
     Validation
     ---------------------------------------------------------- */
  const validators = {
    "co-email": (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || "Enter a valid email address.",
    "co-phone": (v) => {
      const digits = v.replace(/[^\d]/g, "");
      return (
        (/^[+\d][\d\s()-]{6,19}$/.test(v) && digits.length >= 7 && digits.length <= 15) ||
        "Enter a phone number with 7–15 digits."
      );
    },
    "co-first": (v) => v.length >= 2 || "Enter your first name.",
    "co-last": (v) => v.length >= 2 || "Enter your last name.",
    "co-address1": (v) => v.length >= 5 || "Enter your street address.",
    "co-city": (v) => v.length >= 2 || "Enter your city.",
    "co-region": (v) => v.length >= 2 || "Enter your state or division.",
    "co-postcode": (v) =>
      /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(v) || "Enter a valid postcode.",
    "co-country": (v) => v.length > 0 || "Select a country.",
    "co-cardname": (v) => v.length >= 3 || "Enter the name on your card.",
    "co-cardnumber": (v) => {
      const digits = v.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) {
        return "Enter a valid card number.";
      }
      return luhn(digits) || "That card number doesn’t look right.";
    },
    "co-expiry": (v) => {
      const match = /^(\d{2})\/(\d{2})$/.exec(v);
      if (!match) return "Use MM/YY.";
      const month = Number(match[1]);
      const year = 2000 + Number(match[2]);
      if (month < 1 || month > 12) return "Month must be 01–12.";
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      return endOfMonth >= new Date() || "This card has expired.";
    },
    "co-cvc": (v) => /^\d{3,4}$/.test(v) || "CVC is 3 or 4 digits.",
  };

  function luhn(digits) {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  }

  const CARD_FIELDS = ["co-cardname", "co-cardnumber", "co-expiry", "co-cvc"];

  function fieldNode(id) {
    const input = document.getElementById(id);
    return input ? input.closest(".field") || input.closest(".terms") : null;
  }

  function setError(id, message) {
    const input = document.getElementById(id);
    const err = document.getElementById(`${id}-error`);
    const field = fieldNode(id);
    if (!input) return;
    if (err) err.textContent = message || "";
    if (field) field.classList.toggle("is-invalid", Boolean(message));
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function clearError(id) {
    const err = document.getElementById(`${id}-error`);
    if (err && err.textContent) setError(id, "");
  }

  function isActive(id) {
    return state.payment === "card" || !CARD_FIELDS.includes(id);
  }

  function validate(id) {
    const input = document.getElementById(id);
    if (!input || !isActive(id)) return true;
    const result = validators[id](input.value.trim());
    setError(id, result === true ? "" : result);
    return result === true;
  }

  function validateTerms() {
    const ok = els.terms.checked;
    setError("co-terms", ok ? "" : "Please accept the terms to continue.");
    return ok;
  }

  Object.keys(validators).forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("blur", () => {
      if (input.value.trim() || input.closest(".field.is-invalid")) validate(id);
    });
    input.addEventListener("input", () => clearError(id));
  });

  els.terms.addEventListener("change", () => {
    if (els.terms.checked) setError("co-terms", "");
  });

  function validateForm() {
    const order = [
      "co-email",
      "co-phone",
      "co-first",
      "co-last",
      "co-address1",
      "co-city",
      "co-region",
      "co-postcode",
      "co-country",
      ...(state.payment === "card" ? CARD_FIELDS : []),
    ];

    let firstInvalid = null;
    order.forEach((id) => {
      const ok = validate(id);
      if (!ok && !firstInvalid) firstInvalid = document.getElementById(id);
    });
    if (!validateTerms() && !firstInvalid) firstInvalid = els.terms;

    return firstInvalid;
  }

  /* ----------------------------------------------------------
     Place order
     ---------------------------------------------------------- */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    placeOrder();
  });

  function placeOrder() {
    if (state.placing) return;

    if (!Cart.items().length) {
      toast("Your bag is empty — add a pair first.", true);
      $("#addDemoItem").focus();
      return;
    }

    const firstInvalid = validateForm();
    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      els.status.textContent = "Please check the highlighted fields.";
      els.status.classList.add("is-error");
      toast("Please check the highlighted fields.", true);
      return;
    }

    els.status.classList.remove("is-error");
    els.status.textContent = "Authorising payment…";
    els.place.classList.add("is-loading");
    els.placeLabel.textContent = "Placing order";
    els.place.disabled = true;
    state.placing = true;

    window.setTimeout(completeOrder, 1500);
  }

  function paymentLabel() {
    if (state.payment === "applepay") return "Apple Pay";
    if (state.payment === "cod") return "Cash on delivery";
    const digits = els.cardNumber.value.replace(/\D/g, "");
    return `Card ending ${digits.slice(-4)}`;
  }

  async function completeOrder() {
    const items = Cart.items();
    const t = totals();
    const val = (id) => {
      const node = document.getElementById(id);
      return node ? node.value.trim() : "";
    };
    const email = val("co-email");
    const firstName = val("co-first");
    const customerName = `${firstName} ${val("co-last")}`.trim();
    const payload = {
      cart_id: Cart && typeof Cart.cartId === "function" ? Cart.cartId() : "",
      customer: { name: customerName, email, phone: val("co-phone") },
      address: {
        address1: val("co-address1"),
        address2: val("co-address2"),
        city: val("co-city"),
        region: val("co-region"),
        postcode: val("co-postcode"),
        country: val("co-country"),
      },
      items,
      promo: state.promo ? state.promo.code : "",
      shipping_method: state.shipping,
      payment_method: state.payment,
      payment_label: paymentLabel(),
    };

    let savedOrder = null;
    let apiError = "";
    try {
      if (typeof window.fetch === "function" && /^https?:$/.test(window.location.protocol)) {
        els.status.textContent = "Saving your order…";
        const res = await window.fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || !json.order) {
          apiError = (json && json.error) || "The order could not be saved. Please try again.";
        } else {
          savedOrder = json.order;
        }
      }
    } catch (err) {
      savedOrder = null; // static/offline fallback below
    }

    if (apiError) {
      state.placing = false;
      els.place.disabled = false;
      els.place.classList.remove("is-loading");
      els.placeLabel.textContent = `Place order · ${money(t.total)}`;
      els.status.textContent = apiError;
      els.status.classList.add("is-error");
      toast(apiError, true);
      return;
    }

    const displayItems = savedOrder && Array.isArray(savedOrder.items) && savedOrder.items.length ? savedOrder.items : items;
    const finalTotal = savedOrder ? Number(savedOrder.total) : t.total;
    const orderNumber =
      (savedOrder && (savedOrder.order_no || savedOrder.id)) ||
      "AP2-" + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 900 + 100);

    $("#successName").textContent = firstName || "friend";
    $("#successEmail").textContent = email;
    $("#orderNumber").textContent = orderNumber;
    $("#successTotal").textContent = money(finalTotal);
    $("#successEta").textContent = etaLong(state.shipping);
    $("#successPayment").textContent = paymentLabel();

    const lines = $("#successLines");
    lines.innerHTML = "";
    displayItems.forEach((item) => {
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.append(`${item.qty} × ${item.name}`);
      const opts = [];
      if (item.care) opts.push(siteProduct.care_name || "AppleCare+");
      if (item.engraving) opts.push(`Engraved “${item.engraving}”`);
      if (opts.length) {
        const small = document.createElement("small");
        small.textContent = ` — ${opts.join(" · ")}`;
        small.style.color = "var(--text-3)";
        left.appendChild(small);
      }
      const price = document.createElement("b");
      price.textContent = money((Number(item.price ?? item.unit_price) || 0) * item.qty);
      li.append(left, price);
      lines.appendChild(li);
    });

    els.grid.hidden = true;
    els.demoNote.hidden = true;
    els.success.hidden = false;
    setStep("done");

    /* Offline/static fallback only: normal orders are already saved in SQLite. */
    if (!savedOrder) {
      try {
        const ORDERS_KEY = "airpods-pro2-orders/v1";
        const orders = JSON.parse(window.localStorage.getItem(ORDERS_KEY) || "[]");
        if (Array.isArray(orders)) {
          orders.unshift({
            id: orderNumber,
            date: new Date().toISOString(),
            customer: customerName,
            email,
            phone: val("co-phone"),
            address: [val("co-address1"), val("co-city"), val("co-region"), val("co-postcode"), val("co-country")].filter(Boolean).join(", "),
            items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, care: Boolean(i.care), engraving: i.engraving || "" })),
            subtotal: t.subtotal,
            discount: t.discount,
            shipping: t.shipping,
            tax: t.tax,
            total: t.total,
            promo: state.promo ? state.promo.code : "",
            payment: paymentLabel(),
            shippingMethod: state.shipping,
            status: "Pending",
          });
          window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 200)));
        }
      } catch (err) {
        /* storage unavailable — the demo confirmation still completes */
      }
    }

    Cart.clear({ converted: Boolean(savedOrder) });
    refreshBadges();
    state.placing = false;
    els.place.classList.remove("is-loading");

    document.title = `Order confirmed — ${siteProduct.name || "AirPods Pro 2"}`;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    window.setTimeout(() => {
      const title = $("#successTitle");
      if (title) title.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 320);
    els.success.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function setStep(active) {
    const order = ["bag", "details", "done"];
    const index = order.indexOf(active);
    $$(".co-step", els.steps).forEach((step, i) => {
      step.classList.toggle("is-done", i < index);
      step.classList.toggle("is-active", i === index);
      if (i === index) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
  }

  $("#printReceipt").addEventListener("click", () => window.print());

  /* ----------------------------------------------------------
     Toast
     ---------------------------------------------------------- */
  const toastEl = $("#toast");
  let toastTimer = null;
  function toast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", isError);
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
      () => toastEl.classList.remove("is-visible"),
      3200
    );
  }

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  renderCart();

  if (Cart) {
    Cart.onChange(() => renderCart());
  }
})();
