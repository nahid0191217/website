/* ============================================================
   AirPods Pro 2 — landing page interactions (v2)
   Vanilla JS, no dependencies. Uses window.AirPodsCart (cart.js).
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const Cart = window.AirPodsCart;
  const money = Cart ? Cart.money : (n) => `$${Number(n).toFixed(2)}`;
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
     Nav: sticky state, mobile menu, scroll spy, progress,
     parallax lifestyle image, sticky buy bar
     ---------------------------------------------------------- */
  const nav = $("#nav");
  const burger = $("#burger");
  const navLinks = $("#navLinks");
  const progressBar = $("#progressBar");
  const links = $$(".nav__link");
  const spySections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const closeMenu = () => {
    if (!navLinks) return;
    navLinks.classList.remove("is-open");
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
  };

  if (burger && navLinks) {
    burger.addEventListener("click", () => {
      const open = navLinks.classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    links.forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("click", (e) => {
      if (navLinks.classList.contains("is-open") && !navLinks.contains(e.target) && !burger.contains(e.target)) {
        closeMenu();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) =>
          link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`)
        );
      });
    },
    { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
  );
  spySections.forEach((s) => spy.observe(s));

  const lifeImg = $("#lifeImg");
  const stickyBuy = $("#stickyBuy");
  const buySection = $("#buy");
  const footer = $(".footer");
  let buyInView = false;
  let footerInView = false;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const doc = document.documentElement;

    if (nav) nav.classList.toggle("is-stuck", y > 12);

    if (progressBar) {
      const max = doc.scrollHeight - window.innerHeight;
      progressBar.style.width = `${max > 0 ? clamp((y / max) * 100, 0, 100) : 0}%`;
    }

    if (!reduceMotion && lifeImg) {
      const rect = lifeImg.parentElement.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) / 11;
        lifeImg.style.transform = `translate3d(0, ${clamp(offset, -72, 72)}px, 0)`;
      }
    }

    if (stickyBuy) {
      const show = y > 640 && !buyInView && !footerInView;
      stickyBuy.classList.toggle("is-visible", show);
      stickyBuy.setAttribute("aria-hidden", String(!show));
      document.body.classList.toggle("has-sticky-bar", show);
    }

    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onScroll);
    },
    { passive: true }
  );

  if (buySection) {
    new IntersectionObserver(
      ([entry]) => { buyInView = entry.isIntersecting; onScroll(); },
      { threshold: 0.12 }
    ).observe(buySection);
  }
  if (footer) {
    new IntersectionObserver(
      ([entry]) => { footerInView = entry.isIntersecting; onScroll(); },
      { threshold: 0.05 }
    ).observe(footer);
  }
  onScroll();

  /* ----------------------------------------------------------
     Offer countdown (announcement bar) — ends at local midnight
     ---------------------------------------------------------- */
  const offerClock = $("#offerCountdown");
  if (offerClock) {
    const pad = (n) => String(n).padStart(2, "0");
    const tickClock = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const diff = Math.max(0, end.getTime() - now.getTime());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      offerClock.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    };
    tickClock();
    window.setInterval(tickClock, 1000);
  }

  /* ----------------------------------------------------------
     Reveal on scroll
     ---------------------------------------------------------- */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
  );
  $$(".reveal").forEach((el) => revealObserver.observe(el));

  /* review rating bars fill when summary reveals */
  const summary = $(".summary");
  if (summary) {
    $$(".bar__track i", summary).forEach((bar) => {
      bar.style.setProperty("--w", `${bar.dataset.bar || 0}%`);
    });
  }

  /* ----------------------------------------------------------
     Counters
     ---------------------------------------------------------- */
  const formatNumber = (value, decimals) =>
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString("en-US");

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        counterObserver.unobserve(el);

        const target = parseFloat(el.dataset.count);
        const decimals = parseInt(el.dataset.decimals || "0", 10);
        const suffix = el.dataset.suffix || "";
        const duration = 1500;
        const start = performance.now();

        if (reduceMotion) {
          el.textContent = formatNumber(target, decimals) + suffix;
          return;
        }
        const tick = (now) => {
          const p = clamp((now - start) / duration, 0, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = formatNumber(target * eased, decimals) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.55 }
  );
  $$(".counter").forEach((el) => counterObserver.observe(el));

  /* battery fill */
  const batteryVisual = $(".battery__visual");
  if (batteryVisual) {
    new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            batteryVisual.classList.add("is-full");
            obs.disconnect();
          }
        });
      },
      { threshold: 0.45 }
    ).observe(batteryVisual);
  }

  /* ----------------------------------------------------------
     Hero: 3D tilt on product image (desktop) + magnetic CTAs
     ---------------------------------------------------------- */
  const heroStage = $("#heroStage");
  const heroImg = $("#heroImg");
  if (heroStage && heroImg && finePointer && !reduceMotion) {
    let raf = null;
    heroStage.addEventListener("pointermove", (e) => {
      const rect = heroStage.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        heroImg.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 8}deg) translateZ(6px)`;
      });
    });
    heroStage.addEventListener("pointerleave", () => {
      if (raf) cancelAnimationFrame(raf);
      heroImg.style.transform = "";
    });
  }

  if (finePointer && !reduceMotion) {
    $$(".magnetic").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
      });
      btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
    });
  }

  /* bento card spotlight follow */
  if (finePointer) {
    $$(".bcard").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
      });
    });
  }

  /* ----------------------------------------------------------
     ANC interactive demo (canvas)
     ---------------------------------------------------------- */
  const ancCanvas = $("#ancCanvas");
  const ancRange = $("#ancRange");
  const ancMode = $("#ancMode");
  const ancDb = $("#ancDb");
  const ancTip = $("#ancTip");
  const ancChips = $$("[data-anc]");

  if (ancCanvas && ancRange) {
    const ctx = ancCanvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let level = 1;        // target 0..1 (1 = full cancellation)
    let levelShown = 1;   // eased value used for drawing
    let running = false;
    let animId = null;
    let interacted = false;

    const particles = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.9,
    }));

    function resize() {
      const rect = ancCanvas.getBoundingClientRect();
      ancCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
      ancCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(t) {
      const w = ancCanvas.width;
      const h = ancCanvas.height;
      const mid = h / 2;
      levelShown += (level - levelShown) * 0.06;
      const noise = 1 - levelShown; // 1 = full city noise, 0 = silence
      const time = t * 0.001;

      ctx.clearRect(0, 0, w, h);

      /* ambient particles — jitter dies as ANC rises */
      particles.forEach((p) => {
        const jitter = noise * 26 * dpr;
        const x = p.x * w + Math.sin(time * p.speed * 2 + p.phase) * jitter;
        const y = p.y * h + Math.cos(time * p.speed * 1.7 + p.phase) * jitter;
        const alpha = 0.1 + noise * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, p.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 113, 227, ${alpha.toFixed(3)})`;
        ctx.fill();
      });

      /* layered waves */
      const waves = [
        { amp: 0.34, freq: 0.011, speed: 1.6, color: "rgba(0, 113, 227, 0.9)", width: 2.2 },
        { amp: 0.22, freq: 0.017, speed: 2.3, color: "rgba(125, 74, 255, 0.65)", width: 1.8 },
        { amp: 0.13, freq: 0.027, speed: 3.1, color: "rgba(224, 53, 107, 0.5)", width: 1.4 },
      ];
      waves.forEach((wv) => {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4 * dpr) {
          const chaos =
            Math.sin(x * 0.05 + time * 7) * noise * 9 * dpr +
            Math.sin(x * 0.021 - time * 5.2) * noise * 14 * dpr;
          const y =
            mid +
            Math.sin(x * wv.freq / dpr + time * wv.speed) * h * wv.amp * (0.08 + noise * 0.92) +
            chaos;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = wv.color;
        ctx.lineWidth = wv.width * dpr;
        ctx.shadowColor = "rgba(0, 113, 227, 0.35)";
        ctx.shadowBlur = 12 * dpr * noise;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      /* calm centre line grows in as silence deepens */
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.strokeStyle = `rgba(23, 138, 66, ${(levelShown * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([6 * dpr, 8 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function loop(t) {
      draw(t);
      if (running) animId = requestAnimationFrame(loop);
    }
    function start() {
      if (running) return;
      running = true;
      animId = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (animId) cancelAnimationFrame(animId);
    }

    if (reduceMotion) {
      draw(1200);
    } else {
      new IntersectionObserver(
        ([entry]) => (entry.isIntersecting ? start() : stop()),
        { threshold: 0.12 }
      ).observe(ancCanvas);
    }

    function syncFromRange(animateTip) {
      const v = Number(ancRange.value);
      level = v / 100;
      ancRange.style.setProperty("--fill", `${v}%`);

      const db = Math.round(-48 * level);
      let mode = "Noise Cancellation";
      if (v < 34) mode = "Transparency";
      else if (v < 67) mode = "Adaptive";

      if (ancMode) ancMode.textContent = mode;
      if (ancDb) ancDb.textContent = db === 0 ? "0" : `−${Math.abs(db)}`;
      ancRange.setAttribute("aria-valuetext", `${mode}, minus ${Math.abs(db)} decibels`);

      ancChips.forEach((chip) => chip.classList.toggle("is-active", Number(chip.dataset.anc) === v));

      if (animateTip && !interacted) {
        interacted = true;
        if (ancTip) ancTip.classList.add("is-hidden");
      }
      if (reduceMotion) draw(1200);
    }

    ancRange.addEventListener("input", () => syncFromRange(true));

    ancChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const target = Number(chip.dataset.anc);
        if (reduceMotion) {
          ancRange.value = String(target);
          syncFromRange(true);
          return;
        }
        const from = Number(ancRange.value);
        const startTime = performance.now();
        const duration = 550;
        const step = (now) => {
          const p = clamp((now - startTime) / duration, 0, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          ancRange.value = String(Math.round(from + (target - from) * eased));
          syncFromRange(true);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    });

    syncFromRange(false);
  }

  /* ----------------------------------------------------------
     Gallery / showcase switcher (+ gentle autoplay)
     ---------------------------------------------------------- */
  const galleryTabs = $$("[data-gallery-tab]");
  const galleryImgs = $$("[data-gallery-img]");
  const galleryCaption = $("#galleryCaption");
  const galleryCount = $("#galleryCount");

  if (galleryTabs.length && galleryImgs.length) {
    let gIndex = 0;
    let gTimer = null;

    function showGallery(i) {
      gIndex = (i + galleryTabs.length) % galleryTabs.length;
      const tab = galleryTabs[gIndex];
      const key = tab.dataset.galleryTab;
      galleryTabs.forEach((t, ti) => {
        t.classList.toggle("is-active", ti === gIndex);
        t.setAttribute("aria-selected", String(ti === gIndex));
      });
      galleryImgs.forEach((img) => img.classList.toggle("is-active", img.dataset.galleryImg === key));
      if (galleryCaption) {
        galleryCaption.innerHTML = `<b>${escapeHtml(tab.dataset.title || "")}</b><span>${escapeHtml(tab.dataset.text || "")}</span>`;
      }
      if (galleryCount) {
        galleryCount.textContent = `${String(gIndex + 1).padStart(2, "0")} / ${String(galleryTabs.length).padStart(2, "0")}`;
      }
    }

    function stopAuto() {
      if (gTimer) window.clearInterval(gTimer);
      gTimer = null;
    }
    function startAuto() {
      if (reduceMotion) return;
      stopAuto();
      gTimer = window.setInterval(() => showGallery(gIndex + 1), 6000);
    }

    galleryTabs.forEach((tab, i) => {
      tab.addEventListener("click", () => { showGallery(i); startAuto(); });
    });

    const tablist = $(".gallery__thumbs");
    if (tablist) {
      tablist.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); showGallery(gIndex + 1); galleryTabs[gIndex].focus(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); showGallery(gIndex - 1); galleryTabs[gIndex].focus(); }
      });
      tablist.addEventListener("pointerenter", stopAuto);
      tablist.addEventListener("pointerleave", startAuto);
    }

    showGallery(0);
    startAuto();
  }

  /* ----------------------------------------------------------
     Accordions (specs + FAQ)
     ---------------------------------------------------------- */
  $$(".acc").forEach((acc) => {
    const btn = $(".acc__btn", acc);
    const panel = $(".acc__panel", acc);
    if (!btn || !panel) return;

    const setOpen = (open) => {
      acc.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
      panel.style.maxHeight = open ? `${panel.scrollHeight}px` : "0px";
    };

    setOpen(btn.getAttribute("aria-expanded") === "true");
    btn.addEventListener("click", () => setOpen(!acc.classList.contains("is-open")));
    window.addEventListener("resize", () => {
      if (acc.classList.contains("is-open")) panel.style.maxHeight = `${panel.scrollHeight}px`;
    });
  });

  /* ----------------------------------------------------------
     Dynamic pricing (buy panel)
     ---------------------------------------------------------- */
  /* SQLite-managed product/settings from server.py (window.__SITE__). */
  const SITE = window.SiteData || window.__SITE__ || {};
  const siteSettings = SITE.settings || {};
  const siteProduct = SITE.product || {};
  let legacySettings = {};
  try {
    legacySettings = JSON.parse(window.localStorage.getItem("airpods-pro2-settings/v1") || "{}") || {};
  } catch (err) {
    legacySettings = {};
  }
  const settingPrice = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const money0 = (n) => (typeof window.SiteMoney === "function" ? window.SiteMoney(n, true) : money(n).replace(/\.00$/, ""));
  const BASE = settingPrice(siteProduct.price ?? legacySettings.basePrice, 249);
  const WAS = Math.max(settingPrice(siteProduct.compare_at_price ?? legacySettings.wasPrice, 279), BASE);
  const CARE_PRICE = (() => {
    const raw = siteProduct.care_price ?? legacySettings.carePrice;
    const n = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? n : 49;
  })();
  const PRODUCT_NAME =
    typeof siteProduct.name === "string" && siteProduct.name.trim()
      ? siteProduct.name.trim().slice(0, 120)
      : typeof legacySettings.productName === "string" && legacySettings.productName.trim()
        ? legacySettings.productName.trim().slice(0, 120)
        : "AirPods Pro 2";
  const PRODUCT_ID = siteProduct.slug || "airpods-pro-2";
  const PRODUCT_IMAGE = siteProduct.image || "assets/img/case.jpg";
  const MAX_QTY = clamp(Math.round(Number(siteProduct.max_qty) || 5), 1, 99);
  const ENGRAVE_MAX = clamp(Math.round(Number(siteSettings.engraving_max_length) || 14), 1, 40);
  const ENGRAVING_ENABLED = siteSettings.engraving_enabled !== false;
  const DELIVERY_CUTOFF_HOUR = clamp(Math.round(Number(siteSettings.delivery_cutoff_hour) ?? 16) || 0, 0, 23);
  const DELIVERY_BUSINESS_DAYS = clamp(Math.round(Number(siteSettings.delivery_business_days) || 2), 0, 60);

  const totalPriceEl = $("#totalPrice");
  const wasPriceEl = $("#wasPrice");
  const savePillEl = $("#savePill");
  const monthlyEl = $("#monthlyPrice");
  const perUnitEl = $("#perUnitNote");
  const stickyPriceEl = $("#stickyPrice");
  const qtyValueEl = $("#qtyValue");
  const qtyMinus = $("#qtyMinus");
  const qtyPlus = $("#qtyPlus");
  const caseRadios = $$('input[name="case"]');

  /* apply admin settings: care-plan price, price labels, product name */
  const careRadio = caseRadios.find((r) => (r.dataset.label || "").includes("AppleCare"));
  if (careRadio) {
    careRadio.value = String(CARE_PRICE);
    careRadio.dataset.label = `${siteProduct.care_name || "AppleCare+"} (${siteProduct.care_description || "2 yrs"})`;
  }
  $$(".js-from-price").forEach((el) => { el.textContent = money0(BASE); });
  $$(".js-care-price").forEach((el) => { el.textContent = money0(CARE_PRICE); });
  $$(".js-save-amount").forEach((el) => { el.textContent = money0(Math.max(0, WAS - BASE)); });
  $$("[data-product-name]").forEach((el) => { el.textContent = PRODUCT_NAME; });
  const productSubtitle = $("[data-product-subtitle]");
  if (productSubtitle) {
    productSubtitle.textContent = siteProduct.subtitle || "";
    productSubtitle.style.display = siteProduct.subtitle ? "" : "none";
  }
  const engraveRadios = $$('input[name="engrave"]');
  const engraveWrap = $("#engraveWrap");
  const engraveInput = $("#engraveInput");
  const engraveCount = $("#engraveCount");
  const engravePreview = $("#engravePreview");
  if (engraveInput) {
    engraveInput.maxLength = ENGRAVE_MAX;
    const engraveMaxEl = $("#engraveMax");
    if (engraveMaxEl) engraveMaxEl.textContent = String(ENGRAVE_MAX);
  }
  const engravingFieldset = $("[data-engraving-fieldset]");
  if (engravingFieldset && !ENGRAVING_ENABLED) engravingFieldset.style.display = "none";

  let qty = 1;
  let displayedTotal = BASE;
  let priceRaf = null;

  const getAddon = () => {
    const checked = caseRadios.find((r) => r.checked);
    return checked ? Number(checked.value) || 0 : 0;
  };
  const getCareLabel = () => {
    const checked = caseRadios.find((r) => r.checked);
    return checked ? checked.dataset.label || "USB-C case" : "USB-C case";
  };
  const engravingOn = () => ENGRAVING_ENABLED && engraveRadios.some((r) => r.checked && r.value === "on");
  const engravingText = () => (engravingOn() && engraveInput ? engraveInput.value.trim().slice(0, ENGRAVE_MAX) : "");

  function animatePriceTo(target) {
    if (!totalPriceEl) return;
    if (priceRaf) cancelAnimationFrame(priceRaf);
    if (reduceMotion) {
      displayedTotal = target;
      totalPriceEl.textContent = money(target);
      return;
    }
    const from = displayedTotal;
    const start = performance.now();
    const duration = 420;
    totalPriceEl.classList.remove("is-tick");
    void totalPriceEl.offsetWidth;
    totalPriceEl.classList.add("is-tick");
    const step = (now) => {
      const p = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      displayedTotal = from + (target - from) * eased;
      totalPriceEl.textContent = money(displayedTotal);
      if (p < 1) priceRaf = requestAnimationFrame(step);
      else displayedTotal = target;
    };
    priceRaf = requestAnimationFrame(step);
  }

  function updatePricing() {
    const addon = getAddon();
    const unit = BASE + addon;
    const total = unit * qty;
    const wasTotal = (WAS + addon) * qty;
    const save = (WAS - BASE) * qty;

    animatePriceTo(total);
    if (wasPriceEl) {
      wasPriceEl.textContent = money(wasTotal);
      wasPriceEl.style.display = save > 0 ? "" : "none";
    }
    if (savePillEl) {
      savePillEl.textContent = `Save ${money0(save)}`;
      savePillEl.style.display = save > 0 ? "" : "none";
    }
    if (monthlyEl) monthlyEl.textContent = `${money(total / 12)}/mo`;
    if (perUnitEl) perUnitEl.textContent = qty > 1 ? `${money(unit)} each` : "Free engraving included";
    if (stickyPriceEl) stickyPriceEl.textContent = money(total);
    if (qtyValueEl) qtyValueEl.textContent = String(qty);
    if (qtyMinus) qtyMinus.toggleAttribute("disabled", qty <= 1);
    if (qtyPlus) qtyPlus.toggleAttribute("disabled", qty >= MAX_QTY);

    const qtyNote = $("#qtyNote");
    if (qtyNote) qtyNote.textContent = qty >= MAX_QTY ? `Limit reached (${MAX_QTY} per order)` : `Limit ${MAX_QTY} per order`;
  }

  if (qtyMinus) qtyMinus.addEventListener("click", () => { qty = clamp(qty - 1, 1, MAX_QTY); updatePricing(); });
  if (qtyPlus) qtyPlus.addEventListener("click", () => { qty = clamp(qty + 1, 1, MAX_QTY); updatePricing(); });
  caseRadios.forEach((r) => r.addEventListener("change", updatePricing));

  function syncEngraving() {
    const on = engravingOn();
    if (engraveWrap) engraveWrap.hidden = !on;
    if (engraveInput) {
      if (engraveCount) engraveCount.textContent = String(engraveInput.value.length);
      const text = engraveInput.value.trim();
      if (engravePreview) {
        engravePreview.textContent = text || "Your text";
        engravePreview.classList.toggle("is-on", on);
      }
      if (on) engraveInput.focus({ preventScroll: true });
    }
  }
  engraveRadios.forEach((r) => r.addEventListener("change", syncEngraving));
  if (engraveInput) {
    engraveInput.addEventListener("input", () => {
      if (engraveCount) engraveCount.textContent = String(engraveInput.value.length);
      if (engravePreview) {
        engravePreview.textContent = engraveInput.value.trim() || "Your text";
        engravePreview.classList.toggle("is-on", engravingOn());
      }
    });
  }

  updatePricing();

  /* ----------------------------------------------------------
     Delivery estimate (dynamic dates)
     ---------------------------------------------------------- */
  const orderByEl = $("#orderBy");
  const deliveryDateEl = $("#deliveryDate");
  if (orderByEl && deliveryDateEl) {
    const addBusinessDays = (from, days) => {
      const d = new Date(from);
      let added = 0;
      while (added < days) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) added += 1;
      }
      return d;
    };
    const fmt = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

    const updateDelivery = () => {
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(DELIVERY_CUTOFF_HOUR, 0, 0, 0);
      let shipBase = now;
      if (now > cutoff) {
        cutoff.setDate(cutoff.getDate() + 1);
        shipBase = cutoff;
      }
      const ms = cutoff.getTime() - now.getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      orderByEl.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
      deliveryDateEl.textContent = fmt(addBusinessDays(shipBase, DELIVERY_BUSINESS_DAYS));
    };
    updateDelivery();
    window.setInterval(updateDelivery, 30_000);
  }

  /* ----------------------------------------------------------
     Cart drawer
     ---------------------------------------------------------- */
  const drawer = $("#cartDrawer");
  const overlay = $("#cartOverlay");
  const drawerItemsEl = $("#drawerItems");
  const drawerEmptyEl = $("#drawerEmpty");
  const drawerSubtotalEl = $("#drawerSubtotal");
  const drawerFoot = $("#drawerFoot");
  const shipMsgEl = $("#shipMsg");
  const shipBarFill = $("#shipBarFill");
  const shipBlock = $("#shipBlock");
  const cartBtn = $("#cartBtn");
  const FREE_SHIP = Math.max(0, Number(siteSettings.free_shipping_threshold) ?? 200);
  let lastFocus = null;
  let lastCount = Cart ? Cart.count() : 0;

  function renderDrawer() {
    if (!Cart || !drawerItemsEl) return;
    const items = Cart.items();
    const subtotal = Cart.subtotal();

    drawerItemsEl.innerHTML = items
      .map((item) => {
        const key = escapeHtml(Cart.lineKey(item));
        const meta = [
          item.care ? "With AppleCare+ (2 yrs)" : "USB-C case",
          item.engraving ? `Engraved: <span class="eng">“${escapeHtml(item.engraving)}”</span>` : "No engraving",
        ].join("<br />");
        return `
        <li class="ditem">
          <img class="ditem__img" src="${escapeHtml(PRODUCT_IMAGE)}" alt="" width="72" height="72" />
          <div class="ditem__info">
            <b>${escapeHtml(item.name)}</b>
            <span class="ditem__meta">${meta}</span>
          </div>
          <div class="ditem__side">
            <span class="ditem__price">${money(item.price * item.qty)}</span>
            <div class="ditem__controls">
              <div class="dstepper" data-key="${key}">
                <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
                <span>${item.qty}</span>
                <button type="button" data-step="1" aria-label="Increase quantity">+</button>
              </div>
              <button type="button" class="ditem__remove" data-remove="${key}">Remove</button>
            </div>
          </div>
        </li>`;
      })
      .join("");

    const empty = items.length === 0;
    if (drawerEmptyEl) drawerEmptyEl.style.display = empty ? "grid" : "none";
    if (drawerFoot) drawerFoot.style.display = empty ? "none" : "grid";
    if (shipBlock) shipBlock.style.display = empty ? "none" : "block";
    if (drawerSubtotalEl) drawerSubtotalEl.textContent = money(subtotal);

    if (shipMsgEl && shipBarFill) {
      if (subtotal >= FREE_SHIP) {
        shipMsgEl.innerHTML = "<b>Free express delivery unlocked</b> — nice choice.";
        shipBarFill.style.width = "100%";
      } else {
        shipMsgEl.innerHTML = `You’re <b>${money(FREE_SHIP - subtotal)}</b> away from free express delivery`;
        shipBarFill.style.width = `${clamp((subtotal / FREE_SHIP) * 100, 0, 100)}%`;
      }
    }
  }

  if (drawerItemsEl) {
    drawerItemsEl.addEventListener("click", (e) => {
      const stepBtn = e.target.closest("[data-step]");
      const removeBtn = e.target.closest("[data-remove]");
      if (stepBtn && Cart) {
        const wrap = stepBtn.closest(".dstepper");
        const key = wrap ? wrap.dataset.key : "";
        const item = Cart.items().find((i) => Cart.lineKey(i) === key);
        if (item) Cart.setQty(key, item.qty + Number(stepBtn.dataset.step));
      }
      if (removeBtn && Cart) {
        Cart.remove(removeBtn.dataset.remove);
        showToast("Removed from your bag");
      }
    });
  }

  function openDrawer() {
    if (!drawer || !overlay) return;
    lastFocus = document.activeElement;
    renderDrawer();
    drawer.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
      overlay.classList.add("is-open");
    });
    document.body.classList.add("is-locked");
    const closeBtn = $("#drawerClose");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (!drawer || !overlay) return;
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    window.setTimeout(() => {
      drawer.hidden = true;
      overlay.hidden = true;
    }, 480);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus({ preventScroll: true });
  }

  if (cartBtn) cartBtn.addEventListener("click", openDrawer);
  const drawerClose = $("#drawerClose");
  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);
  const drawerShop = $("#drawerShop");
  if (drawerShop) drawerShop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
  });

  if (Cart) {
    Cart.onChange(() => {
      renderDrawer();
      const newCount = Cart.count();
      if (cartBtn && newCount > lastCount) {
        cartBtn.classList.remove("is-bump");
        void cartBtn.offsetWidth;
        cartBtn.classList.add("is-bump");
      }
      lastCount = newCount;
    });
    renderDrawer();
  }

  /* ----------------------------------------------------------
     Add to Bag / Buy now
     ---------------------------------------------------------- */
  function buildItem() {
    return {
      id: PRODUCT_ID,
      name: PRODUCT_NAME,
      price: BASE + getAddon(),
      qty,
      care: Boolean(careRadio && careRadio.checked),
      engraving: engravingText(),
    };
  }

  const addToBagBtn = $("#addToBag");
  if (addToBagBtn && Cart) {
    addToBagBtn.addEventListener("click", () => {
      Cart.add(buildItem());
      showToast(`Added to bag — ${getCareLabel()}${engravingText() ? `, engraved “${engravingText()}”` : ""}`);
      window.setTimeout(openDrawer, 450);
    });
  }

  const buyNowBtn = $("#buyNow");
  if (buyNowBtn && Cart) {
    buyNowBtn.addEventListener("click", () => {
      Cart.add(buildItem());
      window.location.href = "checkout";
    });
  }

  /* ----------------------------------------------------------
     Reviews carousel (autoplay, dots, swipe)
     ---------------------------------------------------------- */
  const track = $("#carouselTrack");
  const viewport = $("#carouselViewport");
  const dotsWrap = $("#carouselDots");
  const prevBtn = $("#prevReview");
  const nextBtn = $("#nextReview");

  if (track && viewport && $$(".review", track).length) {
    const slides = $$(".review", track);
    let index = 0;
    let autoTimer = null;

    const dots = slides.map((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", `Show review ${i + 1} of ${slides.length}`);
      dot.addEventListener("click", () => { goTo(i); restartAuto(); });
      if (dotsWrap) dotsWrap.appendChild(dot);
      return dot;
    });

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, di) => {
        dot.classList.toggle("is-active", di === index);
        dot.setAttribute("aria-selected", String(di === index));
      });
    }

    function stopAuto() { if (autoTimer) window.clearInterval(autoTimer); autoTimer = null; }
    function restartAuto() {
      stopAuto();
      if (reduceMotion) return;
      autoTimer = window.setInterval(() => goTo(index + 1), 5500);
    }

    if (prevBtn) prevBtn.addEventListener("click", () => { goTo(index - 1); restartAuto(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { goTo(index + 1); restartAuto(); });

    ["pointerenter", "focusin"].forEach((ev) => viewport.addEventListener(ev, stopAuto));
    ["pointerleave", "focusout"].forEach((ev) => viewport.addEventListener(ev, restartAuto));

    let startX = null;
    viewport.addEventListener("pointerdown", (e) => { startX = e.clientX; stopAuto(); });
    viewport.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 48) goTo(index + (dx < 0 ? 1 : -1));
      startX = null;
      restartAuto();
    });
    viewport.addEventListener("pointercancel", () => { startX = null; restartAuto(); });

    goTo(0);
    restartAuto();
  }

  /* ----------------------------------------------------------
     Newsletter
     ---------------------------------------------------------- */
  const subscribeForm = $("#subscribeForm");
  const subscribeEmail = $("#subscribeEmail");
  const subscribeMsg = $("#subscribeMsg");
  if (subscribeForm && subscribeEmail && subscribeMsg) {
    subscribeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = subscribeEmail.value.trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
      if (!valid) {
        subscribeMsg.textContent = "Please enter a valid email address.";
        subscribeMsg.classList.add("is-error");
        subscribeEmail.focus();
        return;
      }
      subscribeMsg.textContent = "You’re in. First quiet update lands soon.";
      subscribeMsg.classList.remove("is-error");
      const saveSubscriberLocally = () => {
        try {
          const SUBS_KEY = "airpods-pro2-subscribers/v1";
          const subs = JSON.parse(window.localStorage.getItem(SUBS_KEY) || "[]");
          if (Array.isArray(subs) && !subs.some((s) => s && s.email === value)) {
            subs.push({ email: value, date: new Date().toISOString() });
            window.localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
          }
        } catch (err) {
          /* storage unavailable — the signup still confirms */
        }
      };
      if (typeof window.fetch === "function" && /^https?:$/.test(window.location.protocol)) {
        window.fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value, source: "landing-footer" }),
        }).then((res) => { if (!res.ok) saveSubscriberLocally(); }).catch(saveSubscriberLocally);
      } else {
        saveSubscriberLocally();
      }
      subscribeEmail.value = "";
      showToast("Subscribed — welcome to the quiet list");
    });
  }

  /* ----------------------------------------------------------
     Misc: back-to-top, footer year
     ---------------------------------------------------------- */
  const toTop = $("#toTop");
  if (toTop) {
    toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
