# Contributing

Thank you for helping. This project is small. Keep changes small too.

## Set up

- Node 22 or newer. Python 3.10 or newer. No packages to install. The code uses only the standard library.
- Clone the repository. Run the tests from the repository root:

```sh
npm test
```

This runs three test groups:

1. `test/*.test.mjs`: the Lovelace card logic and the order planner, in Node.
2. `tools/test_*.py`: the Home Assistant fetchers in `tools/`.
3. `tests/`: the standalone Python package in `restock/`.

## Ground rules

- Keep the data model. An item is a need. Its description holds line-based fields. See the README and `docs/data-model.md`. Do not add a new file format without a good reason.
- Keep `restock-card.js` and `split-plan.js` at the repository root. The Home Assistant copy depends on those paths.
- Keep `tools/fetch_prices.py` and `tools/fetch_deals.py` working on their own. A user copies them alone to a Home Assistant folder.
- The standalone package is stdlib only. Do not add a dependency.
- Do not put personal data in code, tests, fixtures or docs. That includes names, addresses, IP addresses, home paths, e-mail addresses and tokens. Use neutral examples such as `Milk` and `todo.home_items`.
- Tests must not use the network. Use the fixtures in `tools/fixtures/`, or inject a fake client.

## Add a store adapter

See the README section "Add a store". In short:

1. Copy an existing adapter from `restock/stores/` that uses the same kind of site.
2. Implement `barcode_from_link`, `read_link` and, when the store has a barcode search, `lookup`.
3. Add a fixture from the public product page to `tools/fixtures/` or `tests/fixtures/`. Remove anything that identifies a person.
4. Register the adapter in `restock/stores/__init__.py`.
5. Add tests for the parser, the registry and the "no product" case.

## Pull requests

- One topic per pull request.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Run `npm test` before you push. CI runs the same command.
- Describe what changed and how you tested it.

## Reporting problems

Open an issue. Include the store, the product link with any personal data removed, and the output of the command you ran.
