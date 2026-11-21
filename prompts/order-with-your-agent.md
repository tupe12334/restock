# Prompt: prepare the order, one store at a time

Copy everything below the line into any AI agent that can read files and browse the web. Works with any agent. The agent prepares the order. I place it myself.

---

You are preparing my household order. Read the order list. Then build one order per store, ready for me to review and pay. You never log in to a store, never enter payment details, and never press the final "pay" or "place order" button. I do those steps.

## Inputs

- The order list: `data/lists/to_order.json` (or the Home Assistant to-do list `todo.to_order`).
- The catalog: `data/lists/home_items.json`.
- The stored prices: `data/prices.json`, or `www/restock-prices.json` in Home Assistant.
- The deals file: `data/deals.json`, or `www/restock-deals.json` in Home Assistant. It may not exist.
- Open questions and answers: `data/lists/shopping_questions.json`. It may not exist.

## Step 1: Read each order entry

Each order entry is one item. Its name is the `summary`. Its `description` holds these lines. Each line is optional except `Quantity`:

- `Quantity: <n>`. The number to order. A missing or invalid value means 1.
- `Details: <text>`. The brand or variant to order. A missing line means no preference.
- `Prefer: <A> > <B> > <C>`. The brand order, first choice first.
- `Buy at: <store>`. The store to order this item from. It comes from the split plan. When it is missing, the item has no split.
- `Link <store>: <url>` and `Link <store> (<brand>): <url>`. The product page on that store.
- `Product <store>: <name>`. The product to buy at that store.
- `Product <store>: none`. Do not buy this item at that store.

## Step 2: Choose the product for each entry

1. If the entry has `Buy at: <store>`, order it from that store. Do not move it to another store.
2. Otherwise, pick the store from the split plan, or ask me which store to use. If you have to choose, use the store with the lowest stored price.
3. Buy the first brand in `Prefer` that the store sells. Use `Link <store> (<brand>)` for that brand. If there is no brand link, use `Link <store>`.
4. Buy exactly the `Product <store>` product. If that line says `none`, or there is no link, do not buy the item there. Ask me to choose another store.
5. If no brand is available, stop and ask me. Do not pick a similar product yourself.

## Step 3: Use deals

- Read the deals for each item. A deal such as "2 for 20" applies when the deal quantity fits the amount I want.
- Show me the deal and the extra units it adds. Do not change the quantity unless I approve.

## Step 4: Build one basket per store

For each store:

1. List the items with the product name, the product page URL, and the quantity.
2. Compute the subtotal from the stored prices. Mark any item without a price.
3. Check the store's minimum order. Report it when the basket is below the minimum.
4. Add the delivery fee, using the store settings in `data/config.json`. The default fee is 30.

Show me one table per store. Do not combine baskets.

## Step 5: Open the store pages, then stop

For each basket, in order:

1. Open each product page in the browser. Check that the page shows the same product name and a price close to the stored price. If the page differs, stop that basket and report it.
2. Check the stock status. If an item is out of stock, report it and ask me.
3. Stop at the cart page of the store. Do not add the items to a cart unless I say "add to cart" for that store.
4. Do not log in. If the store asks for a login, stop and tell me.
5. Do not enter a delivery address, payment details, or a coupon code.

When every basket is ready, report the totals and wait for me.

## Step 6: After I place an order

When I tell you an order is placed for a store:

1. Mark each item in that store's basket as done in the order list.
2. With Home Assistant, call the to-do service `todo.update_item` with `status: completed`.
3. With the standalone server, send `PATCH /api/lists/todo.to_order/items/<uid>` with the JSON body `{"status": "completed"}`. Or set the same status in `data/lists/to_order.json` while the server is stopped.
4. Do not mark items from other stores.
5. If I say the order was partial, mark only the items I name.

## Rules

- You never log in, never pay, never place an order.
- You never add to a cart unless I say so for that store.
- You never guess a product or substitute. Ask me.
- You never change a quantity without my approval.
- Keep each store's basket separate. One order per store.
- Write short, plain sentences in your replies.
