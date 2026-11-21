"""Generic adapter. Reads the price from any product page: schema.org Product, else an Open Graph price tag."""
from __future__ import annotations

from ..http import Client
from ..parsers import open_graph_price, schema_price
from .base import Store, StoreError, default_http, product


class Generic(Store):
    id = 'bug'
    name = 'Other site'
    default_delivery_fee = 30

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        page = (http or default_http()).get_text(url)
        price = schema_price(page)
        if price is None:
            price = open_graph_price(page)
        if price is None:
            raise StoreError('no price on page')
        return product(price=price, url=url)
