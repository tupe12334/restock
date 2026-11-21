#!/usr/bin/env python3
"""Fetch store deals for the restock catalog.

Reads the "Home items" Local To-do file of Home Assistant. For each Victory
and Rami Levy link, it reads the current price and any active deal. It writes
www/restock-deals.json in the Home Assistant config directory.

Run from <config>/restock/fetch_deals.py. The config directory is the parent
of the script directory. Use --config to set another one. Standard library only.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

CATALOG_FILE = Path('.storage') / 'local_todo.home_items.ics'
OUTPUT_FILE = Path('www') / 'restock-deals.json'
USER_AGENT = 'Mozilla/5.0 (restock-card deals fetcher)'
TIMEOUT_S = 20
MIN_GAP_S = 1.0
RAMI_CATALOG_URL = 'https://www.rami-levy.co.il/api/catalog?'

LINK_LINE = re.compile(
    r'^\s*link\s+([a-z][a-z0-9_-]*)\s*(?:\(([^()]*)\))?\s*:\s*(\S.*?)\s*$',
    re.IGNORECASE,
)
# "2 ב-₪12.9", "2 ב-20 ₪", "3 יח' ב-10 ש\"ח". Quantity and total price.
QUANTITY_DEAL = re.compile(r"(\d+)\s*(?:יח'?\s*)?ב-\s*₪?\s*(\d+(?:\.\d+)?)")
JSON_LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL)
VICTORY_SALES = '"sales":'
BARCODE_IN_URL = re.compile(r'/gs1/(\d{8,14})/')


def one_line(value):
    return ' '.join(str(value or '').split())


def money(value):
    """Format a price without a trailing .0. 12.9 gives '12.9', 20.0 gives '20'."""
    return f'{float(value):g}'


# ---------------------------------------------------------------- catalog


def unfold_ics(text):
    """Join folded ICS lines. A line that starts with a space or tab continues the one above."""
    out = []
    for raw in text.replace('\r\n', '\n').split('\n'):
        if raw[:1] in (' ', '\t') and out:
            out[-1] += raw[1:]
        else:
            out.append(raw)
    return out


def unescape_ics(value):
    """Undo ICS text escapes: \\n gives a newline. \\, \\; and \\\\ give the character."""
    return re.sub(r'\\(.)', lambda m: '\n' if m.group(1) in 'nN' else m.group(1), value, flags=re.DOTALL)


def parse_todos(ics_text):
    """Return [{summary, description}] for each VTODO that has a SUMMARY."""
    items = []
    current = None
    for line in unfold_ics(ics_text):
        if line == 'BEGIN:VTODO':
            current = {}
        elif line == 'END:VTODO':
            if current and 'SUMMARY' in current:
                items.append({
                    'summary': current['SUMMARY'].strip(),
                    'description': current.get('DESCRIPTION', ''),
                })
            current = None
        elif current is not None and ':' in line:
            name_part, value = line.split(':', 1)
            name = name_part.split(';', 1)[0].upper()
            if name in ('SUMMARY', 'DESCRIPTION') and name not in current:
                current[name] = unescape_ics(value)
    return items


def store_links(description):
    """Return [{store, brand, url}] from the Link lines. The first link per store and brand wins."""
    seen = {}
    for line in str(description or '').splitlines():
        match = LINK_LINE.match(line)
        if not match:
            continue
        store = match.group(1).lower()
        brand = (match.group(2) or '').strip() or None
        url = match.group(3).strip()
        if not url.startswith('https://'):
            continue
        seen.setdefault((store, brand), url)
    return [{'store': s, 'brand': b, 'url': u} for (s, b), u in seen.items()]


def barcode_of(url):
    """Return the barcode of a Rami Levy search link (q=...), or None."""
    query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    for key in ('q', 'item'):
        if query.get(key) and query[key][0].isdigit():
            return query[key][0]
    return None


# ---------------------------------------------------------------- deal shape


def deal_entry(store, brand, price, sale_name, quantity, total, until, url):
    """One deal in the output format. A quantity deal reads '2 ב-20 ₪'. Any other deal keeps its own text."""
    if quantity is not None and total is not None:
        text = f'{quantity} ב-{money(total)} ₪'
    else:
        text = sale_name
    return {
        'store': store,
        'brand': brand,
        'price': price,
        'deal': text,
        'dealQuantity': quantity,
        'dealPrice': total,
        'until': until,
        'url': url,
    }


def quantity_of(name):
    """Return (quantity, total) from a deal name such as '2 ב-₪12.9', or (None, None)."""
    match = QUANTITY_DEAL.search(name or '')
    if not match:
        return None, None
    quantity = int(match.group(1))
    total = float(match.group(2))
    if quantity < 1:
        return None, None
    return quantity, total


def is_iso_day(text):
    try:
        return dt.date.fromisoformat(text)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- Victory


def victory_price(page):
    """Return the regular price from the schema.org Product block, or None."""
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


def victory_sales(page):
    """Return the sales list of the product. The page embeds it as escaped JSON inside a script."""
    text = page.replace('\\"', '"')
    at = text.find(VICTORY_SALES)
    if at == -1:
        return []
    try:
        value, _ = json.JSONDecoder().raw_decode(text, at + len(VICTORY_SALES))
    except ValueError:
        return []
    return value if isinstance(value, list) else []


def deals_from_victory(page, url, brand, today):
    """Return the active deals of one Victory product page. Price and sales come from the page."""
    price = victory_price(page)
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
            continue  # a per-unit price label, not a deal
        out.append(deal_entry(
            'victory', brand, price, name, quantity, total,
            expires.isoformat() if expires else None, url,
        ))
    return out


# ---------------------------------------------------------------- Rami Levy


def rami_product(payload, barcode):
    """Return the product row whose barcode matches, or None."""
    rows = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return None
    return next((row for row in rows if isinstance(row, dict) and str(row.get('barcode')) == barcode), None)


def rami_sale_active(sale, today):
    if not isinstance(sale, dict) or sale.get('active') != 1 or sale.get('deleted_at'):
        return False
    start = is_iso_day(str(sale.get('from') or '')[:10])
    end = is_iso_day(str(sale.get('to') or '')[:10])
    if end is None or end < today:
        return False
    return start is None or start <= today


def rami_price(product):
    """Return the regular price of a Rami Levy product row (price.price), or None."""
    try:
        return float(product['price']['price'])
    except (KeyError, TypeError, ValueError):
        return None


def deals_from_rami(payload, barcode, url, brand, today):
    """Return the active deals of one Rami Levy product. The product price is price.price."""
    product = rami_product(payload, barcode)
    if product is None:
        return []
    price = rami_price(product)
    out = []
    for sale in product.get('sale') or []:
        if not rami_sale_active(sale, today):
            continue
        name = one_line(sale.get('label') or sale.get('name'))
        quantity, total = quantity_of(name)
        if quantity is None:
            continue  # only "N for X" deals are kept
        end = is_iso_day(str(sale.get('to') or '')[:10])
        out.append(deal_entry('ramilevy', brand, price, name, quantity, total, end.isoformat(), url))
    return out


# ---------------------------------------------------------------- network


class Client:
    """HTTP client that waits MIN_GAP_S between requests."""

    def __init__(self, gap=MIN_GAP_S):
        self.gap = gap
        self.last = None
        self.requests = 0
        self.failures = 0

    def _wait(self):
        if self.last is not None:
            left = self.gap - (time.monotonic() - self.last)
            if left > 0:
                time.sleep(left)
        self.last = time.monotonic()
        self.requests += 1

    def get_text(self, url, headers=None):
        self._wait()
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, **(headers or {})})
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.read().decode('utf-8', errors='replace')

    def post_json(self, url, body):
        self._wait()
        data = json.dumps(body).encode('utf-8')
        req = urllib.request.Request(
            url, data=data, method='POST',
            headers={'Content-Type': 'application/json', 'User-Agent': USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read().decode('utf-8'))


def collect(items, client, today, log=print):
    """Return {item name: [deal]} for the items with an active deal. A failed link is logged and skipped."""
    cache = {}
    failed = set()
    deals = {}
    for item in items:
        name = item['summary']
        for link in store_links(item['description']):
            store = link['store']
            if store not in ('victory', 'ramilevy'):
                continue
            key = (store, link['url'])
            if key in failed:
                continue
            try:
                if key not in cache:
                    if store == 'victory':
                        cache[key] = client.get_text(link['url'])
                    else:
                        barcode = barcode_of(link['url'])
                        if barcode is None:
                            raise ValueError('no barcode in link')
                        cache[key] = client.post_json(RAMI_CATALOG_URL, {'q': barcode, 'from': 0, 'store': ''})
            except (OSError, ValueError) as err:
                client.failures += 1
                failed.add(key)
                log(f'skip {store} for {name}: {err}')
                continue
            if store == 'victory':
                found = deals_from_victory(cache[key], link['url'], link['brand'], today)
            else:
                found = deals_from_rami(cache[key], barcode_of(link['url']), link['url'], link['brand'], today)
            if found:
                deals.setdefault(name, []).extend(found)
    return deals


def write_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    default_config = Path(__file__).resolve().parent.parent
    parser.add_argument('--config', type=Path, default=default_config, help='Home Assistant config directory')
    parser.add_argument('--output', type=Path, default=None, help='output file, default www/restock-deals.json')
    args = parser.parse_args(argv)

    catalog_path = args.config / CATALOG_FILE
    output = args.output or (args.config / OUTPUT_FILE)
    items = parse_todos(catalog_path.read_text(encoding='utf-8'))
    client = Client()
    deals = collect(items, client, dt.date.today(), log=lambda m: print(m, file=sys.stderr))

    if client.requests and client.failures == client.requests:
        print('every request failed. The output file is not changed.', file=sys.stderr)
        return 1
    payload = {
        'updated': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        'deals': deals,
    }
    write_atomic(output, payload)
    print(f'{len(deals)} items with deals, {client.requests} requests, {client.failures} failed', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
