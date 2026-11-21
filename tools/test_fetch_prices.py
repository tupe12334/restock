"""Tests for fetch_prices. Run with: python3 -m unittest discover -s tools -p 'test_*.py'"""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

import fetch_deals as fd
import fetch_prices as fp

FIXTURES = Path(__file__).resolve().parent / 'fixtures'
NOW = dt.datetime(2026, 11, 21, 6, 15, tzinfo=dt.timezone(dt.timedelta(hours=2)))
YESTERDAY = (NOW - dt.timedelta(days=1)).isoformat()
VICTORY_URL = 'https://www.victoryonline.co.il/product/pepsi'
RAMI_URL = 'https://www.rami-levy.co.il/he/online/search?q=7290020505538&item=7290020505538'
SHUFERSAL_URL = 'https://www.shufersal.co.il/online/he/p/P_7290000136141'


def fixture(name):
    return (FIXTURES / name).read_text(encoding='utf-8')


class FakeClient:
    """Answers GET and POST from a dict. A value that is an exception is raised instead."""

    def __init__(self, get=None, post=None):
        self.get_map = get or {}
        self.post_map = post or {}
        self.calls = []

    def get_text(self, url, headers=None):
        self.calls.append(('get', url))
        self.headers = headers
        answer = self.get_map.get(url, OSError('down'))
        if isinstance(answer, Exception):
            raise answer
        return answer

    def post_json(self, url, body):
        key = body['q'] if 'q' in body else body['variables']['s']
        self.calls.append(('post', key))
        answer = self.post_map.get(key, OSError('down'))
        if isinstance(answer, Exception):
            raise answer
        return answer


def item(name, description):
    return {'summary': name, 'description': description}


class ParseTests(unittest.TestCase):
    def test_product_none_and_brand_links(self):
        text = (
            'Dairy\nPepsi\n'
            f'Link victory: {VICTORY_URL}\n'
            f'Link victory (Riztz): {VICTORY_URL}-b\n'
            f'Link ramilevy: {RAMI_URL}\n'
            'Product ramilevy: none\n'
        )
        targets, none = fp.price_targets(text)
        self.assertEqual(targets, [
            ('victory', 'victory', VICTORY_URL),
            ('victory (Riztz)', 'victory', VICTORY_URL + '-b'),
            ('ramilevy', 'ramilevy', RAMI_URL),
        ])
        self.assertEqual(none, {'ramilevy'})

    def test_bug_and_unknown_stores(self):
        text = 'Link bug: https://bug.example/p/1\nLink unknownstore: https://y.example/p'
        targets, _ = fp.price_targets(text)
        self.assertEqual([t[1] for t in targets], ['bug'])

    def test_product_lines_with_name_are_not_none(self):
        self.assertEqual(fp.product_stores('Product shufersal: Tnuva 3%\nProduct victory: none'),
                         {'shufersal': 'Tnuva 3%', 'victory': 'none'})


