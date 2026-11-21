"""The standalone page. It hosts the same <restock-card> element as Home Assistant, with no hass set.

The card then uses its REST backend (same origin, /api). The config keys are the same as in Home Assistant.
"""
from __future__ import annotations

import html
import json

PAGE_CONFIG = {
    'title': 'Home items',
    'catalog': 'todo.home_items',
    'shopping': 'todo.to_order',
    'questions': 'todo.shopping_questions',
    'history': 'todo.restock_history',
    'deals_url': '/api/deals',
    'prices_url': '/api/prices',
}

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>body {{ margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #f4f4f4; }}
main {{ max-width: 960px; margin: 0 auto; }}</style>
<script type="module" src="/restock-card.js"></script>
</head>
<body>
<main id="app"></main>
<script type="module">
  const config = {config};
  const card = document.createElement('restock-card');
  card.setConfig(config);
  document.getElementById('app').append(card);
</script>
</body>
</html>
"""


def render_page(config: dict | None = None) -> str:
    """Return the HTML page. The JSON config is escaped so it cannot close the script tag."""
    cfg = dict(PAGE_CONFIG if config is None else config)
    encoded = json.dumps(cfg, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e')
    return TEMPLATE.format(title=html.escape(str(cfg.get('title', 'Restock'))), config=encoded)
