"""Order list actions: start a new order, build planner input, apply a split plan.

Same rules as restock-card.js: Every order adds units, and Buy at is set per entry.
"""
from __future__ import annotations

from typing import Any

from . import model
from .plan import plan_split
from .prices import norm
from .storage import FilesStorage

CATALOG = 'todo.home_items'
SHOPPING = 'todo.to_order'


def _find_open(items: list[dict], name: str) -> dict | None:
    key = norm(name)
    return next((i for i in items if norm(i['summary']) == key and i.get('status') != 'completed'), None)


def start_order(storage: Any, catalog: str = CATALOG, shopping: str = SHOPPING) -> int:
    """Add each catalog item with Every order > 0 to the order list. Return the number of items changed."""
    changed = 0
    order_items = storage.read(shopping)
    for item in storage.read(catalog):
        n = model.every_order_of(item['description'])
        if n <= 0:
            continue
        existing = _find_open(order_items, item['summary'])
        if existing is not None:
            qty = model.quantity_of(existing['description']) + n
            storage.write_update(shopping, existing['uid'],
                                 {'description': model.with_quantity(existing['description'], qty)})
            existing['description'] = model.with_quantity(existing['description'], qty)
        else:
            description = model.format_entry(
                n,
                details=model.default_details_of(item['description']),
                links=model.store_links(item['description']),
                products=model.product_stores(item['description']),
            )
            created = storage.write_add(shopping, item['summary'], description)
            order_items.append(created)
        changed += 1
    return changed


def planner_items(storage: Any, prices: dict, shopping: str = SHOPPING) -> list[dict]:
    """Planner input for each open order entry: name, quantity, prices per store, and none stores."""
    by_name: dict[str, dict] = {}
    for entity, rows in (prices.get('items') or {}).items():
        for name, stores in rows.items():
            entry = by_name.setdefault(norm(name), {'prices': {}, 'none': []})
            for store, row in stores.items():
                if '(' in store:
                    continue  # brand links are not planned
                if row.get('none'):
                    entry['none'].append(store)
                elif isinstance(row.get('price'), (int, float)):
                    entry['prices'][store] = row['price']
    out = []
    for order in storage.read(shopping):
        if order.get('status') == 'completed':
            continue
        entry = by_name.get(norm(order['summary']), {'prices': {}, 'none': []})
        out.append({
            'name': order['summary'],
            'quantity': model.quantity_of(order['description']),
            'prices': entry['prices'],
            'none': entry['none'],
        })
    return out


def apply_plan(storage: Any, plan: dict, shopping: str = SHOPPING) -> int:
    """Write Buy at to each order entry in a basket. Other lines are kept. Return the number tagged."""
    tagged = 0
    orders = storage.read(shopping)
    for store, basket in plan.get('baskets', {}).items():
        for line in basket['items']:
            order = _find_open(orders, line['name'])
            if order is None:
                continue
            description = model.with_buy_at(order['description'], store)
            storage.write_update(shopping, order['uid'], {'description': description})
            order['description'] = description
            tagged += 1
    return tagged


def make_plan(storage: Any, prices: dict, stores: dict, max_stores: int, shopping: str = SHOPPING) -> dict:
    return plan_split(items=planner_items(storage, prices, shopping), stores=stores, max_stores=max_stores)


__all__ = ['start_order', 'planner_items', 'apply_plan', 'make_plan', 'FilesStorage']
