"""Line-based item descriptions. Same formats as restock-card.js. Keep the two in step."""
from __future__ import annotations

import re

LINK_LINE = re.compile(
    r"^\s*link\s+([a-z][a-z0-9_-]*)\s*(?:\(([^()]*)\))?\s*:\s*(\S.*?)\s*$", re.IGNORECASE)
PRODUCT_LINE = re.compile(r"^\s*product\s+([a-z][a-z0-9_-]*)\s*:\s*(.*?)\s*$", re.IGNORECASE)
BUY_AT_LINE = re.compile(r"^\s*buy at\s*:\s*(\S.*?)\s*$", re.IGNORECASE)
QUANTITY_LINE = re.compile(r"^\s*quantity\s*:\s*(.*?)\s*$", re.IGNORECASE)
EVERY_ORDER_LINE = re.compile(r"^\s*every order\s*:\s*(.*?)\s*$", re.IGNORECASE)
PRODUCT_NONE = "none"
IMAGE_LINE = re.compile(r"^\s*image\s*:", re.IGNORECASE)


def store_links(description: str) -> list[dict]:
    """[{store, brand, url}] from Link lines, https only. The first link per store and brand wins."""
    seen: dict[tuple, str] = {}
    for line in str(description or "").splitlines():
        m = LINK_LINE.match(line)
        if not m:
            continue
        store = m.group(1).lower()
        brand = (m.group(2) or "").strip() or None
        url = m.group(3).strip()
        if url.startswith("https://"):
            seen.setdefault((store, brand), url)
    return [{"store": s, "brand": b, "url": u} for (s, b), u in seen.items()]


def product_stores(description: str) -> dict[str, str]:
    """{store: product name or 'none'}. The first Product line per store wins."""
    out: dict[str, str] = {}
    for line in str(description or "").splitlines():
        m = PRODUCT_LINE.match(line)
        if m:
            out.setdefault(m.group(1).lower(), m.group(2).strip())
    return out


def quantity_of(description: str) -> int:
    """Quantity line as an integer of 1 or more. Missing or invalid means 1."""
    for line in str(description or "").splitlines():
        m = QUANTITY_LINE.match(line)
        if m:
            try:
                n = int(m.group(1))
            except ValueError:
                return 1
            return n if n >= 1 else 1
    return 1


def buy_at_of(description: str) -> str:
    for line in str(description or "").splitlines():
        m = BUY_AT_LINE.match(line)
        if m:
            return m.group(1).strip().lower()
    return ""


def with_buy_at(description: str, store: str) -> str:
    """Set the Buy at line to store. Old Buy at lines go. Empty store removes the line.

    The new line goes before an Image line, or at the end. Other lines are kept, as in withLinesOf.
    """
    rest = [line for line in str(description or "").splitlines() if not BUY_AT_LINE.match(line)]
    name = str(store or "").strip().lower()
    if not name:
        return "\n".join(rest)
    image = next((i for i, line in enumerate(rest) if IMAGE_LINE.match(line)), len(rest))
    return "\n".join(rest[:image] + [f"Buy at: {name}"] + rest[image:])


def every_order_of(catalog_description: str) -> int:
    """Every order line of a catalog item as an integer. 0 when missing or invalid."""
    for line in str(catalog_description or "").splitlines():
        m = EVERY_ORDER_LINE.match(line)
        if m:
            try:
                n = int(m.group(1))
            except ValueError:
                return 0
            return n if n >= 0 else 0
    return 0


def default_details_of(catalog_description: str) -> str:
    """Line 2 of a catalog item, unless it is a labelled line."""
    lines = str(catalog_description or "").splitlines()
    if len(lines) < 2:
        return ""
    line = lines[1].strip()
    if re.match(r"^(prefer|want|have|every order|link|product|image)\s*:", line, re.IGNORECASE):
        return ""
    return line


def format_entry(quantity: int, details: str = "", buy_at: str = "", links=None, products=None) -> str:
    """Order entry description: Quantity, Details, Buy at, then Link and Product lines."""
    lines = [f"Quantity: {max(1, int(quantity))}"]
    if details:
        lines.append(f"Details: {details}")
    if buy_at:
        lines.append(f"Buy at: {buy_at}")
    for link in links or []:
        lines.append(f"Link {link['store']}: {link['url']}")
    for store, value in (products or {}).items():
        lines.append(f"Product {store}: {value}")
    return "\n".join(lines)


def with_quantity(description: str, quantity: int) -> str:
    """Set the Quantity line to quantity. Other lines are kept. A missing line is added first."""
    lines = str(description or "").splitlines()
    value = f"Quantity: {max(1, int(quantity))}"
    for i, line in enumerate(lines):
        if QUANTITY_LINE.match(line):
            lines[i] = value
            return "\n".join(lines)
    return "\n".join([value] + lines)
