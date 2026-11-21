"""Tiv Taam (tivtaam.co.il). Autocomplete search by barcode, for one branch.

The link is a product page (?catalogProduct=<id>) with no barcode, so the barcode comes from the
item's other lines. The price is read only when the barcode's productId equals the link's id.
"""
from __future__ import annotations

import json
import urllib.parse
from typing import Any

from ..http import Client
from ..parsers import tivtaam_product_id
from .base import Store, StoreError, default_http, product

SEARCH_API = 'https://www.tivtaam.co.il/v2/retailers/{retailer}/branches/{branch}/products/autocomplete'
# Adapter config defaults. The retailer id and the branch id are the ones the store's site uses.
RETAILER_ID = 1062
BRANCH_ID = 924
APP_ID = 4
LANGUAGE_ID = 1
FILTERS = {
    'must': {'exists': ['family.id', 'family.categoriesPaths.id', 'branch.regularPrice'],
             'term': {'branch.isActive': True, 'branch.isVisible': True}},
    'mustNot': {'term': {'branch.regularPrice': 0}},
}


def api_url(barcode: str, retailer: int = RETAILER_ID, branch: int = BRANCH_ID) -> str:
    """Return the autocomplete request for one barcode."""
    query = urllib.parse.urlencode({
        'appId': APP_ID, 'barcode': barcode, 'filters': json.dumps(FILTERS, separators=(',', ':')),
        'from': 0, 'isSearch': 'true', 'languageId': LANGUAGE_ID, 'minScore': 0, 'query': barcode, 'size': 10,
    })
    return f"{SEARCH_API.format(retailer=retailer, branch=branch)}?{query}"


def _product(payload: Any, barcode: str) -> dict[str, Any] | None:
    """Return the suggested product whose barcode equals the barcode exactly, or None."""
    rows = ((((payload or {}).get('suggestions') or {}).get('suggestProducts') or {}).get('products')) or []
    return next((p for p in rows if str(p.get('barcode')) == barcode), None)


class TivTaam(Store):
    id = 'tivtaam'
    name = 'טיב טעם'
    default_delivery_fee = 29.9
    supports_lookup = True
    supports_search = False

    def _search(self, barcode: str, http: Client) -> Any:
        return json.loads(http.get_text(api_url(barcode)))

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        if barcode is None:
            raise StoreError('no barcode on item')
        product_id = tivtaam_product_id(url)
        if product_id is None:
            raise StoreError('no catalogProduct id in link')
        found = _product(self._search(barcode, http or default_http()), barcode)
        if found is None:
            raise StoreError('barcode not in search result')
        if str(found.get('productId')) != product_id:
            raise StoreError('product page differs from barcode')
        return product(price=float(found['branch']['regularPrice']), url=url)

    def lookup(self, barcode: str, http: Client | None = None) -> dict | None:
        found = _product(self._search(barcode, http or default_http()), barcode)
        if found is None:
            return None
        return product(name=found.get('localName'), price=float(found['branch']['regularPrice']))
