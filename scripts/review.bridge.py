#!/usr/bin/env python3
"""One-use, user-private JSONL socket. No credentials or payload logging."""
import argparse
import json
import os
from pathlib import Path
import selectors
import shutil
import signal
import socket
import stat
import sys
import tempfile
import time

MAX_LINE = 4 * 1024 * 1024
QUEUE_BYTES = 128 * 1024


def metadata(kind, **fields):
    print(json.dumps(dict(type=kind, **fields)), file=sys.stderr, flush=True)


def relay(peer, lifetime, terminal_input):
    """Bound both queues and frames; propagate half-close after draining bytes."""
    deadline = time.monotonic() + lifetime
    channels = [
        dict(src=peer.fileno(), dst=1, buffer=bytearray(), open=True, done=False, line=0),
        dict(src=0, dst=peer.fileno(), buffer=bytearray(), open=True, done=False, line=0),
    ]
    for fd in (0, 1, peer.fileno()):
        os.set_blocking(fd, False)
    while not all(c['done'] for c in channels):
        if time.monotonic() >= deadline:
            raise TimeoutError('bridge lifetime exceeded')
        masks = {}
        for c in channels:
            if c['open'] and len(c['buffer']) < QUEUE_BYTES:
                masks[c['src']] = masks.get(c['src'], 0) | selectors.EVENT_READ
            if c['buffer']:
                masks[c['dst']] = masks.get(c['dst'], 0) | selectors.EVENT_WRITE
            elif not c['open'] and not c['done']:
                c['done'] = True
                if c['dst'] == peer.fileno():
                    peer.shutdown(socket.SHUT_WR)
                else:
                    os.close(c['dst'])
        if not masks:
            continue
        # Only three descriptors are used. select also supports redirected
        # regular files on macOS, unlike kqueue's EOF/readiness behavior.
        with selectors.SelectSelector() as selector:
            for fd, mask in masks.items():
                selector.register(fd, mask)
            ready = dict((key.fd, mask) for key, mask in selector.select(min(0.5, max(0, deadline - time.monotonic()))))
        for c in channels:
            if c['open'] and ready.get(c['src'], 0) & selectors.EVENT_READ:
                try:
                    data = os.read(c['src'], min(32768, QUEUE_BYTES - len(c['buffer'])))
                except BlockingIOError:
                    continue
                if not data:
                    c['open'] = False
                    if c['src'] == terminal_input:
                        # Server response EOF or connector peer EOF ends the
                        # conversation. The opposite half-close still drains
                        # accepted requests and their responses normally.
                        for other in channels:
                            if other is not c:
                                other['open'] = False
                                other['buffer'].clear()
                else:
                    parts = data.split(b'\n')
                    for index, part in enumerate(parts):
                        c['line'] += len(part)
                        if c['line'] > MAX_LINE:
                            raise ValueError('JSONL frame exceeds limit')
                        if index < len(parts) - 1:
                            c['line'] = 0
                    c['buffer'].extend(data)
            if c['buffer'] and ready.get(c['dst'], 0) & selectors.EVENT_WRITE:
                try:
                    count = os.write(c['dst'], c['buffer'])
                    del c['buffer'][:count]
                except BlockingIOError:
                    pass


def server(wait_seconds, lifetime):
    directory = Path(tempfile.mkdtemp(prefix='arc-review-', dir='/tmp'))
    os.chmod(directory, 0o700)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    peer = None
    try:
        connector = directory / 'connect.py'
        source = globals().get('BRIDGE_SOURCE')
        connector.write_text(source if source is not None else Path(__file__).read_text())
        os.chmod(connector, 0o600)
        path = directory / 'author.sock'
        listener.bind(str(path))
        os.chmod(path, 0o600)
        listener.listen(1)
        listener.setblocking(False)
        metadata('bridge-ready', directory=str(directory), socketPath=str(path), connectorPath=str(connector))
        # Watch SSH stdin as well as accept: a disconnected launcher must not
        # leave a listener behind until the full connect timeout elapses.
        with selectors.DefaultSelector() as selector:
            selector.register(listener, selectors.EVENT_READ)
            selector.register(0, selectors.EVENT_READ)
            events = selector.select(wait_seconds)
            if not events:
                raise TimeoutError('no author connected')
            if any(key.fd == 0 for key, _ in events):
                raise ConnectionError('launcher disconnected before author')
            peer, _ = listener.accept()
        listener.close()
        path.unlink()  # No second author, including while the first is active.
        metadata('bridge-connected')
        relay(peer, lifetime, 0)
    finally:
        # A simultaneous EOF and SIGTERM must not interrupt directory removal.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        listener.close()
        if peer is not None:
            peer.close()
        shutil.rmtree(directory)
        metadata('bridge-closed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['server', 'connect'])
    parser.add_argument('socket_path', nargs='?')
    parser.add_argument('--wait-seconds', type=float, default=900)
    parser.add_argument('--lifetime-seconds', type=float, default=7200)
    args = parser.parse_args()
    if not all(0.1 <= value <= 86400 for value in (args.wait_seconds, args.lifetime_seconds)):
        parser.error('timeouts must be between 0.1 and 86400 seconds')
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: sys.exit(130))
    try:
        if args.mode == 'server':
            server(args.wait_seconds, args.lifetime_seconds)
        else:
            if not args.socket_path:
                parser.error('connect requires the private socket path')
            # Agent exec tools commonly default stdin to /dev/null. Reject that
            # before consuming the one-use socket, with an actionable error.
            if stat.S_ISCHR(os.fstat(0).st_mode) and not os.isatty(0):
                metadata('bridge-error', message='Connector stdin has no input stream; use a persistent pipe or interactive terminal')
                return 1
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as peer:
                peer.connect(args.socket_path)
                relay(peer, args.lifetime_seconds, peer.fileno())
    except (OSError, ValueError, TimeoutError) as error:
        # Payloads and exception text can contain private material. Never log it.
        metadata('bridge-error', message='Transport closed or exceeded its bounds', errorType=type(error).__name__, errno=getattr(error, 'errno', None))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
