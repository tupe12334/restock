# Home Assistant card

A Lovelace card for household items. Tap an item when it runs out. It lands on the Home Assistant shopping list.

An AI agent can read that list through the Home Assistant API and place the order.

## What it does

- Shows your catalog of household items as tiles.
- Groups tiles by category.
- Tap a tile to add one unit to the shopping list. Each tap adds one more.
- Shows a `×N` badge on tiles that are on the list. `N` is the quantity.
- Shows the details (brand or variant) under the name of tiles on the list.
- Shows the first preferred brand under the name of tiles, marked `★`.
- Shows a `🔗` mark on tiles that have store links.
- Opens a quantity, details and brand preference editor with the ✎ button or a long press.
- Adds new items to the catalog, with a category.
- Deletes catalog items in edit mode.
- Shows open shopping questions at the top, with an answer box. Answered questions stay under a toggle. See [Open questions](#open-questions).
- Logs what you buy, use up and throw away, with the stats in the editor. Optional. See [History](#history).
- Tracks how many units you want at home and how many you have. Shows what is missing, and orders it with one button. See [Wanted amount](#wanted-amount).
- Shows store deals, such as "2 ב-20 ₪", from Victory and Rami Levy. A list of deals sits at the top. See [Deals](#deals).
- Shows the stored price of each item at each store, with its check date, and an order total per store. See [Stored prices](#stored-prices).
- Orders an item again each time you order, with the **Every order** amount. Starts a new order with one button. See [Every order](#every-order).
- Keeps one product for each store. See [Product per store](#product-per-store).
- Plans the order across stores at the lowest total cost, and tags each entry with the store to buy at. See [Order split](#order-split).

The card is a native card. It does not use an iframe. It works in the Home Assistant iPhone and iPad app.

## Install

### HACS

1. Open HACS. Go to Frontend.
2. Open the menu. Choose Custom repositories.
3. Add `https://github.com/tupe12334/restock-card`. Set the type to Dashboard.
4. Install Restock card.

### Manual

1. Copy `restock-card.js` to `<your-ha-config>/www/`.
2. Open Settings. Go to Dashboards. Open Resources.
3. Add a resource. Set the URL to `/local/restock-card.js`. Set the type to JavaScript module.

## Setup

1. Create a Local To-do list named "Home items". Its entity is `todo.home_items`.
2. Create a Local To-do list named "To order". Its entity is `todo.to_order`. Use it as the shopping list.
3. Optional. Create a Local To-do list named "Shopping questions". Its entity is `todo.shopping_questions`. Use it for [Open questions](#open-questions).
4. Optional. Create a Local To-do list named "Restock history". Its entity is `todo.restock_history`. Use it for [History](#history).

Do not use Home Assistant's built-in Shopping list (`todo.shopping_list`). It cannot store quantity or details. Its service calls fail with "Entity does not support setting field: description". A Local To-do list stores descriptions. The card shows a warning when the list cannot store them.

## Card YAML

```yaml
type: custom:restock-card
title: Home items
catalog: todo.home_items
shopping: todo.to_order
```

Optional settings:

- `item_label`: the word for one item in the card texts. The default is `item`. With `item_label: filament` the card says "Add a filament" and "No filaments yet. Add one below."
- `start_order_script`: the script for **Start new order**. The default is `script.restock_start_order`, and the button shows for `todo.to_order` only. Set `start_order_script: false` to hide the button.

## Usage

- Tap a tile to add one unit to the shopping list. Each tap adds one more.
- Tap the ✎ button on a tile, or press and hold a tile for half a second, to open the editor. In the editor:
  - Set the quantity with `−` and `+`. The minimum is 1.
  - Type details, such as a brand or variant, in the Details box.
  - Tick "Remember details for next time" to save the details as the item default. The next tap uses them.
  - Press Save to update the shopping list. Press Remove from list to take the item off the list. Press Cancel to close.
- Brand preference: list brands in the order you want them, first choice at the top. In the editor:
  - Type a brand in "Add brand" and press Add or Enter. Empty and repeated brands are skipped.
  - Press ↑ or ↓ to move a brand. Press ✕ to remove it.
  - Press Save. The order goes to the shopping list entry and to the catalog item. The next tap uses it.
  - The tile shows the first brand as `★ Brand`.
- Product per store: the product to buy at each store, and its link. See [Product per store](#product-per-store).
  - Press Save. The links and products go to the shopping list entry and to the catalog item. Tapping the tile next time copies them.
- Tap Edit to enter edit mode. Tap a tile, then tap it again within 3 seconds, to delete it from the catalog.
- Type a name in "Add an item". Type a category in the category box. Press Add or Enter.
- Category names are the first line of the item description. Items without a category go under "Other".
- Default details are the second line of the catalog item description. Tapping a tile that is not on the list adds these details.
- The header shows the item count and the unit count, for example "3 items · 5 units on the shopping list".

## Shopping list format

Each shopping list item keeps its catalog name as the summary, for example `Cola`. Its description holds two lines:

```
Quantity: 3
Details: Pepsi
Prefer: Pepsi > Coca-Cola > Sprite
Link victory: https://www.victoryonline.co.il/...
```

The `Details:` line is absent when details are empty. The `Prefer:` line is absent when there is no brand preference. The `Link` lines are absent when there are no store links. Brands are separated by `>`, in order of preference. Quantity is an integer of 1 or more.

Catalog items keep the category on line 1. Line 2 holds the default details, for example:

```
Drinks
Pepsi
```

An optional `Prefer:` line holds the brand preference of the item. The card copies it to each new shopping list entry:

```
Drinks
Pepsi
Prefer: Pepsi > Coca-Cola > Sprite
```

The line order is category, details, `Prefer:`, `Want:`, `Have:`, `Every order:`, `Link` lines, `Product` lines, `Image:`. The card skips these lines when it reads the details: `Prefer:`, `Want:`, `Have:`, `Every order:`, `Link`, `Product` and `Image:`.

## Store links

A store link is a direct product page on one online store. Write one `Link` line per store. The store name is one lowercase word, for example `victory`, `shufersal`, `ramilevy`, `yochananof` or `carrefour`:

```
Dairy
Pepsi
Prefer: Tnuva > Tara
Link victory: https://www.victoryonline.co.il/product/...
Link shufersal: https://www.shufersal.co.il/online/...
Image: https://images.openfoodfacts.org/images/products/.../front_small.jpg
```

- Put the links on the catalog item. Tapping a tile copies them to the shopping list entry.
- The `Link` key is not case-sensitive. The first link for each store, or store and brand, wins.

### Links per preferred brand

One item can cover the same product from several brands. Add a brand in the qualifier, in brackets, after the store:

```
Floor cleaning
10 units
Prefer: Riztz > Nikol
Link victory (Riztz): https://www.victoryonline.co.il/product/...
Link victory (Nikol): https://www.victoryonline.co.il/product/...
Link shufersal (Nikol): https://www.shufersal.co.il/online/...
Image: https://www.victoryonline.co.il/...
```

- `Link <store> (<brand>): <url>` is the link for that brand at that store. The brand is the text in brackets, as written in `Prefer:`.
- Brand links are not changed by `Product` lines. A `Product` line is per store only.
- `Link <store>: <url>` with no brackets is the default, first-choice product.
- In the ✎ editor, each brand in "Brand preference" lists its own store links, with an "Add link" form. Store links for the whole item stay in "Product per store". Removing a brand removes its links.
- Brand links are copied to the shopping list entry with the other links.
- The tile shows the first brand as `★ Brand`. The photo is the `Image:` line, the first-choice product.

Agent rule: go down `Prefer`. For each brand, use `Link <store> (<brand>)` for the store you order from. If the first brand has only a plain `Link <store>:` line, that line is its link.
- Editing an item in the card writes the links to the shopping list entry and the catalog item in one catalog update.

## Product per store

An item is a need, for example "Toilet paper". Each store can sell its own product for that need. Write one `Product` line per store, next to the store's `Link` line:

```
Floor cleaning
Prefer: Nikol
Link victory: https://www.victoryonline.co.il/product/...
Product victory: Nikol 10 L
Link shufersal: https://www.shufersal.co.il/online/...
Product shufersal: none
```

- `Product <store>: <product name>` is the product to buy at that store.
- `Product <store>: none` means do not buy this item at that store.
- In the ✎ editor, "Product per store" has one row for each store. Type the store, the product name and an optional `https://` link. Press Add. To mark a store as "no product here", type `none` as the product.
- Press ✕ to remove a store. An Add for a store that is already listed keeps the link or product box that you leave empty.
- Order entries copy the `Product` lines with the `Link` lines.

Agent rule: when ordering from store S, buy exactly the S product (`Link S` and `Product S`). If S has `Product S: none` or no link, do not buy it there. Use another store, or ask.

## Every order

Every order is the amount to add to the order list each time you order. Use it for an item you always buy, such as a 1-pack of toilet paper.

- Open the ✎ editor. In "Stock at home", set **Every order** with `−` and `+`. 0 means off. Press Save.
- A tile with Every order shows `↻N`.
- The header button **Start new order** runs `script.restock_start_order`. The script reads each item's Every order and adds the item to `todo.to_order`.
- The button shows for the `todo.to_order` list only. For another list, set `start_order_script` in the card YAML. Set `start_order_script: false` to hide the button.

Catalog item description, with an Every order line:

```
Paper
Toilet paper
Want: 4
Have: 1
Every order: 1
```

## Open questions

Open questions hold unresolved shopping questions for the household. For example: "What type of ptitim does Alex like?" The family answers them in the card. An agent reads them too.

Add `questions` to the card YAML to show the section. Without it the section is hidden:

```yaml
type: custom:restock-card
title: Home items
catalog: todo.home_items
shopping: todo.to_order
questions: todo.shopping_questions
```

- The section shows at the top of the card as "Open questions (N)". It shows only when a question is open, or after you press "Ask a question".
- Each open question has an answer box. Type the answer and press Answer. The question moves to "Answered (M)".
- Press "Answered (M)" to see resolved questions and their answers. Press Reopen to make a question open again.
- Press "Ask a question". Type the question. Optionally type an About item name, with suggestions from the catalog. Press Add.
- In the ✎ editor, open questions whose About matches the item name show as a note.

Each question is one item on the `questions` Local To-do list:

- The item `summary` is the question text.
- The item `status` is `needs_action` for an open question, and `completed` for an answered one.
- The item `description` holds optional lines:

```
About: Pasta
Answer: Osem, small round ones
```

The `About:` line names a catalog item. The `Answer:` line holds the answer. Both lines are absent when empty.

Agent guidance:

- Ask the family the open questions. Read `todo.shopping_questions` with `status: needs_action`. Ask each question and write the answer with `todo.update_item`, `status: completed`.
- Use the answered questions when you order. Read `todo.shopping_questions` with `status: completed`. For each item you order, find the question whose `About` matches the item name. Follow its `Answer`.

```sh
curl -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d '{"entity_id":"todo.shopping_questions","status":"needs_action"}' "$HA_URL/api/services/todo/get_items?return_response"
```

## History

History records each purchase, use-up and throw-away. Use it to see how often you buy an item. Add `history` to the card YAML to turn it on. Without it the feature is off, and the Log buttons only change Have:

```yaml
type: custom:restock-card
title: Home items
catalog: todo.home_items
shopping: todo.to_order
history: todo.restock_history
```

- Tapping a tile that adds a new entry to the order list logs `used` with quantity 1.
- In the ✎ editor, the Log row has three buttons:
  - **Bought** logs `bought` with the editor quantity. If the item is on the order list, it also marks that entry completed.
  - **Used up** logs `used` with quantity 1.
  - **Threw away** logs `thrown` with the editor quantity.
  - A short note confirms each log, for example "Logged: bought ×2".
  - Each button also changes Have. See [Wanted amount](#wanted-amount).
- The editor History section shows one line of stats, then the last 5 events. For example: "Last bought 3 days ago · every ~9 days · thrown 1×".

Each event is one item on the `history` Local To-do list:

- The item `summary` is the item name, for example `Milk`.
- The item `status` is `completed`.
- The item `description` holds three lines:

```
Action: bought
Quantity: 2
At: 2026-11-20T09:30:00.000Z
```

`Action` is `bought`, `used` or `thrown`. `At` is an ISO 8601 UTC time. An event with an unknown action is ignored.

Agent guidance:

- After you order or buy an item, log `bought` with the quantity. Add an item to `todo.restock_history` with the event description. Then read its `uid` with `todo.get_items` and call `todo.update_item` with `status: completed`. Use the `uid` as `item`, because many events share one name.
- Use the stats to suggest re-orders. Read `todo.restock_history` and take the events for the item. Compare the date of the last `bought` with the average days between buys.

```sh
curl -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d '{"entity_id":"todo.restock_history","item":"Milk","description":"Action: bought\nQuantity: 2\nAt: 2026-11-20T09:30:00.000Z"}' "$HA_URL/api/services/todo/add_item"
```

## Wanted amount

Wanted amount is how many units you want to have at home, per item. The card tracks how many you have and shows what is missing. It works with or without `history`.

- Open the ✎ editor. In "Stock at home", set **Wanted** and **Have** with `−` and `+`. Press Clear to remove the Wanted amount. Press Save to write both to the catalog item.
- Set Wanted and Have on the catalog item only. The shopping list does not hold them.
- A tile with a Wanted amount shows `have/want`, for example `2/4`. When Have is below Wanted, the tile has a warning outline and shows `need N`. N is the units still to order.
- The header shows **Fill up (N)** when any item is short. N is the number of items. Fill up adds each missing item to the order list. If the item is already on the list, it adds the missing units to its quantity. Fill up does not log history.
- In the ✎ editor, the Log buttons change Have:
  - **Bought** adds the editor quantity to Have.
  - **Used up** takes 1 from Have. Have does not go below 0.
  - **Threw away** takes the editor quantity from Have. Have does not go below 0.
  - Tapping a tile to order it does not change Have.

Catalog item description, with the stock lines:

```
Dairy
Milk 3%
Prefer: Tnuva > Tara
Want: 4
Have: 1
Link victory: https://www.victoryonline.co.il/product/...
Image: https://images.openfoodfacts.org/images/products/.../front_small.jpg
```

- `Want: N` is the wanted amount. It is an integer of 0 or more. A missing line means no wanted amount, and the item is never short.
- `Have: N` is the amount at home. It is an integer of 0 or more. A missing line counts as 0.
- Missing units are `max(0, Want − Have − on the order list)`.

Agent rule:

- For each item with `Want:`, order `missingOf(want, have, on-order)`, that is `max(0, Want − Have − Quantity on the order list)`.
- After you buy an item, increase `Have` in the catalog item by the bought quantity.
- The card updates Have only from its own buttons. A `bought` event that an agent logs in `todo.restock_history` does not change Have. So an agent that logs `bought` must also update `Have` in `todo.home_items`.

## Photos

Tiles show a product photo instead of an emoji. The card finds photos on Open Food Facts through a Home Assistant script. The browser cannot call Open Food Facts directly because of CORS.

- The card looks up a photo once for each catalog item that has no `Image:` line. The first hit is saved as the item's `Image:` line in the catalog description.
- Open the editor and press "Change photo" to search again. Pick a thumbnail, or "No photo", and press Save.
- Items without a photo show the emoji.
- Item names and details are sent to Open Food Facts when a search runs.

Catalog item description, with an optional photo line:

```
Drinks
Pepsi
Image: https://images.openfoodfacts.org/images/products/.../front_small.jpg
```

`Image: none` means you chose no photo. The card does not search again for that item.

Add this `rest_command` to `configuration.yaml`:

```yaml
rest_command:
  restock_image_search:
    url: "https://search.openfoodfacts.org/search?q={{ q | urlencode }}&page_size=8&fields=product_name,brands,image_front_small_url"
    method: get
    timeout: 15
```

Add this script. It returns up to 8 image URLs as `images`:

```yaml
restock_find_image:
  alias: Restock find image
  mode: parallel
  max: 10
  fields:
    q: {name: Search text, required: true, selector: {text: {}}}
  sequence:
    - action: rest_command.restock_image_search
      data: {q: "{{ q }}"}
      response_variable: res
    - variables:
        result: "{{ {'images': ((res.content.hits if res.content is mapping else []) | selectattr('image_front_small_url','defined') | map(attribute='image_front_small_url') | list)[:8]} }}"
    - stop: done
      response_variable: result
```

The card calls `script.restock_find_image` by default. To use another script, set `image_search` to its service id, for example `image_search: script.my_photos`. To turn photos off, set `image_search: false`. The card then shows emoji only and does not search.

## Deals

A store deal, for example "2 for 20 ₪", shows on the item. The browser cannot call store sites (CORS). So a script reads the prices on the server and writes a JSON file. The card reads that file.

- A 🏷️ badge on a tile shows the best deal for that item. The lowest price per unit wins.
- "Deals now (N)" at the top lists the items with a deal. Tap an item to open its editor. The link opens the store page.
- The editor shows a Deals row with each store's deal and link. When a deal needs more units than the editor quantity, it shows "Deal: buy N". The card does not change the quantity.
- The card reads `/local/restock-deals.json` on load and every 6 hours. Set `deals_url` to another path or https URL. Set `deals_url: false` to turn deals off.

### Fetcher

`tools/fetch_deals.py` is a Python 3 script that uses only the standard library. It reads the "Home items" Local To-do file, follows each Victory and Rami Levy link, and writes `www/restock-deals.json` in the Home Assistant config directory. It waits one second between requests.

1. Copy `tools/fetch_deals.py` to `<your-ha-config>/restock/fetch_deals.py`.
2. Run it once, and then daily. For example, add this line to the crontab of the user that runs Home Assistant. Use your own path:

```
15 6 * * * python3 <your-ha-config>/restock/fetch_deals.py
```

Run `python3 -m unittest discover -s tools -p 'test_*.py'` in the repository to test the parsers.

The file format:

```json
{
  "updated": "2026-11-20T04:15:00+00:00",
  "deals": {
    "Pepsi Cola": [
      {"store": "victory", "brand": null, "price": 7.0, "deal": "2 ב-12.9 ₪", "dealQuantity": 2, "dealPrice": 12.9, "until": "2026-11-28", "url": "https://www.victoryonline.co.il/product/..."}
    ]
  }
}
```

- The key of `deals` is the catalog item name. Only items with an active deal are listed. Only "N for X" deals are listed. Plain per-unit prices are skipped.
- `brand` is the brand in a brand-qualified link, or `null`.
- `dealQuantity` and `dealPrice` are set for a "N for X" deal. They are `null` for other deals. `deal` is the text the card shows.
- `until` is an ISO date, or `null` when the store gives no end date.

Agent rule: read `/local/restock-deals.json`. Prefer the store with an active deal. Buy the deal quantity when it fits the `Want` and `Have` amounts.

## Stored prices

A script reads the price of each item at each store and writes `www/restock-prices.json`. Each price has the date it was checked. The card shows the price and its age in the editor, the cheapest price on each tile, and the order total at each store in the header.

- The header shows the estimate, for example "Order ≈ ₪815 at Rami Levy · ₪920 Shufersal · ₪922 Victory (prices checked 1 day ago)". It is the quantity of each item on the order list times its stored price. A store with no price for an item shows the count of items without a price.
- The editor "Product per store" rows show the price and age, for example "₪7.00 · today". A store marked `Product <store>: none` shows "none".
- The card reads `/local/restock-prices.json` on load and every 6 hours. Set `prices_url` to another path or https URL. Set `prices_url: false` to turn stored prices off.

The file format:

```json
{
  "updated": "2026-11-21T06:15:00+02:00",
  "items": {
    "todo.home_items": {
      "Pepsi Cola": {
        "victory": {"price": 7.0, "checked": "2026-11-21T06:15:00+02:00", "url": "https://www.victoryonline.co.il/product/..."},
        "ramilevy": {"price": 6.1, "checked": "2026-11-20T06:15:00+02:00", "url": "https://www.rami-levy.co.il/..."},
        "shufersal": {"none": true, "checked": "2026-11-21T06:15:00+02:00"}
      }
    }
  }
}
```

- The keys of `items` are the catalog list entities, such as `todo.home_items` and `todo.3d_filaments`. Inside each list, the key is the item name.
- The store keys are `victory`, `ramilevy`, `shufersal` and `bug`. A brand link has its own key, such as `victory (Riztz)`.
- `none: true` means the item is not bought at that store, from a `Product <store>: none` line.
- `checked` is the ISO time of the last successful read. A failed read keeps the old price and its old `checked` date.

### Stored prices fetcher

`tools/fetch_prices.py` reads every catalog list in `.storage` except the order, history and question lists. It reads each store link once per run and waits one second between requests. It needs `fetch_deals.py` in the same folder.

1. Copy `tools/fetch_prices.py` and `tools/fetch_deals.py` to `<your-ha-config>/restock/`.
2. Run it daily, after the deals fetch. For example:

```
20 6 * * * cd <your-ha-config> && python3 restock/fetch_prices.py >> /tmp/restock_prices.log 2>&1
```

Options:

- `--max-age-days N` reads only the entries checked N or more days ago. The default `0` reads all.
- `--only "<item name>"` reads one item.
- `--config <dir>` sets the Home Assistant config directory. The default is the parent of the script folder.

Agent rule: use `/local/restock-prices.json`. Use the stored price for the store you order from. Refresh an item live only if its `checked` is older than 2 days.

## Order split

When the family orders, the items do not all have to come from one store. **Plan order** splits the order list into one basket per store, at the lowest total cost. The total includes each store's delivery fee.

- Press **Plan order** in the header. The panel shows the best plan. Each store has a collapsible basket. Items that no plan covers are listed in red.
- Each basket lists each item with its unit price, quantity and a link to its product page. The prices come from `/local/restock-prices.json`. The panel shows the age of the oldest price.
- Press **Apply plan**. The card writes a `Buy at: <store>` line to each order entry in a basket. It keeps the other lines and shows how many entries it tagged. A store chip shows on the tile and in the editor.
- Apply plan does not remove `Buy at` from an entry that the new plan leaves out. Edit the entry to change it.

Planner rules:

- A plan uses at most `split_max_stores` stores. The default is 2. The value is 1, 2 or 3. The panel stepper changes it for this browser.
- The planner tries each set of enabled stores. In each set, each item goes to its cheapest store in the set. A store is skipped for an item when it has no price for it, or when its product is `Product <store>: none`.
- A basket must meet its store's minimum order. A basket under its minimum moves its items to another store in the set. If the items cannot move, that set is not used.
- A plan that leaves fewer items unassigned wins first. Then the lowest total wins. A tie goes to the plan with fewer stores.
- A store that gets no items is not used. It pays no delivery fee.

Config. Each store has a default of delivery fee 30 and minimum order 0. Set the values you need:

```yaml
type: custom:restock-card
title: Home items
catalog: todo.home_items
shopping: todo.to_order
split_max_stores: 2
stores:
  victory: {deliveryFee: 30, minOrder: 0}
  ramilevy: {name: "רמי לוי", deliveryFee: 30, minOrder: 150}
  shufersal: {deliveryFee: 0, minOrder: 200, enabled: false}
```

- The default stores are victory, ramilevy, shufersal, yochananof, hazihinam and tivtaam. Each has a name, a `deliveryFee`, a `minOrder` and `enabled`. `enabled: false` leaves the store out of plans.
- The fees and minimums that you change in the panel are saved in this browser. They override the YAML for that browser.

The `Buy at` line in an order entry:

```
Quantity: 3
Details: Pepsi
Buy at: ramilevy
Link ramilevy: https://www.rami-levy.co.il/...
```

Agent rule: if an entry has `Buy at: <store>`, order it from that store, using that store's Link and Product. Place one order per store. An entry without `Buy at` has no split: order it as the other rules say.

## Let an agent order the list

Read the shopping list with the REST API. Set `HA_URL` to your Home Assistant address. Set `HA_TOKEN` to a long-lived access token.

```sh
curl -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d '{"entity_id":"todo.to_order","status":"needs_action"}' "$HA_URL/api/services/todo/get_items?return_response"
```

For each item, read the `summary` as the catalog name. Parse the `description`:

- `Quantity: <n>` is the number to order. A missing or invalid value means 1.
- `Details: <text>` is the brand or variant to order. A missing line means no preference.
- `Prefer: <A> > <B> > <C>` is the brand preference, first choice first. A missing line means no preference.
- `Link <store>: <url>` is the product page on that store. `Link <store> (<brand>): <url>` is the page for that brand. A missing line means no link.
- `Product <store>: <product name>` is the product to buy at that store. `Product <store>: none` means do not buy the item at that store. A missing line means no product for that store.

Agent rule: open the link for the store you order from. If the item has no link for that store, search the store.

Agent rule for products: when ordering from store S, buy exactly the S product (`Link S` and `Product S`). If S has `Product S: none` or no link, do not buy it there. Use another store, or ask.

If an entry has `Buy at: <store>`, follow the rule in [Order split](#order-split).

Buy the first brand in `Prefer` that is available. If none is available, ask, or pick a similar product.

After the agent orders an item, mark it done:

```sh
curl -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d '{"entity_id":"todo.to_order","item":"Milk","status":"completed"}' "$HA_URL/api/services/todo/update_item"
```

To remove an item instead, call `todo.remove_item`:

```sh
curl -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d '{"entity_id":"todo.to_order","item":["Milk"]}' "$HA_URL/api/services/todo/remove_item"
```

## Test

```sh
npm test
```

This runs the card and planner tests in `test/`, the Home Assistant fetcher tests in `tools/`, and the standalone package tests in `tests/`.

## License

MIT. See `LICENSE`.
