# Standalone mode

The standalone mode runs without Home Assistant. It keeps your lists in JSON files, and it serves the same card in a web page. The card uses the REST API of the server.

## Folders

```
data/
  config.json            optional: split_max_stores and store settings
  lists/
    home_items.json      catalog: one item for each need
    to_order.json        order list
    shopping_questions.json
    restock_history.json
  prices.json            written by: python3 -m restock prices
  deals.json             written by: python3 -m restock deals
```

`data/` is the default. Set another folder with `--data DIR` or the `RESTOCK_DATA` environment variable.

`config.json` example:

```json
{
  "split_max_stores": 2,
  "stores": {
    "ramilevy": {"deliveryFee": 30, "minOrder": 150},
    "shufersal": {"enabled": false}
  }
}
```

The keys and the rules are the same as the `stores` and `split_max_stores` card options. See [Home Assistant card](home-assistant.md#order-split).

## Commands

Run every command from the repository folder, or inside the Docker container.

| Command | What it does |
| --- | --- |
| `python3 -m restock serve [--host 127.0.0.1] [--port 8765]` | Start the web page and the REST API. |
| `python3 -m restock prices [--max-age-days N] [--only NAME]` | Read the store links and write `prices.json`. A failed read keeps the old price. |
| `python3 -m restock deals` | Read the Victory and Rami Levy deals and write `deals.json`. |
| `python3 -m restock plan [--max-stores N] [--apply] [--json]` | Plan the order split. `--apply` writes `Buy at:` to each order entry. |
| `python3 -m restock lookup <barcode>` | Look a barcode up at each store that has a barcode API. Prints JSON. |
| `python3 -m restock start-order` | Add each item with `Every order` to the order list. |

Global options come before the command:

- `--data DIR`: the data folder.
- `--backend files|homeassistant`: the list storage. The default is `files`.
- `--ha-config DIR`, `--ha-url URL`, `--ha-token TOKEN`: Home Assistant options for the `homeassistant` backend. The URL and token can also come from `HA_URL` and `HA_TOKEN`. The ICS mode reads a Home Assistant config folder and does not write.

## Web page

`GET /` serves the page. It creates a `<restock-card>` element with the same config keys as Home Assistant, and it sets no `hass`. The card then uses the REST API at `/api`.

`GET /restock-card.js` and `GET /split-plan.js` serve the two card files from the repository folder. Use `--repo DIR` to serve them from another folder.

## REST API

Entity ids are the same as in Home Assistant, for example `todo.home_items`. Errors return `{"error": "message"}`.

| Method and path | Body | Reply |
| --- | --- | --- |
| `GET /api/lists/{entity}` | none | `{"entity_id", "items": [{uid, summary, description, status}]}` |
| `POST /api/lists/{entity}/items` | `{summary, description?, status?}` | 201 and the item |
| `PATCH /api/lists/{entity}/items/{uid}` | any of `summary`, `description`, `status` | the item. 404 for an unknown uid |
| `DELETE /api/lists/{entity}/items/{uid}` | none | 204. 404 for an unknown uid |
| `POST /api/start-order` | none | `{"added": n}` |
| `GET /api/prices` | none | the contents of `prices.json`, or an empty object |
| `GET /api/deals` | none | the contents of `deals.json`, or an empty object |
| `GET /api/images?q=...` | none | `{"images": [url, ...]}` from Open Food Facts. 502 when the search fails |

`status` is `needs_action` or `completed`. A body larger than 64 KiB returns 413.

Example:

```sh
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"summary":"Milk","description":"Dairy\n3%"}' \
  http://127.0.0.1:8765/api/lists/todo.home_items/items
```

## Security

The server has no login. Bind it to `127.0.0.1` unless the network is trusted. The Docker compose file publishes the port on the host loopback address only. Put a reverse proxy with authentication in front of it if you need remote access.

## Refresh schedule

The Docker `refresh` service runs `prices`, then `deals`, then waits 24 hours, in a loop. Without Docker, use cron:

```
20 6 * * * cd /path/to/restock-card && python3 -m restock prices --max-age-days 1 && python3 -m restock deals
```