class StoreTests(unittest.TestCase):
    def test_victory_reads_json_ld_price(self):
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        self.assertEqual(fp.fetch_victory(client, VICTORY_URL), 7.0)

    def test_yochananof_takes_exact_barcode_final_price(self):
        url = 'https://yochananof.co.il/search?q=7290000136141'
        client = FakeClient(post={'7290000136141': json.loads(fixture('yochananof_search.json'))})
        self.assertEqual(fp.fetch_yochananof(client, url), 6.6)
        self.assertEqual(client.calls, [('post', '7290000136141')])

    def test_yochananof_rejects_non_exact_sku(self):
        url = 'https://yochananof.co.il/search?q=7290000136999'
        client = FakeClient(post={'7290000136999': json.loads(fixture('yochananof_search.json'))})
        with self.assertRaises(ValueError):
            fp.fetch_yochananof(client, url)

    def test_hazihinam_reads_exact_barcode_with_guest_token(self):
        url = 'https://shop.hazi-hinam.co.il/searchResults/5029053002408'
        item_url = fp.HAZI_ITEM_URL.format(barcode='5029053002408')
        client = FakeClient(get={fp.HAZI_INIT_URL: fixture('hazihinam_init.json'),
                                 item_url: fixture('hazihinam_item.json')})
        self.assertEqual(fp.fetch_hazihinam(client, url), 36.3)
        self.assertEqual(client.headers, {'Authorization': 'Bearer FIXTURE-GUEST-TOKEN'})
        self.assertEqual(client.calls, [('get', fp.HAZI_INIT_URL), ('get', item_url)])

    def test_hazihinam_reads_token_once_per_client(self):
        client = FakeClient(get={fp.HAZI_INIT_URL: fixture('hazihinam_init.json'),
                                 fp.HAZI_ITEM_URL.format(barcode='5029053002408'): fixture('hazihinam_item.json')})
        url = 'https://shop.hazi-hinam.co.il/searchResults/5029053002408'
        fp.fetch_hazihinam(client, url)
        fp.fetch_hazihinam(client, url)
        self.assertEqual([c[1] for c in client.calls].count(fp.HAZI_INIT_URL), 1)

    def test_hazihinam_rejects_other_barcode(self):
        url = 'https://shop.hazi-hinam.co.il/searchResults/5029053002999'
        client = FakeClient(get={fp.HAZI_INIT_URL: fixture('hazihinam_init.json'),
                                 fp.HAZI_ITEM_URL.format(barcode='5029053002999'): fixture('hazihinam_item.json')})
        with self.assertRaises(ValueError):
            fp.fetch_hazihinam(client, url)

    def test_hazihinam_missing_item_fails(self):
        url = 'https://shop.hazi-hinam.co.il/searchResults/7290000136141'
        none = json.dumps({'IsOK': True, 'Results': {'Item': None}, 'ErrorResponse': None})
        client = FakeClient(get={fp.HAZI_INIT_URL: fixture('hazihinam_init.json'),
                                 fp.HAZI_ITEM_URL.format(barcode='7290000136141'): none})
        with self.assertRaises(ValueError):
            fp.fetch_hazihinam(client, url)

    def test_hazihinam_uses_regular_price_when_net_is_empty(self):
        item = {'BarKod': '1', 'Price_NET': 0.0, 'Price_Regular': 12.5}
        self.assertEqual(fp.hazi_price(item), 12.5)

    def test_hazihinam_barcode_comes_from_path_only(self):
        self.assertEqual(fp.hazi_barcode('https://shop.hazi-hinam.co.il/searchResults/7290000522319'), '7290000522319')
        self.assertIsNone(fp.hazi_barcode('https://shop.hazi-hinam.co.il/searchResults/pepsi'))

    def test_hazihinam_link_has_its_own_store_key(self):
        targets, _ = fp.price_targets('Link hazihinam: https://shop.hazi-hinam.co.il/searchResults/5029053002408')
        self.assertEqual(targets, [('hazihinam', 'hazihinam', 'https://shop.hazi-hinam.co.il/searchResults/5029053002408')])

    def test_yochananof_needs_barcode_in_link(self):
        with self.assertRaises(ValueError):
            fp.fetch_yochananof(FakeClient(), 'https://yochananof.co.il/search?q=pepsi')

    def test_tivtaam_takes_exact_barcode_when_product_id_matches(self):
        url = 'https://www.tivtaam.co.il/?catalogProduct=5458561'
        client = FakeClient(get={fp.tivtaam_api_url('7290000136141'): fixture('tivtaam_search.json')})
        self.assertEqual(fp.fetch_tivtaam(client, url, '7290000136141'), 6.9)

    def test_tivtaam_skips_when_product_id_differs(self):
        url = 'https://www.tivtaam.co.il/?catalogProduct=1111111'
        client = FakeClient(get={fp.tivtaam_api_url('7290000136141'): fixture('tivtaam_search.json')})
        with self.assertRaises(ValueError):
            fp.fetch_tivtaam(client, url, '7290000136141')

    def test_tivtaam_rejects_non_exact_barcode(self):
        url = 'https://www.tivtaam.co.il/?catalogProduct=5458561'
        client = FakeClient(get={fp.tivtaam_api_url('7290000136999'): fixture('tivtaam_search.json')})
        with self.assertRaises(ValueError):
            fp.fetch_tivtaam(client, url, '7290000136999')

    def test_tivtaam_needs_item_barcode_before_request(self):
        client = FakeClient()
        with self.assertRaises(ValueError):
            fp.fetch_tivtaam(client, 'https://www.tivtaam.co.il/?catalogProduct=5458561')
        self.assertEqual(client.calls, [])

    def test_tivtaam_needs_product_id_in_link(self):
        with self.assertRaises(ValueError):
            fp.fetch_tivtaam(FakeClient(), 'https://www.tivtaam.co.il/search/7290000136141', '7290000136141')

    def test_tivtaam_link_has_its_own_store_key(self):
        url = 'https://www.tivtaam.co.il/?catalogProduct=5458561'
        targets, _ = fp.price_targets(f'Link tivtaam: {url}')
        self.assertEqual(targets, [('tivtaam', 'tivtaam', url)])

    def test_item_barcode_reads_store_links_and_images(self):
        cases = {
            'Link ramilevy: https://www.rami-levy.co.il/he/online/search?q=7290000136141': '7290000136141',
            'Link shufersal: https://www.shufersal.co.il/online/he/p/P_7290000136141': '7290000136141',
            'Link yochananof: https://yochananof.co.il/search?q=7290000136141': '7290000136141',
            'Link hazihinam: https://shop.hazi-hinam.co.il/searchResults/5029053002408': '5029053002408',
            'Image: https://cdn.example/gs1/7290000136141/a.jpg': '7290000136141',
            'Image: https://cdn.example/media/product-images/5029053002408/a.jpg': '5029053002408',
        }
        for line, expected in cases.items():
            with self.subTest(line=line):
                self.assertEqual(fp.item_barcode(line), expected)

    def test_item_barcode_skips_tivtaam_and_unknown_lines(self):
        description = 'Link victory: https://www.victoryonline.co.il/product/x\nLink tivtaam: https://www.tivtaam.co.il/?catalogProduct=5458561'
        self.assertIsNone(fp.item_barcode(description))

    def test_item_barcode_takes_first_found(self):
        description = 'Link tivtaam: https://www.tivtaam.co.il/?catalogProduct=5458561\nLink ramilevy: https://www.rami-levy.co.il/he/online/search?q=5029053002408\nImage: https://cdn.example/gs1/7290000136141/a.jpg'
        self.assertEqual(fp.item_barcode(description), '5029053002408')

    def test_refresh_reads_tivtaam_with_item_barcode(self):
        description = 'Link tivtaam: https://www.tivtaam.co.il/?catalogProduct=5458561\nImage: https://cdn.example/gs1/7290000136141/a.jpg'
        catalogs = {'todo.home_items': [item('Pepsi Cola', description)]}
        client = FakeClient(get={fp.tivtaam_api_url('7290000136141'): fixture('tivtaam_search.json')})
        prices, stats = fp.refresh(catalogs, {}, client, dt.datetime(2026, 11, 21, tzinfo=dt.timezone.utc), log=lambda *_: None)
        self.assertEqual(prices['todo.home_items']['Pepsi Cola']['tivtaam']['price'], 6.9)
        self.assertEqual(stats['failed'], 0)

    def test_victory_without_price_fails(self):
        client = FakeClient(get={VICTORY_URL: '<html></html>'})
        with self.assertRaises(ValueError):
            fp.fetch_victory(client, VICTORY_URL)

    def test_ramilevy_matches_barcode(self):
        payload = json.loads(fixture('rami_sale.json'))
        client = FakeClient(post={'7290020505538': payload})
        self.assertEqual(fp.fetch_ramilevy(client, RAMI_URL), 8.9)

    def test_ramilevy_barcode_missing_fails(self):
        client = FakeClient(post={'7290020505538': {'data': []}})
        with self.assertRaises(ValueError):
            fp.fetch_ramilevy(client, RAMI_URL)

    def test_ramilevy_without_barcode_fails_before_request(self):
        client = FakeClient()
        with self.assertRaises(ValueError):
            fp.fetch_ramilevy(client, 'https://www.rami-levy.co.il/he/online/search?q=abc')
        self.assertEqual(client.calls, [])

    def test_shufersal_falls_back_to_offers_regex(self):
        client = FakeClient(get={SHUFERSAL_URL: fixture('shufersal_product.html')})
        self.assertEqual(fp.fetch_shufersal(client, SHUFERSAL_URL), 12.9)

    def test_generic_reads_open_graph_price(self):
        page = '<meta property="product:price:amount" content="4.5">'
        self.assertEqual(fp.fetch_generic(FakeClient(get={'https://b.example/p': page}), 'https://b.example/p'), 4.5)


