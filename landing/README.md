# AirPods Pro 2 — Landing Page + Admin Panel (v3)

A modern, self-contained static storefront for a single product, with a clean
**white (light) Apple-style theme** and a front-end **admin panel**. It lives
outside the Next.js app so it can be deployed anywhere static files are served.

## Structure

```
landing/
  index.html            Landing page (hero, features, pricing, reviews…)
  checkout.html         Checkout flow
  admin.html            Admin panel (orders, pricing settings, subscribers)
  assets/
    css/style.css       Light-theme design system + landing styles (tokens shared)
    css/checkout.css    Checkout styles (loaded after style.css)
    css/admin.css       Admin panel styles (loaded after style.css)
    js/cart.js          localStorage cart store shared by storefront pages
    js/main.js          Landing interactions (reads admin settings)
    js/checkout.js      Checkout logic (saves orders for the admin panel)
    js/admin.js         Admin panel logic
    img/                Product photography (bright studio + Dhaka lifestyle)
```

## Run locally

```bash
cd landing
python3 -m http.server 8080
# Store:     http://localhost:8080
# Checkout:  http://localhost:8080/checkout.html
# Admin:     http://localhost:8080/admin.html   (password: admin123)
```

## Admin panel

Open `admin.html` (also linked as “Admin” in the store footer) and sign in with
the demo password **`admin123`**. You can:

- **Orders** — every order placed at checkout appears here automatically.
  Search/filter, view full details, change status
  (Pending → Confirmed → Shipped → Delivered / Cancelled), delete orders,
  load demo orders, and export everything as CSV.
- **Product & Pricing** — change the product name, selling price, compare-at
  price and AppleCare+ price. The storefront picks the new values up on the
  next page load (hero/CTA labels, “Save $X” offer, buy panel — everywhere).
- **Subscribers** — emails from the footer “Hear it first” form, with
  copy-all and CSV export.

Data is stored in the browser (`localStorage`), because this is a static-site
demo: orders/settings/subscribers live on the current device/browser only.
For a real store, point the same screens at a backend (Firebase/Supabase/API).

## Highlights

- **White, Apple-style design** — blue primary buttons, pastel aurora glows,
  glass chips, bright studio product photography.
- **Hero** with gradient headline, 3D-tilt product shot, floating stat badges,
  social proof, and a live offer countdown.
- **Product showcase** — bright studio photography across the hero and buy sections.
- **Dynamic pricing** — protection plan, free engraving with live case preview,
  quantity, animated totals, 0% monthly estimate, dynamic delivery date.
- **Cart drawer** — slide-in bag with quantity steppers and a free-shipping
  progress bar, synced through the shared `window.AirPodsCart` store.
- **Reviews** — rating summary with distribution bars + auto-advancing carousel.
- Fully responsive, keyboard accessible, honors `prefers-reduced-motion`.

## Demo notes

- Checkout is a front-end demo: no payment is taken. Use card
  `4242 4242 4242 4242`, any future expiry, any CVC. Promo code: `QUIET10` (−10%).
- Admin password is a demo gate only (`admin123`, checked client-side) — never
  use this pattern for real credentials.
- Fan-made concept page — not affiliated with Apple Inc.
