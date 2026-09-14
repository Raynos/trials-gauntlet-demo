## T0 static COM geometry (d ahead of rear patch, h above ground) and critical a/g = d/h per lean
lean -1: d 0.35 h 0.62 d/h 0.57  pitch 4.8 compR 0.129 compF 0.023
lean -0.5: d 0.43 h 0.70 d/h 0.62  pitch 3.2 compR 0.110 compF 0.042
lean 0: d 0.52 h 0.77 d/h 0.67  pitch 1.6 compR 0.092 compF 0.060
lean 0.5: d 0.57 h 0.79 d/h 0.73  pitch 0.4 compR 0.077 compF 0.074
lean 1: d 0.63 h 0.80 d/h 0.78  pitch -0.9 compR 0.063 compF 0.088

## T1 full throttle from rest, constant lean (design: Fpeak 780 N curve, Katt 180): max pitch in 6 s / loop time / speed at 3 s
lean -1: maxPitch 91.2 loop 0.78 s  v(3s) NaN m/s  t16 NaN top 1.0
lean -0.5: maxPitch 57.5 loop NaN s  v(3s) -1.8 m/s  t16 NaN top 0.7
lean -0.25: maxPitch 40.4 loop NaN s  v(3s) 3.7 m/s  t16 NaN top 5.4
lean 0: maxPitch 6.5 loop NaN s  v(3s) 11.0 m/s  t16 5.13 top 17.5
lean 0.25: maxPitch 5.9 loop NaN s  v(3s) 11.2 m/s  t16 4.98 top 17.9
lean 0.5: maxPitch 5.3 loop NaN s  v(3s) 11.4 m/s  t16 4.84 top 18.2
lean 1: maxPitch 5.5 loop NaN s  v(3s) 11.8 m/s  t16 4.58 top 18.9

## T2 full throttle lean -1 (wheelie); when pitch crosses X deg snap lean to +1 (throttle held): pitch after 0.1/0.25/0.5/1 s, max after
from lean -1 snap at 20: +0.1 34.1 +0.25 25.4 +0.5 -3.0 +1.0 4.6  max 34.1 
from lean -1 snap at 30: +0.1 41.7 +0.25 32.2 +0.5 2.0 +1.0 4.8  max 41.8 
from lean -1 snap at 40: +0.1 50.5 +0.25 36.7 +0.5 1.8 +1.0 4.7  max 50.5 
from lean -1 snap at 50: +0.1 62.3 +0.25 35.3 +0.5 -10.8 +1.0 7.6  max 62.4 
from lean -1 snap at 60: +0.1 70.9 +0.25 28.2 +0.5 -3.2 +1.0 5.2  max 72.1 
from lean -0.5 snap at 30: +0.1 37.9 +0.25 28.7 +0.5 3.1 +1.0 4.2  max 38.7 
from lean -0.5 snap at 40: +0.1 48.4 +0.25 30.2 +0.5 -5.7 +1.0 3.7  max 48.6 

## T3 lean step on the ground at 8 m/s: pitch change at 0.05/0.1/0.25/0.5 s (sign of the transient)
lean -1: -0.87 -2.42 2.78 5.84  min -2.94 max 7.64
lean 1: 0.90 1.67 -3.01 -3.12  min -4.05 max 1.72

