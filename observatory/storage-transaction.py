"""Hold an advisory lock and atomically commit one JSON array from stdin."""
import fcntl
import json
import os
import sys
import tempfile
import time

path = sys.argv[1]
directory = os.path.dirname(path)
os.makedirs(directory, exist_ok=True)
if os.path.exists(path + '.lock'):
    sys.exit(74)  # Never compete with the previous directory-lock implementation.
lock = os.open(path + '.write-lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
temporary = None
try:
    deadline = time.monotonic() + 5
    while True:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= deadline:
                sys.exit(73)
            time.sleep(0.025)
    print('LOCKED', flush=True)
    payload = sys.stdin.buffer.read(128 * 1024 * 1024 + 1)
    if not payload:
        sys.exit(0)  # Parent exited without submitting a mutation.
    if len(payload) > 128 * 1024 * 1024 or not isinstance(json.loads(payload), list):
        sys.exit(75)
    fd, temporary = tempfile.mkstemp(prefix=os.path.basename(path) + '.', suffix='.tmp', dir=directory)
    with os.fdopen(fd, 'wb') as output:
        output.write(payload + b'\n')
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    temporary = None
    directory_fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    print('COMMITTED', flush=True)
finally:
    if temporary is not None:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
    os.close(lock)
