"""CLI plan and apply, start-order, and the prices refresh with a fake client. No network."""
import contextlib
import datetime as dt
import io
import json
import tempfile
import unittest
from pathlib import Path

from restock import prices
from restock.cli import main
from restock.storage import FilesStorage


class FakeClient:
    """Answers a GET with a fixed page, and counts calls."""

    def __init__(self, pages):
        self.pages = pages
        self.requests = 0
        self.failures = 0

    def get_text(self, url, headers=None):
        self.requests += 1
        if url not in self.pages:
            raise OSError(f'no page for {url}')
        return self.pages[url]


PAGE = ('<script type="application/ld+json">{"@type": "Product", "offers": {"price": "7.50"}}</script>')


class CliPlanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        self.store = FilesStorage(self.data)
        self.store.write_add('todo.to_order', 'Milk', 'Quantity: 2')
        prices_doc = {'updated': 'now', 'items': {'todo.home_items': {
            'Milk': {'victory': {'price': 7.0, 'checked': 'now', 'url': 'https://v'},
                     'shufersal': {'price': 6.0, 'checked': 'now', 'url': 'https://s'}}}}}
        (self.data / 'prices.json').write_text(json.dumps(prices_doc), encoding='utf-8')
        (self.data / 'config.json').write_text(json.dumps({'split_max_stores': 1}), encoding='utf-8')

    def tearDown(self):
        self.tmp.cleanup()

    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(['--data', str(self.data), *args])
        return code, out.getvalue()

    def test_plan_prints_the_best_single_store(self):
        code, text = self.run_cli('plan')
        self.assertEqual(code, 0)
        self.assertIn('Best plan:', text)
        self.assertIn('Milk', text)
        self.assertIn('₪12.00', text)  # 2 units at the cheaper shufersal price

    def test_plan_apply_writes_buy_at(self):
        code, text = self.run_cli('plan', '--apply')
        self.assertEqual(code, 0)
        self.assertIn('Tagged 1 order entries', text)
        entry = self.store.read('todo.to_order')[0]
        self.assertIn('Buy at: shufersal', entry['description'])
        self.assertIn('Quantity: 2', entry['description'])

    def test_plan_json_has_the_plan_keys(self):
        code, text = self.run_cli('plan', '--json')
        self.assertEqual(code, 0)
        self.assertIn('"baskets"', text)

    def test_start_order_command(self):
        self.store.write_add('todo.home_items', 'Paper', 'Toilet\nEvery order: 1')
        code, text = self.run_cli('start-order')
        self.assertEqual(code, 0)
        self.assertIn('1 items added', text)


class PricesTest(unittest.TestCase):
    def test_refresh_reads_a_price_and_marks_none(self):
        catalogs = {'todo.home_items': [
            {'summary': 'Milk', 'description': 'Dairy\nLink victory: https://v.example/p\n'
                                              'Link shufersal: https://s.example/p\nProduct shufersal: none'},
        ]}
        client = FakeClient({'https://v.example/p': PAGE})
        now = dt.datetime(2026, 11, 21, 6, 15, tzinfo=dt.timezone.utc)
        items, stats = prices.refresh(catalogs, {}, client, now, log=lambda m: None)
        row = items['todo.home_items']['Milk']
        self.assertEqual(row['victory']['price'], 7.5)
        self.assertEqual(row['shufersal'], {'none': True, 'checked': now.isoformat()})
        self.assertEqual(stats['priced'], 1)
        self.assertEqual(stats['none'], 1)

    def test_failed_read_keeps_the_old_entry(self):
        old = {'todo.home_items': {'Milk': {'victory': {'price': 6.0, 'checked': 'old', 'url': 'https://v.example/p'}}}}
        catalogs = {'todo.home_items': [
            {'summary': 'Milk', 'description': 'Dairy\nLink victory: https://v.example/p'}]}
        client = FakeClient({})
        now = dt.datetime(2026, 11, 21, 6, 15, tzinfo=dt.timezone.utc)
        items, stats = prices.refresh(catalogs, old, client, now, log=lambda m: None)
        self.assertEqual(items['todo.home_items']['Milk']['victory']['price'], 6.0)
        self.assertEqual(stats['failed'], 1)


if __name__ == '__main__':
    unittest.main()
