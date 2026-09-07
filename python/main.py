import argparse
import os
import socket
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

    # The READY marker is the ONE thing the Electron side waits on before
    # letting requests through, so it has to mean "the port accepts
    # connections" and nothing looser.
    #
    # It used to be printed here and followed by uvicorn.run(), which
    # meant "migrations are done" instead. Everything the app fetched in
    # the seconds uvicorn then spent starting up was refused —
    # ECONNREFUSED, once per mounted component — while the log claimed
    # READY several seconds before "Uvicorn running on ...".
    #
    # Waiting on a lifespan hook would not have fixed it either: uvicorn
    # runs lifespan startup BEFORE it binds (Server.startup calls
    # lifespan.startup() and only then creates the listener).
    #
    # So bind the socket here and hand it to uvicorn. After listen(), a
    # connect succeeds — the kernel queues it in the backlog until
    # uvicorn accepts — so a request that arrives early WAITS instead of
    # being refused. The marker cannot be early because the listener
    # already exists when it is printed.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", args.port))
    sock.listen(128)

    print(f"READY on port {args.port}", flush=True)

    config = uvicorn.Config(app, log_level="info")
    uvicorn.Server(config).run(sockets=[sock])


if __name__ == "__main__":
    sys.exit(main())
