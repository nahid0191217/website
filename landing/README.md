# AirPods Pro 2 — Landing Page + SQLite Admin CMS

A modern single-product storefront with a real **Python + SQLite backend**.
The admin panel can control the website content, product, pricing, inventory,
features, reviews, promo codes, orders, subscribers, carts and commerce
settings. Data is no longer kept only in the browser: it is stored in
`landing/data/site.db`.

## Run locally

```bash
cd landing
python3 server.py
```

Open:

- Store: http://localhost:8080/
- Checkout: http://localhost:8080/checkout
- Admin: http://localhost:8080/admin

Default admin login:

- Username: `admin`
- Password: `admin123`

Change the password after signing in from **Admin → System → Change admin
password**.

The server creates the SQLite database automatically on first run:

```text
landing/data/site.db
```

Optional environment variables:

```bash
PORT=8080 SITE_DB_PATH=/path/to/site.db python3 server.py
```

## What the admin panel controls

- **Overview** — revenue, orders, pending orders, items sold, subscribers,
  active carts, page views, stock, recent orders, quick on/off switches and
  recent admin activity.
- **Website Content** — site/brand name, SEO title/description, accent colour,
  maintenance mode, announcement bar, navigation labels, hero copy/badges,
  section headings, buy-box text, engraving limit, delivery estimate,
  footer/contact/social links, newsletter text, payment labels, legal links,
  checkout messages and section visibility.
- **Product** — product name/subtitle, SKU, slug, selling price, compare-at
  price, protection-plan price/name, stock, inventory tracking, max quantity,
  displayed rating/review count, active state and product images (path/URL or
  upload).
- **Features** — create, edit, reorder, show/hide and delete landing-page
  feature cards, including visual style (EQ, big text, orbit, icon or pills).
- **Reviews** — create, edit, reorder, show/hide and delete customer reviews.
- **Orders** — search/filter, full customer/address/item/totals details,
  status management, internal notes, delete, demo orders and CSV export.
  Cancelling/deleting a non-cancelled order restores stock.
- **Promo Codes** — percentage, fixed-amount and free-shipping codes with
  minimum subtotal, usage limits, expiry and active state. Checkout validates
  codes on the server.
- **Customers** — newsletter subscribers (copy/export/delete) and synced cart
  snapshots (active/converted carts).
- **Commerce** — currency symbol/code, standard/express shipping fees,
  free-shipping threshold, tax percentage, delivery ETA ranges and return days.
- **System** — SQLite file/size/table counts, downloadable `.db` backup, JSON
  export, legacy browser-data import, default-content reset, activity log and
  admin password change.

## How data flows

1. `server.py` serves clean URLs (`/`, `/checkout`, `/admin`) and injects the
   current SQLite site payload into the storefront/checkout HTML.
2. `assets/js/site.js` applies admin-managed settings, product data, feature
   cards and reviews to the page.
3. The cart still gives an instant browser UI, but cart snapshots are also
   synced to SQLite through `/api/cart`.
4. Checkout asks the server to validate promo codes and creates the final
   order through `/api/orders`. The server recalculates prices, shipping, tax
   and totals from SQLite, then decrements stock.
5. Newsletter signups and page views are saved through public API endpoints.
6. Admin API calls require a secure server-side session cookie. Passwords are
   stored as PBKDF2 hashes, never as plain text.

Main SQLite tables: `settings`, `products`, `features`, `reviews`,
`promo_codes`, `orders`, `order_items`, `subscribers`, `carts`, `page_views`,
`admin_users`, `sessions`, `activity_logs` and `media_uploads`.

Uploaded product images are saved under `assets/img/uploads/` and their paths
are recorded in SQLite.

### Old demo data

If the previous localStorage demo has orders/subscribers/settings in the same
browser, the admin panel imports them into SQLite automatically once after
login. You can also run the import manually from **System → Data tools**.

## Project structure

```text
landing/
  index.html             Landing page
  checkout.html          Checkout
  admin.html             SQLite admin CMS
  server.py              Static server + SQLite API + clean URLs
  data/site.db           SQLite database (created at runtime, not committed)
  assets/
    css/style.css        Store design system
    css/checkout.css     Checkout styles
    css/admin.css        Admin styles
    js/cart.js           Cart UI store + SQLite cart sync
    js/site.js           Applies SQLite content to storefront/checkout
    js/main.js           Landing interactions and dynamic pricing
    js/checkout.js       Checkout, server promo validation and order creation
    js/admin.js          Admin CMS logic
    img/                 Product images and admin uploads
```

## Production notes

- This is still a payment demo: card fields are validated in the browser, but
  no payment gateway charges a card. Connect Stripe/SSLCommerz/bKash/another
  gateway before taking real payments.
- Deploy on a Python-capable host with a persistent disk (a VPS, Render,
  Railway, Fly.io, etc.) and run `python3 server.py`. A purely static host
  cannot run the SQLite API.
- Use HTTPS in production, change the default admin password, and back up
  `data/site.db` regularly (Admin → System → Download DB backup).
- To start with a fresh database, stop the server and delete
  `data/site.db`; the next run recreates and reseeds it. This deletes orders
  and customers, so back up first.

Demo checkout card: `4242 4242 4242 4242`, any future expiry, any CVC.
Default promo codes: `QUIET10` and `FREESHIP` (editable in Admin → Promo Codes).

Fan-made concept page — not affiliated with Apple Inc.
