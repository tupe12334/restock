#!/usr/bin/env python3
"""Fetch the current store price of every catalog item and store link.

Reads each Local To-do catalog file in .storage (home_items, 3d_filaments, ...),
except the order, history and question lists. For each item it reads every store
link: Victory, Rami Levy, Shufersal and bug. A "Product <store>: none" line skips
that store. It writes www/restock-prices.json in the Home Assistant config directory.

A failed read keeps the old entry and its old check date. Use --max-age-days N to
read only the entries older than N days. Use --only "<item name>" for one item.

Run from <config>/restock/fetch_prices.py, next to fetch_deals.py, which it imports.
The config directory is the parent of the script directory. Use --config to set
another one. Standard library only.
"""
import argparse
import copy
import datetime as dt
import json
import re
import sys
import urllib.parse
from pathlib import Path

import fetch_deals as fd

OUTPUT_FILE = Path('www') / 'restock-prices.json'
STORAGE_DIR = Path('.storage')
TODO_FILE = re.compile(r'^local_todo\.(.+)\.ics$')
SKIP_LISTS = {'to_order', 'filaments_to_order', 'restock_history', 'shopping_questions'}
PRODUCT_LINE = re.compile(r'^\s*product\s+([a-z][a-z0-9_-]*)\s*:\s*(.*?)\s*$', re.IGNORECASE)
PRODUCT_NONE = 'none'
SHUFERSAL_OFFER = re.compile(r'"offers"\s*:\s*\{.{0,400}?"price"\s*:\s*"?([\d.]+)', re.S)
OG_PRICE = re.compile(r'<meta\s[^>]*?(?:property|name)="(?:og:|product:)*price:amount"[^>]*?content="([\d.]+)"', re.I)


def norm(value):
    return ' '.join(str(value or '').split()).lower()


def need(price):
    """Return the price, or raise when the page had none."""
    if price is None:
        raise ValueError('no price on page')
    return price


# ---------------------------------------------------------------- stores


def fetch_victory(client, url):
    return need(fd.victory_price(client.get_text(url)))


def fetch_shufersal(client, url):
    page = client.get_text(url)
    price = fd.victory_price(page)
    if price is None:
        match = SHUFERSAL_OFFER.search(page)
        price = float(match.group(1)) if match else None
    return need(price)


def fetch_ramilevy(client, url):
    barcode = fd.barcode_of(url)
    if barcode is None:
        raise ValueError('no barcode in link')
    payload = client.post_json(fd.RAMI_CATALOG_URL, {'q': barcode, 'from': 0, 'store': ''})
    product = fd.rami_product(payload, barcode)
    if product is None:
        raise ValueError('barcode not in search result')
    return need(fd.rami_price(product))


YOCHANANOF_API = 'https://api.yochananof.co.il/graphql'
YOCHANANOF_QUERY = (
    'query($s:String!){ products(search:$s, pageSize:5){ items{ sku '
    'price_range{ minimum_price{ final_price{ value } } } } } }'
)


def yochananof_product(payload, barcode):
    """Return the search item whose SKU equals the barcode exactly, or None."""
    items = (((payload or {}).get('data') or {}).get('products') or {}).get('items') or []
    return next((item for item in items if item.get('sku') == barcode), None)


def yochananof_price(product):
    return float(product['price_range']['minimum_price']['final_price']['value'])


def fetch_yochananof(client, url):
    """Final price of the exact barcode in a Yochananof search link (q=<barcode>)."""
    barcode = fd.barcode_of(url)
    if barcode is None:
        raise ValueError('no barcode in link')
    payload = client.post_json(YOCHANANOF_API, {'query': YOCHANANOF_QUERY, 'variables': {'s': barcode}})
    product = yochananof_product(payload, barcode)
    if product is None:
        raise ValueError('barcode not in search result')
    return need(yochananof_price(product))


HAZI_INIT_URL = 'https://shop.hazi-hinam.co.il/proxy/init'
HAZI_ITEM_URL = 'https://shop.hazi-hinam.co.il/proxy/api/item/getItemByBarkod/{barcode}'


def hazi_barcode(url):
    """Return the barcode of a Chatzi Chinam product link (/searchResults/<barcode>), or None."""
    tail = urllib.parse.urlparse(url).path.rstrip('/').rsplit('/', 1)[-1]
    return tail if tail.isdigit() and 6 <= len(tail) <= 14 else None


def hazi_token(client):
    """Return the anonymous guest token from /proxy/init. It is read once per client."""
    token = getattr(client, 'hazi_token', None)
    if token is None:
        payload = json.loads(client.get_text(HAZI_INIT_URL))
        token = (((payload or {}).get('Results') or {}).get('AnonymousToken') or {}).get('access_token')
        if not token:
            raise ValueError('no guest token')
        client.hazi_token = token
    return token


def hazi_item(payload, barcode):
    """Return the catalog item when its BarKod equals the barcode exactly, or None."""
    item = ((payload or {}).get('Results') or {}).get('Item')
    return item if item and str(item.get('BarKod')) == barcode else None


