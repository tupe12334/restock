import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planSplit, DEFAULT_MAX_STORES, MAX_STORES_LIMIT, storesOf, splitMaxStoresOf, formatPlanSummary,
} from '../split-plan.js';

const store = (name, deliveryFee = 30, minOrder = 0, enabled = true) => ({
  name, deliveryFee, minOrder, enabled,
});

test('one store wins when delivery fees are higher than the savings', () => {
  const stores = { a: store('A'), b: store('B') };
  const items = [
    { name: 'Milk', quantity: 1, prices: { a: 10, b: 9 }, none: [] },
    { name: 'Bread', quantity: 1, prices: { a: 8, b: 9 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  // Single A: 18 + 30 = 48. Split: 9 + 8 + 30 + 30 = 77. Single B: 18 + 30 = 48. Tie: store order picks A.
  assert.deepEqual(Object.keys(plan.baskets), ['a']);
  assert.equal(plan.total, 48);
  assert.equal(plan.unassigned.length, 0);
  assert.equal(plan.feasible, true);
});

test('split across two stores when the savings are larger than the extra fee', () => {
  const stores = { a: store('A', 10), b: store('B', 10) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 20 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 40, b: 15 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  // Split: 5 + 15 + 10 + 10 = 40. Single A: 45 + 10 = 55. Single B: 35 + 10 = 45.
  assert.deepEqual(Object.keys(plan.baskets).sort(), ['a', 'b']);
  assert.equal(plan.total, 40);
  assert.equal(plan.baskets.a.items[0].name, 'Cola');
  assert.equal(plan.baskets.b.items[0].name, 'Cheese');
  assert.equal(plan.baskets.a.total, 15);
  assert.equal(plan.baskets.b.total, 25);
  assert.equal(plan.bestSingle.store, 'b');
  assert.equal(plan.bestSingle.total, 45);
  assert.equal(plan.savingsVsBestSingle, 5);
});

test('the split is rejected when the delivery fee is larger than the savings', () => {
  const stores = { a: store('A', 30), b: store('B', 30) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 6 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 7, b: 6 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(Object.keys(plan.baskets), ['a']);
  assert.equal(plan.total, 42);
  assert.equal(plan.savingsVsBestSingle, 0);
});

test('a store under its minimum order is dropped and its items go to the other store', () => {
  const stores = { a: store('A', 0, 0), b: store('B', 0, 50) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 20, b: 10 }, none: [] },
    { name: 'Water', quantity: 1, prices: { a: 12, b: 11 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 30, b: 25 }, none: [] },
  ];
  // B alone is 46, under its minimum of 50. So B cannot be a basket. All items go to A: 62.
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(Object.keys(plan.baskets), ['a']);
  assert.equal(plan.total, 62);
  assert.equal(plan.singleStoreTotals.b, null);
});

test('a split keeps a store whose basket meets its minimum order', () => {
  const stores = { a: store('A', 10, 0), b: store('B', 10, 20) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 20 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 40, b: 25 }, none: [] },
  ];
  // Split: A = 5 + 10 fee, B = 25 + 10 fee = 50. B meets its 20 minimum. Single A = 55, single B = 55.
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(Object.keys(plan.baskets).sort(), ['a', 'b']);
  assert.equal(plan.total, 50);
});

test('no plan when every store fails its minimum order', () => {
  const stores = { a: store('A', 0, 100), b: store('B', 0, 100) };
  const items = [{ name: 'Milk', quantity: 1, prices: { a: 10, b: 12 }, none: [] }];
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.equal(plan.feasible, false);
  assert.deepEqual(plan.baskets, {});
  assert.equal(plan.total, 0);
  assert.deepEqual(plan.unassigned, ['Milk']);
  assert.equal(plan.singleStoreTotals.a, null);
  assert.equal(plan.singleStoreTotals.b, null);
});

test('a store with a none marker is never used for that item', () => {
  const stores = { a: store('A', 0), b: store('B', 0) };
  const items = [
    { name: 'Paper', quantity: 1, prices: { a: 5, b: 9 }, none: ['a'] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(Object.keys(plan.baskets), ['b']);
  assert.equal(plan.total, 9);
  assert.equal(plan.singleStoreTotals.a, null);
  assert.equal(plan.singleStoreTotals.b, 9);
});

test('an item no store sells is listed as unassigned', () => {
  const stores = { a: store('A', 0), b: store('B', 0) };
  const items = [
    { name: 'Milk', quantity: 2, prices: { a: 5, b: 6 }, none: [] },
    { name: 'Unicorn', quantity: 1, prices: { a: null, b: null }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(plan.unassigned, ['Unicorn']);
  assert.equal(plan.total, 10);
  assert.equal(plan.singleStoreTotals.a, null);
});

test('an item the single store lacks is unassigned there, and a store that covers it wins with maxStores 1', () => {
  const stores = { a: store('A', 0), b: store('B', 0) };
  const items = [
    { name: 'Milk', quantity: 1, prices: { a: 5, b: 9 }, none: [] },
    { name: 'Tahini', quantity: 1, prices: { a: null, b: 12 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 1 });
  // Store B covers both items. Store A covers only Milk. The plan that covers more sellable items wins.
  assert.deepEqual(Object.keys(plan.baskets), ['b']);
  assert.deepEqual(plan.unassigned, []);
  assert.equal(plan.total, 21);
  assert.equal(plan.singleStoreTotals.a, null);
  assert.equal(plan.singleStoreTotals.b, 21);
});

test('maxStores 1 never uses two stores', () => {
  const stores = { a: store('A', 0), b: store('B', 0), c: store('C', 0) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 9, c: 9 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 9, b: 4, c: 9 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 1 });
  // Single B: 9 + 4 = 13. Single A: 14. Single C: 18.
  assert.deepEqual(Object.keys(plan.baskets), ['b']);
  assert.equal(plan.total, 13);
});

test('maxStores 2 and 3 allow more stores, and the total does not rise', () => {
  const stores = { a: store('A', 0), b: store('B', 0), c: store('C', 0) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 9, c: 9 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 9, b: 4, c: 9 }, none: [] },
    { name: 'Olives', quantity: 1, prices: { a: 9, b: 9, c: 3 }, none: [] },
  ];
  const one = planSplit({ items, stores, maxStores: 1 });
  const two = planSplit({ items, stores, maxStores: 2 });
  const three = planSplit({ items, stores, maxStores: 3 });
  // One store: c = 21. Two stores: b (Cola 9, Cheese 4) + c (Olives 3) = 16. Three stores: 5 + 4 + 3 = 12.
  assert.equal(Object.keys(one.baskets).length, 1);
  assert.equal(one.total, 21);
  assert.equal(Object.keys(two.baskets).length, 2);
  assert.equal(two.total, 16);
  assert.equal(Object.keys(three.baskets).length, 3);
  assert.equal(three.total, 12);
});

test('the default maxStores is 2', () => {
  assert.equal(DEFAULT_MAX_STORES, 2);
  assert.equal(MAX_STORES_LIMIT, 3);
  const stores = { a: store('A', 0), b: store('B', 0), c: store('C', 0) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 9, c: 9 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 9, b: 4, c: 9 }, none: [] },
    { name: 'Olives', quantity: 1, prices: { a: 9, b: 9, c: 3 }, none: [] },
  ];
  const plan = planSplit({ items, stores });
  assert.equal(Object.keys(plan.baskets).length, 2);
  assert.equal(plan.total, 16);
});

test('a disabled store is never used and its single total is null', () => {
  const stores = { a: store('A', 0), b: store('B', 0, 0, false) };
  const items = [{ name: 'Milk', quantity: 1, prices: { a: 9, b: 1 }, none: [] }];
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(Object.keys(plan.baskets), ['a']);
  assert.equal(plan.singleStoreTotals.b, null);
});

test('quantity multiplies the price and the subtotal', () => {
  const stores = { a: store('A', 5) };
  const items = [{ name: 'Milk', quantity: 3, prices: { a: 4 }, none: [] }];
  const plan = planSplit({ items, stores, maxStores: 1 });
  assert.equal(plan.baskets.a.subtotal, 12);
  assert.equal(plan.baskets.a.deliveryFee, 5);
  assert.equal(plan.baskets.a.total, 17);
  assert.equal(plan.total, 17);
  assert.equal(plan.baskets.a.items[0].quantity, 3);
  assert.equal(plan.baskets.a.items[0].price, 4);
});

test('the same input always gives the same plan', () => {
  const stores = { a: store('A', 10), b: store('B', 10), c: store('C', 10) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 5, c: 5 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 9, b: 9, c: 9 }, none: [] },
  ];
  const first = planSplit({ items, stores, maxStores: 2 });
  const second = planSplit({ items, stores, maxStores: 2 });
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.baskets), ['a']);
});

