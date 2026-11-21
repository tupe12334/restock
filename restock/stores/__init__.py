"""Store registry. Built-in adapters, plus any adapter you register.

To add a store, write restock/stores/<id>.py with a Store subclass, import it below,
and add an instance to BUILTIN. See README "Add a store".
"""
from __future__ import annotations

from .base import NotSupported, Store, StoreError
from .bug import Generic
from .hazihinam import HaziHinam
from .ramilevy import RamiLevy
from .shufersal import Shufersal
from .tivtaam import TivTaam
from .victory import Victory
from .yochananof import Yochananof

BUILTIN = (Victory(), RamiLevy(), Shufersal(), Yochananof(), HaziHinam(), TivTaam(), Generic())

_registry: dict[str, Store] = {}


def register(adapter: Store) -> None:
    """Add an adapter. Its id must be one lowercase word, and not already registered."""
    if not adapter.id or not adapter.id.replace('_', '').replace('-', '').isalnum() or adapter.id != adapter.id.lower():
        raise StoreError(f'store id must be one lowercase word, got {adapter.id!r}')
    if adapter.id in _registry:
        raise StoreError(f'store {adapter.id} is already registered')
    _registry[adapter.id] = adapter


for _adapter in BUILTIN:
    register(_adapter)


def get(store_id: str) -> Store:
    """Return the adapter for an id. Raises KeyError for an unknown id."""
    return _registry[store_id]


def ids() -> list[str]:
    """Return the registered ids, in registration order."""
    return list(_registry)


__all__ = ['get', 'ids', 'register', 'Store', 'StoreError', 'NotSupported']
