"""Tests for fetch_deals. Run with: python3 -m unittest discover -s tools -p 'test_*.py'"""
import datetime as dt
import json
import unittest
from pathlib import Path

import fetch_deals as fd

FIXTURES = Path(__file__).resolve().parent / 'fixtures'
TODAY = dt.date(2026, 11, 20)
VICTORY_URL = 'https://www.victoryonline.co.il/product/%D7%A4%D7%A4%D7%A1%D7%99-15-%D7%9C%D7%99%D7%98%D7%A8'


def fixture(name):
    return (FIXTURES / name).read_text(encoding='utf-8')


class IcsTests(unittest.TestCase):
    def setUp(self):
        self.items = fd.parse_todos(fixture('catalog.ics'))

    def test_skips_items_without_summary(self):
        self.assertEqual([i['summary'] for i in self.items], ['Pepsi Cola', 'דבש', 'Sponge', 'Bad link'])

    def test_unfolds_lines_and_unescapes_newlines_and_commas(self):
        honey = self.items[1]['description']
        self.assertEqual(honey.split('\n')[:2], ['Pantry', 'דבש, טהור'])

    def test_unfolded_link_line_is_whole(self):
        pepsi = self.items[0]['description']
        self.assertIn('Link ramilevy: https://www.rami-levy.co.il/he/online/search?q=7290000136141&item=7290000136141', pepsi)

    def test_unescape_handles_semicolons_and_backslashes(self):
        self.assertEqual(fd.unescape_ics(r'a\;b\\c\,d\ne'), 'a;b\\c,d\ne')


class LinkTests(unittest.TestCase):
    def test_plain_and_brand_links_in_line_order(self):
        honey = fd.parse_todos(fixture('catalog.ics'))[1]['description']
        links = fd.store_links(honey)
        self.assertEqual(links[0], {'store': 'victory', 'brand': 'Yad Mordechai', 'url': 'https://www.victoryonline.co.il/product/%D7%93%D7%91%D7%A9'})
        self.assertEqual(links[1]['store'], 'victory')
        self.assertIsNone(links[1]['brand'])
        self.assertEqual([link['store'] for link in links], ['victory', 'victory', 'shufersal', 'ramilevy'])

    def test_first_link_per_store_and_brand_wins(self):
        text = 'Link victory: https://a.example/1\nLink VICTORY: https://a.example/2'
        self.assertEqual(fd.store_links(text), [{'store': 'victory', 'brand': None, 'url': 'https://a.example/1'}])

    def test_non_https_links_are_dropped(self):
        self.assertEqual(fd.store_links('Link victory: http://x.example/a'), [])

    def test_barcode_from_rami_search_link(self):
        url = 'https://www.rami-levy.co.il/he/online/search?q=7290000136141&item=7290000136141'
        self.assertEqual(fd.barcode_of(url), '7290000136141')
        self.assertIsNone(fd.barcode_of('https://www.rami-levy.co.il/he/online/search?q=abc'))


class VictoryTests(unittest.TestCase):
    def test_price_and_quantity_deal(self):
        deals = fd.deals_from_victory(fixture('victory_deal.html'), VICTORY_URL, None, TODAY)
        self.assertEqual(deals, [{
            'store': 'victory', 'brand': None, 'price': 7.0, 'deal': '2 ב-12.9 ₪',
            'dealQuantity': 2, 'dealPrice': 12.9, 'until': '2026-11-28', 'url': VICTORY_URL,
        }])

    def test_per_unit_label_is_not_a_deal(self):
        page = fixture('victory_deal.html').replace('2 ב-₪12.9', '₪12.9 ליחידה')
        self.assertEqual(fd.deals_from_victory(page, VICTORY_URL, None, TODAY), [])

    def test_no_sales_gives_no_deal(self):
        self.assertEqual(fd.deals_from_victory(fixture('victory_nodeal.html'), 'https://x.example/p', None, TODAY), [])

    def test_expired_sale_is_ignored(self):
        self.assertEqual(fd.deals_from_victory(fixture('victory_deal.html'), VICTORY_URL, None, dt.date(2026, 11, 29)), [])

    def test_price_without_json_ld_is_none(self):
        self.assertIsNone(fd.victory_price('<html></html>'))

    def test_brand_is_kept(self):
        deals = fd.deals_from_victory(fixture('victory_deal.html'), VICTORY_URL, 'Riztz', TODAY)
        self.assertEqual(deals[0]['brand'], 'Riztz')


