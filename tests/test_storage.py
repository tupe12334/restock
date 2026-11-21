"""Files storage and Home Assistant ICS read. Temp folders only."""
import json
import tempfile
import unittest
from pathlib import Path

from restock.ics import parse_todos
from restock.storage import FilesStorage, HomeAssistantStorage, NotFound, StorageError


class FilesStorageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = FilesStorage(Path(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def test_add_read_update_remove(self):
        item = self.store.write_add('todo.home_items', 'Milk', 'Dairy\n3%')
        self.assertEqual(self.store.read('todo.home_items')[0]['summary'], 'Milk')
        updated = self.store.write_update('todo.home_items', item['uid'], {'status': 'completed'})
        self.assertEqual(updated['status'], 'completed')
        self.store.write_remove('todo.home_items', item['uid'])
        self.assertEqual(self.store.read('todo.home_items'), [])

    def test_file_shape_is_items_in_lists_folder(self):
        self.store.write_add('todo.to_order', 'Bread')
        data = json.loads((Path(self.tmp.name) / 'lists' / 'to_order.json').read_text(encoding='utf-8'))
        self.assertEqual(data['items'][0]['summary'], 'Bread')
        self.assertEqual(self.store.list_names(), ['todo.to_order'])

    def test_unknown_uid_and_bad_entity(self):
        with self.assertRaises(NotFound):
            self.store.write_update('todo.home_items', 'nope', {'status': 'completed'})
        with self.assertRaises(NotFound):
            self.store.write_remove('todo.home_items', 'nope')
        with self.assertRaises(StorageError):
            self.store.read('home_items')
        with self.assertRaises(StorageError):
            self.store.read('todo.Bad-Name')

    def test_bad_status_and_empty_summary_are_refused(self):
        with self.assertRaises(StorageError):
            self.store.write_add('todo.home_items', 'Milk', status='maybe')
        item = self.store.write_add('todo.home_items', 'Milk')
        with self.assertRaises(StorageError):
            self.store.write_update('todo.home_items', item['uid'], {'summary': '  '})

    def test_round_trip_survives_a_new_instance(self):
        self.store.write_add('todo.home_items', 'Eggs', 'Dairy')
        again = FilesStorage(Path(self.tmp.name))
        self.assertEqual([i['summary'] for i in again.read('todo.home_items')], ['Eggs'])


class IcsTest(unittest.TestCase):
    def test_parse_unfolds_and_unescapes(self):
        ics = ('BEGIN:VCALENDAR\nBEGIN:VTODO\nUID:1\nSUMMARY:Pepsi Cola\n'
               'DESCRIPTION:Drinks\\n1.5 L\\nLink victory: https://x.example/\n p\nSTATUS:NEEDS-ACTION\n'
               'END:VTODO\nEND:VCALENDAR\n')
        items = parse_todos(ics)
        self.assertEqual(items[0]['summary'], 'Pepsi Cola')
        self.assertIn('Link victory: https://x.example/p', items[0]['description'])
        self.assertEqual(items[0]['status'], 'needs_action')

    def test_home_assistant_ics_read_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / '.storage'
            folder.mkdir()
            (folder / 'local_todo.home_items.ics').write_text(
                'BEGIN:VTODO\nUID:9\nSUMMARY:Tea\nDESCRIPTION:Drinks\nEND:VTODO\n', encoding='utf-8')
            store = HomeAssistantStorage(config_dir=tmp)
            self.assertEqual(store.read('todo.home_items')[0]['summary'], 'Tea')
            with self.assertRaises(StorageError):
                store.write_add('todo.home_items', 'Coffee')


if __name__ == '__main__':
    unittest.main()
