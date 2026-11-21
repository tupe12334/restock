"""Read Local To-do .ics files: unfold lines, undo text escapes, read VTODO items.

Read only. Home Assistant writes these files. The package never writes them.
"""
from __future__ import annotations

import re
from typing import Any

_ESCAPED = re.compile(r'\\(.)', re.DOTALL)
_STATUS = {'NEEDS-ACTION': 'needs_action', 'COMPLETED': 'completed'}


def unfold(text: str) -> list[str]:
    """Join folded lines. A line that starts with a space or tab continues the line above."""
    out: list[str] = []
    for raw in text.replace('\r\n', '\n').split('\n'):
        if raw[:1] in (' ', '\t') and out:
            out[-1] += raw[1:]
        else:
            out.append(raw)
    return out


def unescape(value: str) -> str:
    """Undo ICS escapes. \\n gives a newline. \\, \\; and \\\\ give the character."""
    return _ESCAPED.sub(lambda m: '\n' if m.group(1) in 'nN' else m.group(1), value)


def parse_todos(text: str) -> list[dict[str, Any]]:
    """Return [{uid, summary, description, status}] for each VTODO that has a SUMMARY."""
    items: list[dict[str, Any]] = []
    current: dict[str, str] | None = None
    for line in unfold(text):
        if line == 'BEGIN:VTODO':
            current = {}
        elif line == 'END:VTODO':
            if current and 'SUMMARY' in current:
                items.append({
                    'uid': current.get('UID', ''),
                    'summary': current['SUMMARY'].strip(),
                    'description': current.get('DESCRIPTION', ''),
                    'status': _STATUS.get(current.get('STATUS', '').upper(), 'needs_action'),
                })
            current = None
        elif current is not None and ':' in line:
            name_part, value = line.split(':', 1)
            name = name_part.split(';', 1)[0].upper()
            if name in ('SUMMARY', 'DESCRIPTION', 'UID', 'STATUS') and name not in current:
                current[name] = unescape(value)
    return items
