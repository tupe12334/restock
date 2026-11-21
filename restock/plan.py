"""Order planner: split an order across stores at the lowest total cost.

Port of split-plan.js. The two must return the same result for the same input.
Shared cases live in test/plan-cases.json.
"""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal

DEFAULT_MAX_STORES = 2
MAX_STORES_LIMIT = 3
EPSILON = 1e-9
DEFAULT_DELIVERY_FEE = 30


def _is_amount(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def _cents(value: float) -> float:
    return math.floor(value * 100 + 0.5) / 100


def _offer(item: dict, store: str):
    if store in (item.get("none") or []):
        return None
    price = (item.get("prices") or {}).get(store)
    return price if _is_amount(price) else None


def _quantity(item: dict) -> int:
    try:
        n = int(item.get("quantity"))
    except (TypeError, ValueError):
        return 1
    return n if n >= 1 else 1


def _fee(store: dict) -> float:
    try:
        n = float(store.get("deliveryFee"))
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) and n > 0 else 0.0


def _min(store: dict) -> float:
    try:
        n = float(store.get("minOrder"))
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) and n > 0 else 0.0


def _cap(max_stores, store_count: int) -> int:
    try:
        n = int(max_stores)
    except (TypeError, ValueError):
        n = DEFAULT_MAX_STORES
    return max(1, min(n, store_count))


def _subsets_up_to(ids: list, cap: int) -> list:
    out: list = []

    def walk(start: int, picked: list) -> None:
        if picked:
            out.append(list(picked))
        if len(picked) == cap:
            return
        for i in range(start, len(ids)):
            picked.append(ids[i])
            walk(i + 1, picked)
            picked.pop()

    walk(0, [])
    return out


def _compare(a: dict, b: dict) -> int:
    if a["sellableUnassigned"] != b["sellableUnassigned"]:
        return a["sellableUnassigned"] - b["sellableUnassigned"]
    if abs(a["total"] - b["total"]) > EPSILON:
        return -1 if a["total"] < b["total"] else 1
    if len(a["storeIds"]) != len(b["storeIds"]):
        return len(a["storeIds"]) - len(b["storeIds"])
    ka, kb = ",".join(a["storeIds"]), ",".join(b["storeIds"])
    if ka == kb:
        return 0
    return -1 if ka < kb else 1


def plan_split(items: list | None = None, stores: dict | None = None, max_stores=DEFAULT_MAX_STORES) -> dict:
    """Plan the split. items: [{name, quantity, prices: {store: price}, none: [store]}].

    stores: {id: {name, deliveryFee, minOrder, enabled}}. Returns the same keys as planSplit in split-plan.js.
    """
    items = items or []
    stores = stores or {}
    names = [str(item.get("name")) for item in items]
    all_ids = sorted(stores)
    enabled = [i for i in all_ids if stores[i].get("enabled") is not False]
    sellable = [any(_offer(item, s) is not None for s in enabled) for item in items]

    def build(subset: list):
        assign = []
        for item in items:
            pick = None
            for s in subset:
                price = _offer(item, s)
                if price is not None and (pick is None or price < pick[1]):
                    pick = (s, price)
            assign.append(pick[0] if pick else None)

        def subtotal_of(store: str) -> float:
            return sum(
                _offer(items[i], store) * _quantity(items[i])
                for i, to in enumerate(assign) if to == store
            )

        for store in subset:
            minimum = _min(stores[store])
            while minimum > 0:
                current = subtotal_of(store)
                if current <= 0 or current >= minimum:
                    break
                move = None
                for i, to in enumerate(assign):
                    if to != store:
                        continue
                    item = items[i]
                    here = _offer(item, store)
                    for alt in subset:
                        if alt == store:
                            continue
                        there = _offer(item, alt)
                        if there is None:
                            continue
                        extra = (there - here) * _quantity(item)
                        if move is None or extra < move["extra"] - EPSILON:
                            move = {"i": i, "to": alt, "extra": extra}
                if move is None:
                    break
                assign[move["i"]] = move["to"]

        for store in subset:
            left = subtotal_of(store)
            if left > 0 and left < _min(stores[store]):
                return None

        baskets = {}
        total = 0.0
        for store in subset:
            lines = []
            for i, item in enumerate(items):
                if assign[i] == store:
                    lines.append({"name": names[i], "quantity": _quantity(item), "price": _offer(item, store)})
            if not lines:
                continue
            subtotal = _cents(sum(line["price"] * line["quantity"] for line in lines))
            fee = _fee(stores[store])
            baskets[store] = {
                "items": lines,
                "subtotal": subtotal,
                "deliveryFee": fee,
                "total": _cents(subtotal + fee),
            }
            total += subtotal + fee
        used = sorted(baskets)
        unassigned = [names[i] for i, to in enumerate(assign) if to is None]
        return {
            "baskets": baskets,
            "total": _cents(total),
            "unassigned": unassigned,
            "sellableUnassigned": sum(1 for i, to in enumerate(assign) if to is None and sellable[i]),
            "storeIds": used,
        }

    best = None
    if items and enabled:
        for subset in _subsets_up_to(enabled, _cap(max_stores, len(enabled))):
            plan = build(subset)
            if plan is not None and (best is None or _compare(plan, best) < 0):
                best = plan

    single_totals = {}
    for sid in all_ids:
        single = build([sid]) if (sid in enabled and items) else None
        single_totals[sid] = single["total"] if single and not single["unassigned"] else None
    priced = [(k, v) for k, v in single_totals.items() if v is not None]
    best_single = None
    if priced:
        k, v = priced[0]
        for k2, v2 in priced[1:]:
            if v2 < v - EPSILON:
                k, v = k2, v2
        best_single = {"store": k, "total": v}

    if best is None:
        return {
            "baskets": {},
            "total": 0,
            "unassigned": names,
            "singleStoreTotals": single_totals,
            "bestSingle": best_single,
            "savingsVsBestSingle": None,
            "feasible": len(items) == 0,
        }
    savings = None
    if best_single and best["storeIds"]:
        savings = _cents(best_single["total"] - best["total"])
    return {
        "baskets": best["baskets"],
        "total": best["total"],
        "unassigned": best["unassigned"],
        "singleStoreTotals": single_totals,
        "bestSingle": best_single,
        "savingsVsBestSingle": savings,
        "feasible": True,
    }


def format_money(amount: float) -> str:
    """Return a money text such as ₪7.00."""
    return f"₪{float(amount):.2f}"


def format_plan_summary(plan: dict, names: dict | None = None) -> str:
    """One line, as formatPlanSummary in split-plan.js. names maps a store id to its display name."""
    names = names or {}
    name_of = lambda sid: names.get(sid, sid)  # noqa: E731
    ids = sorted(plan.get("baskets", {}))
    if not ids:
        return "No store has a price for these items." if plan.get("feasible") else \
            "No plan. Each store misses its minimum order."
    parts = [f"{name_of(i)} {format_money(plan['baskets'][i]['subtotal'])} "
             f"({len(plan['baskets'][i]['items'])} items)" for i in ids]
    text = f"Best plan: {' + '.join(parts)} = {format_money(plan['total'])} incl. delivery"
    single = plan.get("bestSingle")
    saving = plan.get("savingsVsBestSingle")
    if single and saving is not None:
        label = f"{name_of(single['store'])} {format_money(single['total'])}"
        if saving > EPSILON:
            text += f" — saves {format_money(saving)} vs. best single store ({label})"
        else:
            text += f" — no split is cheaper than the best single store ({label})"
    return text
