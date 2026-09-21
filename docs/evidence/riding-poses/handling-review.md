# Handling test review during the shared-geometry retune

This is a parent review of `current-geometry/current-handling.log`, generated during implementation.
It is not a passing qualification report. The old complete physics baseline is preserved beside it.

The 104-test candidate run has 29 failures. Some are real handling regressions; some require the old
body's known failure; three depend on old input recordings that must be re-searched after the physics
is stable. A historical description in an `it()` title is not necessarily its current assertion.

## Preserve the positive behavior requirements

- Keep the existing hop height, slow-snap/half-preload height, monotonicity and input-quantum continuity
  bounds. In particular the R5 ramped snap reaches only 0.181 m against its 0.38 m minimum; the full
  snap passing does not qualify the hop family.
- Keep bounded one-tick response, momentum error, static sag, landing survival/rebound and braking
  requirements. Small numerical misses are still misses.
- Keep air lean authority at 25–40 degrees per half second, the Rookie release kick at no more than
  120 degrees/second, its per-tick step at no more than 15, and wheel throttle/brake nudge bounds.
- Keep the R4 touchdown step at no more than 60 degrees/second per tick and the assisted ramp exit
  at no more than 25 degrees. Pro's 28.1-degree exit is a real miss.
- Keep both classes clearing the same lab obstacle at the prescribed 8–9 m/s entry speeds. A revised
  input technique may be measured, but obstacle geometry, survival and asserted clearance requirements
  cannot be relaxed. The historic corner-roll fixture did **not** meet the prose's +0.1 m clear-air
  wish; the old negative margins must remain explicit rather than being called an airborne clearance.
- Keep recorded clears, pose/contact envelopes, exact replay bytes and the fresh stranger requirement.
  An old recording's failure is preserved evidence, not a license to change its expected finish.

## Historical characterizations requiring review

1. `feel.test.ts` demanded that a held-throttle forward correction from a 20-degree wheelie loop out,
   and remain above 30 degrees at 0.5 s. That encoded the R7 regression, not desired behavior. The new
   candidate recovers without looping and reaches 14.690 degrees; throttle-cut recovery from 30 degrees
   still reaches 50.258 at 0.5 s and −10.044 at 1 s without looping. The parent restored the earlier
   positive 20-degree recovery requirement: no loop, at most 30 degrees after 0.5 s. The existing
   30-degree recovery assertions remain unchanged. The targeted test passes.
2. R3's disabled landing-cap control demanded rebound greater than 0.15 m. New geometry rebounds
   only 0.042 m even with the cap disabled. Reintroducing a pogo to satisfy this control is wrong.
   A replacement must directly prove the cap/intent mechanism and retain every positive landing and
   hop assertion; no replacement has been accepted yet.
3. R5 compares the held-lean angular rate at exactly 0.5 s with the limiter disabled. Its assertion
   assumes that slowing a transient pose change always lowers the final angular rate. The candidate
   gives 154 versus 151 degrees/second while its release kick is 78 versus 211 and the release step
   is 5 versus 49. Direct limiter activation, bounded kick/step and held-angle authority are the
   meaningful requirements. This row still needs an explicit mechanism review before editing.
4. R5's `zeroRun >= 36` measures zero limiter output after first touchdown, **not** required flight
   time. Check the actual support history: a new airborne interval must legitimately re-enable the
   limiter. Preserve blend continuity and blend-out time, and measure landing stability separately.
5. R6's disabled/raised preload eligibility threshold intentionally destroys a partial hop. A new
   mass map changes physical target travel, so the mechanism should be tested at its declared travel
   threshold rather than requiring an arbitrary failed-hop apex. This has not yet been rewritten.
6. R8's old thrown-rider fixture now reaches a head sensor first. The physical event ordering must
   remain honest. A new real overload fixture can prove release, alongside ordinary-impact survival;
   suppressing the sensor to force an expected label would hide a collision.

No final passing-suite claim follows from this classification. Remaining changes require concrete
measurements and review, with the failed candidate logs retained.


## Parent mechanism revisions

The preserved failing logs precede these changes; none is a claim that an old failing row originally passed.

- R3 compares cap-on and cap-off **from identical pre-tick snapshots** through a real drop. Every tick's
  force equals the raw force clipped at the declared intent/closing-speed ceiling; the ceiling engages
  with no input intent. This fixture no longer hits that ceiling, so it does not claim a reduced rebound.
  All positive landing, >=0.45 m hop and >=97% cap-on/off hop assertions remain.
- R5 retains kick/step limits and limits the held-angle difference from its raw control to5 degrees.
  The limiter must reach zero after15 grounded ticks on every support interval, and the fixture must
  exercise such an interval. A later airborne interval may reactivate it. Absolute held authority and
  blend rate checks remain unchanged.
- R6 retains both classes'25–40 degree held authority and torque direction. Pro's early wrong-way dip
  is bounded to no more than15 degrees; a smaller dip is allowed. Its optional preload-gate test retains
  shallow-gate hop parity and eligible pulse activation, and verifies an unreachable100 m preload
  threshold cannot arm. The old0.15 m/very-short-pulse outcomes remain printed observations.
- R8 keeps the original severe-impact fault within0.3s and milder40-degree survival. It permits the
  real first sensor event on the severe fixture, then independently requires an actual reach overload
  to produce a thrown fault, a detached ragdoll and release within36 ticks on both classes.

Targeted revisions passed at the candidate state; final whole-build verification is still required.

## Shared-geometry replay instrumentation

R7/R8 now seed the demand history with the actual stationary spawn target and zero
velocity. The former NaN seed discarded the first command acceleration and counted
the first seven ticks as recovered; B1 consequently reported two false recovery
violations. Recovery duration, force/torque limits and error bounds are unchanged.
`played-final/recovery-probe.ts` and its reports preserve that diagnosis.

R8 reach measurements now use `riderRigFromCOM`, the same articulated geometry as
the actual physical constraint, instead of the obsolete rigid `comFromHips` and
chest offsets. It still independently measures hip-to-ankle and shoulder-to-wrist
distances against the unchanged reach/support bounds. This exposed rather than
hid the H1 Pro support trap: the old finite box pushed the rider downward beneath
the rear fender. The physical one-sided support fix is documented separately in
`support-closure/HANDOFF.md`; all earlier failed reports remain historical.
