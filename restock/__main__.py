"""Entry point: python3 -m restock."""
import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
