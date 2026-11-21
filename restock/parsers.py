"""Pure parsers for store pages and API replies. No network.

Victory and Shufersal pages (schema.org JSON-LD, Open Graph meta tags, sales JSON),
Rami Levy catalog replies (price and "N for X" sales), and barcode lookups from links.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import urllib.parse
from typing import Any

JSON_LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL)
VICTORY_SALES_KEY = '"sales":'
SHUFERSAL_OFFER = re.compile(r'"offers"\s*:\s*\{.{0,400}?"price"\s*:\s*"?([\d.]+)', re.S)
OG_PRICE = re.compile(r'<meta\s[^>]*?(?:property|name)="(?:og:|product:)*price:amount"[^>]*?content="([\d.]+)"', re.I)
QUANTITY_DEAL = re.compile(r"(\d+)\s*(?:יח'?\s*)?ב-\s*₪?\s*(\d+(?:\.\d+)?)")


def one_line(value: Any) -> str:
    return ' '.join(str(value if value is not None else '').split())


def money(value: float) -> str:
    """Format a price without a trailing .0. 12.9 gives '12.9', 20.0 gives '20'."""
    return f'{float(value):g}'


def barcode_of_query(url: str) -> str | None:
    """Return the barcode in a q= or item= query parameter (Rami Levy, Yochananof), or None."""
    query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    for key in ('q', 'item'):
        if query.get(key) and query[key][0].isdigit():
            return query[key][0]
    return None


# ---------------------------------------------------------------- generic price reads

def schema_price(page: str) -> float | None:
    """Return the price of the first schema.org Product block (offers.price), or None."""
    for block in JSON_LD.findall(page):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for node in data if isinstance(data, list) else [data]:
            if not isinstance(node, dict) or node.get('@type') != 'Product':
                continue
            offers = node.get('offers')
            try:
                return float(offers.get('price'))
            except (AttributeError, TypeError, ValueError):
                return None
    return None


def open_graph_price(page: str) -> float | None:
    match = OG_PRICE.search(page)
    return float(match.group(1)) if match else None


def shufersal_price(page: str) -> float | None:
    """Schema.org price, else the "offers" regex."""
    price = schema_price(page)
    if price is None:
        match = SHUFERSAL_OFFER.search(page)
        price = float(match.group(1)) if match else None
    return price


# ---------------------------------------------------------------- deal shape

def quantity_of(name: str | None) -> tuple[int | None, float | None]:
    """Return (quantity, total) from a deal name such as '2 ב-₪12.9', or (None, None)."""
    match = QUANTITY_DEAL.search(name or '')
    if not match:
        return None, None
    quantity = int(match.group(1))
    if quantity < 1:
        return None, None
    return quantity, float(match.group(2))


def deal_entry(store: str, brand: str | None, price: float | None, sale_name: str, quantity: int | None,
               total: float | None, until: str | None, url: str) -> dict[str, Any]:
    """One deal in the output format. A quantity deal reads '2 ב-20 ₪'. Any other deal keeps its own text."""
    text = f'{quantity} ב-{money(total)} ₪' if quantity is not None and total is not None else sale_name
    return {
        'store': store, 'brand': brand, 'price': price, 'deal': text,
        'dealQuantity': quantity, 'dealPrice': total, 'until': until, 'url': url,
    }


def _iso_day(text: Any) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(text))
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- Victory

def victory_sales(page: str) -> list:
    """Return the sales list. The page embeds it as escaped JSON inside a script."""
    text = page.replace('\\"', '"')
    at = text.find(VICTORY_SALES_KEY)
    if at == -1:
        return []
    try:
        value, _ = json.JSONDecoder().raw_decode(text, at + len(VICTORY_SALES_KEY))
    except ValueError:
        return []
    return value if isinstance(value, list) else []


def deals_from_victory(page: str, url: str, brand: str | None, today: dt.date) -> list[dict[str, Any]]:
    """Active "N for X" deals of one Victory product page."""
    price = schema_price(page)
    out = []
    for sale in victory_sales(page):
        if not isinstance(sale, dict):
            continue
        name = one_line(sale.get('name'))
        expires = dt.datetime.strptime(sale['expiresAt'], '%d/%m/%Y').date() if sale.get('expiresAt') else None
        if not name or (expires is not None and expires < today):
            continue
        quantity, total = quantity_of(name)
        if quantity is None:
            continue
        out.append(deal_entry('victory', brand, price, name, quantity, total,
                              expires.isoformat() if expires else None, url))
    return out


# ---------------------------------------------------------------- Rami Levy

def rami_product(payload: Any, barcode: str) -> dict[str, Any] | None:
    """Return the product row whose barcode matches, or None."""
    rows = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return None
    return next((r for r in rows if isinstance(r, dict) and str(r.get('barcode')) == barcode), None)


def rami_price(product: dict[str, Any]) -> float | None:
    """Return price.price of a Rami Levy product row, or None."""
    try:
        return float(product['price']['price'])
    except (KeyError, TypeError, ValueError):
        return None


def _rami_sale_active(sale: Any, today: dt.date) -> bool:
    if not isinstance(sale, dict) or sale.get('active') != 1 or sale.get('deleted_at'):
        return False
    start = _iso_day(str(sale.get('from') or '')[:10])
    end = _iso_day(str(sale.get('to') or '')[:10])
    if end is None or end < today:
        return False
    return start is None or start <= today


def deals_from_rami(payload: Any, barcode: str, url: str, brand: str | None,
                    today: dt.date) -> list[dict[str, Any]]:
    """Active "N for X" sales of one Rami Levy product (sale.active == 1)."""
    product = rami_product(payload, barcode)
    if product is None:
        return []
    price = rami_price(product)
    out = []
    for sale in product.get('sale') or []:
        if not _rami_sale_active(sale, today):
            continue
        name = one_line(sale.get('label') or sale.get('name'))
        quantity, total = quantity_of(name)
        if quantity is None:
            continue
        end = _iso_day(str(sale.get('to') or '')[:10])
        out.append(deal_entry('ramilevy', brand, price, name, quantity, total, end.isoformat(), url))
    return out


# ---------------------------------------------------------------- barcode from links and images

BARCODE_IN_IMAGE = re.compile(r'/(?:gs1|media/product-images)/(\d{6,14})/')
SHUFERSAL_BARCODE = re.compile(r'P_(\d{6,14})')


def hazihinam_barcode(url: str) -> str | None:
    """Return the barcode at the end of a /searchResults/<barcode> link, or None."""
    tail = urllib.parse.urlparse(url).path.rstrip('/').rsplit('/', 1)[-1]
    return tail if tail.isdigit() and 6 <= len(tail) <= 14 else None


def tivtaam_product_id(url: str) -> str | None:
    """Return the catalogProduct id of a Tiv Taam link, or None."""
    values = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('catalogProduct') or []
    return values[0] if values and values[0].isdigit() else None
