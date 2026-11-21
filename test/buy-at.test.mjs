import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buyAtOf,
  withBuyAt,
  parseEntry,
  formatEntry,
} from '../restock-card.js';

test('buyAtOf reads the Buy at line in lowercase, or empty when absent', () => {
  assert.equal(buyAtOf('Quantity: 2\nBuy at: Shufersal'), 'shufersal');
  assert.equal(buyAtOf('Quantity: 2\nDetails: Pepsi'), '');
  assert.equal(buyAtOf(''), '');
});

test('withBuyAt sets one Buy at line and keeps the other lines', () => {
  const before = 'Quantity: 2\nDetails: Pepsi\nLink victory: https://www.victoryonline.co.il/product/1';
  const after = withBuyAt(before, 'ramilevy');
  assert.equal(after, 'Quantity: 2\nDetails: Pepsi\nLink victory: https://www.victoryonline.co.il/product/1\nBuy at: ramilevy');
  assert.equal(withBuyAt(after, 'shufersal').split('\n').filter((l) => /^buy at/i.test(l)).length, 1);
  assert.equal(buyAtOf(withBuyAt(after, 'shufersal')), 'shufersal');
});

test('withBuyAt with an empty store removes the line', () => {
  assert.equal(withBuyAt('Quantity: 1\nBuy at: victory', ''), 'Quantity: 1');
});

test('parseEntry and formatEntry keep the Buy at line', () => {
  const text = 'Quantity: 3\nDetails: Pepsi\nBuy at: victory\nLink victory: https://www.victoryonline.co.il/product/1';
  const parsed = parseEntry(text);
  assert.equal(parsed.buyAt, 'victory');
  assert.equal(parsed.quantity, 3);
  assert.equal(formatEntry(parsed), 'Quantity: 3\nDetails: Pepsi\nBuy at: victory\nLink victory: https://www.victoryonline.co.il/product/1');
  assert.equal(formatEntry({ quantity: 1 }), 'Quantity: 1');
});
