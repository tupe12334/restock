"""Standalone HTTP server: the card page, the card files, and the REST API under /api.

SECURITY: there is no login. Bind to 127.0.0.1 unless the network is trusted.
"""
from __future__ import annotations

import json
import re
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from . import deals as deals_mod
from . import order, prices as prices_mod
from . import web
from .storage import FilesStorage, NotFound, StorageError

MAX_BODY = 64 * 1024
STATIC = {'/restock-card.js': 'restock-card.js', '/split-plan.js': 'split-plan.js'}
ITEM_PATH = re.compile(r'^/api/lists/([^/]+)/items(?:/([^/]+))?$')
OFF_SEARCH = 'https://search.openfoodfacts.org/search?{query}'
IMAGE_LIMIT = 8
UNKNOWN_IMAGE_TIMEOUT = 10


class App:
    """Shared state: storage, data folder, repository folder for the card files, and a write lock."""

    def __init__(self, data_dir: Path, repo_dir: Path, image_search=None):
        self.data_dir = Path(data_dir)
        self.repo_dir = Path(repo_dir)
        self.storage = FilesStorage(self.data_dir)
        self.lock = threading.Lock()
        self.image_search = image_search or default_image_search

    def read_json(self, name: str, empty: dict) -> dict:
        path = self.data_dir / name
        if not path.exists():
            return empty
        return json.loads(path.read_text(encoding='utf-8'))


def default_image_search(query: str) -> list[str]:
    """Open Food Facts photo search. Returns up to IMAGE_LIMIT image URLs."""
    url = OFF_SEARCH.format(query=urllib.parse.urlencode(
        {'q': query, 'page_size': IMAGE_LIMIT, 'fields': 'product_name,brands,image_front_small_url'}))
    req = urllib.request.Request(url, headers={'User-Agent': 'restock/1.0 (+https://github.com/tupe12334/restock-card)'})
    with urllib.request.urlopen(req, timeout=UNKNOWN_IMAGE_TIMEOUT) as resp:
        payload = json.loads(resp.read().decode('utf-8'))
    hits = payload.get('hits') or []
    out: list[str] = []
    for hit in hits:
        image = hit.get('image_front_small_url') if isinstance(hit, dict) else None
        if isinstance(image, str) and image and image not in out:
            out.append(image)
    return out[:IMAGE_LIMIT]


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'restock/1.0'

        def log_message(self, fmt, *args):  # keep test output quiet
            pass

        # ------------------------------------------------------------ helpers
        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def _json(self, status: int, payload: Any) -> None:
            self._send(status, json.dumps(payload, ensure_ascii=False).encode('utf-8'),
                       'application/json; charset=utf-8')

        def _error(self, status: int, message: str) -> None:
            self._json(status, {'error': message})

        def _body(self) -> dict | None:
            length = int(self.headers.get('Content-Length') or 0)
            if length > MAX_BODY:
                self._error(413, 'body too large')
                return None
            raw = self.rfile.read(length) if length else b''
            try:
                data = json.loads(raw.decode('utf-8') or '{}')
            except ValueError:
                self._error(400, 'body must be JSON')
                return None
            if not isinstance(data, dict):
                self._error(400, 'body must be a JSON object')
                return None
            return data

        def _route(self, method: str, handler) -> None:
            try:
                handler()
            except NotFound as err:
                self._error(404, str(err))
            except StorageError as err:
                self._error(400, str(err))
            except (OSError, ValueError) as err:
                self._error(502, str(err))
            except Exception as err:  # keep the server up; report the failure
                self._error(500, f'{type(err).__name__}: {err}')

        # ------------------------------------------------------------ verbs
        def do_GET(self):
            self._route('GET', self._get)

        def do_POST(self):
            self._route('POST', self._post)

        def do_PATCH(self):
            self._route('PATCH', self._patch)

        def do_DELETE(self):
            self._route('DELETE', self._delete)

        def _get(self):
            url = urllib.parse.urlsplit(self.path)
            path = url.path
            if path in ('/', '/index.html'):
                return self._send(200, web.render_page().encode('utf-8'), 'text/html; charset=utf-8')
            if path in STATIC:
                file = app.repo_dir / STATIC[path]
                if not file.exists():
                    return self._error(404, f'{STATIC[path]} not found in {app.repo_dir}')
                return self._send(200, file.read_bytes(), 'application/javascript; charset=utf-8')
            if path == '/api/prices':
                return self._json(200, app.read_json('prices.json', {'updated': None, 'items': {}}))
            if path == '/api/deals':
                return self._json(200, app.read_json('deals.json', {'updated': None, 'deals': {}}))
            if path == '/api/images':
                query = urllib.parse.parse_qs(url.query).get('q', [''])[0].strip()
                if not query:
                    return self._error(400, 'q is required')
                return self._json(200, {'images': app.image_search(query)})
            match = re.match(r'^/api/lists/([^/]+)$', path)
            if match:
                entity = match.group(1)
                return self._json(200, {'entity_id': entity, 'items': app.storage.read(entity)})
            return self._error(404, 'not found')

        def _post(self):
            path = urllib.parse.urlsplit(self.path).path
            if path == '/api/start-order':
                with app.lock:
                    added = order.start_order(app.storage)
                return self._json(200, {'added': added})
            match = re.match(r'^/api/lists/([^/]+)/items$', path)
            if not match:
                return self._error(404, 'not found')
            data = self._body()
            if data is None:
                return None
            summary = str(data.get('summary') or '').strip()
            if not summary:
                return self._error(400, 'summary is required')
            with app.lock:
                item = app.storage.write_add(match.group(1), summary, str(data.get('description') or ''),
                                             data.get('status') or 'needs_action')
            return self._json(201, item)

        def _item_route(self):
            path = urllib.parse.urlsplit(self.path).path
            match = ITEM_PATH.match(path)
            if not match or match.group(2) is None:
                return None
            return match.group(1), urllib.parse.unquote(match.group(2))

        def _patch(self):
            route = self._item_route()
            if route is None:
                return self._error(404, 'not found')
            data = self._body()
            if data is None:
                return None
            changes = {k: data[k] for k in ('summary', 'description', 'status') if k in data}
            entity, uid = route
            with app.lock:
                item = app.storage.write_update(entity, uid, changes)
            return self._json(200, item)

        def _delete(self):
            route = self._item_route()
            if route is None:
                return self._error(404, 'not found')
            entity, uid = route
            with app.lock:
                app.storage.write_remove(entity, uid)
            return self._send(204, b'', 'application/json')

    return Handler


def make_server(data_dir: Path, repo_dir: Path, host: str = '127.0.0.1', port: int = 8765,
                image_search=None) -> ThreadingHTTPServer:
    """Return a bound, not yet running server. Use port 0 for a free port."""
    app = App(data_dir, repo_dir, image_search)
    return ThreadingHTTPServer((host, port), make_handler(app))


__all__ = ['make_server', 'App', 'deals_mod', 'prices_mod']
