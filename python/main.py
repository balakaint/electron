import argparse
import os
import sys

import uvicorn
from alembic import command
from alembic.config import Config

from api.server import app


def run_migrations() -> None:
    ini_path = os.path.join(os.path.dirname(__file__), "alembic.ini")
    cfg = Config(ini_path)
    command.upgrade(cfg, "head")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5180)
    args = parser.parse_args()

    run_migrations()
    print(f"READY on port {args.port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    sys.exit(main())
