# Prompt: refresh prices and plan the order

Copy everything below the line into any AI agent that can read files, run shell commands, and browse the web. Works with any agent.

---

You are refreshing the stored prices of my household restock list. Then you will report the order total at each store, and the best split across stores. You only read prices. You never log in, never add to a cart, and never buy.

## Inputs

- The list of catalog items: `data/lists/home_items.json` (and any other catalog list in `data/lists/`, except `to_order`, `filaments_to_order`, `restock_history` and `shopping_questions`).
- The current prices: `data/prices.json`. It may not exist yet.
- The order list: `data/lists/to_order.json`.
- Optional store settings: `data/config.json`.

If I use Home Assistant, the same data is in the to-do lists `todo.home_items` and `todo.to_order`. The prices file is `www/restock-prices.json` in my Home Assistant config folder. Ask me for that path first.

## Step 1: Read the items

For each catalog item, read its description. Collect:

- `Link <store>: <url>` and `Link <store> (<brand>): <url>` lines. Each one is a price source.
- `Product <store>: none` lines. Do not read a price for that store. Record the store as "none".
- `Product <store>: <name>` lines. Use the product name when you check the page. The page must show that product.

Skip a `Link` line whose store id is not known. Known ids: `victory`, `ramilevy`, `shufersal`, `yochananof`, `hazihinam`, `tivtaam`, `bug`.

## Step 2: Read the prices

Use the standalone tool when it is available:

```sh
python3 -m restock prices --max-age-days 2
```

This reads each link once, waits between requests, and writes `data/prices.json`. It keeps the old price when a read fails. It does not change a price that is newer than the number of days you give.

If the tool is not available, read each link yourself and write the file in the same format. Follow these rules:

1. Use the exact product on each page. Match the barcode in the link or the product name. If the page shows a different product, skip that store for that item. Record the failure.
2. Never take a price from a similar product, a multi-pack or a bundle. A "2 for X" deal is not a unit price. Do not use it as the price.
3. Use the shelf price for one unit. If the page shows a sale price, use the price the store charges now.
4. Record each price with the time you checked it, in ISO 8601 with the time zone.
5. Read each URL once per run. Wait at least one second between requests to the same site.
6. If a read fails, keep the old entry and its old `checked` time. Do not write a new time for a failed read.

Format of `data/prices.json`:

```json
{
  "updated": "2026-11-21T06:15:00+02:00",
  "items": {
    "todo.home_items": {
      "Milk": {
        "victory": {"price": 7.0, "checked": "2026-11-21T06:15:00+02:00", "url": "https://..."},
        "shufersal": {"none": true, "checked": "2026-11-21T06:15:00+02:00"}
      }
    }
  }
}
```

Only refresh stale prices when I ask for a partial run. A price is stale when its `checked` time is two days or older. A new entry with no price is always stale.

## Step 3: Report the order totals

For each store:

1. Take the items on the order list. For each one, take its `Quantity` (1 when missing or invalid).
2. Use the stored price for that item at that store. Skip items with no price or with `none` at that store.
3. Multiply the price by the quantity. Add the subtotal.
4. Add the store's delivery fee when the subtotal is above zero.
5. Check the store's minimum order. A basket under the minimum cannot be placed alone.

Report a table:

| Store | Items with a price | Missing | Subtotal | Delivery | Total | Oldest price |
| --- | --- | --- | --- | --- | --- | --- |

Show the oldest `checked` date in each row. Warn me when a price is older than two days.

Default store settings: delivery fee 30 and minimum order 0 for every store. Tiv Taam has delivery fee 29.9. Use the values in `data/config.json` when that file exists.

## Step 4: Find the best split

Find the cheapest way to buy the order. The rules:

- A plan uses at most `split_max_stores` stores. The default is 2. Use 3 when I ask.
- Each item goes to the cheapest store in the plan that sells it.
- A store's basket must meet its minimum order. A basket below its minimum moves its items to another store in the plan. If that is not possible, the plan is not valid.
- A plan that leaves fewer items without a store wins. Then the lower total wins. On a tie, the plan with fewer stores wins.
- A store with no items is not used. It pays no delivery fee.

The standalone tool does the same calculation:

```sh
python3 -m restock plan --max-stores 2
```

Check its result against your own table. If they differ, say so and show both.

Report:

- The best plan, as one line: store, subtotal, item count, and total with delivery.
- The saving against the cheapest single store.
- The items that no plan covers, in a separate list.

## Step 5: Save and stop

1. Save `data/prices.json` only when at least one read succeeded. Keep the old file when every read failed.
2. Do not change the order list unless I ask you to apply the plan. To apply the plan, run `python3 -m restock plan --apply`. It writes a `Buy at: <store>` line to each order entry.
3. Do not place any order. Do not log in to any store. Do not add to a cart.

## Rules

- Exact match only. A substitute is not a price.
- Respect `none`. A store marked `none` is not a source for that item.
- Keep the old price when a read fails. Never delete a price because a read failed.
- Write short, plain sentences in your reports.
