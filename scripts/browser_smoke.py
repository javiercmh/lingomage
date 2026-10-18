#!/usr/bin/env python3
"""Serve a disposable, offline workspace with a dependency-free browser smoke runner."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8891)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1]
    manifest = json.loads((source / 'manifest.json').read_text())
    with tempfile.TemporaryDirectory(prefix='lingomage-browser-') as directory:
        workspace = Path(directory)
        for name in manifest['files']:
            target = workspace / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if name in manifest['app2Update']['seedDefaults']:
                target.write_text(json.dumps(manifest['app2Update']['seedDefaults'][name]), encoding='utf-8')
            else:
                shutil.copyfile(source / name, target)
        shutil.copytree(source / 'tests/browser', workspace / 'tests/browser')
        (workspace / 'data/browser-test-workspace.json').write_text('{"disposable":true}', encoding='utf-8')
        print(f'Browser smoke runner: http://localhost:{args.port}/tests/browser/smoke.html', flush=True)
        print(f'Screenshot fixtures (recovery states, zoom): http://localhost:{args.port}/tests/browser/inspect.html', flush=True)
        try:
            return subprocess.call([sys.executable, 'dev_server.py', str(args.port), '--mock-ai'], cwd=workspace)
        except KeyboardInterrupt:
            return 0


if __name__ == '__main__':
    sys.exit(main())
