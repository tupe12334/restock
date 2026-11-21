"""Optional <data>/config.json: split_max_stores and per-store settings.

Same defaults and validation as split-plan.js storesOf and splitMaxStoresOf.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

DEFAULT_MAX_STORES = 2
MAX_STORES_LIMIT = 3
DEFAULT_DELIVERY_FEE = 30
STORE_ID = re.compile(r'[a-z][a-z0-9_-]*')

STORE_DEFAULTS: dict[str, dict[str, Any]] = {
    'victory': {'name': 'ויקטורי', 'deliveryFee': DEFAULT_DELIVERY_FEE, 'minOrder': 0, 'enabled': True},
    'ramilevy': {'name': 'רמי לוי', 'deliveryFee': DEFAULT_DELIVERY_FEE, 'minOrder': 0, 'enabled': True},
    'shufersal': {'name': 'שופרסל', 'deliveryFee': DEFAULT_DELIVERY_FEE, 'minOrder': 0, 'enabled': True},
    'yochananof': {'name': 'יוחננוף', 'deliveryFee': DEFAULT_DELIVERY_FEE, 'minOrder': 0, 'enabled': True},
    'hazihinam': {'name': 'חצי חינם', 'deliveryFee': DEFAULT_DELIVERY_FEE, 'minOrder': 0, 'enabled': True},
    'tivtaam': {'name': 'טיב טעם', 'deliveryFee': 29.9, 'minOrder': 0, 'enabled': True},
}


class ConfigError(ValueError):
    """An invalid config value."""


def _is_amount(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def stores_of(setting: Any, saved: Any = None) -> dict[str, dict[str, Any]]:
    """Return {id: {name, deliveryFee, minOrder, enabled}}. Layers: defaults, config, saved. Bad config raises."""
    if setting is not None and not isinstance(setting, dict):
        raise ConfigError('restock-card: "stores" must be a map of store id to settings')
    config = setting or {}
    out: dict[str, dict[str, Any]] = {}
    for store_id in sorted(set(STORE_DEFAULTS) | set(config)):
        if not STORE_ID.fullmatch(store_id):
            raise ConfigError(f'restock-card: store id must be one lowercase word, got "{store_id}"')
        base = dict(STORE_DEFAULTS.get(store_id, {'name': store_id, 'deliveryFee': DEFAULT_DELIVERY_FEE,
                                                  'minOrder': 0, 'enabled': True}))
        given = config.get(store_id)
        given = {} if given is None else given
        if not isinstance(given, dict):
            raise ConfigError(f'restock-card: stores.{store_id} must be an object')
        _apply(store_id, given, base)
        kept = (saved or {}).get(store_id) if isinstance(saved, dict) else None
        kept = kept if isinstance(kept, dict) else {}
        for key in ('deliveryFee', 'minOrder'):
            if _is_amount(kept.get(key)):
                base[key] = kept[key]
        out[store_id] = base
    return out


def _apply(store_id: str, given: dict[str, Any], base: dict[str, Any]) -> None:
    if given.get('name') is not None:
        name = str(given['name']).strip()
        if not name:
            raise ConfigError(f'restock-card: stores.{store_id}.name must not be empty')
        base['name'] = name
    for key in ('deliveryFee', 'minOrder'):
        if given.get(key) is not None:
            if not _is_amount(given[key]):
                raise ConfigError(f'restock-card: stores.{store_id}.{key} must be 0 or more')
            base[key] = given[key]
    if given.get('enabled') is not None:
        if not isinstance(given['enabled'], bool):
            raise ConfigError(f'restock-card: stores.{store_id}.enabled must be true or false')
        base['enabled'] = given['enabled']


def split_max_stores_of(setting: Any) -> int:
    """Return 2 for None, else an integer from 1 to 3. Anything else raises ConfigError."""
    if setting is None:
        return DEFAULT_MAX_STORES
    try:
        number = float(setting)
    except (TypeError, ValueError):
        number = math.nan
    if not (math.isfinite(number) and number == int(number) and 1 <= number <= MAX_STORES_LIMIT):
        raise ConfigError(f'restock-card: "split_max_stores" must be 1, 2 or 3, got "{setting}"')
    return int(number)


def load(data_dir: Path | str) -> dict[str, Any]:
    """Return the config.json object, or {} when the file does not exist."""
    path = Path(data_dir) / 'config.json'
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ConfigError(f'{path} must hold a JSON object')
    return data
