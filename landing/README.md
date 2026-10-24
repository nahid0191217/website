# AirPods Pro 2 — Landing Page (v2)

A modern, self-contained static landing page for a single product, rebuilt from the
previous project with a new design system, new product imagery, and richer interactions.
It lives outside the Next.js app so it can be deployed anywhere static files are served.

## Structure

```
landing/
  index.html            Landing page (hero, ANC demo, showcase, pricing, reviews…)
  checkout.html         Checkout flow (kept from the previous project)
  assets/
    css/style.css       Design system + landing styles (tokens shared with checkout)
    css/checkout.css    Checkout styles (loaded after style.css)
    js/cart.js          localStorage cart store shared by both pages
    js/main.js          Landing interactions
    js/checkout.js      Checkout logic (validation, promo, order sim)
    img/                Product photography (hero, case, detail, lifestyle)
```

## Run locally

Any static server works, for example:

```bash
cd landing
python3 -m http.server 8080
# → http://localhost:8080
```

## Highlights

- **Hero** with gradient headline, 3D-tilt product shot, floating stat badges,
  social proof, and a live offer countdown in the announcement bar.
- **Interactive ANC demo** — canvas waveform + particles reacting to a slider/chips,
  with live dB readout.
- **Product showcase gallery** — 4 switchable views with captions and autoplay.
- **Dynamic pricing** — protection plan, free engraving with live case preview,
  quantity, animated totals, 0% monthly estimate, dynamic delivery date.
- **Cart drawer** — slide-in bag with quantity steppers, free-shipping progress,
  synced through the shared `window.AirPodsCart` store (localStorage).
- **Reviews** — rating summary with distribution bars + auto-advancing carousel.
- **Footer** — social links, contact details, newsletter, payment badges, legal links.
- Fully responsive, keyboard accessible, honors `prefers-reduced-motion`.

## Demo notes

- Checkout is a front-end demo: no payment is taken. Use card
  `4242 4242 4242 4242`, any future expiry, any CVC. Promo code: `QUIET10` (−10%).
- Fan-made concept page — not affiliated with Apple Inc.
