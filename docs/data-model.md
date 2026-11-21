# Data model

Restock keeps one **item** for each need. A need is something you run out of, for example "Milk". Each item has a name, and a description with line-based fields. The same format works in Home Assistant Local To-do lists and in the standalone JSON files.

## Lists

| List | Home Assistant entity | Standalone file | Holds |
| --- | --- | --- | --- |
| Catalog | `todo.home_items` | `data/lists/home_items.json` | One item for each need |
| Order | `todo.to_order` | `data/lists/to_order.json` | Items to order now |
| Questions | `todo.shopping_questions` | `data/lists/shopping_questions.json` | Open shopping questions |
| History | `todo.restock_history` | `data/lists/restock_history.json` | Bought, used and thrown events |

Other catalog lists, such as `todo.3d_filaments`, use the same format. Each list has its own file, named after the entity without `todo.`.

The standalone file format for a list:

```json
{
  "items": [
    {"uid": "3f1c...", "summary": "Milk", "description": "Dairy\n3%", "status": "needs_action"}
  ]
}
```

`status` is `needs_action` or `completed`.

## Catalog item description

Line 1 is the category. Line 2 is the default details. The other lines are optional and come in this order:

```
Dairy
3%
Prefer: Tnuva > Tara
Want: 4
Have: 1
Every order: 1
Link victory: https://www.victoryonline.co.il/product/...
Link victory (Tara): https://www.victoryonline.co.il/product/...
Product victory: Tnuva 3% 1 L
Product shufersal: none
Image: https://images.openfoodfacts.org/images/products/.../front_small.jpg
```

| Line | Meaning |
| --- | --- |
| `Prefer: A > B` | Brands, first choice first |
| `Want: N` | Units you want at home. Missing means no target |
| `Have: N` | Units at home. Missing counts as 0 |
| `Every order: N` | Units to add each time you start a new order. 0 or missing means off |
| `Link <store>: <url>` | Default product page at a store. The first line per store wins |
| `Link <store> (<brand>): <url>` | Product page for one brand at a store |
| `Product <store>: <name>` | The product to buy at that store |
| `Product <store>: none` | Do not buy this item at that store |
| `Image: <url>` | Product photo. `Image: none` means no photo |

Only `https://` links count.

## Order entry description

The order list holds one entry for each item to order.

```
Quantity: 3
Details: Pepsi
Prefer: Pepsi > Coca-Cola > Sprite
Buy at: ramilevy
Link ramilevy: https://www.rami-levy.co.il/...
Product ramilevy: Pepsi Cola 1.5 L
```

- `Quantity` is an integer of 1 or more. A missing or invalid value means 1.
- `Buy at: <store>` is set by the order split. It names the one store that sells this entry in the plan.
- The `Link` and `Product` lines are copied from the catalog item.

## Question description

```
About: Pasta
Answer: Small round ones
```

`summary` is the question. `status` is `needs_action` while the question is open. `About` names a catalog item. `Answer` holds the answer. Both lines are optional.

## History description

```
Action: bought
Quantity: 2
At: 2026-11-20T09:30:00.000Z
```

`Action` is `bought`, `used` or `thrown`. `At` is an ISO 8601 time in UTC. The item `summary` is the item name.

## Stores

A store id is one lowercase word. The built-in ids are `victory`, `ramilevy`, `shufersal`, `yochananof`, `hazihinam`, `tivtaam` and `bug`. `bug` is the generic adapter for any product page with a schema.org price. You can add more. See [Add a store](../README.md#add-a-store).

## Stored prices and deals files

- `prices.json` holds, for each list and item, the price at each store, its `checked` time, and `none` for stores that do not sell the item. The format is in [Home Assistant: stored prices](home-assistant.md#stored-prices).
- `deals.json` holds the active "N for X" deals for each item. The format is in [Home Assistant: deals](home-assistant.md#deals).
