import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perStoreTotals, recommendation, planSplit, formatWhole } from '../split-plan.js';

const store = (name, deliveryFee = 30, minOrder = 0, enabled = true) => ({ name, deliveryFee, minOrder, enabled });
const stores = { a: store('A'), b: store('B') };

test('perStoreTotals lists one row per enabled store, cheapest total first', () => {
  const items = [
    { name: 'Milk', quantity: 2, prices: { a: 5, b: 4 }, none: [] },
    { name: 'Bread', quantity: 1, prices: { a: 10 }, none: [] },
  ];
  const rows = perStoreTotals(items, stores);
  assert.deepEqual(rows.map((r) => r.store), ['b', 'a']);
  const a = rows[1];
  assert.equal(a.itemsHave, 2);
  assert.equal(a.subtotal, 20);
  assert.equal(a.total, 50);
  assert.equal(a.complete, true);
});

test('a missing item shows where it is cheapest elsewhere', () => {
  const items = [
    { name: 'Milk', quantity: 1, prices: { a: 5, b: 4 }, none: [] },
    { name: 'Tea', quantity: 3, prices: { b: 2 }, none: [] },
  ];
  const a = perStoreTotals(items, stores).find((r) => r.store === 'a');
  assert.equal(a.complete, false);
  assert.deepEqual(a.missing, [{ name: 'Tea', quantity: 3, cheapestStore: 'b', price: 2, cost: 6 }]);
  assert.equal(a.missingElsewhereTotal, 6);
  assert.equal(a.total, 35);
});

test('a missing item sold nowhere has no cost elsewhere', () => {
  const items = [{ name: 'Rare', quantity: 1, prices: {}, none: [] }];
  const row = perStoreTotals(items, stores)[0];
  assert.equal(row.missing[0].cheapestStore, null);
  assert.equal(row.missing[0].cost, null);
  assert.equal(row.missingElsewhereTotal, 0);
});

test('a store under its minimum is not complete, and still pays its delivery fee', () => {
  const items = [{ name: 'Milk', quantity: 1, prices: { a: 5 }, none: [] }];
  const row = perStoreTotals(items, { a: store('A', 30, 50) })[0];
  assert.equal(row.belowMinimum, true);
  assert.equal(row.complete, false);
  assert.equal(row.total, 35);
});

test('a disabled store is left out', () => {
  const rows = perStoreTotals([{ name: 'Milk', quantity: 1, prices: { a: 5 }, none: [] }],
    { a: store('A'), b: store('B', 30, 0, false) });
  assert.deepEqual(rows.map((r) => r.store), ['a']);
});

test('recommendation offers one store when it costs at most the tolerance more', () => {
  const items = [
    { name: 'Milk', quantity: 1, prices: { a: 10, b: 9 }, none: [] },
    { name: 'Bread', quantity: 1, prices: { a: 8, b: 9 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  const rec = recommendation(plan, perStoreTotals(items, stores));
  assert.equal(rec.split, plan.total);
  assert.equal(rec.single.store, 'a');
  assert.equal(rec.extra, 0);
  assert.equal(rec.offerSingle, true);
});

test('recommendation does not offer a single store far above the split', () => {
  const items = [
    { name: 'Milk', quantity: 1, prices: { a: 1, b: 100 }, none: [] },
    { name: 'Bread', quantity: 1, prices: { a: 100, b: 1 }, none: [] },
  ];
  const plan = planSplit({ items, stores, maxStores: 2 });
  const rec = recommendation(plan, perStoreTotals(items, stores));
  assert.equal(rec.offerSingle, false);
  assert.ok(rec.extra > 20);
});

test('recommendation without a plan has no split and no offer', () => {
  const rec = recommendation({ baskets: {}, total: 0 }, []);
  assert.equal(rec.split, null);
  assert.equal(rec.offerSingle, false);
});

test('formatWhole groups thousands and rounds', () => {
  assert.equal(formatWhole(1411.4), '₪1,411');
  assert.equal(formatWhole(26), '₪26');
});
