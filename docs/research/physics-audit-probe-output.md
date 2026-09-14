# Probe output: `harness/out/parent/physarch-probe.ts` against the round-11 solver (commit 42bdfe0 + working tree, 2026-09-14)

Raw output of the audit probes referenced from `physics-audit.md`. Re-run with `npx tsx harness/out/parent/physarch-probe.ts`.


## P1 stationary hop: rear apex vs preload duration P (ticks), snap lean +1 held 0.35 s, thr 0.35 (Rookie)
| P ticks | P s | apex rear m | apex front m | air ticks | air s | max pitch | land pitch | phases | fault |
|--|--|--|--|--|--|--|--|--|--|
| 6 | 0.050 | 0.004 | 0.381 | 0 | 0.000 | 19.5 | NaN | preload>recover>idle | null |
| 10 | 0.083 | 0.000 | 0.339 | 0 | 0.000 | 17.4 | NaN | preload>recover>idle | null |
| 12 | 0.100 | 0.000 | 0.292 | 0 | 0.000 | 15.5 | NaN | preload>recover>idle | null |
| 13 | 0.108 | 0.000 | 0.266 | 0 | 0.000 | 14.6 | NaN | preload>recover>idle | null |
| 14 | 0.117 | 0.000 | 0.239 | 0 | 0.000 | 13.7 | NaN | preload>recover>idle | null |
| 15 | 0.125 | 0.102 | 0.276 | 38 | 0.317 | 9.5 | -0.5 | preload>push>recover>idle | null |
| 16 | 0.133 | 0.130 | 0.288 | 40 | 0.333 | 9.3 | -2.3 | preload>push>recover>idle | null |
| 18 | 0.150 | 0.258 | 0.270 | 42 | 0.350 | 8.1 | -10.2 | preload>push>recover>idle | null |
| 20 | 0.167 | 0.347 | 0.306 | 44 | 0.367 | 8.7 | -14.6 | preload>push>recover>idle | null |
| 24 | 0.200 | 0.570 | 0.393 | 49 | 0.408 | 9.0 | -19.7 | preload>push>recover>idle | null |
| 30 | 0.250 | 0.665 | 0.537 | 59 | 0.492 | 8.7 | -12.9 | preload>push>recover>idle | null |
| 36 | 0.300 | 0.740 | 0.637 | 69 | 0.575 | 8.7 | -3.9 | preload>push>recover>idle | null |
| 42 | 0.350 | 0.856 | 0.732 | 75 | 0.625 | 9.5 | 7.0 | preload>push>recover>idle | null |
| 48 | 0.400 | 0.897 | 0.780 | 74 | 0.617 | 18.2 | 14.4 | preload>push>recover>idle | null |
| 60 | 0.500 | 0.912 | 0.869 | 72 | 0.600 | 40.6 | 33.0 | preload>push>recover>idle | null |
| 90 | 0.750 | 0.663 | 0.746 | 62 | 0.517 | 42.7 | 32.2 | preload>push>recover>idle | null |
| 120 | 1.000 | 0.680 | 1.023 | 62 | 0.517 | 59.8 | 37.9 | preload>push>recover>idle | null |
| 150 | 1.250 | 0.704 | 0.762 | 63 | 0.525 | 42.8 | 32.4 | preload>push>recover>idle | null |
| 170 | 1.417 | 0.684 | 0.772 | 52 | 0.433 | 12.7 | NaN | preload>push>recover | null |
| 180 | 1.500 | 0.680 | 0.776 | 41 | 0.342 | 8.7 | NaN | preload>push>recover | null |
| 181 | 1.508 | 0.681 | 0.776 | 40 | 0.333 | 8.7 | NaN | preload>push>recover | null |
| 190 | 1.583 | 0.000 | 0.074 | 0 | 0.000 | 8.7 | NaN | preload>recover>idle | null |

## P2 one-quantum perturbations around the nominal hop (P=36): lean quantum 1/127, throttle quantum 1/255
nominal: apex 0.740 air 69 maxPitch 8.7 hash ea4e82beabcdaac9
repeat identical hash: true (ea4e82beabcdaac9)
| perturbation | apex rear | Δ apex | air ticks | max pitch | phases |
|--|--|--|--|--|--|
| snap lean 1 - 1/127 | 0.756 | 0.0165 | 68 | 8.7 | preload>push>recover>idle |
| snap lean 1 - 2/127 | 0.773 | 0.0326 | 67 | 8.7 | preload>push>recover>idle |
| snap lean 0.5 | 0.995 | 0.2552 | 61 | 9.4 | preload>push>recover>idle |
| snap lean 0.1 | 1.130 | 0.3901 | 66 | 9.2 | preload>push>recover>idle |
| snap lean 0.0 (release only) | 1.077 | 0.3370 | 60 | 12.0 | preload>push>recover>idle |
| snap lean -0.2 (partial release) | 0.863 | 0.1227 | 62 | 8.7 | preload>push>recover>idle |
| snap lean -0.26 (release past abort line) | 0.799 | 0.0587 | 63 | 8.7 | preload>push>recover>idle |
| thr 0.35 + 1/255 | 0.739 | -0.0012 | 69 | 8.8 | preload>push>recover>idle |
| thr 0.35 - 1/255 | 0.740 | 0.0000 | 69 | 8.7 | preload>push>recover>idle |
| preload P=37 (1 tick later snap) | 0.765 | 0.0247 | 71 | 8.7 | preload>push>recover>idle |
| preload P=35 (1 tick earlier snap) | 0.719 | -0.0207 | 66 | 8.7 | preload>push>recover>idle |
| preload P=41 (5 ticks later) | 0.841 | 0.1015 | 75 | 8.7 | preload>push>recover>idle |
| preload P=48 (12 ticks later) | 0.897 | 0.1567 | 74 | 18.2 | preload>push>recover>idle |

