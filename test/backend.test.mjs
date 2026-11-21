import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiRequestFor,
  apiErrorMessage,
  listItemsOf,
  imageUrlsOf,
  RestockApiBackend,
} from '../restock-card.js';

test('add_item becomes POST to the list items path with defaults', () => {
  assert.deepEqual(apiRequestFor('add_item', 'todo.home_items', { item: 'Milk' }), {
    method: 'POST',
    path: '/api/lists/todo.home_items/items',
    body: { summary: 'Milk', description: '', status: 'needs_action' },
  });
});

test('add_item passes description and status through', () => {
  const req = apiRequestFor('add_item', 'todo.home_items', {
    item: 'Eggs', description: 'Dairy', status: 'completed',
  });
  assert.equal(req.method, 'POST');
  assert.deepEqual(req.body, { summary: 'Eggs', description: 'Dairy', status: 'completed' });
});

test('update_item sends only the fields the data has', () => {
  assert.deepEqual(apiRequestFor('update_item', 'todo.to_order', { item: 'uid-1', status: 'completed' }), {
    method: 'PATCH',
    path: '/api/lists/todo.to_order/items/uid-1',
    body: { status: 'completed' },
  });
  assert.deepEqual(apiRequestFor('update_item', 'todo.to_order', { item: 'uid-1' }).body, {});
});

test('update_item maps rename to summary and keeps description', () => {
  const req = apiRequestFor('update_item', 'todo.home_items', {
    item: 'uid-2', rename: 'Oat Milk', description: 'Shelf 3',
  });
  assert.deepEqual(req.body, { summary: 'Oat Milk', description: 'Shelf 3' });
});

test('remove_item becomes DELETE with no body', () => {
  assert.deepEqual(apiRequestFor('remove_item', 'todo.home_items', { item: 'uid-3' }), {
    method: 'DELETE',
    path: '/api/lists/todo.home_items/items/uid-3',
    body: null,
  });
});

test('entity id and uid are URL encoded', () => {
  const req = apiRequestFor('remove_item', 'todo.my list/x', { item: 'a/b c?d#e' });
  assert.equal(req.path, '/api/lists/todo.my%20list%2Fx/items/a%2Fb%20c%3Fd%23e');
  const add = apiRequestFor('add_item', 'todo.a&b', { item: 'Milk' });
  assert.equal(add.path, '/api/lists/todo.a%26b/items');
});

test('an unknown service throws unsupported service', () => {
  assert.throws(() => apiRequestFor('get_items', 'todo.home_items', {}), /^Error: unsupported service$/);
});

test('apiErrorMessage returns the server error text, else the status', () => {
  assert.equal(apiErrorMessage({ error: 'Item not found' }, 404), 'Item not found');
  assert.equal(apiErrorMessage({ error: '' }, 500), 'HTTP 500');
  assert.equal(apiErrorMessage(null, 502), 'HTTP 502');
});

test('listItemsOf returns the items array or an empty array', () => {
  const items = [{ uid: 'u1', summary: 'Milk', description: '', status: 'needs_action' }];
  assert.deepEqual(listItemsOf({ entity_id: 'todo.home_items', items }), items);
  assert.deepEqual(listItemsOf({ items: 'nope' }), []);
  assert.deepEqual(listItemsOf(undefined), []);
});

test('imageUrlsOf keeps non-empty strings and caps the count at 8', () => {
  const urls = ['https://img.example/1.jpg', '', null, 3, ...Array.from({ length: 9 }, (_, i) => `https://img.example/${i + 2}.jpg`)];
  const out = imageUrlsOf(urls);
  assert.equal(out.length, 8);
  assert.equal(out[0], 'https://img.example/1.jpg');
  assert.deepEqual(imageUrlsOf(undefined), []);
});

test('RestockApiBackend.callTodo rejects an unknown service without a request', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => null }; };
  try {
    const backend = new RestockApiBackend();
    await assert.rejects(backend.callTodo('get_items', 'todo.home_items', {}), /unsupported service/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('RestockApiBackend.callTodo rejects with the server error text', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: 'Item not found' }) });
  try {
    const backend = new RestockApiBackend();
    await assert.rejects(
      backend.callTodo('remove_item', 'todo.home_items', { item: 'uid-9' }),
      (err) => err instanceof Error && err.message === 'Item not found',
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
