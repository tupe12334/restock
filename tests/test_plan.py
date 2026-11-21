"""Planner parity with split-plan.js, using the shared cases in test/plan-cases.json."""
import json
import unittest
from pathlib import Path

from restock.plan import format_plan_summary, plan_split

CASES = json.loads((Path(__file__).resolve().parent.parent / 'test' / 'plan-cases.json').read_text(encoding='utf-8'))


class PlanParity(unittest.TestCase):
    def test_every_shared_case_matches_the_js_planner(self):
        for case in CASES:
            with self.subTest(case=case['name']):
                inp = case['input']
                got = plan_split(items=inp['items'], stores=inp['stores'], max_stores=inp.get('maxStores', 2))
                self.assertEqual(got, case['output'])

    def test_summary_text_for_a_split(self):
        stores = {'a': {'name': 'A', 'deliveryFee': 30, 'minOrder': 0, 'enabled': True},
                  'b': {'name': 'B', 'deliveryFee': 30, 'minOrder': 0, 'enabled': True}}
        items = [{'name': 'x', 'quantity': 1, 'prices': {'a': 5, 'b': 4}, 'none': []}]
        plan = plan_split(items=items, stores=stores, max_stores=2)
        self.assertEqual(format_plan_summary(plan, {'a': 'A', 'b': 'B'}),
                         'Best plan: B ₪4.00 (1 items) = ₪34.00 incl. delivery — '
                         'no split is cheaper than the best single store (B ₪34.00)')


if __name__ == '__main__':
    unittest.main()
