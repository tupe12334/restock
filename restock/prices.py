"""Stored prices: read each store link of each catalog item, write prices.json.

Same rules as tools/fetch_prices.py. A failed read keeps the old entry. A store marked
"Product <store>: none" is not read. Each URL is read once per run.
"""
from __future__ import annotations

import copy
import datetime as dt
import re
from typing import Any, Callable

from . import model
from .http import Client
from .stores import get as get_store
from .stores import ids as store_ids
from .stores.base import StoreError

BARCODE_IN_IMAGE = re.compile(r'/(?:gs1|media/product-images)/(\d{6,14})/')
SKIP_LISTS = {'todo.to_order', 'todo.filaments_to_order', 'todo.restock_history', 'todo.shopping_questions'}


def norm(value: str) -> str:
    return ' '.join(str(value or '').split()).lower()


def item_barcode(description: str) -> str | None:
    """First barcode in an Image line, or carried by a Link of a known store."""
    for line in str(description or '').splitlines():
        stripped = line.strip()
        if stripped.lower().startswith('image:'):
            m = BARCODE_IN_IMAGE.search(stripped)
            if m:
                return m.group(1)
            continue
        link = model.LINK_LINE.match(stripped)
        if not link:
            continue
        store = link.group(1).lower()
        if store in store_ids():
            barcode = get_store(store).barcode_from_link(link.group(3).strip())
            if barcode:
                return barcode
    return None


def price_targets(description: str) -> tuple[list[tuple[str, str, str]], set[str]]:
    """Return ([(key, store, url)], stores marked none). A brand link key reads 'store (brand)'."""
    none = {s for s, value in model.product_stores(description).items() if value.lower() == model.PRODUCT_NONE}
    targets = []
    for link in model.store_links(description):
        store = link['store']
        if store not in store_ids():
            continue
        key = store if link['brand'] is None else f"{store} ({link['brand']})"
        targets.append((key, store, link['url']))
    return targets, none


def due(prior: dict | None, now: dt.datetime, max_age_days: int) -> bool:
    """True when the entry must be read: no price yet, max age 0, or the check is old enough."""
    if max_age_days <= 0 or not prior or 'price' not in prior:
        return True
    try:
        checked = dt.datetime.fromisoformat(prior['checked'])
    except (KeyError, TypeError, ValueError):
        return True
    return now - checked >= dt.timedelta(days=max_age_days)


def refresh(catalogs: dict[str, list[dict]], previous: dict[str, Any], http: Client, now: dt.datetime,
            max_age_days: int = 0, only: str | None = None,
            log: Callable[[str], None] = print) -> tuple[dict[str, Any], dict[str, int]]:
    """Return (items, stats). items is the previous items with the fresh entries merged in."""
    prices = copy.deepcopy(previous)
    stamp = now.isoformat()
    wanted = norm(only) if only else None
    cache: dict[tuple, tuple[Any, str | None]] = {}
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
            for store in sorted(none_stores & set(store_ids())):
                row[store] = {'none': True, 'checked': stamp}
                stats['none'] += 1
            for key, store, url in targets:
                if store in none_stores:
                    continue
                if not due(row.get(key), now, max_age_days):
                    stats['kept'] += 1
                    continue
                cache_key = (store, url, barcode)
                if cache_key not in cache:
                    try:
                        found = get_store(store).read_link(url, barcode, http)
                        cache[cache_key] = (found['price'], None)
                    except (OSError, ValueError) as err:
                        cache[cache_key] = (None, str(err))
                price, error = cache[cache_key]
                if error is None:
                    row[key] = {'price': price, 'checked': stamp, 'url': url}
                    stats['priced'] += 1
                else:
                    stats['failed'] += 1
                    log(f'skip {key} for {name}: {error}')
    stats['requests'] = len(cache)
    stats['failed_requests'] = sum(1 for _, error in cache.values() if error)
    return prices, stats


__all__ = ['refresh', 'item_barcode', 'price_targets', 'due', 'norm', 'StoreError']
