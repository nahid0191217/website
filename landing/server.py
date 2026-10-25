"""AirPods Pro 2 store server — static site + SQLite API.

Run from this folder:
    python3 server.py

Then open:
    Store:    http://localhost:8080/
    Checkout: http://localhost:8080/checkout
    Admin:    http://localhost:8080/admin

All editable website content, product/pricing, orders, subscribers, carts,
promo codes and admin settings are stored in landing/data/site.db (SQLite).
Default admin login: username `admin`, password `admin123`.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse, urlunparse

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))
DB_PATH = Path(os.environ.get("SITE_DB_PATH", ROOT / "data" / "site.db")).expanduser()
if not DB_PATH.is_absolute():
    DB_PATH = (ROOT / DB_PATH).resolve()
UPLOAD_DIR = ROOT / "assets" / "img" / "uploads"
SESSION_COOKIE = "ap2_admin_session"
MAX_JSON_BYTES = 6 * 1024 * 1024
MAX_UPLOAD_BYTES = 3 * 1024 * 1024
ORDER_STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"]
LOGIN_ATTEMPTS: dict[str, list[float]] = {}

# ---------------------------------------------------------------------------
# Defaults / seed content
# ---------------------------------------------------------------------------

DEFAULT_SETTINGS = {
    # General / SEO / theme
    "site_name": "AirPods Pro 2 Store",
    "brand_name": "AirPods Pro",
    "page_title": "AirPods Pro 2 — Silence the world. Hear every detail.",
    "meta_description": "AirPods Pro (2nd generation) with up to 2× more Active Noise Cancellation, Adaptive Audio, Personalised Spatial Audio and a USB-C charging case. Free engraving, free delivery, 14-day returns.",
    "accent_color": "#0071e3",
    "currency_symbol": "$",
    "currency_code": "USD",
    "store_open": True,
    "maintenance_message": "The store is temporarily closed for maintenance. Please check back soon.",
    "track_page_views": True,
    # Announcement + navigation
    "show_announcement": True,
    "announcement_tag": "Launch offer",
    "announcement_text": "Save {save} + free engraving",
    "announcement_link_text": "Shop now",
    "announcement_link": "#buy",
    "countdown_enabled": True,
    "nav_features_label": "Features",
    "nav_reviews_label": "Reviews",
    "nav_buy_label": "Buy",
    # Hero
    "hero_eyebrow": "AirPods Pro · 2nd generation",
    "hero_title_1": "Silence the world.",
    "hero_title_2": "Hear every detail.",
    "hero_subtitle": "Up to 2× more Active Noise Cancellation. Adaptive Audio that reads the room. Personalised Spatial Audio that puts you inside it. Now with USB‑C.",
    "hero_cta_text": "Buy from {price}",
    "hero_badge_1_value": "−48",
    "hero_badge_1_unit": "dB",
    "hero_badge_1_label": "ambient noise cancelled",
    "hero_badge_2_value": "30",
    "hero_badge_2_unit": "h",
    "hero_badge_2_label": "with charging case",
    "hero_meta_1": "Free engraving",
    "hero_meta_2": "Free express delivery",
    "hero_meta_3": "14-day free returns",
    # Features / reviews headings
    "show_features": True,
    "features_eyebrow": "Engineering",
    "features_title": "Small. And impossibly smart.",
    "features_subtitle": "An H2 chip, custom amplifiers and a new low‑distortion driver work together in a space smaller than your fingertip.",
    "show_reviews": True,
    "reviews_eyebrow": "Loved by {count} people",
    "reviews_title": "Quietly a cult classic.",
    "rating_5_percent": 89,
    "rating_4_percent": 8,
    "rating_3_percent": 2,
    "rating_2_percent": 1,
    "rating_1_percent": 0,
    "review_tags": "“Silence” · 3,102 | “Battery” · 2,240 | “Comfort” · 1,918 | “Bass” · 1,402",
    # Buy section
    "buy_eyebrow": "Buy",
    "buy_finish_text": "White · the only finish it needs",
    "stock_in_text": "In stock — ships today from Dhaka",
    "stock_low_text": "Low stock — order soon",
    "stock_out_text": "Out of stock",
    "low_stock_threshold": 5,
    "protection_title": "Protection plan",
    "standard_plan_name": "Standard",
    "standard_plan_description": "USB‑C case included",
    "care_badge": "Popular",
    "engraving_enabled": True,
    "engraving_title": "Engraving",
    "engraving_max_length": 14,
    "add_to_bag_text": "Add to Bag",
    "buy_now_text": "Buy it now",
    "delivery_cutoff_hour": 16,
    "delivery_business_days": 2,
    "assurance_1": "1-year warranty",
    "assurance_2": "14-day returns",
    "assurance_3": "Secure checkout",
    "buy_fineprint": "Free delivery · Free returns within 14 days · Engraved items are final sale",
    # Commerce
    "standard_shipping_fee": 0,
    "express_shipping_fee": 12,
    "free_shipping_threshold": 200,
    "tax_percent": 0,
    "standard_eta_min_days": 4,
    "standard_eta_max_days": 6,
    "express_eta_min_days": 1,
    "express_eta_max_days": 2,
    "return_days": 14,
    # Footer / contact / legal
    "footer_tagline": "Sound that gets out of the way.",
    "support_email": "support@airpodspro.example",
    "support_phone": "+880 1700-000000",
    "support_address": "Level 8, Gulshan Avenue,\nDhaka 1212, Bangladesh",
    "support_hours": "Sat–Thu, 9 am – 8 pm (GMT+6)",
    "social_x_url": "https://x.com",
    "social_instagram_url": "https://instagram.com",
    "social_youtube_url": "https://youtube.com",
    "social_tiktok_url": "https://tiktok.com",
    "show_newsletter": True,
    "newsletter_title": "Hear it first",
    "newsletter_text": "Product news, quietly. No spam, ever.",
    "payments_text": "VISA, Mastercard, bKash, Nagad, Apple Pay",
    "legal_note": "AirPods Pro concept landing page. A fan‑made design demo — not affiliated with Apple Inc. AirPods, AirPods Pro and AppleCare+ are trademarks of Apple Inc.",
    "privacy_url": "#",
    "terms_url": "#",
    "shipping_policy_url": "#buy",
    "accessibility_url": "#",
    "show_sticky_buy": True,
    # Checkout
    "checkout_note": "Demo checkout. No payment is taken and nothing ships. Use card 4242 4242 4242 4242 with any future expiry and any CVC.",
    "checkout_help_text": "Your details are encrypted and never shared. This is a design demo — no real payment is processed.",
}

DEFAULT_PRODUCT = {
    "name": "AirPods Pro 2",
    "subtitle": "(2nd gen)",
    "sku": "AP2-USBC-WHT",
    "slug": "airpods-pro-2",
    "price": 249,
    "compare_at_price": 279,
    "care_price": 49,
    "care_name": "AppleCare+",
    "care_description": "2 yrs cover",
    "stock": 48,
    "track_inventory": 1,
    "max_qty": 5,
    "rating": 4.9,
    "review_count": 12480,
    "hero_image": "assets/img/hero-buds.jpg",
    "image": "assets/img/case.jpg",
    "description": DEFAULT_SETTINGS["meta_description"],
    "active": 1,
}

DEFAULT_FEATURES = [
    {"title": "Adaptive Audio", "description": "Blends Transparency and Noise Cancellation in real time, so you hear your surroundings when you should — and ignore them when you shouldn’t.", "tag": "H2 chip inside", "visual_type": "eq", "visual_text": "", "size": "large", "sort_order": 1, "active": 1},
    {"title": "Active Noise Cancellation", "description": "Twice the cancellation, tuned to the unique shape of your ear.", "tag": "", "visual_type": "big", "visual_text": "2×", "size": "normal", "sort_order": 2, "active": 1},
    {"title": "Personalised Spatial Audio", "description": "Dynamic head tracking keeps the stage fixed around you — in a cinema, on the train, anywhere.", "tag": "", "visual_type": "orbit", "visual_text": "", "size": "normal", "sort_order": 3, "active": 1},
    {"title": "Up to 6 hours per charge", "description": "Six hours of listening. Thirty with the case. Five minutes gets you an hour.", "tag": "", "visual_type": "big", "visual_text": "6h", "size": "normal", "sort_order": 4, "active": 1},
    {"title": "IP54 protection", "description": "Dust, sweat and water resistant. Built for rain runs and everything after.", "tag": "", "visual_type": "icon", "visual_text": "", "size": "normal", "sort_order": 5, "active": 1},
    {"title": "Charge any way you like", "description": "One cable for everything you own. And if the case goes missing, Find My can make it play a sound.", "tag": "Charging case", "visual_type": "pills", "visual_text": "USB-C, MagSafe, Qi, Apple Watch, Find My", "size": "large", "sort_order": 6, "active": 1},
]

DEFAULT_REVIEWS = [
    {"author": "Mahin K.", "location": "Dhaka", "rating": 5, "body": "The noise cancellation on my commute is genuinely the difference between arriving at work wound up and arriving calm.", "date_label": "2 weeks ago", "color": "#4ad9ff", "verified": 1, "sort_order": 1, "active": 1},
    {"author": "Sara L.", "location": "Chittagong", "rating": 5, "body": "Adaptive Audio is the feature I didn’t know I needed. It fades the traffic out but keeps the announcement at the gate.", "date_label": "1 month ago", "color": "#8b7bff", "verified": 1, "sort_order": 2, "active": 1},
    {"author": "Arif R.", "location": "Sylhet", "rating": 4, "body": "Spatial Audio with head tracking made me re‑listen to my whole library. The case speaker has already saved me twice.", "date_label": "1 month ago", "color": "#ff9d6c", "verified": 1, "sort_order": 3, "active": 1},
    {"author": "Nusrat T.", "location": "Dhaka", "rating": 5, "body": "Four hours in a library, no pressure, no ache. Just swapped to the small tips and forgot they were there.", "date_label": "2 months ago", "color": "#b6ff6a", "verified": 1, "sort_order": 4, "active": 1},
    {"author": "Farhan H.", "location": "Dhaka", "rating": 5, "body": "Bought a second pair for my wife within a week. Calls are crystal clear even on a rickshaw in Mirpur traffic.", "date_label": "3 months ago", "color": "#ff6ca8", "verified": 1, "sort_order": 5, "active": 1},
]

DEFAULT_PROMOS = [
    {"code": "QUIET10", "type": "percent", "value": 10, "min_subtotal": 0, "max_uses": 0, "expires_at": "", "active": 1},
    {"code": "FREESHIP", "type": "shipping", "value": 0, "min_subtotal": 0, "max_uses": 0, "expires_at": "", "active": 1},
]


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_text(value, max_len=1000, *, allow_newlines=True) -> str:
    text = "" if value is None else str(value)
    if not allow_newlines:
        text = " ".join(text.split())
    return text.strip()[:max_len]


def as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def as_number(value, fallback=0, *, integer=False, minimum=None, maximum=None):
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = float(fallback)
    if minimum is not None:
        n = max(float(minimum), n)
    if maximum is not None:
        n = min(float(maximum), n)
    return int(round(n)) if integer else round(n, 2)


def money_round(value) -> float:
    return round(float(value or 0) + 1e-9, 2)


def valid_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", value or ""))


def hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 260_000)
    return digest.hex(), salt.hex()


def verify_password(password: str, expected_hash: str, salt_hex: str) -> bool:
    actual, _ = hash_password(password, salt_hex)
    return hmac.compare_digest(actual, expected_hash)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  price REAL NOT NULL,
  compare_at_price REAL NOT NULL DEFAULT 0,
  care_price REAL NOT NULL DEFAULT 0,
  care_name TEXT NOT NULL DEFAULT 'AppleCare+',
  care_description TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  track_inventory INTEGER NOT NULL DEFAULT 1,
  max_qty INTEGER NOT NULL DEFAULT 5,
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  hero_image TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  visual_type TEXT NOT NULL DEFAULT 'big',
  visual_text TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT 'normal',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  author TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  body TEXT NOT NULL,
  date_label TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#0071e3',
  verified INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'percent',
  value REAL NOT NULL DEFAULT 0,
  min_subtotal REAL NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  cart_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address1 TEXT NOT NULL DEFAULT '',
  address2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  promo_code TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  payment_label TEXT NOT NULL DEFAULT '',
  shipping_method TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  care INTEGER NOT NULL DEFAULT 0,
  engraving TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'subscribed',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS carts (
  cart_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL DEFAULT '[]',
  item_count INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  converted_order_no TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY,
  admin_username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_uploads (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_features_sort ON features(sort_order, id);
CREATE INDEX IF NOT EXISTS idx_reviews_sort ON reviews(sort_order, id);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
"""


