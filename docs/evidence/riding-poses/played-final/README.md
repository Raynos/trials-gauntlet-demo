# Played input and release qualification

`input-report.json` describes the reproducible, input-only recordings in
`harness/inputs/riding-poses/{hop,crash-restart}-{rookie,pro}.json`. Their full production
Node snapshots replay byte-identically. Hop apex is 0.4767m Rookie / 0.5005m Pro;
crashes enter a moving ragdoll and one restart input restores control in one tick.

`pre-roll-review.json` preserves the parent's failed Race sleeve review and the
Street hop sequence before the subsequent arm-roll correction. These are real played
recordings, inspected as temporally ordered decoded frames. They are not final garment
acceptance or a claim of human continuous-video review.

The final impact retune exposed a 0.629mm first-release knee displacement on Rookie:
its GLB thigh socket is offset from the planar pelvis center, so an absolute ragdoll
segment angle did not equal the actual articulated leg angle. The renderer now captures
that constant planar offset at physical release and follows each ragdoll body's angular
displacement. It neither blends with a previous frame nor changes a physics state.
The existing strict release gate passes20/20 (all10files,bothclasses), preserving
<10µm spawn endpoints, <.002m/s artificial velocity, independent detached motion and
fresh one-tick restart (`release-fix.log`). Render source is still under roll review.

`find-thrown.ts` subsequently found over-reach releases using only quantized controls
on actual ridden H2 prefixes, then replayed both complete recordings from track start.
Rookie throws at input tick703 (69 search branches); Pro at2139 (277 branches).
`thrown-input-report.json` and `harness/inputs/riding-poses/thrown-*.json` preserve
these real impact/release sequences. Search branches are diagnostic experiments,
not stranger attempts or claimed human performance. Both full production snapshots
match exactly on independent replay; visual release capture follows separately.
