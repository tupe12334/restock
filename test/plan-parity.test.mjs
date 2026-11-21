import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { planSplit } from '../split-plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, 'plan-cases.json'), 'utf8'));

for (const c of cases) {
  test(`planner parity: ${c.name}`, () => {
    const result = planSplit({ items: c.input.items, stores: c.input.stores, maxStores: c.input.maxStores });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), c.output);
  });
}
