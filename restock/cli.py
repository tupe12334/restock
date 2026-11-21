"""Command line: python3 -m restock <command>. Standard library only.

Commands: prices, deals, plan, lookup, start-order, serve.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

from . import config as config_mod
from . import deals as deals_mod
from . import order, plan as plan_mod, prices as prices_mod
from .http import Client
from .stores import get as get_store
from .stores import ids as store_ids
from .stores.base import NotSupported, StoreError

ORDER_LISTS = prices_mod.SKIP_LISTS
CATALOG = 'todo.home_items'
PRICES_FILE = 'prices.json'
DEALS_FILE = 'deals.json'


def default_data_dir() -> Path:
    return Path(os.environ.get('RESTOCK_DATA', 'data'))


def _storage(args):
    if args.backend == 'homeassistant':
        from .storage import HomeAssistantStorage
        return HomeAssistantStorage(url=args.ha_url or os.environ.get('HA_URL'),
                                    token=args.ha_token or os.environ.get('HA_TOKEN'),
                                    config_dir=args.ha_config)
    from .storage import FilesStorage
    return FilesStorage(args.data)


def _catalogs(storage) -> dict[str, list[dict]]:
    out = {}
    for entity in storage.list_names():
        if entity in ORDER_LISTS:
            continue
        out[entity] = storage.read(entity)
    return out


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def _read_json(path: Path, empty: dict) -> dict:
    if not path.exists():
        return empty
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except ValueError as err:
        raise SystemExit(f'{path} is not valid JSON, not overwritten: {err}')
    return data if isinstance(data, dict) else empty


def cmd_prices(args) -> int:
    storage = _storage(args)
    path = args.data / PRICES_FILE
    previous = _read_json(path, {}).get('items') or {}
    client = Client()
    now = dt.datetime.now().astimezone().replace(microsecond=0)
    items, stats = prices_mod.refresh(_catalogs(storage), previous, client, now, args.max_age_days, args.only,
                                      log=lambda m: print(m, file=sys.stderr))
    if stats['requests'] and stats['failed_requests'] == stats['requests']:
        print('every request failed. The output file is not changed.', file=sys.stderr)
        return 1
    _write_json(path, {'updated': now.isoformat(), 'items': items})
    print(f"{stats['items']} items: {stats['priced']} prices read, {stats['none']} none, "
          f"{stats['kept']} kept as fresh, {stats['failed']} failed, {stats['requests']} requests", file=sys.stderr)
    return 0


def cmd_deals(args) -> int:
    storage = _storage(args)
    client = Client()
    found = deals_mod.collect(storage.read(CATALOG), client, dt.date.today(),
                              log=lambda m: print(m, file=sys.stderr))
    if client.requests and client.failures == client.requests:
        print('every request failed. The output file is not changed.', file=sys.stderr)
        return 1
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    _write_json(args.data / DEALS_FILE, {'updated': now, 'deals': found})
    print(f'{len(found)} items with deals, {client.requests} requests', file=sys.stderr)
    return 0


def _settings(args) -> tuple[dict, int]:
    cfg = config_mod.load(args.data)
    stores = config_mod.stores_of(cfg.get('stores'))
    max_stores = args.max_stores if args.max_stores is not None else config_mod.split_max_stores_of(
        cfg.get('split_max_stores'))
    return stores, max_stores


def cmd_plan(args) -> int:
    storage = _storage(args)
    prices = _read_json(args.data / PRICES_FILE, {'items': {}})
    stores, max_stores = _settings(args)
    result = order.make_plan(storage, prices, stores, max_stores)
    names = {sid: cfg['name'] for sid, cfg in stores.items()}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(plan_mod.format_plan_summary(result, names))
        for sid, basket in sorted(result['baskets'].items()):
            print(f"\n{names.get(sid, sid)}: subtotal {plan_mod.format_money(basket['subtotal'])}, "
                  f"delivery {plan_mod.format_money(basket['deliveryFee'])}")
            for line in basket['items']:
                print(f"  {line['quantity']} x {line['name']} @ {plan_mod.format_money(line['price'])}")
        if result['unassigned']:
            print('\nNo plan covers: ' + ', '.join(result['unassigned']))
    if args.apply:
        tagged = order.apply_plan(storage, result)
        print(f'\nTagged {tagged} order entries with Buy at.')
    return 0


def cmd_lookup(args) -> int:
    client = Client()
    out: dict[str, object] = {}
    for sid in store_ids():
        adapter = get_store(sid)
        if not adapter.supports_lookup:
            out[sid] = {'error': 'no barcode lookup'}
            continue
        try:
            found = adapter.lookup(args.barcode, client)
            out[sid] = found if found is not None else None
        except NotSupported as err:
            out[sid] = {'error': str(err)}
        except (OSError, StoreError, ValueError) as err:
            out[sid] = {'error': str(err)}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def cmd_start_order(args) -> int:
    added = order.start_order(_storage(args))
    print(f'{added} items added or raised on the order list.')
    return 0


def cmd_serve(args) -> int:
    from .server import make_server
    repo = Path(args.repo) if args.repo else Path(__file__).resolve().parent.parent
    server = make_server(args.data, repo, args.host, args.port)
    host, port = server.server_address[:2]
    print(f'restock serving http://{host}:{port} (data: {args.data}, repo: {repo})', file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='python3 -m restock', description='Household restock lists.')
    parser.add_argument('--data', type=Path, default=default_data_dir(),
                        help='data folder (default: env RESTOCK_DATA, else ./data)')
    parser.add_argument('--backend', choices=['files', 'homeassistant'], default='files')
    parser.add_argument('--ha-config', type=Path, default=None, help='Home Assistant config folder (ICS read)')
    parser.add_argument('--ha-url', default=None, help='Home Assistant URL (API mode); or env HA_URL')
    parser.add_argument('--ha-token', default=None, help='Home Assistant token; or env HA_TOKEN')
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('prices', help='refresh stored prices')
    p.add_argument('--max-age-days', type=int, default=0, help='read only entries checked N or more days ago')
    p.add_argument('--only', default=None, help='read one item by name')
    p.set_defaults(func=cmd_prices)

    p = sub.add_parser('deals', help='refresh store deals')
    p.set_defaults(func=cmd_deals)

    p = sub.add_parser('plan', help='plan the order split across stores')
    p.add_argument('--max-stores', type=int, default=None, choices=[1, 2, 3])
    p.add_argument('--apply', action='store_true', help='write Buy at to the order entries')
    p.add_argument('--json', action='store_true', help='print the full plan as JSON')
    p.set_defaults(func=cmd_plan)

    p = sub.add_parser('lookup', help='look a barcode up at every store with a barcode API')
    p.add_argument('barcode')
    p.set_defaults(func=cmd_lookup)

    p = sub.add_parser('start-order', help='add Every order units to the order list')
    p.set_defaults(func=cmd_start_order)

    p = sub.add_parser('serve', help='run the standalone web server')
    p.add_argument('--host', default='127.0.0.1')
    p.add_argument('--port', type=int, default=8765)
    p.add_argument('--repo', default=None, help='folder with restock-card.js and split-plan.js')
    p.set_defaults(func=cmd_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
