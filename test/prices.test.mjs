import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pricesUrlOf,
  dealsUrlOf,
  pricesFor,
  cheapestStore,
  formatAge,
  formatPrice,
  priceLabel,
  orderEstimate,
  orderEstimateText,
} from '../restock-card.js';

const NOW = new Date(2026, 10, 21, 18, 0); // local time, 21 Nov 2026
const TWO_DAYS_AGO = new Date(2026, 10, 19, 6, 15).toISOString();
const TODAY = new Date(2026, 10, 21, 6, 15).toISOString();
const YESTERDAY = new Date(2026, 10, 20, 6, 15).toISOString();

const file = {
  updated: TODAY,
  items: {
    'todo.home_items': {
      Pepsi: {
        victory: { price: 7, checked: TODAY, url: 'https://v.example/p' },
        ramilevy: { price: 6.1, checked: YESTERDAY, url: 'https://r.example/p' },
        'victory (Riztz)': { price: 6.5, checked: TODAY, url: 'https://v.example/q' },
      },
      Sponge: {
        victory: { price: 4, checked: TWO_DAYS_AGO, url: 'https://v.example/s' },
        shufersal: { none: true, checked: TODAY },
      },
    },
    'todo.3d_filaments': {
      PLA: { bug: { price: 99, checked: TODAY, url: 'https://b.example/p' } },
    },
  },
};

test('pricesUrlOf defaults to the local file, false disables, bad values throw', () => {
  assert.equal(pricesUrlOf(undefined), '/local/restock-prices.json');
  assert.equal(pricesUrlOf(null), '/local/restock-prices.json');
  assert.equal(pricesUrlOf(false), null);
  assert.equal(pricesUrlOf('/local/x.json'), '/local/x.json');
  assert.equal(pricesUrlOf('https://h.example/p.json'), 'https://h.example/p.json');
  assert.throws(() => pricesUrlOf('x.json'), /"prices_url"/);
  assert.equal(dealsUrlOf(undefined), '/local/restock-deals.json');
});

test('pricesFor finds an item in any list, ignoring case and spacing', () => {
  assert.equal(pricesFor('  pepsi ', file).victory.price, 7);
  assert.equal(pricesFor('PLA', file).bug.price, 99);
  assert.deepEqual(pricesFor('Unknown', file), {});
  assert.deepEqual(pricesFor('Pepsi', null), {});
  assert.deepEqual(pricesFor('Pepsi', { items: 'bad' }), {});
});

test('cheapestStore picks the lowest price and skips none and brand keys', () => {
  const best = cheapestStore(pricesFor('Pepsi', file));
  assert.equal(best.store, 'ramilevy');
  assert.equal(best.price, 6.1);
  assert.equal(cheapestStore(pricesFor('Sponge', file)).store, 'victory');
  assert.equal(cheapestStore({}), null);
  assert.equal(cheapestStore(pricesFor('Sponge', file), false).store, 'victory');
});

test('cheapestStore with excludeNone false returns a none store when no store has a price', () => {
  const none = cheapestStore({ shufersal: { none: true, checked: TODAY } }, false);
  assert.equal(none.store, 'shufersal');
  assert.equal(none.none, true);
  assert.equal(cheapestStore({ shufersal: { none: true } }), null);
});

test('formatAge counts calendar days', () => {
  assert.equal(formatAge(TODAY, NOW), 'today');
  assert.equal(formatAge(YESTERDAY, NOW), '1 day ago');
  assert.equal(formatAge(TWO_DAYS_AGO, NOW), '2 days ago');
  assert.equal(formatAge(null, NOW), '');
  assert.equal(formatAge('not a date', NOW), '');
  assert.equal(formatAge(new Date(2026, 10, 22, 1).toISOString(), NOW), 'today');
});

test('formatPrice and priceLabel show the price and the age', () => {
  assert.equal(formatPrice(7), '₪7.00');
  assert.equal(priceLabel({ price: 7, checked: TODAY }, NOW), '₪7.00 · today');
  assert.equal(priceLabel({ price: 6.1, checked: YESTERDAY }, NOW), '₪6.10 · 1 day ago');
  assert.equal(priceLabel({ none: true }, NOW), 'none');
  assert.equal(priceLabel(undefined, NOW), '');
  assert.equal(priceLabel({ price: 'x' }, NOW), '');
});

test('orderEstimate multiplies quantities by store prices and counts missing prices', () => {
  const estimate = orderEstimate([
    { name: 'Pepsi', quantity: 3 },
    { name: 'Sponge', quantity: 2 },
  ], file);
  assert.equal(estimate.stores.victory.total, 3 * 7 + 2 * 4);
  assert.equal(estimate.stores.victory.missing, 0);
  assert.equal(estimate.stores.ramilevy.total, 3 * 6.1);
  assert.equal(estimate.stores.ramilevy.missing, 1);
  assert.equal(estimate.stores.shufersal.missing, 2);
  assert.equal(estimate.cheapest.store, 'victory');
  assert.equal(estimate.cheapest.total, 29);
  assert.equal(estimate.oldest, new Date(TWO_DAYS_AGO).toISOString());
});

test('orderEstimate has no cheapest store when no store prices every item', () => {
  const estimate = orderEstimate([{ name: 'Pepsi', quantity: 1 }, { name: 'Unknown', quantity: 1 }], file);
  assert.equal(estimate.cheapest, null);
  assert.equal(estimate.stores.victory.missing, 1);
});

test('orderEstimateText writes the total at the cheapest store, then stores with gaps', () => {
  const estimate = orderEstimate([{ name: 'Pepsi', quantity: 1 }, { name: 'Sponge', quantity: 1 }], file);
  assert.equal(
    orderEstimateText(estimate, NOW),
    'Order ≈ ₪11 at Victory · ₪6 Rami Levy (1 without price) · Shufersal (2 without price) (prices checked 2 days ago)',
  );
});

test('orderEstimateText has no at-store part when no store prices every item', () => {
  const estimate = orderEstimate([{ name: 'Pepsi', quantity: 2 }, { name: 'Unknown', quantity: 1 }], file);
  assert.equal(
    orderEstimateText(estimate, NOW),
    'Order ≈ ₪12 Rami Levy (1 without price) · ₪14 Victory (1 without price) (prices checked 1 day ago)',
  );
});

test('orderEstimateText is empty when no store has a price for the order', () => {
  assert.equal(orderEstimateText(orderEstimate([{ name: 'Nothing', quantity: 1 }], file), NOW), '');
  assert.equal(orderEstimateText(orderEstimate([], null), NOW), '');
});