## P3 state-machine thresholds: preload lean (hopLeanBack -0.5) and throttle (hopThrottle 0.3) one quantum either side
| leanPre | thr | apex rear | air ticks | phases |
|--|--|--|--|--|
| -0.5039 | 0.3500 | 0.531 | 56 | preload>push>recover>idle |
| -0.4961 | 0.3500 | 0.000 | 0 | idle |
| -1.0000 | 0.3020 | 0.795 | 70 | preload>push>recover>idle |
| -1.0000 | 0.2980 | 0.002 | 0 | idle |
| -1.0000 | 0.3000 | 0.795 | 70 | preload>push>recover>idle |

## P4 snap speed: lean ramped from -1 to +1 over N ticks after a 36-tick preload (hopSnapRate 4/s; abort at lean > -0.25)
| ramp ticks | ramp s | lean rate /s | apex rear | air ticks | max pitch | phases |
|--|--|--|--|--|--|--|
| 1 | 0.008 | 240.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 2 | 0.017 | 120.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 4 | 0.033 | 60.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 6 | 0.050 | 40.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 8 | 0.067 | 30.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 12 | 0.100 | 20.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 16 | 0.133 | 15.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 20 | 0.167 | 12.0 | 0.740 | 69 | 8.7 | preload>push>recover>idle |
| 24 | 0.200 | 10.0 | 0.725 | 70 | 8.7 | preload>push>recover>idle |
| 30 | 0.250 | 8.0 | 0.726 | 69 | 8.7 | preload>push>recover>idle |
| 40 | 0.333 | 6.0 | 0.790 | 71 | 8.7 | preload>push>recover>idle |
| 50 | 0.417 | 4.8 | 0.959 | 68 | 8.7 | preload>push>recover>idle |
| 55 | 0.458 | 4.4 | 0.964 | 69 | 8.7 | preload>push>recover>idle |
| 58 | 0.483 | 4.1 | 1.017 | 72 | 8.7 | preload>push>recover>idle |
| 60 | 0.500 | 4.0 | 0.996 | 71 | 8.7 | preload>push>recover>idle |
| 62 | 0.517 | 3.9 | 1.039 | 74 | 8.7 | preload>push>recover>idle |
| 70 | 0.583 | 3.4 | 0.000 | 0 | 18.5 | preload>recover>idle |
| 90 | 0.750 | 2.7 | 0.000 | 0 | 13.9 | preload>recover>idle |

## P5 does snapping forward correct a rising front? full throttle from rest at lean 0; when pitch crosses X deg step lean to +1 (throttle held)

### rookie
| snap at pitch | t snap | pitch +0.1 s | +0.25 s | +0.5 s | +1.0 s | max pitch after | min pitch after | fault | t fault |
|--|--|--|--|--|--|--|--|--|--|
| 10 | 2.158 | 12.3 | 10.7 | 2.8 | -7.7 | 12.3 | -8.4 | null | NaN |
| 20 | 2.458 | 23.6 | 25.2 | 26.6 | 12.8 | 27.1 | -29.8 | null | NaN |
| 30 | 2.775 | 31.7 | 30.4 | 30.4 | 25.2 | 31.7 | -34.7 | null | NaN |
| 40 | NaN | - | - | - | - | -1000000000.0 | 1000000000.0 | null | NaN |
| 50 | NaN | - | - | - | - | -1000000000.0 | 1000000000.0 | null | NaN |
| 60 | NaN | - | - | - | - | -1000000000.0 | 1000000000.0 | null | NaN |
| never | NaN | - | - | - | - | -1000000000.0 | 1000000000.0 | null | NaN |

