#!/usr/bin/env python3
"""Dependency-free test entry point. Run from any directory with Python 3.9+ and Node 22."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require_node():
    """Some tests require() ES modules, which is unflagged from Node 22.12."""
    version = subprocess.run(['node', '--version'], text=True, stdout=subprocess.PIPE).stdout.strip()
    major, minor = (int(part) for part in version.lstrip('v').split('.')[:2])
    assert (major, minor) >= (22, 12), 'Node 22.12 or newer is required (found ' + version + ')'


def main():
    require_node()
    assert not (ROOT / 'android/app/build.gradle.kts').exists() and not list((ROOT / 'android/app/src').rglob('*.kt')), 'Native implementation must not return to the subapp'
    # Ignored local IDE/build artifacts may remain after Git removes native source.
    observed = set()
    for path in sorted((ROOT / 'tests').iterdir()):
        if path.suffix not in {'.cjs', '.mjs'}:
            continue
        result = subprocess.run(['node', str(path)], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(result.stdout, end='')
        if result.returncode:
            return result.returncode
        observed.update(re.findall(r'^SAFEGUARD ([A-Z]+-\d+)$', result.stdout, re.M))
    register = json.loads((ROOT / 'data/language-safeguards.json').read_text())
    ids = [rule['id'] for rule in register['requirements']]
    assert len(ids) == len(set(ids)), 'Duplicate safeguard IDs'
    for rule in register['requirements']:
        assert rule['status'] in {'active', 'retired'}
        if rule['status'] == 'active':
            assert rule['id'] in observed, 'Untested safeguard: ' + rule['id']
            assert (ROOT / rule['test']).is_file(), 'Missing test source'
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    files = manifest['files']
    update = manifest['app2Update']
    assert manifest['main'] in files
    assert len(files) == len(set(files)), 'Duplicate manifest files'
    for name in files:
        assert (ROOT / name).is_file(), 'Missing packaged file: ' + name
    for name in update['managedFiles'] + update['seedFiles']:
        assert name in files, 'Owned file is not packaged: ' + name
    assert not set(update['managedFiles']) & set(update['seedFiles'])
    for name in files:
        if name.endswith(('.js', '.css', '.html')):
            assert name in update['managedFiles'], 'Code file would not ship in updates: ' + name
    for path in sorted((ROOT / 'js').glob('*.js')):
        assert 'js/' + path.name in files, 'Module is not in the manifest: ' + path.name
    for name in files:
        if name.startswith('js/') and name.endswith('.js'):
            for imported in re.findall(r"from\s+'\./([^']+)'", (ROOT / name).read_text(encoding='utf-8')):
                assert 'js/' + imported in files, name + ' imports a module outside the manifest: ' + imported
    for name in ['data/stories.json', 'data/settings.json', 'data/generation-checkpoints.json']:
        assert name in update['seedFiles']
    assert update['seedDefaults']['data/generation-checkpoints.json'] == []
    for name in ['js/learning-validation.js', 'js/generation-pipeline.js', 'data/language-safeguards.json']:
        assert name in update['managedFiles']
    print('PASS safeguard coverage and manifest ownership')
    return subprocess.call([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], cwd=ROOT)


if __name__ == '__main__':
    raise SystemExit(main())