def hazi_price(item):
    """Return the shelf price (Price_NET, the sale price when on sale), or the regular price when NET is empty."""
    net = item.get('Price_NET') or 0
    return float(net if net > 0 else item['Price_Regular'])


def fetch_hazihinam(client, url):
    """Guest-session price of the exact barcode in a Chatzi Chinam product link."""
    barcode = hazi_barcode(url)
    if barcode is None:
        raise ValueError('no barcode in link')
    token = hazi_token(client)
    payload = json.loads(client.get_text(HAZI_ITEM_URL.format(barcode=barcode), headers={'Authorization': f'Bearer {token}'}))
    item = hazi_item(payload, barcode)
    if item is None:
        raise ValueError('barcode not in catalog')
    return need(hazi_price(item))


TIVTAAM_SEARCH_API = 'https://www.tivtaam.co.il/v2/retailers/1062/branches/924/products/autocomplete'
TIVTAAM_FILTERS = {
    'must': {'exists': ['family.id', 'family.categoriesPaths.id', 'branch.regularPrice'],
             'term': {'branch.isActive': True, 'branch.isVisible': True}},
    'mustNot': {'term': {'branch.regularPrice': 0}},
}


def tivtaam_api_url(barcode):
    """Return the Tiv Taam autocomplete request for one barcode (branch 924, app 4)."""
    query = urllib.parse.urlencode({
        'appId': 4, 'barcode': barcode, 'filters': json.dumps(TIVTAAM_FILTERS, separators=(',', ':')),
        'from': 0, 'isSearch': 'true', 'languageId': 1, 'minScore': 0, 'query': barcode, 'size': 10,
    })
    return f'{TIVTAAM_SEARCH_API}?{query}'


def tivtaam_product_id(url):
    """Return the productId of a Tiv Taam product link (?catalogProduct=<id>), or None."""
    values = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('catalogProduct') or []
    return values[0] if values and values[0].isdigit() else None


def tivtaam_product(payload, barcode):
    """Return the suggested product whose barcode equals the barcode exactly, or None."""
    products = ((((payload or {}).get('suggestions') or {}).get('suggestProducts') or {}).get('products')) or []
    return next((p for p in products if str(p.get('barcode')) == barcode), None)


def tivtaam_price(product):
    """Return the branch regular (shelf) price. Multi-buy specials are not used."""
    return float(product['branch']['regularPrice'])


def fetch_tivtaam(client, url, barcode=None):
    """Shelf price of the item's barcode at Tiv Taam, for branch 924.

    The link is a product page (?catalogProduct=<productId>), which has no barcode. The barcode comes
    from the item's other lines. The price is read only when the exact barcode's productId equals the link's.
    """
    if barcode is None:
        raise ValueError('no barcode on item')
    product_id = tivtaam_product_id(url)
    if product_id is None:
        raise ValueError('no catalogProduct id in link')
    payload = json.loads(client.get_text(tivtaam_api_url(barcode)))
    product = tivtaam_product(payload, barcode)
    if product is None:
        raise ValueError('barcode not in search result')
    if str(product.get('productId')) != product_id:
        raise ValueError('product page differs from barcode')
    return need(tivtaam_price(product))


BARCODE_IN_IMAGE = re.compile(r'/(?:gs1|media/product-images)/(\d{6,14})/')


def item_barcode(description):
    """Return the first barcode in an item's Link or Image lines, or None.

    Reads Rami Levy (q=), Shufersal (P_), Yochananof (q=), Chatzi Chinam (/searchResults/) links and the
    Victory-style Image path. Tiv Taam links are skipped: they carry a productId, not a barcode.
    """
    for line in str(description or '').splitlines():
        stripped = line.strip()
        match = BARCODE_IN_IMAGE.search(stripped) if stripped.startswith('Image:') else None
        if match:
            return match.group(1)
        link = fd.LINK_LINE.match(stripped)
        if not link:
            continue
        store, url = link.group(1).lower(), link.group(3).strip()
        if store in ('ramilevy', 'yochananof'):
            barcode = fd.barcode_of(url)
        elif store == 'shufersal':
            found = re.search(r'P_(\d{6,14})', url)
            barcode = found.group(1) if found else None
        elif store == 'hazihinam':
            barcode = hazi_barcode(url)
        else:
            barcode = None
        if barcode:
            return barcode
    return None


def fetch_generic(client, url):
    """Schema.org Product price, or an Open Graph price meta tag. For stores without their own parser."""
    page = client.get_text(url)
    price = fd.victory_price(page)
    if price is None:
        match = OG_PRICE.search(page)
        price = float(match.group(1)) if match else None
    return need(price)


FETCHERS = {
    'victory': fetch_victory,
    'ramilevy': fetch_ramilevy,
    'shufersal': fetch_shufersal,
    'yochananof': fetch_yochananof,
    'hazihinam': fetch_hazihinam,
    'tivtaam': fetch_tivtaam,
    'bug': fetch_generic,
}


# ---------------------------------------------------------------- catalog