### pro
| snap at pitch | t snap | pitch +0.1 s | +0.25 s | +0.5 s | +1.0 s | max pitch after | min pitch after | fault | t fault |
|--|--|--|--|--|--|--|--|--|--|
| 10 | 1.092 | 11.2 | 7.8 | -1.7 | -0.1 | 11.3 | -5.8 | null | NaN |
| 20 | 1.675 | 26.0 | 27.5 | 37.2 | 34.3 | 42.7 | -110.0 | crash | 3.95 |
| 30 | 1.825 | 45.1 | 59.4 | 77.6 | - | 129.9 | 31.6 | crash | 2.53 |
| 40 | 1.900 | 65.3 | 94.1 | 127.3 | - | 153.9 | 41.7 | crash | 2.52 |
| 50 | 1.958 | 84.7 | 114.4 | - | - | 141.2 | 53.5 | crash | 2.40 |
| 60 | 1.992 | 92.3 | 126.3 | - | - | 130.8 | 62.7 | crash | 2.27 |
| never | NaN | - | - | - | - | -1000000000.0 | 1000000000.0 | crash | 2.30 |

## P5b same, but the correction is throttle OFF (lean stays 0) — what actually saves it in v1?

### rookie
| cut at pitch | pitch +0.25 s | +0.5 s | max after | fault |
|--|--|--|--|--|
| 20 | 3.1 | -1.8 | 20.6 | null |
| 30 | 10.0 | -3.6 | 30.4 | null |
| 40 | - | - | -1000000000.0 | null |
| 50 | - | - | -1000000000.0 | null |

### pro
| cut at pitch | pitch +0.25 s | +0.5 s | max after | fault |
|--|--|--|--|--|
| 20 | 2.2 | -2.0 | 21.0 | null |
| 30 | 29.6 | -6.2 | 35.5 | null |
| 40 | 63.5 | 68.2 | 68.4 | null |
| 50 | 105.1 | - | 130.3 | crash |

## P6 Pro constant-input grid from rest (thr x lean): max pitch, loop time, speed at 6 s
| lean \ thr | 0.4 | 0.6 | 0.8 | 1 |
|--|--|--|--|--|
| -1 | 10°, 21.1 m/s | 13°, 21.5 m/s | 31°, 21.7 m/s | 21°, 21.5 m/s |
| -0.5 | 9°, 20.9 m/s | 11°, 21.5 m/s | 12°, 21.1 m/s | LOOP 1.78 s |
| -0.3 | 6°, 20.9 m/s | 7°, 21.4 m/s | 7°, 21.7 m/s | 16°, 21.2 m/s |
| 0 | 5°, 20.9 m/s | 7°, 21.0 m/s | 8°, 21.5 m/s | LOOP 2.30 s |
| 0.2 | 5°, 20.9 m/s | 7°, 21.3 m/s | 8°, 20.9 m/s | 9°, 21.1 m/s |
| 0.4 | 3°, 20.9 m/s | 5°, 21.5 m/s | 6°, 21.4 m/s | 7°, 20.9 m/s |
| 1 | 3°, 20.9 m/s | 3°, 20.9 m/s | 3°, 20.9 m/s | 3°, 20.9 m/s |

## P7 crest 20 m x 2 m cosine at x=40, approach at full gas from rest; lean 0 / +0.4, Rookie / Pro
| bike | lean | max pitch | speed at crest | fault | x fault |
|--|--|--|--|--|--|
| rookie | 0 | 42.3 | 13.4 | null | NaN |
| rookie | 0.4 | 34.1 | 13.5 | null | NaN |
| pro | 0 | -1000000000.0 | NaN | crash | 18.6 |
| pro | 0.4 | 26.3 | 17.0 | null | NaN |

## P8 snapshot/restore mid-hop (push phase) vs straight run
straight 245dcaa1a86bb33e forked 245dcaa1a86bb33e equal=true

## P9 rolling hop: 5 m/s cruise, preload 0.3 s, snap; apex vs snap lean and vs speed (Rookie)
| speed target | leanSnap | apex rear | air ticks | max pitch | land pitch | fault |
|--|--|--|--|--|--|--|
| 3 | 1 | 0.694 | 57 | 16.8 | -19.6 | null |
| 3 | 0.5 | 0.753 | 53 | 16.8 | -30.9 | null |
| 5 | 1 | 0.637 | 57 | 17.1 | -16.5 | null |
| 5 | 0.5 | 0.702 | 53 | 17.1 | -28.3 | null |
| 8 | 1 | 0.678 | 57 | 16.7 | -16.5 | null |
| 8 | 0.5 | 0.822 | 52 | 16.7 | -35.9 | null |

## P10 lean-only response on the ground at 8 m/s cruise: step lean -1 / +1, pitch after 0.25 / 0.5 s (mass shift sign)
rookie lean -1: Δpitch +0.1 s -0.25, +0.25 s 3.96, +0.5 s 3.23, +1 s 3.20; min -0.43 max 4.09
rookie lean 1: Δpitch +0.1 s 1.73, +0.25 s -2.00, +0.5 s -9.58, +1 s -3.10; min -9.62 max 1.73
pro lean -1: Δpitch +0.1 s 0.29, +0.25 s 4.90, +0.5 s 2.98, +1 s 3.49; min -0.23 max 4.93
pro lean 1: Δpitch +0.1 s 1.90, +0.25 s -1.47, +0.5 s -8.70, +1 s -3.09; min -8.77 max 2.02

DONE
