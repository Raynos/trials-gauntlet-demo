"""Verify recorded artifact bytes without writing files or rerunning the game."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
manifest = json.loads((Path(__file__).parent / 'manifest.json').read_text())
failures = []
for item in manifest['artifacts']:
    path = root / item['path']
    if not path.is_file():
        failures.append(f"Missing: {item['path']}")
        continue
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    digest = h.hexdigest()
    if digest != item['sha256']:
        failures.append(f"Changed: {item['path']}")
if failures:
    raise SystemExit('\n'.join(failures))
print(f"Verified {len(manifest['artifacts'])} artifacts.")
