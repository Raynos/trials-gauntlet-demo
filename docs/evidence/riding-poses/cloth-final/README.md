# Frozen physical transition audit

`transitions.json.gz` is the September 21 shared-geometry/impact-retune build before the
subsequent sleeve surface correction. All four recorded source hashes stayed constant.
It covers 20 outfit/detail/class combinations, 840 real input ticks each, with actual
CPU-skinned geometry sampled at 12 Hz (1,700 samples). None faulted. The minimum rear
fender envelope clearance was 8.197 mm (Pro Street, 4.333 s); no sampled vertex was
more than 5 mm beneath the fender top. This supports rear clearance in this sequence,
not continuous collision coverage or garment appearance acceptance.

The parent still rejected the Race upper-arm appearance in a separately captured
input-driven forward sequence. Historical source sculpting dimples become exposed by
the new arm orientation. Follow-up is in `../sleeve-final/`.

Reproduce without overwriting this record:

```sh
pnpm exec tsx docs/evidence/riding-poses/cloth-audit/played-audit.ts \
  harness/inputs/riding-poses lean-transitions /tmp/unique-transitions-report.json
```