class RamiTests(unittest.TestCase):
    def test_active_sale_with_quantity(self):
        payload = json.loads(fixture('rami_sale.json'))
        deals = fd.deals_from_rami(payload, '7290020505538', 'https://u.example', None, TODAY)
        self.assertEqual(deals, [{
            'store': 'ramilevy', 'brand': None, 'price': 8.9, 'deal': '3 ב-10 ₪',
            'dealQuantity': 3, 'dealPrice': 10.0, 'until': '2026-11-20', 'url': 'https://u.example',
        }])

    def test_no_sale_gives_no_deal(self):
        payload = json.loads(fixture('rami_nosale.json'))
        self.assertEqual(fd.deals_from_rami(payload, '7290000522319', 'https://u.example', None, TODAY), [])

    def test_unknown_barcode_gives_no_deal(self):
        payload = json.loads(fixture('rami_sale.json'))
        self.assertEqual(fd.deals_from_rami(payload, '1', 'https://u.example', None, TODAY), [])

    def test_inactive_and_expired_sales_are_skipped(self):
        payload = json.loads(fixture('rami_sale.json'))
        product = payload['data'][0]
        product['sale'][0]['active'] = 0
        self.assertEqual(fd.deals_from_rami(payload, '7290020505538', 'u', None, TODAY), [])
        payload = json.loads(fixture('rami_sale.json'))
        payload['data'][0]['sale'][0]['to'] = '2026-11-19 23:59:59'
        self.assertEqual(fd.deals_from_rami(payload, '7290020505538', 'u', None, TODAY), [])


class FormatTests(unittest.TestCase):
    def test_money_drops_trailing_zero(self):
        self.assertEqual(fd.money(20.0), '20')
        self.assertEqual(fd.money(12.9), '12.9')

    def test_non_quantity_deal_keeps_its_text(self):
        deal = fd.deal_entry('victory', None, 10.0, '20% הנחה', None, None, None, 'u')
        self.assertEqual(deal['deal'], '20% הנחה')
        self.assertIsNone(deal['dealQuantity'])

    def test_quantity_of_reads_both_shapes(self):
        self.assertEqual(fd.quantity_of('2 ב-₪12.9'), (2, 12.9))
        self.assertEqual(fd.quantity_of("3 יח' ב-10 ש\"ח"), (3, 10.0))
        self.assertEqual(fd.quantity_of('מבצע רגיל'), (None, None))


class CollectTests(unittest.TestCase):
    class FakeClient:
        def __init__(self):
            self.requests = 0
            self.failures = 0
            self.calls = []

        def get_text(self, url):
            self.calls.append(('get', url))
            self.requests += 1
            if 'victoryonline' in url:
                return fixture('victory_deal.html')
            raise OSError('down')  # any other host is down in this fake

        def post_json(self, url, body):
            self.calls.append(('post', body['q']))
            self.requests += 1
            if body['q'] == '7290020505538':
                return json.loads(fixture('rami_sale.json'))
            return json.loads(fixture('rami_nosale.json'))

    def test_items_without_deals_are_left_out_and_each_url_is_fetched_once(self):
        items = fd.parse_todos(fixture('catalog.ics'))
        items[0]['description'] = items[0]['description'].replace('7290000136141', '7290020505538')
        client = self.FakeClient()
        deals = fd.collect(items, client, TODAY, log=lambda m: None)
        self.assertEqual(sorted(deals), ['Pepsi Cola', 'דבש'])
        self.assertEqual([d['store'] for d in deals['Pepsi Cola']], ['victory', 'ramilevy'])
        self.assertEqual(sorted(set(c[1] for c in client.calls if c[0] == 'get')), sorted(
            ['https://www.victoryonline.co.il/product/%D7%A4%D7%A4%D7%A1%D7%99-15-%D7%9C%D7%99%D7%98%D7%A8',
             'https://www.victoryonline.co.il/product/%D7%93%D7%91%D7%A9',
             'https://www.victoryonline.co.il/product/%D7%93%D7%91%D7%A9-2']))
        self.assertEqual(sum(1 for c in client.calls if c[0] == 'get'), 3)

    def test_failed_link_is_logged_once_and_skipped(self):
        items = [{'summary': 'Pepsi', 'description': 'Link victory: https://down.example/p/1'},
                 {'summary': 'Cola', 'description': 'Link victory: https://down.example/p/1'}]
        client = self.FakeClient()
        logs = []
        deals = fd.collect(items, client, TODAY, log=logs.append)
        self.assertEqual(deals, {})
        self.assertEqual(client.failures, 1)
        self.assertEqual(len(logs), 1)


if __name__ == '__main__':
    unittest.main()
