"""Fail closed before any projected RGB use or material-pass acceptance."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parent
spec = json.loads((ROOT.parent / 'street-mustard.sculpt.json').read_text())
readiness = json.loads((ROOT / 'projection-readiness.json').read_text())
failures = []
if spec.get('referenceCamera', {}).get('solved') is not True:
    failures.append('construction camera is an initial guess; rendered overlay fit is not accepted')
for name in ['cameraOverlayReview', 'delitRegionReview', 'projectionCoverageReview', 'relightingReview']:
    evidence = readiness.get(name)
    if not isinstance(evidence, dict) or evidence.get('accepted') is not True or not evidence.get('artifact'):
        failures.append(name + ' has no accepted evidence')
    elif not (ROOT / evidence['artifact']).is_file():
        failures.append(name + ' evidence file is missing')
if spec.get('materialGate', {}).get('passed') is not True:
    failures.append('official materialGate remains failed')
print(json.dumps({'passed': not failures, 'failures': failures, 'projectionEnabled': not failures}, indent=2))
sys.exit(1 if failures else 0)
