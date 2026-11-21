"""REST API on a random port. No network: photo search is replaced by a fake."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from restock.server import make_server

REPO = Path(__file__).resolve().parent.parent


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = make_server(Path(self.tmp.name), REPO, '127.0.0.1', 0,
                                  image_search=lambda q: [f'https://img.example/{q}.jpg'])
        self.base = f'http://127.0.0.1:{self.server.server_address[1]}'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def call(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode('utf-8')
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read()
                ctype = resp.headers.get('Content-Type', '')
                return resp.status, (json.loads(raw) if 'json' in ctype and raw else raw), ctype
        except urllib.error.HTTPError as err:
            raw = err.read()
            return err.code, (json.loads(raw) if raw else None), err.headers.get('Content-Type', '')

    def test_page_and_card_files(self):
        status, body, ctype = self.call('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn('text/html', ctype)
        self.assertIn(b'restock-card', body)
        self.assertIn(b'"deals_url": "/api/deals"', body)
        status, body, ctype = self.call('GET', '/restock-card.js')
        self.assertEqual(status, 200)
        self.assertIn('javascript', ctype)
        self.assertEqual(self.call('GET', '/split-plan.js')[0], 200)

    def test_list_item_lifecycle(self):
        status, item, _ = self.call('POST', '/api/lists/todo.home_items/items',
                                    {'summary': 'Milk', 'description': 'Dairy'})
        self.assertEqual(status, 201)
        uid = item['uid']
        status, body, _ = self.call('GET', '/api/lists/todo.home_items')
        self.assertEqual([i['summary'] for i in body['items']], ['Milk'])
        status, item, _ = self.call('PATCH', f'/api/lists/todo.home_items/items/{uid}', {'status': 'completed'})
        self.assertEqual((status, item['status']), (200, 'completed'))
        self.assertEqual(self.call('DELETE', f'/api/lists/todo.home_items/items/{uid}')[0], 204)
        self.assertEqual(self.call('DELETE', f'/api/lists/todo.home_items/items/{uid}')[0], 404)
        self.assertEqual(self.call('PATCH', f'/api/lists/todo.home_items/items/{uid}', {'status': 'completed'})[0], 404)

    def test_validation_errors(self):
        status, body, _ = self.call('POST', '/api/lists/todo.home_items/items', {'summary': ' '})
        self.assertEqual(status, 400)
        self.assertIn('error', body)
        self.assertEqual(self.call('GET', '/api/lists/home_items')[0], 400)
        self.assertEqual(self.call('GET', '/api/nothing')[0], 404)

    def test_start_order_prices_deals_and_images(self):
        self.call('POST', '/api/lists/todo.home_items/items',
                  {'summary': 'Paper', 'description': 'Toilet\nEvery order: 2'})
        self.assertEqual(self.call('POST', '/api/start-order')[1], {'added': 1})
        self.assertEqual(self.call('POST', '/api/start-order')[1], {'added': 1})
        status, body, _ = self.call('GET', '/api/lists/todo.to_order')
        self.assertIn('Quantity: 4', body['items'][0]['description'])
        self.assertEqual(self.call('GET', '/api/prices')[1], {'updated': None, 'items': {}})
        self.assertEqual(self.call('GET', '/api/deals')[1], {'updated': None, 'deals': {}})
        self.assertEqual(self.call('GET', '/api/images?q=milk')[1], {'images': ['https://img.example/milk.jpg']})
        self.assertEqual(self.call('GET', '/api/images')[0], 400)

    def test_body_too_large_is_refused(self):
        req = urllib.request.Request(self.base + '/api/lists/todo.home_items/items', data=b'x' * (70 * 1024),
                                     method='POST', headers={'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=5)
        self.assertEqual(ctx.exception.code, 413)


if __name__ == '__main__':
    unittest.main()
