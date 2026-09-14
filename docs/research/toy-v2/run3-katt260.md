## T0 static COM geometry (d ahead of rear patch, h above ground) and critical a/g = d/h per lean
lean -1: d 0.31 h 0.61 d/h 0.50  pitch 5.7 compR 0.134 compF 0.010
lean -0.5: d 0.39 h 0.70 d/h 0.56  pitch 3.8 compR 0.112 compF 0.031
lean 0: d 0.47 h 0.78 d/h 0.61  pitch 2.0 compR 0.092 compF 0.051
lean 0.5: d 0.53 h 0.79 d/h 0.67  pitch 0.5 compR 0.075 compF 0.068
lean 1: d 0.59 h 0.81 d/h 0.73  pitch -1.0 compR 0.058 compF 0.085

## T1 full throttle from rest, constant lean (F0 0.62 W, P 12.5 kW, lean torque 260 Nm): max pitch in 6 s / loop time / speed at 3 s
lean -1: maxPitch 90.5 loop 0.53 s  v(3s) NaN m/s
lean -0.5: maxPitch 90.8 loop 0.64 s  v(3s) NaN m/s
lean -0.25: maxPitch 91.1 loop 0.77 s  v(3s) NaN m/s
lean 0: maxPitch 91.2 loop 3.47 s  v(3s) -3.4 m/s
lean 0.25: maxPitch 49.0 loop NaN s  v(3s) 5.0 m/s
lean 0.5: maxPitch 6.2 loop NaN s  v(3s) 15.1 m/s
lean 1: maxPitch 6.9 loop NaN s  v(3s) 15.7 m/s

## T2 full throttle lean -1 (wheelie); when pitch crosses X deg snap lean to +1 (throttle held): pitch after 0.1/0.25/0.5/1 s, max after
snap at 10: +0.1 32.3 +0.25 35.2 +0.5 6.2 +1.0 8.9  max 37.3 
snap at 20: +0.1 43.2 +0.25 45.6 +0.5 12.1 +1.0 9.8  max 49.1 
snap at 30: +0.1 52.0 +0.25 51.2 +0.5 9.5 +1.0 11.8  max 57.5 
snap at 40: +0.1 61.9 +0.25 52.7 +0.5 -0.8 +1.0 12.0  max 65.5 
snap at 50: +0.1 72.1 +0.25 47.7 +0.5 -5.3 +1.0 11.6  max 72.9 

## T3 lean step on the ground at 8 m/s: pitch change at 0.05/0.1/0.25/0.5 s (sign of the transient)
lean -1: -0.96 -2.61 4.65 18.31  min -3.06 max 45.76
lean 1: 0.97 1.67 -3.71 -3.62  min -4.66 max 1.78

## T4 stationary hop: lean -1 + throttle 0.4 for P s (brake off), then lean +1 at rider rate; rear apex, front apex, airtime
P 0.1: apex chassis 0.059 rear 0.231 front 0.139 bothOff 0.00 s pitch -6..8
P 0.2: apex chassis 0.128 rear 0.351 front 0.289 bothOff 0.00 s pitch -11..19
P 0.3: apex chassis 0.147 rear 0.404 front 0.487 bothOff 0.00 s pitch -15..29
P 0.4: apex chassis 0.179 rear 0.477 front 0.687 bothOff 0.03 s pitch -19..38
P 0.5: apex chassis 0.265 rear 0.524 front 0.890 bothOff 0.04 s pitch -21..48
P 0.7: apex chassis 0.390 rear 0.548 front 1.176 bothOff 0.00 s pitch -20..65
P 1: apex chassis 0.408 rear 0.381 front 1.254 bothOff 0.00 s pitch -13..72
-- snap speed (P 0.35):
rate 1 m/s: apex chassis 0.116 rear 0.106 front 0.465 bothOff 0.00 s pitch -3..25
rate 1.5 m/s: apex chassis 0.124 rear 0.238 front 0.533 bothOff 0.00 s pitch -7..30
rate 2 m/s: apex chassis 0.127 rear 0.363 front 0.552 bothOff 0.00 s pitch -13..31
rate 3 m/s: apex chassis 0.162 rear 0.444 front 0.586 bothOff 0.02 s pitch -17..33
rate 4 m/s: apex chassis 0.193 rear 0.513 front 0.629 bothOff 0.05 s pitch -20..35
-- gas through the snap (P 0.35): thrPre 0.6, thrSnap 0.6/0.8/1.0, rate 3/4.5, cap 5k/8k
thrSnap 0.6 rate 3 cap 2500: apex chassis 0.226 rear 0.496 front 0.789 bothOff 0.07 s pitch -19..42
thrSnap 0.8 rate 3 cap 2500: apex chassis 0.241 rear 0.476 front 0.830 bothOff 0.10 s pitch -18..44
thrSnap 1 rate 3 cap 2500: apex chassis 0.283 rear 0.413 front 0.880 bothOff 0.15 s pitch -13..47
thrSnap 0.8 rate 4.5 cap 2500: apex chassis 0.263 rear 0.431 front 0.885 bothOff 0.08 s pitch -16..47
thrSnap 0.8 rate 4.5 cap 4000: apex chassis 0.264 rear 0.526 front 0.836 bothOff 0.16 s pitch -20..46
thrSnap 1 rate 4.5 cap 4000: apex chassis 0.306 rear 0.504 front 0.856 bothOff 0.18 s pitch -19..47
thrSnap 1 rate 6 cap 4000: apex chassis 0.287 rear 0.474 front 0.845 bothOff 0.17 s pitch -18..46
-- preload sweep with gas through (thrPre 0.6, thrSnap 0.8, rate 4.5, cap 4k):
P 0.15: apex chassis 0.070 rear 0.267 front 0.327 bothOff 0.00 s pitch -8..22
P 0.25: apex chassis 0.175 rear 0.403 front 0.565 bothOff 0.10 s pitch -15..33
P 0.35: apex chassis 0.264 rear 0.526 front 0.836 bothOff 0.16 s pitch -20..46
P 0.45: apex chassis 0.339 rear 0.526 front 1.109 bothOff 0.12 s pitch -20..62
P 0.6: apex chassis 1.329 rear 2.226 front 1.897 bothOff 1.04 s pitch -78..454
P 0.8: apex chassis 0.454 rear 2.8213161490199455e+102 front 2.8213161490199455e+102 bothOff 0.31 s pitch -0..1.0530769077463255e+216
-- snap magnitude (P 0.35, rate 3):
snap to lean 1: apex chassis 0.162 rear 0.444 front 0.586 bothOff 0.02 s pitch -17..33
snap to lean 0.5: apex chassis 0.147 rear 0.380 front 0.607 bothOff 0.06 s pitch -13..34
snap to lean 0.25: apex chassis 0.173 rear 0.332 front 0.620 bothOff 0.07 s pitch -10..35
snap to lean 0: apex chassis 0.200 rear 0.263 front 0.634 bothOff 0.12 s pitch -5..35
snap to lean -0.5: apex chassis 0.267 rear 0.103 front 0.688 bothOff 0.00 s pitch -1..36

## T5 in the air (launched level at 8 m/s from 3 m, no ground): pitch after 0.5 s for lean -1 / +1 / throttle / brake
none: Δpitch 0.1 deg in 0.5 s
lean-1: Δpitch 33.5 deg in 0.5 s
lean+1: Δpitch -38.1 deg in 0.5 s
thr: Δpitch 13.8 deg in 0.5 s
brake: Δpitch -17.4 deg in 0.5 s