class RefreshTests(unittest.TestCase):
    def test_new_prices_are_written_with_check_date_and_url(self):
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')},
                            post={'7290020505538': json.loads(fixture('rami_sale.json'))})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}\nLink ramilevy: {RAMI_URL}')]
        prices, stats = fp.refresh({'todo.home_items': items}, {}, client, NOW)
        row = prices['todo.home_items']['Pepsi']
        self.assertEqual(row['victory'], {'price': 7.0, 'checked': NOW.isoformat(), 'url': VICTORY_URL})
        self.assertEqual(row['ramilevy']['price'], 8.9)
        self.assertEqual((stats['priced'], stats['failed'], stats['requests']), (2, 0, 2))

    def test_failed_read_keeps_old_entry_and_its_date(self):
        old = {'price': 6.0, 'checked': YESTERDAY, 'url': VICTORY_URL}
        previous = {'todo.home_items': {'Pepsi': {'victory': old}}}
        client = FakeClient(get={VICTORY_URL: OSError('timeout')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}')]
        prices, stats = fp.refresh({'todo.home_items': items}, previous, client, NOW, log=lambda m: None)
        self.assertEqual(prices['todo.home_items']['Pepsi']['victory'], old)
        self.assertEqual(stats['failed'], 1)

    def test_none_store_is_not_read(self):
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}\nProduct victory: none')]
        prices, _ = fp.refresh({'todo.home_items': items}, {}, client, NOW)
        self.assertEqual(prices['todo.home_items']['Pepsi']['victory'], {'none': True, 'checked': NOW.isoformat()})
        self.assertEqual(client.calls, [])

    def test_fresh_entries_are_kept_when_max_age_is_set(self):
        fresh = {'price': 6.0, 'checked': (NOW - dt.timedelta(hours=5)).isoformat(), 'url': VICTORY_URL}
        previous = {'todo.home_items': {'Pepsi': {'victory': fresh}}}
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}')]
        prices, stats = fp.refresh({'todo.home_items': items}, previous, client, NOW, max_age_days=2)
        self.assertEqual(prices['todo.home_items']['Pepsi']['victory'], fresh)
        self.assertEqual(client.calls, [])
        self.assertEqual(stats['kept'], 1)

    def test_old_entries_are_read_when_older_than_max_age(self):
        old = {'price': 6.0, 'checked': (NOW - dt.timedelta(days=3)).isoformat(), 'url': VICTORY_URL}
        previous = {'todo.home_items': {'Pepsi': {'victory': old}}}
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}')]
        prices, _ = fp.refresh({'todo.home_items': items}, previous, client, NOW, max_age_days=2)
        self.assertEqual(prices['todo.home_items']['Pepsi']['victory']['price'], 7.0)

    def test_same_url_is_read_once_per_run(self):
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}'), item('Cola', f'Link victory: {VICTORY_URL}')]
        fp.refresh({'todo.home_items': items}, {}, client, NOW)
        self.assertEqual(len(client.calls), 1)

    def test_only_one_item_is_read(self):
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}'), item('Cola', f'Link victory: {VICTORY_URL}-2')]
        prices, stats = fp.refresh({'todo.home_items': items}, {}, client, NOW, only='  pepsi ')
        self.assertEqual(list(prices['todo.home_items']), ['Pepsi'])
        self.assertEqual(stats['items'], 1)

    def test_other_entities_are_kept_untouched(self):
        other = {'todo.3d_filaments': {'PLA': {'bug': {'price': 99.0, 'checked': YESTERDAY, 'url': 'u'}}}}
        prices, _ = fp.refresh({'todo.home_items': []}, other, FakeClient(), NOW)
        self.assertEqual(prices, other)

    def test_brand_link_has_its_own_key(self):
        client = FakeClient(get={VICTORY_URL: fixture('victory_deal.html')})
        items = [item('Pepsi', f'Link victory: {VICTORY_URL}\nLink victory (Riztz): {VICTORY_URL}')]
        prices, _ = fp.refresh({'todo.home_items': items}, {}, client, NOW)
        self.assertEqual(set(prices['todo.home_items']['Pepsi']), {'victory', 'victory (Riztz)'})