## T4 stationary hop: lean -1 + throttle 0.4 for P s (brake off), then lean +1 at rider rate; rear apex, front apex, airtime
P 0.1: apex chassis 0.040 rear 0.193 front 0.079 bothOff 0.00 s pitch -4..7
P 0.2: apex chassis 0.092 rear 0.280 front 0.188 bothOff 0.00 s pitch -8..12
P 0.3: apex chassis 0.112 rear 0.317 front 0.281 bothOff 0.00 s pitch -10..18
P 0.4: apex chassis 0.115 rear 0.327 front 0.341 bothOff 0.00 s pitch -10..20
P 0.5: apex chassis 0.103 rear 0.310 front 0.363 bothOff 0.00 s pitch -10..20
P 0.7: apex chassis 0.091 rear 0.284 front 0.364 bothOff 0.00 s pitch -9..20
P 1: apex chassis 0.125 rear 0.340 front 0.364 bothOff 0.00 s pitch -11..20
-- snap speed (P 0.35):
rate 1 m/s: apex chassis 0.031 rear 0.115 front 0.210 bothOff 0.00 s pitch -2..12
rate 1.5 m/s: apex chassis 0.065 rear 0.226 front 0.270 bothOff 0.00 s pitch -6..16
rate 2 m/s: apex chassis 0.104 rear 0.299 front 0.294 bothOff 0.00 s pitch -9..18
rate 3 m/s: apex chassis 0.116 rear 0.326 front 0.316 bothOff 0.00 s pitch -10..19
rate 4 m/s: apex chassis 0.099 rear 0.302 front 0.345 bothOff 0.00 s pitch -9..21
-- gas through the snap (P 0.35): thrPre 0.6, thrSnap 0.6/0.8/1.0, rate 3/4.5, cap 5k/8k
thrSnap 0.6 rate 3 cap 2500: apex chassis 0.078 rear 0.273 front 0.442 bothOff 0.00 s pitch -9..26
thrSnap 0.8 rate 3 cap 2500: apex chassis 0.091 rear 0.304 front 0.457 bothOff 0.00 s pitch -10..27
thrSnap 1 rate 3 cap 2500: apex chassis 0.100 rear 0.324 front 0.474 bothOff 0.02 s pitch -11..28
thrSnap 0.8 rate 4.5 cap 2500: apex chassis 0.093 rear 0.282 front 0.508 bothOff 0.00 s pitch -9..29
thrSnap 0.8 rate 4.5 cap 4000: apex chassis 0.098 rear 0.321 front 0.507 bothOff 0.02 s pitch -11..29
thrSnap 1 rate 4.5 cap 4000: apex chassis 0.125 rear 0.342 front 0.518 bothOff 0.05 s pitch -12..30
thrSnap 1 rate 6 cap 4000: apex chassis 0.117 rear 0.338 front 0.504 bothOff 0.05 s pitch -12..30
-- preload sweep with gas through (thrPre 0.6, thrSnap 0.8, rate 4.5, cap 4k):
P 0.15: apex chassis 0.044 rear 0.160 front 0.226 bothOff 0.00 s pitch -2..16
P 0.25: apex chassis 0.052 rear 0.206 front 0.364 bothOff 0.00 s pitch -5..23
P 0.35: apex chassis 0.098 rear 0.321 front 0.507 bothOff 0.02 s pitch -11..29
P 0.45: apex chassis 0.150 rear 0.403 front 0.630 bothOff 0.05 s pitch -15..35
P 0.6: apex chassis 0.230 rear 0.389 front 0.764 bothOff 0.05 s pitch -15..40
P 0.8: apex chassis 0.292 rear 0.390 front 0.887 bothOff 0.03 s pitch -15..46
-- snap magnitude (P 0.35, rate 3):
snap to lean 1: apex chassis 0.116 rear 0.326 front 0.316 bothOff 0.00 s pitch -10..19
snap to lean 0.5: apex chassis 0.068 rear 0.234 front 0.324 bothOff 0.00 s pitch -6..20
snap to lean 0.25: apex chassis 0.051 rear 0.198 front 0.329 bothOff 0.00 s pitch -4..21
snap to lean 0: apex chassis 0.040 rear 0.161 front 0.334 bothOff 0.00 s pitch -2..21
snap to lean -0.5: apex chassis 0.040 rear 0.102 front 0.347 bothOff 0.00 s pitch 0..21

## T6 full brake from ~10 m/s at lean -1 / 0 / +1: stopping distance, min front comp, rear lifts?
lean -1: dist 5.72 m  rear off 0.26 s  min pitch -8.1  t 1.06 s
lean 0: dist 7.04 m  rear off 0.27 s  min pitch -6.2  t 1.42 s
lean 1: dist NaN m  rear off 2.86 s  min pitch NaN  t 3.33 s

## T5 in the air (launched level at 8 m/s from 3 m, no ground): pitch after 0.5 s for lean -1 / +1 / throttle / brake
none: Δpitch 0.1 deg in 0.5 s
lean-1: Δpitch 20.8 deg in 0.5 s
lean+1: Δpitch -23.9 deg in 0.5 s
thr: Δpitch 13.7 deg in 0.5 s
brake: Δpitch -17.9 deg in 0.5 s
