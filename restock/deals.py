"""Store deals: "N for X" offers from Victory and Rami Levy product pages. Same rules as tools/fetch_deals.py."""
from __future__ import annotations

import datetime as dt
from typing import Callable

from . import model
from .http import Client
from .parsers import barcode_of_query as rami_barcode
from .parsers import deals_from_rami, deals_from_victory
from .stores.ramilevy import CATALOG_URL

DEAL_STORES = ('victory', 'ramilevy')


def collect(items: list[dict], http: Client, today: dt.date,
            log: Callable[[str], None] = print) -> dict[str, list[dict]]:
    """Return {item name: [deal]} for items with an active deal. A failed link is logged and skipped."""
    cache: dict[tuple, object] = {}
    failed: set[tuple] = set()
    deals: dict[str, list[dict]] = {}
    for item in items:
        name = item['summary']
        for link in model.store_links(item['description']):
            store = link['store']
            if store not in DEAL_STORES:
                continue
            key = (store, link['url'])
            if key in failed:
                continue
            try:
                if key not in cache:
                    if store == 'victory':
                        cache[key] = http.get_text(link['url'])
                    else:
                        barcode = rami_barcode(link['url'])
                        if barcode is None:
                            raise ValueError('no barcode in link')
                        cache[key] = (barcode, http.post_json(CATALOG_URL, {'q': barcode, 'from': 0, 'store': ''}))
            except (OSError, ValueError) as err:
                failed.add(key)
                log(f'skip {store} for {name}: {err}')
                continue
            if store == 'victory':
                found = deals_from_victory(cache[key], link['url'], link['brand'], today)
            else:
                barcode, payload = cache[key]
                found = deals_from_rami(payload, barcode, link['url'], link['brand'], today)
            if found:
                deals.setdefault(name, []).extend(found)
    return deals
