"""Shufersal (shufersal.co.il). Price from the schema.org block, or the "offers" regex."""
from __future__ import annotations

import re

from ..http import Client
from ..parsers import shufersal_price
from .base import Store, StoreError, default_http, product

PRODUCT_BARCODE = re.compile(r'P_(\d{6,14})')


class Shufersal(Store):
    id = 'shufersal'
    name = 'Shufersal'
    default_delivery_fee = 30

    def barcode_from_link(self, url: str) -> str | None:
        found = PRODUCT_BARCODE.search(url)
        return found.group(1) if found else None

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict:
        price = shufersal_price((http or default_http()).get_text(url))
        if price is None:
            raise StoreError('no price on page')
        return product(price=price, url=url)