test('an empty order gives an empty plan with no savings', () => {
  const plan = planSplit({ items: [], stores: { a: store('A') }, maxStores: 2 });
  assert.deepEqual(plan.baskets, {});
  assert.equal(plan.total, 0);
  assert.deepEqual(plan.unassigned, []);
  assert.equal(plan.savingsVsBestSingle, null);
});

test('storesOf layers defaults, config and saved values', () => {
  const stores = storesOf(
    { victory: { deliveryFee: 0, enabled: false }, hazihinam: { name: 'Hazi' } },
    { victory: { deliveryFee: 12 }, ramilevy: { minOrder: 80 } },
  );
  assert.equal(stores.victory.name, 'ויקטורי');
  assert.equal(stores.victory.enabled, false);
  assert.equal(stores.victory.deliveryFee, 12);
  assert.equal(stores.ramilevy.deliveryFee, 30);
  assert.equal(stores.ramilevy.minOrder, 80);
  assert.equal(stores.hazihinam.name, 'Hazi');
  assert.equal(stores.tivtaam.name, 'טיב טעם');
});

test('storesOf rejects bad config and ignores bad saved values', () => {
  assert.throws(() => storesOf([]), /"stores" must be a map/);
  assert.throws(() => storesOf({ 'Bad Id': {} }), /store id/);
  assert.throws(() => storesOf({ victory: { deliveryFee: -1 } }), /deliveryFee/);
  assert.throws(() => storesOf({ victory: { enabled: 'yes' } }), /enabled/);
  const stores = storesOf(undefined, { victory: { deliveryFee: 'x', minOrder: -3 } });
  assert.equal(stores.victory.deliveryFee, 30);
  assert.equal(stores.victory.minOrder, 0);
});

