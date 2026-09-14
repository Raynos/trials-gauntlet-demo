## T0 static COM geometry (d ahead of rear patch, h above ground) and critical a/g = d/h per lean
lean -1: d 0.31 h 0.63 d/h 0.50  pitch 3.7 compR 0.111 compF 0.032
lean -0.5: d 0.39 h 0.70 d/h 0.56  pitch 2.8 compR 0.101 compF 0.042
lean 0: d 0.47 h 0.78 d/h 0.61  pitch 2.0 compR 0.092 compF 0.051
lean 0.5: d 0.52 h 0.79 d/h 0.66  pitch 1.5 compR 0.086 compF 0.057
lean 1: d 0.57 h 0.81 d/h 0.71  pitch 1.0 compR 0.080 compF 0.063

## T1 full throttle from rest, constant lean: max pitch in 6 s / loop time (pitch > 90) / speed at 3 s
lean -1: maxPitch 91.1 loop 0.56 s  v(3s) NaN m/s
lean -0.5: maxPitch 92.0 loop 0.59 s  v(3s) NaN m/s
lean -0.25: maxPitch 91.5 loop 0.63 s  v(3s) NaN m/s
lean 0: maxPitch 90.5 loop 0.68 s  v(3s) NaN m/s
lean 0.25: maxPitch 90.8 loop 0.72 s  v(3s) NaN m/s
lean 0.5: maxPitch 90.1 loop 0.75 s  v(3s) NaN m/s
lean 1: maxPitch 91.2 loop 0.82 s  v(3s) NaN m/s

## T2 full throttle lean -0.5 (wheelies to 44 deg); when pitch crosses X deg snap lean to +1 (throttle held): pitch after 0.1/0.25/0.5/1 s, max after
snap at 10: +0.1 31.6 +0.25 37.0 +0.5 49.2 +1.0 -0.4  max 92.0 LOOP
snap at 20: +0.1 40.9 +0.25 48.3 +0.5 58.3 +1.0 0.3  max 91.6 LOOP
snap at 30: +0.1 51.1 +0.25 60.0 +0.5 69.3 +1.0 7.0  max 91.6 LOOP
snap at 40: +0.1 66.8 +0.25 64.8 +0.5 40.9 +1.0 44.5  max 90.8 LOOP
snap at 50: +0.1 82.3 +0.25 - +0.5 - +1.0 -  max 91.4 LOOP

## T3 lean step on the ground at 8 m/s: pitch change at 0.05/0.1/0.25/0.5 s (sign of the transient)
lean -1: NaN NaN NaN NaN  min NaN max NaN
lean 1: NaN NaN NaN NaN  min NaN max NaN

## T4 stationary hop: lean -1 + throttle 0.4 for P s (brake off), then lean +1 at rider rate; rear apex, front apex, airtime
P 0.1: apex chassis 0.030 rear 0.176 front 0.216 bothOff 0.00 s pitch -4..15
P 0.2: apex chassis 0.135 rear 0.384 front 0.369 bothOff 0.00 s pitch -13..24
P 0.3: apex chassis 0.147 rear 0.416 front 0.445 bothOff 0.03 s pitch -15..27
P 0.4: apex chassis 0.151 rear 0.431 front 0.527 bothOff 0.05 s pitch -16..30
P 0.5: apex chassis 0.146 rear 0.422 front 0.593 bothOff 0.04 s pitch -16..33
P 0.7: apex chassis 0.181 rear 0.325 front 0.564 bothOff 0.00 s pitch -12..30
P 1: apex chassis 0.182 rear 0.271 front 0.554 bothOff 0.00 s pitch -7..28
-- snap speed (P 0.35):
rate 1 m/s: apex chassis 0.065 rear 0.088 front 0.369 bothOff 0.00 s pitch -2..22
rate 1.5 m/s: apex chassis 0.081 rear 0.197 front 0.422 bothOff 0.00 s pitch -5..25
rate 2 m/s: apex chassis 0.090 rear 0.302 front 0.415 bothOff 0.00 s pitch -10..25
rate 3 m/s: apex chassis 0.150 rear 0.427 front 0.486 bothOff 0.05 s pitch -16..29
rate 4 m/s: apex chassis 0.170 rear 0.469 front 0.498 bothOff 0.07 s pitch -18..29
-- gas through the snap (P 0.35): thrPre 0.6, thrSnap 0.6/0.8/1.0, rate 3/4.5, cap 5k/8k
thrSnap 0.6 rate 3 cap 5000: apex chassis 0.320 rear 0.284 front 0.772 bothOff 0.23 s pitch -2..40
thrSnap 0.8 rate 3 cap 5000: apex chassis 0.402 rear 0.219 front 0.949 bothOff 0.15 s pitch -0..45
thrSnap 1 rate 3 cap 5000: apex chassis 0.481 rear 0.220 front 1.169 bothOff 0.19 s pitch -2..54
thrSnap 0.8 rate 4.5 cap 5000: apex chassis 0.382 rear 0.405 front 0.772 bothOff 0.31 s pitch -10..42
thrSnap 0.8 rate 4.5 cap 8000: apex chassis 0.383 rear 0.410 front 0.770 bothOff 0.31 s pitch -11..42
thrSnap 1 rate 4.5 cap 8000: apex chassis 0.443 rear 0.365 front 0.924 bothOff 0.38 s pitch -3..44
thrSnap 1 rate 6 cap 8000: apex chassis 0.413 rear 0.583 front 0.739 bothOff 0.32 s pitch -20..42
-- preload sweep with gas through (thrPre 0.6, thrSnap 0.8, rate 4.5, cap 8k):
P 0.15: apex chassis 0.255 rear 0.258 front 0.538 bothOff 0.20 s pitch -2..28
P 0.25: apex chassis 0.321 rear 0.463 front 0.578 bothOff 0.26 s pitch -15..34
P 0.35: apex chassis 0.383 rear 0.410 front 0.770 bothOff 0.31 s pitch -11..42
P 0.45: apex chassis 0.347 rear 0.497 front 0.967 bothOff 0.23 s pitch -17..53
P 0.6: apex chassis 0.433 rear 0.993 front 1.190 bothOff 0.03 s pitch -42..68
P 0.8: apex chassis 0.408 rear 0.595 front 1.255 bothOff 0.00 s pitch -22..72
-- snap magnitude (P 0.35, rate 3):
snap to lean 1: apex chassis 0.150 rear 0.427 front 0.486 bothOff 0.05 s pitch -16..29
snap to lean 0.5: apex chassis 0.133 rear 0.363 front 0.486 bothOff 0.06 s pitch -12..29
snap to lean 0.25: apex chassis 0.134 rear 0.331 front 0.486 bothOff 0.05 s pitch -10..29
snap to lean 0: apex chassis 0.136 rear 0.293 front 0.487 bothOff 0.06 s pitch -8..29
snap to lean -0.5: apex chassis 0.134 rear 0.132 front 0.480 bothOff 0.00 s pitch -1..28

## T5 in the air (launched level at 8 m/s from 3 m, no ground): pitch after 0.5 s for lean -1 / +1 / throttle / brake
none: Δpitch 0.1 deg in 0.5 s
lean-1: Δpitch -21.2 deg in 0.5 s
lean+1: Δpitch 11.7 deg in 0.5 s
thr: Δpitch 16.6 deg in 0.5 s
brake: Δpitch -20.7 deg in 0.5 s
