# Prompt: build your shopping list

Copy everything below the line into any AI agent that can read files, run shell commands, and browse the web. Works with any agent.

---

You are helping me build a household restock list. A restock list has one entry for each **need**. A need is something we run out of, for example "Toilet paper" or "Milk". Each store can sell a different product for the same need. Your job is to find the exact product at each store I choose, and to write the list in the format below.

You will work in these steps. Do not skip a step. Ask me before you change anything I did not approve.

## Step 1: Interview me

Ask me these questions. Ask in small groups, not all at once. Wait for my answers.

1. Which categories do we have? For example: Dairy, Cleaning, Pantry, Drinks, Baby, Pet.
2. For each category, which items do we buy regularly? Ask for the name only. Do not ask for brands yet.
3. For each item, which brand do we prefer? Ask for an ordered list, first choice first. For example: `Tnuva > Tara`. If I have no preference, write "none".
4. For each item, what size or variant do we need? For example: "1.5 L", "6 pack", "unscented".
5. How many units do we want to keep at home? This is the **Want** amount. Ask for an integer, or "none" if we do not track it.
6. How many do we have now? This is the **Have** amount. Ask for an integer, or leave it out.
7. Which items do we always buy, every order, with no thinking? For each one, ask how many to add each time. This is **Every order**.
8. Which stores do we use? Use only the stores I name. The built-in store ids are: `victory`, `ramilevy`, `shufersal`, `yochananof`, `hazihinam`, `tivtaam`, `bug`. Use `bug` for any other online store that has a product page with a price. Ask me for a name for each store I add.
9. Are there questions about our preferences that you cannot answer? For example: "What type of pasta do we like?" Write each one as an **open question**. Do not guess.

Keep your questions short. Do not ask me for information you can find yourself.

## Step 2: Find each product, store by store

For each item and each store I chose:

1. Look for the **exact product by barcode**. Use the barcode of a product I approved, or search by the name and brand I gave. If the store has a barcode search, use it. The standalone tool can help:

   ```sh
   python3 -m restock lookup <barcode>
   ```

   This prints the product from each store that supports barcode lookup. Use it only as a helper. The store site is the source of truth.

2. If you have no barcode, search the store site for the brand and size. Show me the results. Ask me which one is correct.
3. Record the product page URL. It must start with `https://`.
4. If the store does not sell the exact product, do **not** pick a substitute. Record `Product <store>: none`. Ask me if I want a substitute.
5. Never add anything to a cart. Never log in to a store. Never pay. You only read product pages.

Certainty rules:

- An exact barcode match is the best evidence. Use it first.
- A matching name, brand and size is good evidence. Show it to me and ask me to approve it.
- Never guess. Never pick a "similar" product without my approval.
- If two products look the same, show both and ask me.

## Step 3: Approve each product with me

Show me a short table for each item:

| Item | Store | Product name | Price | URL | Barcode |
| --- | --- | --- | --- | --- | --- |

Ask me to approve each row. Use the answers I give. Write only the rows I approve.

## Step 4: Write the list

Write one catalog item for each need. Use this format exactly. Line order matters. Leave out a line when it has no value.

```
<Category>
<Default details, for example "1.5 L">
Prefer: <Brand 1> > <Brand 2>
Want: <N>
Have: <N>
Every order: <N>
Link <store>: <product URL>
Link <store> (<brand>): <product URL>
Product <store>: <product name>
Product <store>: none
Image: <image URL>
```

Rules:

- The item name is the catalog **summary**, for example `Milk`. It is not part of the description.
- Line 1 of the description is the category.
- Line 2 is the default details. Leave it empty if there are none.
- `Prefer:` lists brands, first choice first, separated by ` > `.
- `Link <store>: <url>` is the first-choice link for that store. `Link <store> (<brand>): <url>` is the link for one brand at that store.
- `Product <store>: <name>` is the product to buy at that store. `Product <store>: none` means do not buy at that store.
- Do not put a line in the description for a value you do not have.

If I use the standalone tool, write the whole list as one JSON file. Use one object per item. Give each item a new random hex `uid`:

```json
{
  "items": [
    {"uid": "<random hex>", "summary": "Milk", "status": "needs_action",
     "description": "Dairy\n3%\nPrefer: Tnuva > Tara\nWant: 4\nHave: 1\nLink victory: https://...\nProduct victory: Tnuva 3% 1 L"}
  ]
}
```

Save it to `data/lists/home_items.json`. Write `\n` for each line break inside `description`. Do not write a `Quantity` line in catalog items. Quantity belongs to the order list.

If I use Home Assistant, write the same descriptions with the Home Assistant to-do service `todo.add_item` for `todo.home_items`. Do not change other lists.

## Step 5: Open questions

For each open question from Step 1, add one item to `data/lists/shopping_questions.json`:

- `summary` is the question text.
- `status` is `needs_action`.
- `description` holds `About: <item name>` when the question is about an item. Leave it out otherwise.

Do not answer a question for me.

## Step 6: Check your work

Before you finish:

1. Read each file back. Check that every item has a category, and that every store link starts with `https://`.
2. Check that each `Product <store>` line matches a `Link <store>` line, or is `none`.
3. Check that no item has a substitute I did not approve.
4. Tell me the number of items, the number of links for each store, and the open questions.

Then stop. Do not place any order.

## Rules you must follow

- Use only the stores I named.
- Never guess a product. Ask me.
- Never log in to a store. Never add to a cart. Never buy.
- Do not put personal data in any file other than the lists in `data/`.
- Write short, plain sentences in your replies.
