"""Rami Levy (rami-levy.co.il). Catalog API by barcode, with sales."""
from __future__ import annotations

from ..http import Client
from ..parsers import barcode_of_query, deals_from_rami, rami_price, rami_product
from .base import Store, StoreError, default_http, product, today

CATALOG_URL = 'https://www.rami-levy.co.il/api/catalog?'


class RamiLevy(Store):
    id = 'ramilevy'
    name = 'Rami Levy'
    default_delivery_fee = 30
    supports_lookup = True
    supports_search = True

    def barcode_from_link(self, url: str) -> str | None:
        return barcode_of_query(url)

    def _catalog(self, text: str, http: Client) -> dict:
        return http.post_json(CATALOG_URL, {'q': text, 'from': 0, 'store': ''})

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        client = http or default_http()
        code = barcode or barcode_of_query(url)
        if code is None:
            raise StoreError('no barcode in link')
        payload = self._catalog(code, client)
        row = rami_product(payload, code)
        if row is None:
            raise StoreError('barcode not in search result')
        price = rami_price(row)
        if price is None:
            raise StoreError('no price on page')
        deals = deals_from_rami(payload, code, url, None, today())
        return product(name=row.get('name'), price=price, url=url, deals=deals)

    def lookup(self, barcode: str, http: Client | None = None) -> dict | None:
        payload = self._catalog(barcode, http or default_http())
        row = rami_product(payload, barcode)
        if row is None or rami_price(row) is None:
            return None
        return product(name=row.get('name'), price=rami_price(row))

    def search(self, text: str, http: Client | None = None) -> list[dict]:
        payload = self._catalog(text, http or default_http())
        rows = payload.get('data') if isinstance(payload, dict) else None
        out = []
        for row in rows if isinstance(rows, list) else []:
            if isinstance(row, dict):
                out.append({'barcode': str(row.get('barcode')), 'name': row.get('name'), 'price': rami_price(row)})
        return out
