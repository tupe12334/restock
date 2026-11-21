"""Yochananof (yochananof.co.il). GraphQL search. The SKU must equal the barcode exactly."""
from __future__ import annotations

from ..http import Client
from ..parsers import barcode_of_query
from .base import Store, StoreError, default_http, product

API_URL = 'https://api.yochananof.co.il/graphql'
QUERY = (
    'query($s:String!){ products(search:$s, pageSize:5){ items{ sku '
    'price_range{ minimum_price{ final_price{ value } } } } } }'
)


def _items(payload: dict | None) -> list:
    return (((payload or {}).get('data') or {}).get('products') or {}).get('items') or []


def _final_price(item: dict) -> float:
    return float(item['price_range']['minimum_price']['final_price']['value'])


class Yochananof(Store):
    id = 'yochananof'
    name = 'Yochananof'
    default_delivery_fee = 30
    supports_lookup = True
    supports_search = True

    def barcode_from_link(self, url: str) -> str | None:
        return barcode_of_query(url)

    def _query(self, text: str, http: Client) -> list:
        return _items(http.post_json(API_URL, {'query': QUERY, 'variables': {'s': text}}))

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        code = barcode or barcode_of_query(url)
        if code is None:
            raise StoreError('no barcode in link')
        match = next((i for i in self._query(code, http or default_http()) if i.get('sku') == code), None)
        if match is None:
            raise StoreError('barcode not in search result')
        return product(price=_final_price(match), url=url)

    def lookup(self, barcode: str, http: Client | None = None) -> dict | None:
        match = next((i for i in self._query(barcode, http or default_http()) if i.get('sku') == barcode), None)
        return None if match is None else product(price=_final_price(match))

    def search(self, text: str, http: Client | None = None) -> list[dict]:
        return [{'barcode': str(i.get('sku')), 'price': _final_price(i)}
                for i in self._query(text, http or default_http())]