class FileTests(unittest.TestCase):
    def test_catalog_files_skip_order_and_history_lists(self):
        with tempfile.TemporaryDirectory() as tmp:
            storage = Path(tmp) / '.storage'
            storage.mkdir()
            ics = 'BEGIN:VTODO\nSUMMARY:Pepsi\nEND:VTODO\n'
            for name in ('home_items', '3d_filaments', 'to_order', 'restock_history', 'shopping_questions'):
                (storage / f'local_todo.{name}.ics').write_text(ics, encoding='utf-8')
            found = fp.catalog_files(Path(tmp))
            self.assertEqual(sorted(found), ['todo.3d_filaments', 'todo.home_items'])

    def test_damaged_previous_file_stops_the_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'restock-prices.json'
            path.write_text('{not json', encoding='utf-8')
            with self.assertRaises(SystemExit):
                fp.load_previous(path)

    def test_missing_previous_file_is_empty(self):
        self.assertEqual(fp.load_previous(Path('/nonexistent/restock-prices.json')), {})

    def test_due_rules(self):
        self.assertTrue(fp.due(None, NOW, 0))
        self.assertTrue(fp.due({'price': 1, 'checked': YESTERDAY}, NOW, 0))
        self.assertFalse(fp.due({'price': 1, 'checked': YESTERDAY}, NOW, 2))
        self.assertTrue(fp.due({'price': 1, 'checked': 'garbage'}, NOW, 2))


if __name__ == '__main__':
    unittest.main()