def product_stores(description):
    """Return {store: value} from the Product lines. A value is a product name or 'none'. The first line per store wins."""
    out = {}
    for line in str(description or '').splitlines():
        match = PRODUCT_LINE.match(line)
        if match:
            out.setdefault(match.group(1).lower(), match.group(2).strip())
    return out


def price_targets(description):
    """Return ([(key, store, url)], stores_marked_none). A brand link key reads 'store (brand)'."""
    none = {store for store, value in product_stores(description).items() if value.lower() == PRODUCT_NONE}
    targets = []
    for link in fd.store_links(description):
        store = link['store']
        if store not in FETCHERS:
            continue
        key = store if link['brand'] is None else f"{store} ({link['brand']})"
        targets.append((key, store, link['url']))
    return targets, none


def catalog_files(config):
    """Return {entity: [{summary, description}]} for each catalog file in .storage."""
    out = {}
    for path in sorted((config / STORAGE_DIR).glob('local_todo.*.ics')):
        match = TODO_FILE.match(path.name)
        if not match or match.group(1) in SKIP_LISTS:
            continue
        out[f'todo.{match.group(1)}'] = fd.parse_todos(path.read_text(encoding='utf-8'))
    return out


# ---------------------------------------------------------------- merge


def due(prior, now, max_age_days):
    """True when an entry must be read again: no price yet, max age 0, or the check is at least max_age_days old."""
    if max_age_days <= 0 or not prior or 'price' not in prior:
        return True
    try:
        checked = dt.datetime.fromisoformat(prior['checked'])
    except (KeyError, TypeError, ValueError):
        return True
    return now - checked >= dt.timedelta(days=max_age_days)


def refresh(catalogs, previous, client, now, max_age_days=0, only=None, log=print):
    """Return (prices, stats). prices is the previous file's items with the fresh entries merged in.

    A failed read keeps the previous entry. A store marked none gets {'none': True}.
    Each URL is read once per run.
    """
    prices = copy.deepcopy(previous)
    stamp = now.isoformat()
    wanted = norm(only) if only else None
    cache = {}
    stats = {'items': 0, 'priced': 0, 'none': 0, 'kept': 0, 'failed': 0}
    for entity, items in catalogs.items():
        for item in items:
            name = item['summary']
            if not name or (wanted is not None and norm(name) != wanted):
                continue
            targets, none_stores = price_targets(item['description'])
            if not targets and not none_stores:
                continue
            barcode = item_barcode(item['description'])
            stats['items'] += 1
            row = prices.setdefault(entity, {}).setdefault(name, {})
            for store in sorted(none_stores & FETCHERS.keys()):
                row[store] = {'none': True, 'checked': stamp}
                stats['none'] += 1
            for key, store, url in targets:
                if store in none_stores:
                    continue
                if not due(row.get(key), now, max_age_days):
                    stats['kept'] += 1
                    continue
                key_cache = (store, url, barcode if store == 'tivtaam' else None)
                if key_cache not in cache:
                    try:
                        extra = (barcode,) if store == 'tivtaam' else ()
                        cache[key_cache] = (FETCHERS[store](client, url, *extra), None)
                    except (OSError, ValueError) as err:
                        cache[key_cache] = (None, str(err))
                price, error = cache[key_cache]
                if error is None:
                    row[key] = {'price': price, 'checked': stamp, 'url': url}
                    stats['priced'] += 1
                else:
                    stats['failed'] += 1
                    log(f'skip {key} for {name}: {error}')
    stats['requests'] = len(cache)
    stats['failed_requests'] = sum(1 for _, error in cache.values() if error)
    return prices, stats


def load_previous(path):
    """Return the items of the previous prices file, or {} when there is none. A damaged file stops the run."""
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except ValueError as err:
        raise SystemExit(f'{path} is not valid JSON, not overwritten: {err}')
    items = data.get('items') if isinstance(data, dict) else None
    return items if isinstance(items, dict) else {}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    default_config = Path(__file__).resolve().parent.parent
    parser.add_argument('--config', type=Path, default=default_config, help='Home Assistant config directory')
    parser.add_argument('--output', type=Path, default=None, help='output file, default www/restock-prices.json')
    parser.add_argument('--max-age-days', type=int, default=0, help='read only entries checked N or more days ago. 0 reads all')
    parser.add_argument('--only', default=None, help='read one item by name')
    args = parser.parse_args(argv)

    output = args.output or (args.config / OUTPUT_FILE)
    previous = load_previous(output)
    catalogs = catalog_files(args.config)
    client = fd.Client()
    now = dt.datetime.now().astimezone().replace(microsecond=0)
    prices, stats = refresh(catalogs, previous, client, now, args.max_age_days, args.only,
                            log=lambda m: print(m, file=sys.stderr))

    if stats['requests'] and stats['failed_requests'] == stats['requests']:
        print('every request failed. The output file is not changed.', file=sys.stderr)
        return 1
    payload = {'updated': now.isoformat(), 'items': prices}
    fd.write_atomic(output, payload)
    print(
        f"{stats['items']} items: {stats['priced']} prices read, {stats['none']} none, "
        f"{stats['kept']} kept as fresh, {stats['failed']} failed, {stats['requests']} requests",
        file=sys.stderr,
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
