"""Does the READY marker mean the port accepts connections?

The bug: main.py printed READY after migrations and *before* uvicorn.run,
so the marker meant "migrations done". Electron waits on that marker
before releasing queued requests, so every fetch in the seconds uvicorn
spent starting up was refused.

This connects the instant the marker appears. Under the old ordering the
connect is refused; under the fixed one the kernel queues it.
"""
import socket, subprocess, sys, time

MODE = sys.argv[1] if len(sys.argv) > 1 else "new"      # "old" or "new"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5399

child = """
import socket, sys, time
port = int(sys.argv[1])
mode = sys.argv[2]
if mode == "old":
    print("READY on port %d" % port, flush=True)
    time.sleep(2.0)                       # uvicorn importing/starting
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", port)); s.listen(128)
else:
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", port)); s.listen(128)
    print("READY on port %d" % port, flush=True)
    time.sleep(2.0)                       # uvicorn not accepting yet
time.sleep(3.0)
"""

p = subprocess.Popen([sys.executable, "-c", child, str(PORT), MODE],
                     stdout=subprocess.PIPE, text=True)
line = p.stdout.readline()
assert "READY" in line, line

# The moment Electron would stop holding requests back.
err = None
try:
    c = socket.create_connection(("127.0.0.1", PORT), timeout=5)
    c.close()
except OSError as e:
    err = e
p.kill()

ok = err is None
print(f"{'OK  ' if ok else 'BAD '} {MODE}: connect right after READY"
      + ("" if ok else f" — {err.__class__.__name__}: {err}"))
sys.exit(0 if ok else 1)
