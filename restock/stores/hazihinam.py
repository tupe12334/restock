"""Chatzi Chinam (shop.hazi-hinam.co.il). Guest token from /proxy/init, then item by barcode.

The guest token is read once per http client and kept in client.memo.
"""
from __future__ import annotations

import json
from typing import Any

from ..http import Client
from ..parsers import hazihinam_barcode
from .base import Store, StoreError, default_http, product

INIT_URL = 'https://shop.hazi-hinam.co.il/proxy/init'
ITEM_URL = 'https://shop.hazi-hinam.co.il/proxy/api/item/getItemByBarkod/{barcode}'
TOKEN_KEY = 'hazihinam_token'


def _token(http: Client) -> str:
    token = http.memo.get(TOKEN_KEY)
    if token is None:
        payload = json.loads(http.get_text(INIT_URL))
        token = (((payload or {}).get('Results') or {}).get('AnonymousToken') or {}).get('access_token')
        if not token:
            raise StoreError('no guest token')
        http.memo[TOKEN_KEY] = token
    return token


def _item(http: Client, barcode: str) -> dict[str, Any] | None:
    """Return the catalog item whose BarKod equals the barcode exactly, or None."""
    token = _token(http)
    payload = json.loads(http.get_text(ITEM_URL.format(barcode=barcode), headers={'Authorization': f'Bearer {token}'}))
    item = ((payload or {}).get('Results') or {}).get('Item')
    return item if item and str(item.get('BarKod')) == barcode else None


def _shelf_price(item: dict[str, Any]) -> float:
    """Price_NET (the sale price when on sale), or Price_Regular when NET is empty."""
    net = item.get('Price_NET') or 0
    return float(net if net > 0 else item['Price_Regular'])


class HaziHinam(Store):
    id = 'hazihinam'
    name = 'חצי חינם'
    default_delivery_fee = 30
    supports_lookup = True

    def barcode_from_link(self, url: str) -> str | None:
        return hazihinam_barcode(url)

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        client = http or default_http()
        code = hazihinam_barcode(url)
        if code is None:
            raise StoreError('no barcode in link')
        item = _item(client, code)
        if item is None:
            raise StoreError('barcode not in catalog')
        return product(price=_shelf_price(item), url=url)

    def lookup(self, barcode: str, http: Client | None = None) -> dict | None:
        item = _item(http or default_http(), barcode)
        return None if item is None else product(name=item.get('Name'), price=_shelf_price(item))
