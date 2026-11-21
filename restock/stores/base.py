"""Base class for store adapters, and the shared error types and product shape.

An adapter reads prices from one store. read_link reads one product link. lookup and search
use the store's barcode or text search API, when it has one. Other calls raise NotSupported.
"""
from __future__ import annotations

import datetime as dt
from typing import Any

from ..http import Client

_shared: Client | None = None


class StoreError(ValueError):
    """A failed read: no price, no barcode, a page or API that did not match."""


class NotSupported(StoreError):
    """The store has no API for this call."""


def default_http() -> Client:
    """Return one shared client for calls that pass no client."""
    global _shared
    if _shared is None:
        _shared = Client()
    return _shared


def product(name: str | None = None, price: float | None = None, regular_price: float | None = None,
            image: str | None = None, url: str | None = None, deals: list | None = None) -> dict[str, Any]:
    """Return the product shape: {name, price, regular_price, image, url, deals}."""
    return {
        'name': name, 'price': price, 'regular_price': regular_price if regular_price is not None else price,
        'image': image, 'url': url, 'deals': deals or [],
    }


def today() -> dt.date:
    return dt.date.today()


class Store:
    """One store. Subclasses set id, name, and the fee and minimum defaults."""

    id: str = ''
    name: str = ''
    default_delivery_fee: float = 30
    default_min_order: float = 0
    supports_lookup: bool = False
    supports_search: bool = False

    def barcode_from_link(self, url: str) -> str | None:
        """Return the barcode carried by a product link, or None."""
        return None

    def read_link(self, url: str, barcode: str | None = None, http: Client | None = None) -> dict[str, Any]:
        """Read one product page or API. Raise StoreError for a failed read."""
        raise NotImplementedError

    def lookup(self, barcode: str, http: Client | None = None) -> dict[str, Any] | None:
        """Find a product by barcode. Raise NotSupported when the store has no barcode API."""
        raise NotSupported(f'{self.id} has no barcode lookup')

    def search(self, text: str, http: Client | None = None) -> list[dict[str, Any]]:
        """Search products by text. Raise NotSupported when the store has no search API."""
        raise NotSupported(f'{self.id} has no text search')
