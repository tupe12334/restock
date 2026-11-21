# Restock

Household restock lists. For each item you run out of, keep the exact product at each store you use. Keep the stored prices and deals. Plan the cheapest order across stores. Use it from a Home Assistant dashboard, or run it on its own.

> Screenshot placeholder: add `docs/screenshot.png` of the card and of the Plan order panel.

## What it does

- Shows your household items as tiles, grouped by category. Tap a tile to add it to the order.
- Keeps one product for each store, with its link. Marks a store as "none" when it does not sell the item.
- Keeps a wanted amount and the amount you have. Shows what is missing, and fills the order up with one button.
- Keeps a brand preference per item, in the order you want.
- Stores the price of each item at each store, with the date it was checked. Shows the order total at each store.
- Reads store deals such as "2 for 20".
- Plans the order across stores at the lowest total cost, including delivery fees. Tags each order line with the store to buy at.
- Keeps open shopping questions and answers for the household, so an AI agent can ask them.
- Works in two ways: as a Home Assistant card, or as a standalone web app with a REST API and a command line tool.

An AI agent can read the order list and place the order. The project includes ready-to-use prompts for that. See [Agent prompts](#agent-prompts).

## Quick start: standalone with Docker

You need Docker with Compose.

```sh
git clone https://github.com/tupe12334/restock-card.git
cd restock-card
docker compose up -d restock
```

Open <http://localhost:8765>. The first start creates `./data`. The data folder keeps your lists, prices and deals.

The `refresh` service reads the prices and deals once a day:

```sh
docker compose up -d refresh
```

To run the tool without Docker, use Python 3.10 or newer. There is nothing to install.

```sh
python3 -m restock serve --port 8765
python3 -m restock prices --max-age-days 2
python3 -m restock deals
python3 -m restock plan --max-stores 2
python3 -m restock lookup 7290000136141
```

The tool keeps its data in `./data`. Set another folder with `--data DIR` or the `RESTOCK_DATA` environment variable. See [Standalone mode](docs/standalone.md) for every command and the REST API.

## Quick start: Home Assistant card

Use this when you already run Home Assistant and want the card on a dashboard.

### HACS

1. Open HACS. Go to Frontend.
2. Open the menu. Choose Custom repositories.
3. Add `https://github.com/tupe12334/restock-card`. Set the type to Dashboard.
4. Install Restock card.

### Manual

1. Copy `restock-card.js` and `split-plan.js` to `<your-ha-config>/www/`.
2. Open Settings, then Dashboards, then Resources.
3. Add a resource. Set the URL to `/local/restock-card.js`. Set the type to JavaScript module.

Then add a card:

```yaml
type: custom:restock-card
title: Home items
catalog: todo.home_items
shopping: todo.to_order
```

Create the Local To-do lists first. See [Home Assistant card](docs/home-assistant.md) for setup, every option, the photo and deals fetchers, and the Home Assistant services that agents use.

## Data model

An **item** is a need, for example "Milk". Its description holds line-based fields: the category, the default details, the brand order, the wanted amount, the store links and the product per store. The order list holds one entry for each item to order. The same format works in Home Assistant and in the standalone files.

See [Data model](docs/data-model.md) for every line.

## Stores

| Store id | Store | Barcode lookup | Search | Links |
| --- | --- | --- | --- | --- |
| `victory` | Victory | no | no | yes |
| `ramilevy` | Rami Levy | yes | yes | yes, with deals |
| `shufersal` | Shufersal | no | no | yes |
| `yochananof` | Yochananof | yes | yes | yes |
| `hazihinam` | Chatzi Chinam | yes | no | yes |
| `tivtaam` | Tiv Taam | yes | no | yes |
| `bug` | Any store with a schema.org price on the product page | no | no | yes |

A store with no barcode lookup is read from the product link you save. The `bug` adapter reads any product page that shows a schema.org price or an Open Graph price tag.

## Add a store

A store is an adapter in `restock/stores/`. Each adapter reads one site. See `restock/stores/base.py` for the base class.

1. Create `restock/stores/<id>.py`. Use one lowercase word for `<id>`.
2. Implement `barcode_from_link(url)` to read the barcode from a product link. Return `None` when there is none.
3. Implement `read_link(url, barcode=None)`. Return a dict with `name`, `price`, `regular_price`, `image`, `url` and `deals`. Raise `StoreError` on a failed read.
4. If the store has a search by barcode, implement `lookup(barcode)`. Return `None` when the store does not sell it. Otherwise raise `NotSupported`.
5. Register the adapter in `restock/stores/__init__.py`.
6. Add a test. Use a saved page or API answer from `tools/fixtures/` or `tests/fixtures/`. Do not use the network in tests.

Then add the store id to a list item as `Link <id>: <url>`. The card and the tools use it the same way.

## Agent prompts

Plain Markdown prompts you can copy into any AI agent:

- [`prompts/build-your-shopping-list.md`](prompts/build-your-shopping-list.md): the agent interviews you, finds the exact product at each store, asks you to approve each one, and writes the list.
- [`prompts/fetch-prices.md`](prompts/fetch-prices.md): the agent refreshes the prices, reports the total at each store, and finds the best split.
- [`prompts/order-with-your-agent.md`](prompts/order-with-your-agent.md): the agent prepares one order per store. It never logs in, never pays, and never places the order.

## Privacy

- The standalone server has no login. Run it on a trusted network only. Bind it to `127.0.0.1` unless you put it behind your own access control.
- Your lists, prices and deals stay in your data folder. Nothing is sent to the project.
- The tool sends requests to the store sites you list in your lists. It also sends the search text to Open Food Facts when you search for a photo. It does not send your lists anywhere else.
- The agent prompts never log in to a store, add to a cart, or pay. You take those steps yourself.
- Do not commit your `data/` folder or a Home Assistant token. The `.gitignore` file leaves out `data/`.

## Development

```sh
npm test
```

This runs the card and planner tests, the Home Assistant fetcher tests, and the standalone tests. CI runs the same command. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Data model](docs/data-model.md)
- [Standalone mode](docs/standalone.md)
- [Home Assistant card](docs/home-assistant.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
