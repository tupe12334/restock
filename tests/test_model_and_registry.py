"""Line helpers match restock-card.js, and the store registry."""
import unittest

from restock import model
from restock import stores
from restock.stores.base import Store, StoreError


class ModelTest(unittest.TestCase):
    def test_with_buy_at_goes_before_image_and_replaces_old_line(self):
        out = model.with_buy_at('Quantity: 2\nBuy at: old\nLink a: https://x\nImage: https://i', 'Victory')
        self.assertEqual(out, 'Quantity: 2\nLink a: https://x\nBuy at: victory\nImage: https://i')

    def test_with_buy_at_empty_removes_the_line(self):
        self.assertEqual(model.with_buy_at('Quantity: 2\nBuy at: old', ''), 'Quantity: 2')

    def test_quantity_and_every_order(self):
        self.assertEqual(model.quantity_of('Quantity: 0'), 1)
        self.assertEqual(model.quantity_of('Quantity: 3'), 3)
        self.assertEqual(model.every_order_of('Paper\nToilet paper\nEvery order: 2'), 2)
        self.assertEqual(model.every_order_of('Paper\nToilet paper'), 0)

    def test_links_keep_https_only_and_first_wins(self):
        links = model.store_links('Link victory: http://no\nLink victory: https://a\nLink victory: https://b')
        self.assertEqual(links, [{'store': 'victory', 'brand': None, 'url': 'https://a'}])

    def test_product_stores(self):
        self.assertEqual(model.product_stores('Product shufersal: none\nProduct victory: Milk 1 L'),
                         {'shufersal': 'none', 'victory': 'Milk 1 L'})


class RegistryTest(unittest.TestCase):
    def test_every_built_in_id_has_an_adapter(self):
        self.assertEqual(set(stores.ids()), {'victory', 'ramilevy', 'shufersal', 'yochananof',
                                             'hazihinam', 'tivtaam', 'bug'})
        for sid in stores.ids():
            self.assertEqual(stores.get(sid).id, sid)

    def test_register_adds_a_new_store_and_refuses_duplicates(self):
        class Demo(Store):
            id = 'demoshop'
            name = 'Demo'

        stores.register(Demo())
        self.assertIn('demoshop', stores.ids())
        with self.assertRaises(StoreError):
            stores.register(Demo())

    def test_register_refuses_a_bad_id(self):
        class Bad(Store):
            id = 'Not Lower'
            name = 'Bad'

        with self.assertRaises(StoreError):
            stores.register(Bad())


if __name__ == '__main__':
    unittest.main()
