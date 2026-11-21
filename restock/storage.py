"""Todo list storage. Two backends: plain JSON files, and Home Assistant.

Every backend has the same methods: list_names, read, write_add, write_update, write_remove.
An item is a dict {uid, summary, description, status}. status is needs_action or completed.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any, Callable

from . import ics

ENTITY_ID = re.compile(r'todo\.[a-z0-9_]+')
STATUSES = ('needs_action', 'completed')
Post = Callable[[str, dict, dict | None], Any]


class StorageError(ValueError):
    """A bad entity id, a bad status, or a write that the backend does not allow."""


class NotFound(StorageError):
    """No item with the given uid."""


def check_entity(entity: str) -> str:
    """Return the entity id, or raise StorageError when it is not todo.<name> with [a-z0-9_]."""
    if not isinstance(entity, str) or not ENTITY_ID.fullmatch(entity):
        raise StorageError(f'invalid entity id: {entity!r}')
    return entity


def check_status(status: str) -> str:
    if status not in STATUSES:
        raise StorageError(f'status must be needs_action or completed, got {status!r}')
    return status


def _item(uid: str, summary: str, description: str, status: str) -> dict[str, str]:
    return {'uid': uid, 'summary': summary, 'description': description, 'status': status}


class FilesStorage:
    """Lists as JSON files: <data>/lists/<name>.json with {"items": [...]}."""

    def __init__(self, data_dir: Path | str) -> None:
        self.dir = Path(data_dir) / 'lists'

    def _path(self, entity: str) -> Path:
        return self.dir / f'{check_entity(entity)[len("todo."):]}.json'

    def list_names(self) -> list[str]:
        if not self.dir.is_dir():
            return []
        return sorted(f'todo.{p.stem}' for p in self.dir.glob('*.json') if ENTITY_ID.fullmatch(f'todo.{p.stem}'))

    def read(self, entity: str) -> list[dict[str, str]]:
        path = self._path(entity)
        if not path.exists():
            return []
        data = json.loads(path.read_text(encoding='utf-8'))
        return [dict(item) for item in data.get('items', [])]

    def _save(self, entity: str, items: list[dict[str, str]]) -> None:
        """Write the list atomically: a temp file in the same folder, then os.replace."""
        path = self._path(entity)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.tmp-', suffix='.json')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                json.dump({'items': items}, handle, ensure_ascii=False, indent=2)
                handle.write('\n')
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def write_add(self, entity: str, summary: str, description: str = '', status: str = 'needs_action') -> dict:
        check_status(status)
        items = self.read(entity)
        item = _item(uuid.uuid4().hex, summary, description, status)
        items.append(item)
        self._save(entity, items)
        return item

    def write_update(self, entity: str, uid: str, changes: dict[str, Any]) -> dict:
        items = self.read(entity)
        for item in items:
            if item['uid'] == uid:
                _apply(item, changes)
                self._save(entity, items)
                return item
        raise NotFound(f'unknown uid {uid}')

    def write_remove(self, entity: str, uid: str) -> None:
        items = self.read(entity)
        kept = [item for item in items if item['uid'] != uid]
        if len(kept) == len(items):
            raise NotFound(f'unknown uid {uid}')
        self._save(entity, kept)


def _apply(item: dict[str, str], changes: dict[str, Any]) -> None:
    """Apply the allowed fields of changes to item. Raises StorageError for a bad value."""
    if 'summary' in changes:
        summary = str(changes['summary'] or '').strip()
        if not summary:
            raise StorageError('summary must not be empty')
        item['summary'] = summary
    if 'description' in changes:
        item['description'] = str(changes['description'] or '')
    if 'status' in changes:
        item['status'] = check_status(changes['status'])


class HomeAssistantStorage:
    """Home Assistant todo lists.

    Read only from ICS files when config_dir is set. Otherwise the REST API at url, with a bearer token.
    The token goes only into the Authorization header. It is never logged.
    """

    def __init__(self, url: str | None = None, token: str | None = None, config_dir: Path | str | None = None,
                 post: Post | None = None) -> None:
        self.url = url.rstrip('/') if url else None
        self.token = token
        self.config_dir = Path(config_dir) if config_dir else None
        self._post = post

    def _call(self, path: str, body: dict) -> Any:
        if self._post is None:
            from .http import Client
            self._post = Client(min_gap=0).post_json
        headers = {'Authorization': f'Bearer {self.token}'} if self.token else None
        return self._post(f'{self.url}{path}', body, headers)

    def _ics_path(self, entity: str) -> Path:
        return self.config_dir / '.storage' / f'local_todo.{check_entity(entity)[len("todo."):]}.ics'

    def list_names(self) -> list[str]:
        if self.config_dir is None:
            raise StorageError('list_names needs --ha-config in ICS mode')
        folder = self.config_dir / '.storage'
        names = []
        for path in sorted(folder.glob('local_todo.*.ics')) if folder.is_dir() else []:
            name = path.name[len('local_todo.'):-len('.ics')]
            if ENTITY_ID.fullmatch(f'todo.{name}'):
                names.append(f'todo.{name}')
        return names

    def read(self, entity: str) -> list[dict[str, str]]:
        check_entity(entity)
        if self.config_dir is not None:
            path = self._ics_path(entity)
            return ics.parse_todos(path.read_text(encoding='utf-8')) if path.exists() else []
        response = self._call('/api/services/todo/get_items?return_response',
                              {'entity_id': entity, 'status': list(STATUSES)})
        return list(response['service_response'][entity]['items'])

    def _read_only(self) -> None:
        if self.config_dir is not None and self.url is None:
            raise StorageError('ICS mode is read only. Use --ha-url to write.')

    def write_add(self, entity: str, summary: str, description: str = '', status: str = 'needs_action') -> dict:
        self._read_only()
        check_status(status)
        self._call('/api/services/todo/add_item',
                   {'entity_id': check_entity(entity), 'item': summary, 'description': description})
        # The service does not return the uid. Read the list back and take the newest match.
        match = [i for i in self.read(entity) if i.get('summary') == summary][-1]
        if status != match.get('status'):
            return self.write_update(entity, match['uid'], {'status': status})
        return match

    def write_update(self, entity: str, uid: str, changes: dict[str, Any]) -> dict:
        self._read_only()
        body: dict[str, Any] = {'entity_id': check_entity(entity), 'item': uid}
        if 'summary' in changes:
            body['rename'] = str(changes['summary'])
        if 'description' in changes:
            body['description'] = str(changes['description'] or '')
        if 'status' in changes:
            body['status'] = check_status(changes['status'])
        self._call('/api/services/todo/update_item', body)
        return next((i for i in self.read(entity) if i['uid'] == uid), {'uid': uid, **changes})

    def write_remove(self, entity: str, uid: str) -> None:
        self._read_only()
        self._call('/api/services/todo/remove_item', {'entity_id': check_entity(entity), 'item': [uid]})
