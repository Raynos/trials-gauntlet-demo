"""Propagate existing replay proof to completed session metadata only."""
import json
from pathlib import Path

out = Path(__file__).resolve().parent
root = out.parents[3]
for proof in out.glob('*/replay.json'):
    row = json.loads(proof.read_text())['rows'][0]
    source = json.loads((proof.parent / 'provenance.json').read_text())['source']
    for p in [proof.parent / 'session.json', root / source / 'session.json']:
        data = json.loads(p.read_text())
        data['replayVerified'] = row['passed']
        data['replayFaults'] = row['browserFaults']
        p.write_text(json.dumps(data, indent=2) + '\n')
