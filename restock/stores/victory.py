"""Victory (victoryonline). Price and quantity deals from the product page."""
from __future__ import annotations

from ..http import Client
from ..parsers import deals_from_victory, schema_price
from .base import Store, StoreError, default_http, product, today


class Victory(Store):
    id = 'victory'
    name = 'Victory'
    default_delivery_fee = 30

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        page = (http or default_http()).get_text(url)
        price = schema_price(page)
        if price is None:
            raise StoreError('no price on page')
        return product(price=price, url=url, deals=deals_from_victory(page, url, None, today()))