test('splitMaxStoresOf accepts 1 to 3 and defaults to 2', () => {
  assert.equal(splitMaxStoresOf(undefined), 2);
  assert.equal(splitMaxStoresOf(1), 1);
  assert.equal(splitMaxStoresOf(3), 3);
  assert.throws(() => splitMaxStoresOf(4), /split_max_stores/);
  assert.throws(() => splitMaxStoresOf(0), /split_max_stores/);
  assert.throws(() => splitMaxStoresOf(1.5), /split_max_stores/);
});

test('formatPlanSummary names the baskets, the total and the saving', () => {
  const stores = { a: store('A', 10), b: store('B', 10) };
  const items = [
    { name: 'Cola', quantity: 1, prices: { a: 5, b: 20 }, none: [] },
    { name: 'Cheese', quantity: 1, prices: { a: 40, b: 15 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  assert.equal(
    formatPlanSummary(plan, { a: 'Rami Levy', b: 'Shufersal' }),
    'Best plan: Rami Levy ₪5.00 (1 items) + Shufersal ₪15.00 (1 items) = ₪40.00 incl. delivery — saves ₪5.00 vs. best single store (Shufersal ₪45.00)',
  );
});

test('formatPlanSummary explains a plan with no store price', () => {
  const plan = planSplit({ items: [{ name: 'X', quantity: 1, prices: {}, none: [] }], stores: { a: store('A') } });
  assert.equal(formatPlanSummary(plan, {}), 'No store has a price for these items.');
  const blocked = planSplit({
    items: [{ name: 'Milk', quantity: 1, prices: { a: 10 }, none: [] }],
    stores: { a: store('A', 0, 100) },
  });
  assert.equal(formatPlanSummary(blocked, {}), 'No plan. Each store misses its minimum order.');
});
