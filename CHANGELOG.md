# Changelog

All notable changes to this project are in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [1.0.0]

First open-source release.

### Added

- Standalone mode. A Python package, `restock/`, runs without Home Assistant. It stores lists as JSON files in `data/lists/`.
- Command line tool: `python3 -m restock` with `prices`, `deals`, `plan`, `lookup`, `start-order` and `serve`.
- Standalone server. It serves the same card in a web page, a REST API for lists, order, prices, deals and photo search.
- Store adapters for Victory, Rami Levy, Shufersal, Yochananof, Chatzi Chinam, Tiv Taam and a generic `bug` adapter. A registry lets you add more.
- Home Assistant storage backend. It reads Local To-do files, or uses the Home Assistant services.
- Docker image and `docker-compose.yml`, with a daily refresh of prices and deals.
- Card data access behind one adapter. The card uses Home Assistant when `hass` is set. Otherwise it uses the standalone REST API.
- Agent prompts in `prompts/`: build a shopping list, refresh prices and plan the order, prepare an order.
- MIT license, contributing guide, GitHub Actions test workflow.

### Changed

- The project is now a standalone project as well as a Home Assistant card. The Home Assistant files keep their paths: `restock-card.js`, `split-plan.js` and `tools/fetch_*.py`.

## [0.13.0]

Last version before the open-source release. It was a Home Assistant card only. Its history is in the private repository.