def seed_defaults(conn: sqlite3.Connection, *, force: bool = False) -> None:
    ts = now_iso()
    if force:
        conn.execute("DELETE FROM settings")
        conn.execute("DELETE FROM features")
        conn.execute("DELETE FROM reviews")
        conn.execute("DELETE FROM promo_codes")
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES (?, ?, ?)",
            (key, json.dumps(value, ensure_ascii=False), ts),
        )
    if not conn.execute("SELECT 1 FROM products WHERE id = 1").fetchone() or force:
        p = DEFAULT_PRODUCT
        conn.execute(
            """INSERT OR REPLACE INTO products
               (id,name,subtitle,sku,slug,price,compare_at_price,care_price,care_name,
                care_description,stock,track_inventory,max_qty,rating,review_count,
                hero_image,image,description,active,updated_at)
               VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (p["name"], p["subtitle"], p["sku"], p["slug"], p["price"], p["compare_at_price"],
             p["care_price"], p["care_name"], p["care_description"], p["stock"],
             p["track_inventory"], p["max_qty"], p["rating"], p["review_count"],
             p["hero_image"], p["image"], p["description"], p["active"], ts),
        )
    if force or not conn.execute("SELECT 1 FROM features LIMIT 1").fetchone():
        for f in DEFAULT_FEATURES:
            conn.execute(
                """INSERT INTO features(title,description,tag,visual_type,visual_text,size,
                   sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (f["title"], f["description"], f["tag"], f["visual_type"], f["visual_text"],
                 f["size"], f["sort_order"], f["active"], ts, ts),
            )
    if force or not conn.execute("SELECT 1 FROM reviews LIMIT 1").fetchone():
        for r in DEFAULT_REVIEWS:
            conn.execute(
                """INSERT INTO reviews(author,location,rating,body,date_label,color,verified,
                   sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (r["author"], r["location"], r["rating"], r["body"], r["date_label"], r["color"],
                 r["verified"], r["sort_order"], r["active"], ts, ts),
            )
    if force or not conn.execute("SELECT 1 FROM promo_codes LIMIT 1").fetchone():
        for p in DEFAULT_PROMOS:
            conn.execute(
                """INSERT INTO promo_codes(code,type,value,min_subtotal,max_uses,expires_at,active,
                   created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)""",
                (p["code"], p["type"], p["value"], p["min_subtotal"], p["max_uses"],
                 p["expires_at"], p["active"], ts, ts),
            )
    if not conn.execute("SELECT 1 FROM admin_users WHERE username = 'admin'").fetchone():
        pwd_hash, salt = hash_password("admin123")
        conn.execute(
            "INSERT INTO admin_users(username,password_hash,salt,created_at,updated_at) VALUES (?,?,?,?,?)",
            ("admin", pwd_hash, salt, ts, ts),
        )


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)
        seed_defaults(conn)


# ---------------------------------------------------------------------------
# Data access / serialisation
# ---------------------------------------------------------------------------

def get_settings(conn: sqlite3.Connection) -> dict:
    settings = dict(DEFAULT_SETTINGS)
    for row in conn.execute("SELECT key, value FROM settings").fetchall():
        try:
            settings[row["key"]] = json.loads(row["value"])
        except json.JSONDecodeError:
            settings[row["key"]] = row["value"]
    return settings


def rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


def get_product(conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT * FROM products ORDER BY id LIMIT 1").fetchone()
    if not row:
        seed_defaults(conn)
        row = conn.execute("SELECT * FROM products ORDER BY id LIMIT 1").fetchone()
    p = dict(row)
    for key in ("track_inventory", "active"):
        p[key] = bool(p.get(key))
    return p


def list_features(conn: sqlite3.Connection, *, active_only=False) -> list[dict]:
    sql = "SELECT * FROM features"
    if active_only:
        sql += " WHERE active = 1"
    sql += " ORDER BY sort_order, id"
    out = rows_to_dicts(conn.execute(sql).fetchall())
    for item in out:
        item["active"] = bool(item["active"])
    return out


def list_reviews(conn: sqlite3.Connection, *, active_only=False) -> list[dict]:
    sql = "SELECT * FROM reviews"
    if active_only:
        sql += " WHERE active = 1"
    sql += " ORDER BY sort_order, id"
    out = rows_to_dicts(conn.execute(sql).fetchall())
    for item in out:
        item["verified"] = bool(item["verified"])
        item["active"] = bool(item["active"])
    return out


def list_promos(conn: sqlite3.Connection) -> list[dict]:
    out = rows_to_dicts(conn.execute("SELECT * FROM promo_codes ORDER BY code").fetchall())
    for item in out:
        item["active"] = bool(item["active"])
    return out


def order_to_dict(row: sqlite3.Row) -> dict:
    order = dict(row)
    try:
        order["items"] = json.loads(order.pop("items_json") or "[]")
    except json.JSONDecodeError:
        order["items"] = []
    order["demo"] = bool(order.get("demo"))
    address_parts = [order.get("address1"), order.get("address2"), order.get("city"),
                     order.get("region"), order.get("postcode"), order.get("country")]
    order["address"] = ", ".join(str(x) for x in address_parts if x)
    order["customer"] = order.get("customer_name", "")
    order["date"] = order.get("created_at", "")
    order["promo"] = order.get("promo_code", "")
    order["payment"] = order.get("payment_label") or order.get("payment_method", "")
    order["shippingMethod"] = order.get("shipping_method", "standard")
    return order


def list_orders(conn: sqlite3.Connection, *, query="", status="", limit=500) -> list[dict]:
    clauses = []
    params: list = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if query:
        clauses.append("(order_no LIKE ? OR customer_name LIKE ? OR email LIKE ? OR phone LIKE ?)")
        like = f"%{query}%"
        params.extend([like, like, like, like])
    sql = "SELECT * FROM orders"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(int(limit))
    return [order_to_dict(r) for r in conn.execute(sql, params).fetchall()]


def site_payload(conn: sqlite3.Connection) -> dict:
    return {
        "settings": get_settings(conn),
        "product": get_product(conn),
        "features": list_features(conn, active_only=True),
        "reviews": list_reviews(conn, active_only=True),
        "generated_at": now_iso(),
    }


def dashboard_stats(conn: sqlite3.Connection) -> dict:
    def one(sql, params=()):
        row = conn.execute(sql, params).fetchone()
        return row[0] if row and row[0] is not None else 0

    product = get_product(conn)
    today = datetime.now(timezone.utc).date().isoformat()
    return {
        "revenue": money_round(one("SELECT COALESCE(SUM(total),0) FROM orders WHERE status != 'Cancelled'")),
        "orders": int(one("SELECT COUNT(*) FROM orders")),
        "pending_orders": int(one("SELECT COUNT(*) FROM orders WHERE status = 'Pending'")),
        "items_sold": int(one("""SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi
                                  JOIN orders o ON o.id = oi.order_id WHERE o.status != 'Cancelled'""")),
        "subscribers": int(one("SELECT COUNT(*) FROM subscribers")),
        "active_carts": int(one("SELECT COUNT(*) FROM carts WHERE status = 'active' AND item_count > 0")),
        "page_views": int(one("SELECT COUNT(*) FROM page_views")),
        "page_views_today": int(one("SELECT COUNT(*) FROM page_views WHERE substr(created_at,1,10) = ?", (today,))),
        "product_stock": int(product.get("stock") or 0),
        "promo_codes": int(one("SELECT COUNT(*) FROM promo_codes WHERE active = 1")),
        "reviews": int(one("SELECT COUNT(*) FROM reviews")),
        "features": int(one("SELECT COUNT(*) FROM features")),
    }


def system_info(conn: sqlite3.Connection) -> dict:
    tables = ["settings", "products", "features", "reviews", "promo_codes", "orders",
              "order_items", "subscribers", "carts", "page_views", "activity_logs", "media_uploads"]
    counts = {}
    for table in tables:
        counts[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    try:
        relative_db = str(DB_PATH.relative_to(ROOT))
    except ValueError:
        relative_db = str(DB_PATH)
    return {
        "database": relative_db,
        "database_size_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        "table_counts": counts,
        "server_time": now_iso(),
        "sqlite_version": sqlite3.sqlite_version,
    }


def log_activity(conn: sqlite3.Connection, username: str, action: str, details: str = "") -> None:
    conn.execute(
        "INSERT INTO activity_logs(admin_username,action,details,created_at) VALUES (?,?,?,?)",
        (username or "admin", action[:120], details[:500], now_iso()),
    )


# ---------------------------------------------------------------------------
# Commerce calculations
# ---------------------------------------------------------------------------

def normalize_items(conn: sqlite3.Connection, raw_items, *, check_stock=False) -> tuple[list[dict], float, int]:
    product = get_product(conn)
    settings = get_settings(conn)
    if not isinstance(raw_items, list) or not raw_items:
        raise ApiError("Your bag is empty.")
    if not product.get("active"):
        raise ApiError("This product is currently unavailable.", 409)
    max_qty = max(1, int(product.get("max_qty") or 5))
    engraving_max = int(settings.get("engraving_max_length") or 14)
    items = []
    total_qty = 0
    subtotal = 0.0
    for raw in raw_items[:20]:
        if not isinstance(raw, dict):
            continue
        qty = as_number(raw.get("qty"), 1, integer=True, minimum=1, maximum=max_qty)
        care = as_bool(raw.get("care"))
        engraving = clean_text(raw.get("engraving"), engraving_max, allow_newlines=False)
        if engraving and not as_bool(settings.get("engraving_enabled", True)):
            engraving = ""
        unit = money_round(float(product["price"]) + (float(product["care_price"]) if care else 0))
        line_total = money_round(unit * qty)
        items.append({
            "id": product["slug"],
            "product_slug": product["slug"],
            "name": product["name"],
            "qty": int(qty),
            "price": unit,
            "unit_price": unit,
            "line_total": line_total,
            "care": care,
            "engraving": engraving,
        })
        total_qty += int(qty)
        subtotal += line_total
    if not items:
        raise ApiError("Your bag is empty.")
    if check_stock and product.get("track_inventory") and total_qty > int(product.get("stock") or 0):
        raise ApiError("Sorry — there is not enough stock for this order.", 409)
    return items, money_round(subtotal), total_qty


def find_promo(conn: sqlite3.Connection, code: str) -> dict | None:
    clean = clean_text(code, 40, allow_newlines=False).upper()
    if not clean:
        return None
    row = conn.execute("SELECT * FROM promo_codes WHERE upper(code) = ?", (clean,)).fetchone()
    return dict(row) if row else None


def calculate_totals(conn: sqlite3.Connection, raw_items, shipping_method="standard", promo_code="", *, check_stock=False) -> dict:
    settings = get_settings(conn)
    if not as_bool(settings.get("store_open", True)):
        raise ApiError(clean_text(settings.get("maintenance_message"), 300) or "The store is temporarily closed.", 503)
    items, subtotal, total_qty = normalize_items(conn, raw_items, check_stock=check_stock)
    method = "express" if shipping_method == "express" else "standard"
    shipping = money_round(settings.get("express_shipping_fee" if method == "express" else "standard_shipping_fee", 0))
    threshold = money_round(settings.get("free_shipping_threshold", 0))
    if threshold > 0 and subtotal >= threshold:
        shipping = 0.0
    discount = 0.0
    promo_obj = None
    clean_code = clean_text(promo_code, 40, allow_newlines=False).upper()
    if clean_code:
        promo = find_promo(conn, clean_code)
        if not promo or not promo.get("active"):
            raise ApiError(f"“{clean_code}” isn’t a valid promo code.")
        if promo.get("expires_at"):
            try:
                exp = datetime.fromisoformat(str(promo["expires_at"]).replace("Z", "+00:00"))
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp < datetime.now(timezone.utc):
                    raise ApiError("That promo code has expired.")
            except ValueError:
                pass
        if subtotal < float(promo.get("min_subtotal") or 0):
            raise ApiError("Your subtotal is below this promo code’s minimum.")
        if int(promo.get("max_uses") or 0) > 0 and int(promo.get("used_count") or 0) >= int(promo["max_uses"]):
            raise ApiError("That promo code has reached its usage limit.")
        ptype = str(promo.get("type") or "percent")
        pvalue = float(promo.get("value") or 0)
        if ptype == "percent":
            discount = money_round(subtotal * min(max(pvalue, 0), 100) / 100)
            label = f"{clean_code} · {pvalue:g}% off"
        elif ptype == "fixed":
            discount = money_round(min(subtotal, max(pvalue, 0)))
            label = f"{clean_code} · discount applied"
        elif ptype == "shipping":
            shipping = 0.0
            label = f"{clean_code} · free delivery"
        else:
            raise ApiError("That promo code type is not supported.")
        promo_obj = {"code": clean_code, "type": ptype, "value": pvalue, "label": label,
                     "min_subtotal": float(promo.get("min_subtotal") or 0)}
    taxable = max(0.0, subtotal - discount)
    tax = money_round(taxable * float(settings.get("tax_percent") or 0) / 100)
    total = money_round(taxable + shipping + tax)
    return {
        "items": items,
        "item_count": total_qty,
        "subtotal": money_round(subtotal),
        "discount": money_round(discount),
        "shipping": money_round(shipping),
        "tax": tax,
        "total": total,
        "shipping_method": method,
        "promo": promo_obj,
    }


# ---------------------------------------------------------------------------
# Validation for admin saves
# ---------------------------------------------------------------------------

def validate_settings_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ApiError("Settings must be an object.")
    updates = {}
    for key, value in payload.items():
        if key not in DEFAULT_SETTINGS:
            continue
        default = DEFAULT_SETTINGS[key]
        if isinstance(default, bool):
            updates[key] = as_bool(value)
        elif isinstance(default, int):
            maximum = 100000
            if key.startswith("rating_") or key == "tax_percent":
                maximum = 100
            elif key == "delivery_cutoff_hour":
                maximum = 23
            elif key in {"engraving_max_length"}:
                maximum = 40
            elif "eta" in key or key in {"delivery_business_days", "return_days", "low_stock_threshold"}:
                maximum = 365
            updates[key] = as_number(value, default, integer=True, minimum=0, maximum=maximum)
        elif isinstance(default, float):
            updates[key] = as_number(value, default, minimum=0, maximum=100000)
        else:
            text = clean_text(value, 5000)
            if key == "accent_color" and not re.fullmatch(r"#[0-9a-fA-F]{6}", text):
                raise ApiError("Accent colour must be a 6-digit hex colour, e.g. #0071e3.")
            if key == "currency_symbol":
                text = text[:4] or "$"
            if key == "currency_code":
                text = re.sub(r"[^A-Za-z]", "", text).upper()[:6] or "USD"
            updates[key] = text
    # Fill numeric defaults that were seeded as ints but might be submitted as decimals.
    for key in ("standard_shipping_fee", "express_shipping_fee", "free_shipping_threshold", "tax_percent"):
        if key in payload:
            updates[key] = as_number(payload[key], DEFAULT_SETTINGS[key], minimum=0, maximum=100000)
    return updates


def validate_product_payload(payload: dict, current: dict) -> dict:
    if not isinstance(payload, dict):
        raise ApiError("Product data must be an object.")
    data = dict(current)
    text_fields = {
        "name": 120, "subtitle": 120, "sku": 80, "care_name": 80,
        "care_description": 200, "hero_image": 1000, "image": 1000, "description": 5000,
    }
    for field, max_len in text_fields.items():
        if field in payload:
            data[field] = clean_text(payload[field], max_len)
    if "slug" in payload:
        slug = re.sub(r"[^a-z0-9-]+", "-", clean_text(payload["slug"], 100).lower()).strip("-")
        data["slug"] = slug or "airpods-pro-2"
    if "price" in payload:
        data["price"] = as_number(payload["price"], current["price"], minimum=0.01, maximum=1000000)
    if "compare_at_price" in payload:
        data["compare_at_price"] = as_number(payload["compare_at_price"], 0, minimum=0, maximum=1000000)
    if "care_price" in payload:
        data["care_price"] = as_number(payload["care_price"], 0, minimum=0, maximum=1000000)
    if "stock" in payload:
        data["stock"] = as_number(payload["stock"], 0, integer=True, minimum=0, maximum=1000000)
    if "max_qty" in payload:
        data["max_qty"] = as_number(payload["max_qty"], 5, integer=True, minimum=1, maximum=99)
    if "rating" in payload:
        data["rating"] = as_number(payload["rating"], 0, minimum=0, maximum=5)
    if "review_count" in payload:
        data["review_count"] = as_number(payload["review_count"], 0, integer=True, minimum=0, maximum=100000000)
    if "track_inventory" in payload:
        data["track_inventory"] = 1 if as_bool(payload["track_inventory"]) else 0
    if "active" in payload:
        data["active"] = 1 if as_bool(payload["active"]) else 0
    if not data["name"]:
        raise ApiError("Product name is required.")
    if float(data["compare_at_price"]) and float(data["compare_at_price"]) < float(data["price"]):
        data["compare_at_price"] = data["price"]
    return data


def validate_feature_payload(payload: dict, current: dict | None = None) -> dict:
    data = dict(current or {})
    data.update({
        "title": clean_text(payload.get("title", data.get("title", "")), 160, allow_newlines=False),
        "description": clean_text(payload.get("description", data.get("description", "")), 1200),
        "tag": clean_text(payload.get("tag", data.get("tag", "")), 100, allow_newlines=False),
        "visual_type": clean_text(payload.get("visual_type", data.get("visual_type", "big")), 30, allow_newlines=False),
        "visual_text": clean_text(payload.get("visual_text", data.get("visual_text", "")), 500),
        "size": "large" if payload.get("size", data.get("size")) == "large" else "normal",
        "sort_order": as_number(payload.get("sort_order", data.get("sort_order", 0)), 0, integer=True, minimum=-9999, maximum=9999),
        "active": 1 if as_bool(payload.get("active", data.get("active", True))) else 0,
    })
    if data["visual_type"] not in {"eq", "big", "orbit", "icon", "pills"}:
        data["visual_type"] = "big"
    if not data["title"]:
        raise ApiError("Feature title is required.")
    return data


def validate_review_payload(payload: dict, current: dict | None = None) -> dict:
    data = dict(current or {})
    color = clean_text(payload.get("color", data.get("color", "#0071e3")), 20, allow_newlines=False)
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#0071e3"
    data.update({
        "author": clean_text(payload.get("author", data.get("author", "")), 100, allow_newlines=False),
        "location": clean_text(payload.get("location", data.get("location", "")), 100, allow_newlines=False),
        "rating": as_number(payload.get("rating", data.get("rating", 5)), 5, integer=True, minimum=1, maximum=5),
        "body": clean_text(payload.get("body", data.get("body", "")), 2000),
        "date_label": clean_text(payload.get("date_label", data.get("date_label", "")), 80, allow_newlines=False),
        "color": color,
        "verified": 1 if as_bool(payload.get("verified", data.get("verified", True))) else 0,
        "sort_order": as_number(payload.get("sort_order", data.get("sort_order", 0)), 0, integer=True, minimum=-9999, maximum=9999),
        "active": 1 if as_bool(payload.get("active", data.get("active", True))) else 0,
    })
    if not data["author"] or not data["body"]:
        raise ApiError("Review author and text are required.")
    return data


def validate_promo_payload(payload: dict, current: dict | None = None) -> dict:
    data = dict(current or {})
    code = re.sub(r"[^A-Z0-9_-]+", "", clean_text(payload.get("code", data.get("code", "")), 40, allow_newlines=False).upper())
    ptype = clean_text(payload.get("type", data.get("type", "percent")), 20, allow_newlines=False)
    if ptype not in {"percent", "fixed", "shipping"}:
        ptype = "percent"
    data.update({
        "code": code,
        "type": ptype,
        "value": as_number(payload.get("value", data.get("value", 0)), 0, minimum=0, maximum=100000),
        "min_subtotal": as_number(payload.get("min_subtotal", data.get("min_subtotal", 0)), 0, minimum=0, maximum=1000000),
        "max_uses": as_number(payload.get("max_uses", data.get("max_uses", 0)), 0, integer=True, minimum=0, maximum=1000000),
        "expires_at": clean_text(payload.get("expires_at", data.get("expires_at", "")), 40, allow_newlines=False),
        "active": 1 if as_bool(payload.get("active", data.get("active", True))) else 0,
    })
    if not code:
        raise ApiError("Promo code is required.")
    if ptype == "percent":
        data["value"] = min(100, data["value"])
    return data


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class StoreHandler(SimpleHTTPRequestHandler):
    server_version = "AirPodsStore/2.0"
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ---------- generic response helpers ----------
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def send_json(self, data, status=200, *, headers=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error_json(self, message: str, status=400):
        self.send_json({"ok": False, "error": message}, status=status)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_JSON_BYTES:
            raise ApiError("Request body is too large.", 413)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ApiError("Invalid JSON request.") from exc
        if not isinstance(data, dict):
            raise ApiError("JSON request must be an object.")
        return data

    def cookie_value(self, name: str) -> str:
        raw = self.headers.get("Cookie", "")
        if not raw:
            return ""
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:
            return ""
        morsel = cookie.get(name)
        return morsel.value if morsel else ""

    def current_admin(self, conn: sqlite3.Connection) -> dict | None:
        token = self.cookie_value(SESSION_COOKIE)
        if not token:
            return None
        row = conn.execute(
            """SELECT u.id, u.username FROM sessions s JOIN admin_users u ON u.id = s.admin_id
               WHERE s.token_hash = ? AND s.expires_at > ?""",
            (token_hash(token), now_iso()),
        ).fetchone()
        return dict(row) if row else None

    def require_admin(self, conn: sqlite3.Connection, *, mutation=False) -> dict:
        admin = self.current_admin(conn)
        if not admin:
            raise ApiError("Please sign in to the admin panel first.", 401)
        if mutation and self.headers.get("X-Admin-Request") != "1":
            raise ApiError("Missing admin request header.", 403)
        return admin

    # ---------- routing ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("GET", parsed)
            return
        self.serve_static(parsed, head=False)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("HEAD", parsed)
            return
        self.serve_static(parsed, head=True)

    def do_POST(self):
        self.route_mutation("POST")

    def do_PUT(self):
        self.route_mutation("PUT")

    def do_PATCH(self):
        self.route_mutation("PATCH")

    def do_DELETE(self):
        self.route_mutation("DELETE")

    def route_mutation(self, method: str):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api(method, parsed)
        else:
            self.send_error_json("Method not allowed.", 405)

    # ---------- static files / clean URLs / HTML data injection ----------
    def is_sensitive_path(self, path: str) -> bool:
        decoded = unquote(path).replace("\\", "/").lower()
        return (
            decoded.startswith("/data/")
            or decoded in {"/server.py", "/.gitignore"}
            or decoded.endswith((".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm", ".py", ".pyc"))
        )

    def serve_static(self, parsed, *, head=False):
        path = parsed.path
        if self.is_sensitive_path(path):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        clean_map = {
            "/": "index.html",
            "/index": "index.html",
            "/index.html": "index.html",
            "/checkout": "checkout.html",
            "/checkout.html": "checkout.html",
            "/admin": "admin.html",
            "/admin.html": "admin.html",
        }
        if path in clean_map:
            self.serve_html(ROOT / clean_map[path], inject=clean_map[path] in {"index.html", "checkout.html"}, head=head)
            return
        # Generic clean URL for any future page.
        if not Path(path).suffix:
            candidate = ROOT / (path.strip("/") + ".html")
            if candidate.is_file():
                self.path = urlunparse(parsed._replace(path=path + ".html"))
        if head:
            SimpleHTTPRequestHandler.do_HEAD(self)
        else:
            SimpleHTTPRequestHandler.do_GET(self)

    def serve_html(self, file_path: Path, *, inject=False, head=False):
        if not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        html = file_path.read_text(encoding="utf-8")
        if inject:
            with get_db() as conn:
                payload = site_payload(conn)
            payload_json = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
            script = f"<script>window.__SITE__ = {payload_json};</script>"
            if "</head>" in html:
                html = html.replace("</head>", script + "\n</head>", 1)
            else:
                html = script + html
        body = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    # ---------- API ----------
    def handle_api(self, method: str, parsed):
        path = parsed.path.rstrip("/") or "/"
        query = {k: values[-1] for k, values in parse_qs(parsed.query).items()}
        try:
            with get_db() as conn:
                self.dispatch_api(method, path, query, conn)
        except ApiError as exc:
            self.send_error_json(exc.message, exc.status)
        except sqlite3.IntegrityError as exc:
            self.send_error_json(f"Database conflict: {exc}", 409)
        except BrokenPipeError:
            pass
        except Exception as exc:  # keep the API JSON-shaped even on unexpected errors
            self.send_error_json(f"Server error: {exc}", 500)

    def dispatch_api(self, method: str, path: str, query: dict, conn: sqlite3.Connection):
        # Public endpoints -------------------------------------------------
        if method == "GET" and path == "/api/health":
            self.send_json({"ok": True, "database": DB_PATH.name, "time": now_iso()})
            return
        if method == "GET" and path == "/api/site":
            self.send_json({"ok": True, **site_payload(conn)})
            return
        if method == "POST" and path == "/api/subscribe":
            data = self.read_json()
            email = clean_text(data.get("email"), 254, allow_newlines=False).lower()
            if not valid_email(email):
                raise ApiError("Please enter a valid email address.")
            cur = conn.execute(
                "INSERT OR IGNORE INTO subscribers(email,source,status,created_at) VALUES (?,?,?,?)",
                (email, clean_text(data.get("source"), 60) or "website", "subscribed", now_iso()),
            )
            self.send_json({"ok": True, "created": cur.rowcount > 0, "email": email})
            return
        if method == "POST" and path == "/api/track":
            settings = get_settings(conn)
            if as_bool(settings.get("track_page_views", True)):
                data = self.read_json()
                conn.execute(
                    "INSERT INTO page_views(path,referrer,user_agent,created_at) VALUES (?,?,?,?)",
                    (clean_text(data.get("path"), 500) or "/", clean_text(data.get("referrer"), 1000),
                     clean_text(self.headers.get("User-Agent"), 500), now_iso()),
                )
            self.send_json({"ok": True})
            return
        if method == "POST" and path == "/api/cart":
            data = self.read_json()
            cart_id = re.sub(r"[^A-Za-z0-9_-]", "", clean_text(data.get("cart_id"), 90, allow_newlines=False))
            if len(cart_id) < 8:
                raise ApiError("A valid cart ID is required.")
            raw_items = data.get("items") if isinstance(data.get("items"), list) else []
            if raw_items:
                items, subtotal, count = normalize_items(conn, raw_items)
            else:
                items, subtotal, count = [], 0.0, 0
            ts = now_iso()
            conn.execute(
                """INSERT INTO carts(cart_id,items_json,item_count,subtotal,email,status,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT(cart_id) DO UPDATE SET items_json=excluded.items_json,
                     item_count=excluded.item_count, subtotal=excluded.subtotal,
                     email=excluded.email, status='active', updated_at=excluded.updated_at""",
                (cart_id, json.dumps(items, ensure_ascii=False), count, subtotal,
                 clean_text(data.get("email"), 254).lower(), "active", ts, ts),
            )
            self.send_json({"ok": True, "cart_id": cart_id, "item_count": count, "subtotal": subtotal})
            return
        if method == "POST" and path == "/api/promo/validate":
            data = self.read_json()
            calc = calculate_totals(conn, data.get("items") or [], data.get("shipping_method") or data.get("shippingMethod") or "standard", data.get("code") or "")
            self.send_json({"ok": True, "promo": calc["promo"], "totals": {k: calc[k] for k in ("subtotal", "discount", "shipping", "tax", "total")}})
            return
        if method == "POST" and path == "/api/orders":
            order = self.create_order(conn, self.read_json())
            self.send_json({"ok": True, "order": order}, status=201)
            return

        # Admin auth --------------------------------------------------------
        if method == "POST" and path == "/api/admin/login":
            self.admin_login(conn)
            return
        if method == "POST" and path == "/api/admin/logout":
            token = self.cookie_value(SESSION_COOKIE)
            if token:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
            cookie = f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
            self.send_json({"ok": True}, headers={"Set-Cookie": cookie})
            return
        if method == "GET" and path == "/api/admin/me":
            admin = self.current_admin(conn)
            if not admin:
                raise ApiError("Not signed in.", 401)
            self.send_json({"ok": True, "admin": admin})
            return

        if path.startswith("/api/admin/"):
            self.dispatch_admin(method, path, query, conn)
            return
        raise ApiError("API endpoint not found.", 404)

    def admin_login(self, conn: sqlite3.Connection):
        ip = self.client_address[0] if self.client_address else "unknown"
        now = time.time()
        attempts = [t for t in LOGIN_ATTEMPTS.get(ip, []) if now - t < 300]
        if len(attempts) >= 8:
            raise ApiError("Too many login attempts. Please wait a few minutes.", 429)
        data = self.read_json()
        username = clean_text(data.get("username") or "admin", 80, allow_newlines=False)
        password = str(data.get("password") or "")
        row = conn.execute("SELECT * FROM admin_users WHERE username = ?", (username,)).fetchone()
        if not row or not verify_password(password, row["password_hash"], row["salt"]):
            attempts.append(now)
            LOGIN_ATTEMPTS[ip] = attempts
            raise ApiError("Wrong username or password.", 401)
        LOGIN_ATTEMPTS.pop(ip, None)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(timespec="seconds")
        conn.execute(
            "INSERT INTO sessions(token_hash,admin_id,created_at,expires_at) VALUES (?,?,?,?)",
            (token_hash(token), row["id"], now_iso(), expires),
        )
        log_activity(conn, username, "Signed in")
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        cookie = f"{SESSION_COOKIE}={token}; Path=/; Max-Age={7*24*60*60}; HttpOnly; SameSite=Lax{secure}"
        self.send_json({"ok": True, "admin": {"id": row["id"], "username": row["username"]}}, headers={"Set-Cookie": cookie})

    def create_order(self, conn: sqlite3.Connection, data: dict) -> dict:
        customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
        address = data.get("address") if isinstance(data.get("address"), dict) else {}
        name = clean_text(customer.get("name") or data.get("customer_name") or data.get("customer"), 160, allow_newlines=False)
        email = clean_text(customer.get("email") or data.get("email"), 254, allow_newlines=False).lower()
        phone = clean_text(customer.get("phone") or data.get("phone"), 60, allow_newlines=False)
        addr = {
            "address1": clean_text(address.get("address1") or data.get("address1"), 250),
            "address2": clean_text(address.get("address2") or data.get("address2"), 250),
            "city": clean_text(address.get("city") or data.get("city"), 100),
            "region": clean_text(address.get("region") or data.get("region"), 100),
            "postcode": clean_text(address.get("postcode") or data.get("postcode"), 30),
            "country": clean_text(address.get("country") or data.get("country"), 100),
        }
        if not name:
            raise ApiError("Customer name is required.")
        if not valid_email(email):
            raise ApiError("A valid customer email is required.")
        if not phone:
            raise ApiError("Customer phone is required.")
        if not addr["address1"] or not addr["city"] or not addr["postcode"] or not addr["country"]:
            raise ApiError("Delivery address is incomplete.")
        shipping_method = data.get("shipping_method") or data.get("shippingMethod") or "standard"
        promo_code = data.get("promo") or data.get("promo_code") or ""
        calc = calculate_totals(conn, data.get("items") or [], shipping_method, promo_code, check_stock=True)
        product = get_product(conn)
        ts = now_iso()
        # Insert with a temporary unique number, then replace it with a readable sequential number.
        temp_no = f"TEMP-{secrets.token_hex(6)}"
        cur = conn.execute(
            """INSERT INTO orders(order_no,cart_id,customer_name,email,phone,address1,address2,city,region,
               postcode,country,items_json,subtotal,discount,shipping,tax,total,promo_code,payment_method,
               payment_label,shipping_method,status,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (temp_no, clean_text(data.get("cart_id"), 90), name, email, phone, addr["address1"], addr["address2"],
             addr["city"], addr["region"], addr["postcode"], addr["country"],
             json.dumps(calc["items"], ensure_ascii=False), calc["subtotal"], calc["discount"], calc["shipping"],
             calc["tax"], calc["total"], calc["promo"]["code"] if calc["promo"] else "",
             clean_text(data.get("payment_method") or data.get("paymentMethod"), 40),
             clean_text(data.get("payment_label") or data.get("payment") or data.get("paymentMethod"), 100),
             calc["shipping_method"], "Pending", ts, ts),
        )
        order_id = int(cur.lastrowid)
        order_no = f"AP2-{datetime.now().strftime('%Y%m%d')}-{order_id:04d}"
        conn.execute("UPDATE orders SET order_no = ? WHERE id = ?", (order_no, order_id))
        for item in calc["items"]:
            conn.execute(
                "INSERT INTO order_items(order_id,product_slug,name,qty,unit_price,care,engraving) VALUES (?,?,?,?,?,?,?)",
                (order_id, item["product_slug"], item["name"], item["qty"], item["unit_price"], 1 if item["care"] else 0, item["engraving"]),
            )
        if calc["promo"]:
            conn.execute("UPDATE promo_codes SET used_count = used_count + 1, updated_at = ? WHERE upper(code) = ?", (ts, calc["promo"]["code"]))
        if product.get("track_inventory"):
            conn.execute("UPDATE products SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?", (calc["item_count"], ts, product["id"]))
        cart_id = clean_text(data.get("cart_id"), 90)
        if cart_id:
            conn.execute("UPDATE carts SET status='converted', converted_order_no=?, updated_at=? WHERE cart_id=?", (order_no, ts, cart_id))
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        return order_to_dict(row)

    # ---------- authenticated admin API ----------
    def dispatch_admin(self, method: str, path: str, query: dict, conn: sqlite3.Connection):
        mutation = method in {"POST", "PUT", "PATCH", "DELETE"}
        admin = self.require_admin(conn, mutation=mutation)
        username = admin["username"]

        if method == "GET" and path == "/api/admin/bootstrap":
            carts = []
            for row in conn.execute("SELECT * FROM carts ORDER BY updated_at DESC LIMIT 200").fetchall():
                cart = dict(row)
                try:
                    cart["items"] = json.loads(cart.pop("items_json") or "[]")
                except json.JSONDecodeError:
                    cart["items"] = []
                carts.append(cart)
            self.send_json({
                "ok": True,
                "admin": admin,
                "dashboard": dashboard_stats(conn),
                "settings": get_settings(conn),
                "product": get_product(conn),
                "features": list_features(conn),
                "reviews": list_reviews(conn),
                "promos": list_promos(conn),
                "orders": list_orders(conn, query=query.get("q", ""), status=query.get("status", "")),
                "subscribers": rows_to_dicts(conn.execute("SELECT * FROM subscribers ORDER BY id DESC").fetchall()),
                "carts": carts,
                "system": system_info(conn),
                "activity": rows_to_dicts(conn.execute("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 30").fetchall()),
            })
            return
        if method == "GET" and path == "/api/admin/dashboard":
            self.send_json({"ok": True, "dashboard": dashboard_stats(conn), "orders": list_orders(conn, limit=8)})
            return
        if method == "GET" and path == "/api/admin/settings":
            self.send_json({"ok": True, "settings": get_settings(conn)})
            return
        if method in {"PUT", "PATCH"} and path == "/api/admin/settings":
            payload = self.read_json()
            updates = validate_settings_payload(payload.get("settings", payload))
            ts = now_iso()
            for key, value in updates.items():
                conn.execute(
                    """INSERT INTO settings(key,value,updated_at) VALUES (?,?,?)
                       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
                    (key, json.dumps(value, ensure_ascii=False), ts),
                )
            log_activity(conn, username, "Updated website settings", ", ".join(sorted(updates.keys()))[:480])
            self.send_json({"ok": True, "settings": get_settings(conn)})
            return
        if method == "GET" and path == "/api/admin/product":
            self.send_json({"ok": True, "product": get_product(conn)})
            return
        if method in {"PUT", "PATCH"} and path == "/api/admin/product":
            payload = self.read_json()
            current_raw = dict(conn.execute("SELECT * FROM products ORDER BY id LIMIT 1").fetchone())
            data = validate_product_payload(payload.get("product", payload), current_raw)
            conn.execute(
                """UPDATE products SET name=?,subtitle=?,sku=?,slug=?,price=?,compare_at_price=?,care_price=?,
                   care_name=?,care_description=?,stock=?,track_inventory=?,max_qty=?,rating=?,review_count=?,
                   hero_image=?,image=?,description=?,active=?,updated_at=? WHERE id=?""",
                (data["name"], data["subtitle"], data["sku"], data["slug"], data["price"], data["compare_at_price"],
                 data["care_price"], data["care_name"], data["care_description"], data["stock"], int(data["track_inventory"]),
                 data["max_qty"], data["rating"], data["review_count"], data["hero_image"], data["image"],
                 data["description"], int(data["active"]), now_iso(), current_raw["id"]),
            )
            log_activity(conn, username, "Updated product", f"{data['name']} · stock {data['stock']}")
            self.send_json({"ok": True, "product": get_product(conn)})
            return

        if self.handle_collection(method, path, conn, username, "features"):
            return
        if self.handle_collection(method, path, conn, username, "reviews"):
            return
        if self.handle_collection(method, path, conn, username, "promos"):
            return

        if method == "GET" and path == "/api/admin/orders":
            self.send_json({"ok": True, "orders": list_orders(conn, query=query.get("q", ""), status=query.get("status", ""))})
            return
        order_match = re.fullmatch(r"/api/admin/orders/(\d+)", path)
        if order_match and method == "PATCH":
            self.update_order(conn, int(order_match.group(1)), username)
            return
        if order_match and method == "DELETE":
            self.delete_order(conn, int(order_match.group(1)), username)
            return
        if method == "DELETE" and path == "/api/admin/orders":
            # Return stock for all non-cancelled orders before clearing the table.
            qty = conn.execute("""SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id
                                  WHERE o.status != 'Cancelled'""").fetchone()[0]
            product = get_product(conn)
            if product.get("track_inventory") and qty:
                conn.execute("UPDATE products SET stock = stock + ?, updated_at=? WHERE id=?", (int(qty), now_iso(), product["id"]))
            conn.execute("DELETE FROM orders")
            log_activity(conn, username, "Cleared all orders")
            self.send_json({"ok": True})
            return
        if method == "POST" and path == "/api/admin/seed-orders":
            count = self.seed_demo_orders(conn)
            log_activity(conn, username, "Loaded demo orders", f"{count} orders")
            self.send_json({"ok": True, "created": count, "orders": list_orders(conn), "dashboard": dashboard_stats(conn)})
            return

        if method == "GET" and path == "/api/admin/subscribers":
            self.send_json({"ok": True, "subscribers": rows_to_dicts(conn.execute("SELECT * FROM subscribers ORDER BY id DESC").fetchall())})
            return
        sub_match = re.fullmatch(r"/api/admin/subscribers/(\d+)", path)
        if sub_match and method == "DELETE":
            conn.execute("DELETE FROM subscribers WHERE id = ?", (int(sub_match.group(1)),))
            self.send_json({"ok": True})
            return
        if method == "DELETE" and path == "/api/admin/subscribers":
            conn.execute("DELETE FROM subscribers")
            log_activity(conn, username, "Cleared subscribers")
            self.send_json({"ok": True})
            return

        cart_match = re.fullmatch(r"/api/admin/carts/([^/]+)", path)
        if cart_match and method == "DELETE":
            conn.execute("DELETE FROM carts WHERE cart_id = ?", (unquote(cart_match.group(1)),))
            self.send_json({"ok": True})
            return

        if method == "POST" and path == "/api/admin/upload":
            self.upload_image(conn, username)
            return
        if method == "POST" and path == "/api/admin/change-password":
            self.change_password(conn, admin)
            return
        if method == "POST" and path == "/api/admin/import-legacy":
            result = self.import_legacy(conn, self.read_json(), username)
            self.send_json({"ok": True, **result})
            return
        if method == "POST" and path == "/api/admin/reset-content":
            seed_defaults(conn, force=True)
            log_activity(conn, username, "Reset website content to defaults")
            self.send_json({"ok": True, **site_payload(conn)})
            return
        if method == "GET" and path == "/api/admin/export":
            self.send_json({"ok": True, "exported_at": now_iso(), **self.export_all(conn)})
            return
        if method == "GET" and path == "/api/admin/backup":
            self.download_backup(conn)
            return
        raise ApiError("Admin API endpoint not found.", 404)

    def handle_collection(self, method: str, path: str, conn: sqlite3.Connection, username: str, kind: str) -> bool:
        base = f"/api/admin/{kind}"
        match = re.fullmatch(rf"{re.escape(base)}(?:/(\d+))?", path)
        if not match:
            return False
        item_id = int(match.group(1)) if match.group(1) else None
        table = {"features": "features", "reviews": "reviews", "promos": "promo_codes"}[kind]
        if method == "GET" and item_id is None:
            data = list_features(conn) if kind == "features" else list_reviews(conn) if kind == "reviews" else list_promos(conn)
            self.send_json({"ok": True, kind: data})
            return True
        if method == "POST" and item_id is None:
            payload = self.read_json()
            ts = now_iso()
            if kind == "features":
                d = validate_feature_payload(payload)
                cur = conn.execute("""INSERT INTO features(title,description,tag,visual_type,visual_text,size,sort_order,active,created_at,updated_at)
                                      VALUES (?,?,?,?,?,?,?,?,?,?)""", (d["title"], d["description"], d["tag"], d["visual_type"], d["visual_text"], d["size"], d["sort_order"], d["active"], ts, ts))
            elif kind == "reviews":
                d = validate_review_payload(payload)
                cur = conn.execute("""INSERT INTO reviews(author,location,rating,body,date_label,color,verified,sort_order,active,created_at,updated_at)
                                      VALUES (?,?,?,?,?,?,?,?,?,?,?)""", (d["author"], d["location"], d["rating"], d["body"], d["date_label"], d["color"], d["verified"], d["sort_order"], d["active"], ts, ts))
            else:
                d = validate_promo_payload(payload)
                cur = conn.execute("""INSERT INTO promo_codes(code,type,value,min_subtotal,max_uses,expires_at,active,created_at,updated_at)
                                      VALUES (?,?,?,?,?,?,?,?,?)""", (d["code"], d["type"], d["value"], d["min_subtotal"], d["max_uses"], d["expires_at"], d["active"], ts, ts))
            log_activity(conn, username, f"Created {kind[:-1]}", f"ID {cur.lastrowid}")
            self.send_json({"ok": True, "id": int(cur.lastrowid)}, status=201)
            return True
        if method in {"PUT", "PATCH"} and item_id is not None:
            row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone()
            if not row:
                raise ApiError("Item not found.", 404)
            payload = self.read_json()
            ts = now_iso()
            if kind == "features":
                d = validate_feature_payload(payload, dict(row))
                conn.execute("""UPDATE features SET title=?,description=?,tag=?,visual_type=?,visual_text=?,size=?,sort_order=?,active=?,updated_at=? WHERE id=?""",
                             (d["title"], d["description"], d["tag"], d["visual_type"], d["visual_text"], d["size"], d["sort_order"], d["active"], ts, item_id))
            elif kind == "reviews":
                d = validate_review_payload(payload, dict(row))
                conn.execute("""UPDATE reviews SET author=?,location=?,rating=?,body=?,date_label=?,color=?,verified=?,sort_order=?,active=?,updated_at=? WHERE id=?""",
                             (d["author"], d["location"], d["rating"], d["body"], d["date_label"], d["color"], d["verified"], d["sort_order"], d["active"], ts, item_id))
            else:
                d = validate_promo_payload(payload, dict(row))
                conn.execute("""UPDATE promo_codes SET code=?,type=?,value=?,min_subtotal=?,max_uses=?,expires_at=?,active=?,updated_at=? WHERE id=?""",
                             (d["code"], d["type"], d["value"], d["min_subtotal"], d["max_uses"], d["expires_at"], d["active"], ts, item_id))
            log_activity(conn, username, f"Updated {kind[:-1]}", f"ID {item_id}")
            self.send_json({"ok": True})
            return True
        if method == "DELETE" and item_id is not None:
            conn.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
            log_activity(conn, username, f"Deleted {kind[:-1]}", f"ID {item_id}")
            self.send_json({"ok": True})
            return True
        return False

    def update_order(self, conn: sqlite3.Connection, order_id: int, username: str):
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            raise ApiError("Order not found.", 404)
        data = self.read_json()
        status = clean_text(data.get("status", row["status"]), 30, allow_newlines=False)
        if status not in ORDER_STATUSES:
            raise ApiError("Invalid order status.")
        notes = clean_text(data.get("notes", row["notes"]), 2000)
        old_status = row["status"]
        product = get_product(conn)
        qty = int(conn.execute("SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = ?", (order_id,)).fetchone()[0])
        if product.get("track_inventory") and qty:
            if old_status != "Cancelled" and status == "Cancelled":
                conn.execute("UPDATE products SET stock = stock + ?, updated_at=? WHERE id=?", (qty, now_iso(), product["id"]))
            elif old_status == "Cancelled" and status != "Cancelled":
                if int(product.get("stock") or 0) < qty:
                    raise ApiError("Not enough stock to reactivate this order.", 409)
                conn.execute("UPDATE products SET stock = stock - ?, updated_at=? WHERE id=?", (qty, now_iso(), product["id"]))
        conn.execute("UPDATE orders SET status=?, notes=?, updated_at=? WHERE id=?", (status, notes, now_iso(), order_id))
        log_activity(conn, username, "Updated order", f"{row['order_no']} → {status}")
        updated = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        self.send_json({"ok": True, "order": order_to_dict(updated), "dashboard": dashboard_stats(conn)})

    def delete_order(self, conn: sqlite3.Connection, order_id: int, username: str):
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            raise ApiError("Order not found.", 404)
        product = get_product(conn)
        qty = int(conn.execute("SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = ?", (order_id,)).fetchone()[0])
        if product.get("track_inventory") and row["status"] != "Cancelled" and qty:
            conn.execute("UPDATE products SET stock = stock + ?, updated_at=? WHERE id=?", (qty, now_iso(), product["id"]))
        conn.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        log_activity(conn, username, "Deleted order", row["order_no"])
        self.send_json({"ok": True, "dashboard": dashboard_stats(conn)})

    def seed_demo_orders(self, conn: sqlite3.Connection) -> int:
        product = get_product(conn)
        examples = [
            ("Tamim Rahman", "Tamim.Rahman@example.com", "Dhaka", 1, False, "Delivered", 8),
            ("Nusrat Jahan", "Nusrat.Jahan@example.com", "Chattogram", 1, True, "Shipped", 5),
            ("sara Kabir", "sara Kabir@example.com", "Dhaka", 2, False, "Confirmed", 3),
            ("Mehedi Hasan", "Mehedi Hasan@example.com", "Khulna", 1, False, "Pending", 1),
            ("Tanvir Ahmed", "Tanvir Ahmed@example.com", "Sylhet", 1, True, "Pending", 0),
        ]
        created = 0
        for idx, (name, email, city, qty, care, status, days_ago) in enumerate(examples, start=1):
            order_no = f"DEMO-{datetime.now().strftime('%Y%m%d')}-{idx:03d}"
            if conn.execute("SELECT 1 FROM orders WHERE order_no = ?", (order_no,)).fetchone():
                continue
            unit = money_round(float(product["price"]) + (float(product["care_price"]) if care else 0))
            subtotal = money_round(unit * qty)
            items = [{"id": product["slug"], "product_slug": product["slug"], "name": product["name"], "qty": qty,
                      "price": unit, "unit_price": unit, "line_total": subtotal, "care": care, "engraving": ""}]
            date = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(timespec="seconds")
            cur = conn.execute(
                """INSERT INTO orders(order_no,customer_name,email,phone,address1,city,region,postcode,country,items_json,
                   subtotal,discount,shipping,tax,total,payment_method,payment_label,shipping_method,status,demo,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (order_no, name, email, "+880 1700-000000", "House 12, Road 5", city, city, "1212", "Bangladesh",
                 json.dumps(items, ensure_ascii=False), subtotal, 0, 0, 0, subtotal, "card", "Card ending 4242", "standard", status, 1, date, date),
            )
            conn.execute("INSERT INTO order_items(order_id,product_slug,name,qty,unit_price,care,engraving) VALUES (?,?,?,?,?,?,?)",
                         (int(cur.lastrowid), product["slug"], product["name"], qty, unit, 1 if care else 0, ""))
            created += 1
        return created

    def upload_image(self, conn: sqlite3.Connection, username: str):
        data = self.read_json()
        data_url = str(data.get("data_url") or data.get("dataUrl") or "")
        match = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)", data_url)
        if not match:
            raise ApiError("Please choose a PNG, JPG, WebP or GIF image.")
        mime = match.group(1)
        try:
            raw = base64.b64decode(match.group(2), validate=False)
        except (binascii.Error, ValueError) as exc:
            raise ApiError("The uploaded image data is invalid.") from exc
        if not raw or len(raw) > MAX_UPLOAD_BYTES:
            raise ApiError("Image must be between 1 byte and 3 MB.", 413)
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}[mime]
        original = Path(clean_text(data.get("filename"), 120, allow_newlines=False)).stem
        safe = re.sub(r"[^a-z0-9-]+", "-", original.lower()).strip("-")[:40] or "image"
        filename = f"{int(time.time())}-{secrets.token_hex(4)}-{safe}{ext}"
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        target = UPLOAD_DIR / filename
        target.write_bytes(raw)
        rel = f"assets/img/uploads/{filename}"
        conn.execute("INSERT INTO media_uploads(filename,path,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?)",
                     (filename, rel, mime, len(raw), now_iso()))
        log_activity(conn, username, "Uploaded image", rel)
        self.send_json({"ok": True, "path": rel, "url": "/" + rel, "size_bytes": len(raw)}, status=201)

    def change_password(self, conn: sqlite3.Connection, admin: dict):
        data = self.read_json()
        current = str(data.get("current_password") or "")
        new = str(data.get("new_password") or "")
        if len(new) < 8:
            raise ApiError("New password must be at least 8 characters.")
        row = conn.execute("SELECT * FROM admin_users WHERE id = ?", (admin["id"],)).fetchone()
        if not row or not verify_password(current, row["password_hash"], row["salt"]):
            raise ApiError("Current password is incorrect.", 401)
        pwd_hash, salt = hash_password(new)
        conn.execute("UPDATE admin_users SET password_hash=?, salt=?, updated_at=? WHERE id=?", (pwd_hash, salt, now_iso(), admin["id"]))
        # Keep this session, revoke other sessions.
        token = self.cookie_value(SESSION_COOKIE)
        conn.execute("DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?", (admin["id"], token_hash(token)))
        log_activity(conn, admin["username"], "Changed admin password")
        self.send_json({"ok": True})

    def import_legacy(self, conn: sqlite3.Connection, data: dict, username: str) -> dict:
        imported = {"orders": 0, "subscribers": 0, "settings": False}
        legacy_settings = data.get("settings") if isinstance(data.get("settings"), dict) else {}
        if legacy_settings:
            current = dict(conn.execute("SELECT * FROM products ORDER BY id LIMIT 1").fetchone())
            mapped = {
                "name": legacy_settings.get("productName", current["name"]),
                "price": legacy_settings.get("basePrice", current["price"]),
                "compare_at_price": legacy_settings.get("wasPrice", current["compare_at_price"]),
                "care_price": legacy_settings.get("carePrice", current["care_price"]),
            }
            product = validate_product_payload(mapped, current)
            conn.execute("UPDATE products SET name=?,price=?,compare_at_price=?,care_price=?,updated_at=? WHERE id=?",
                         (product["name"], product["price"], product["compare_at_price"], product["care_price"], now_iso(), current["id"]))
            imported["settings"] = True
        for sub in data.get("subscribers", [])[:1000] if isinstance(data.get("subscribers"), list) else []:
            email = clean_text(sub.get("email") if isinstance(sub, dict) else sub, 254).lower()
            if valid_email(email):
                cur = conn.execute("INSERT OR IGNORE INTO subscribers(email,source,status,created_at) VALUES (?,?,?,?)",
                                   (email, "legacy-localStorage", "subscribed", clean_text(sub.get("date"), 40) if isinstance(sub, dict) else now_iso()))
                imported["subscribers"] += int(cur.rowcount > 0)
        for order in data.get("orders", [])[:500] if isinstance(data.get("orders"), list) else []:
            if not isinstance(order, dict):
                continue
            order_no = clean_text(order.get("id") or order.get("order_no"), 80, allow_newlines=False)
            email = clean_text(order.get("email"), 254).lower()
            if not order_no or not valid_email(email) or conn.execute("SELECT 1 FROM orders WHERE order_no=?", (order_no,)).fetchone():
                continue
            items = order.get("items") if isinstance(order.get("items"), list) else []
            clean_items = []
            for item in items:
                if isinstance(item, dict):
                    clean_items.append({
                        "id": "airpods-pro-2", "product_slug": "airpods-pro-2",
                        "name": clean_text(item.get("name"), 120) or "AirPods Pro 2",
                        "qty": as_number(item.get("qty"), 1, integer=True, minimum=1, maximum=99),
                        "price": as_number(item.get("price"), 0, minimum=0), "unit_price": as_number(item.get("price"), 0, minimum=0),
                        "care": as_bool(item.get("care")), "engraving": clean_text(item.get("engraving"), 40),
                    })
            date = clean_text(order.get("date") or order.get("created_at"), 40) or now_iso()
            cur = conn.execute(
                """INSERT INTO orders(order_no,customer_name,email,phone,address1,items_json,subtotal,discount,shipping,tax,total,
                   promo_code,payment_method,payment_label,shipping_method,status,demo,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (order_no, clean_text(order.get("customer"), 160) or "Legacy customer", email, clean_text(order.get("phone"), 60),
                 clean_text(order.get("address"), 500), json.dumps(clean_items, ensure_ascii=False),
                 as_number(order.get("subtotal"), 0), as_number(order.get("discount"), 0), as_number(order.get("shipping"), 0),
                 as_number(order.get("tax"), 0), as_number(order.get("total"), 0), clean_text(order.get("promo"), 40),
                 "", clean_text(order.get("payment"), 100), clean_text(order.get("shippingMethod"), 30) or "standard",
                 order.get("status") if order.get("status") in ORDER_STATUSES else "Pending", 1 if order.get("demo") else 0, date, date),
            )
            for item in clean_items:
                conn.execute("INSERT INTO order_items(order_id,product_slug,name,qty,unit_price,care,engraving) VALUES (?,?,?,?,?,?,?)",
                             (int(cur.lastrowid), item["product_slug"], item["name"], item["qty"], item["unit_price"], 1 if item["care"] else 0, item["engraving"]))
            imported["orders"] += 1
        if imported["orders"] or imported["subscribers"] or imported["settings"]:
            log_activity(conn, username, "Imported legacy browser data", json.dumps(imported))
        return {"imported": imported}

    def export_all(self, conn: sqlite3.Connection) -> dict:
        return {
            "settings": get_settings(conn),
            "product": get_product(conn),
            "features": list_features(conn),
            "reviews": list_reviews(conn),
            "promos": list_promos(conn),
            "orders": list_orders(conn, limit=10000),
            "subscribers": rows_to_dicts(conn.execute("SELECT * FROM subscribers ORDER BY id DESC").fetchall()),
        }

    def download_backup(self, conn: sqlite3.Connection):
        # Use SQLite's backup API through a temporary file for a consistent snapshot.
        tmp = DB_PATH.with_name(f".backup-{secrets.token_hex(4)}.db")
        try:
            dest = sqlite3.connect(tmp)
            try:
                conn.backup(dest)
            finally:
                dest.close()
            body = tmp.read_bytes()
        finally:
            try:
                tmp.unlink(missing_ok=True)
            except TypeError:
                if tmp.exists():
                    tmp.unlink()
        filename = f"site-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/vnd.sqlite3")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), StoreHandler)
    server.daemon_threads = True
    print(f"Serving {ROOT} at http://localhost:{PORT} (clean URLs + SQLite API)")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
