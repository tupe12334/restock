"""HTTP client for store reads and the Home Assistant API. Standard library only.

It keeps a timeout, a minimum gap between requests to one host, a neutral User-Agent,
and counters for requests and failures. Tests pass a fake opener and a fake sleep.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Any, Callable

USER_AGENT = 'restock/1.0 (+https://github.com/tupe12334/restock-card)'
TIMEOUT_S = 20.0
MIN_GAP_S = 1.0


class Client:
    """Sends GET and POST requests. Waits min_gap seconds between requests to the same host."""

    def __init__(self, timeout: float = TIMEOUT_S, min_gap: float = MIN_GAP_S,
                 opener: Callable[..., Any] | None = None, sleep: Callable[[float], None] = time.sleep,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.timeout = timeout
        self.min_gap = min_gap
        self._open = opener or urllib.request.urlopen
        self._sleep = sleep
        self._clock = clock
        self._last: dict[str, float] = {}
        self.requests = 0
        self.failures = 0
        self.memo: dict[str, Any] = {}

    def _wait(self, url: str) -> None:
        host = urllib.parse.urlsplit(url).netloc
        last = self._last.get(host)
        if last is not None:
            left = self.min_gap - (self._clock() - last)
            if left > 0:
                self._sleep(left)
        self._last[host] = self._clock()
        self.requests += 1

    def _send(self, request: urllib.request.Request) -> str:
        with self._open(request, timeout=self.timeout) as resp:
            return resp.read().decode('utf-8', errors='replace')

    def get_text(self, url: str, headers: dict[str, str] | None = None) -> str:
        """Return the body of a GET. Raises OSError for a network or HTTP error."""
        self._wait(url)
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, **(headers or {})})
        try:
            return self._send(request)
        except OSError:
            self.failures += 1
            raise

    def post_json(self, url: str, body: Any, headers: dict[str, str] | None = None) -> Any:
        """Send a JSON POST and return the parsed JSON reply. Raises OSError or ValueError on failure."""
        self._wait(url)
        request = urllib.request.Request(
            url, data=json.dumps(body).encode('utf-8'), method='POST',
            headers={'Content-Type': 'application/json', 'User-Agent': USER_AGENT, **(headers or {})},
        )
        try:
            return json.loads(self._send(request))
        except OSError:
            self.failures += 1
            raise
