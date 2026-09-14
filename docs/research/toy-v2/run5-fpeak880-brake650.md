# Run 5: as run 4 but F_peak 880 N, curve v[0,4,8,12,17,20] f[.85,1,1,.70,.48,.35], brakes 390/260 Nm (the first draft of the §13 table). Finding: neutral full gas lifts into a self-limiting 58 deg wheelie (no loop), lean +0.25 does not lift and reaches 16 m/s in 4.0 s, lean -0.5 loops at 3.4 s; full brake at neutral stoppies (13 m) — the 650 Nm / 60-40 split was revised to 560 Nm / 55-45 in the design.

## T0 static COM geometry (d ahead of rear patch, h above ground) and critical a/g = d/h per lean
lean -1: d 0.35 h 0.62 d/h 0.57  pitch 4.8 compR 0.129 compF 0.023
lean -0.5: d 0.43 h 0.70 d/h 0.62  pitch 3.2 compR 0.110 compF 0.042
lean 0: d 0.52 h 0.77 d/h 0.67  pitch 1.6 compR 0.092 compF 0.060
lean 0.5: d 0.57 h 0.79 d/h 0.73  pitch 0.4 compR 0.077 compF 0.074
lean 1: d 0.63 h 0.80 d/h 0.78  pitch -0.9 compR 0.063 compF 0.088

## T1 full throttle from rest, constant lean (design: Fpeak 780 N curve, Katt 180): max pitch in 6 s / loop time / speed at 3 s
lean -1: maxPitch 90.2 loop 0.68 s  v(3s) NaN m/s  t16 NaN top 1.2
lean -0.5: maxPitch 90.4 loop 3.42 s  v(3s) -5.2 m/s  t16 NaN top 0.8
lean -0.25: maxPitch 72.6 loop NaN s  v(3s) 3.1 m/s  t16 NaN top 3.2
lean 0: maxPitch 58.3 loop NaN s  v(3s) 5.3 m/s  t16 NaN top 15.5
lean 0.25: maxPitch 6.6 loop NaN s  v(3s) 13.1 m/s  t16 3.99 top 20.0
lean 0.5: maxPitch 6.0 loop NaN s  v(3s) 13.3 m/s  t16 3.90 top 20.0
lean 1: maxPitch 5.9 loop NaN s  v(3s) 13.7 m/s  t16 3.74 top 20.1

## T2 full throttle lean -1 (wheelie); when pitch crosses X deg snap lean to +1 (throttle held): pitch after 0.1/0.25/0.5/1 s, max after
from lean -1 snap at 20: +0.1 36.2 +0.25 29.9 +0.5 7.1 +1.0 5.4  max 36.6 
from lean -1 snap at 30: +0.1 44.1 +0.25 36.3 +0.5 11.6 +1.0 5.3  max 44.8 
from lean -1 snap at 40: +0.1 53.0 +0.25 40.4 +0.5 11.3 +1.0 5.2  max 53.2 
from lean -1 snap at 50: +0.1 64.2 +0.25 38.9 +0.5 -5.7 +1.0 9.4  max 64.3 
from lean -1 snap at 60: +0.1 73.6 +0.25 32.8 +0.5 -1.1 +1.0 5.4  max 74.7 
from lean -0.5 snap at 30: +0.1 40.0 +0.25 34.3 +0.5 19.2 +1.0 3.9  max 41.5 
from lean -0.5 snap at 40: +0.1 52.8 +0.25 40.7 +0.5 12.7 +1.0 4.5  max 54.3 

## T3 lean step on the ground at 8 m/s: pitch change at 0.05/0.1/0.25/0.5 s (sign of the transient)
lean -1: -0.87 -2.43 2.79 5.91  min -2.94 max 7.59
lean 1: 0.91 1.72 -2.87 -3.22  min -4.00 max 1.77

## T4 stationary hop: lean -1 + throttle 0.4 for P s (brake off), then lean +1 at rider rate; rear apex, front apex, airtime
P 0.1: apex chassis 0.039 rear 0.190 front 0.084 bothOff 0.00 s pitch -4..7
P 0.2: apex chassis 0.088 rear 0.271 front 0.198 bothOff 0.00 s pitch -8..13
P 0.3: apex chassis 0.101 rear 0.298 front 0.302 bothOff 0.00 s pitch -9..19
P 0.4: apex chassis 0.104 rear 0.308 front 0.376 bothOff 0.00 s pitch -10..22
P 0.5: apex chassis 0.095 rear 0.299 front 0.412 bothOff 0.00 s pitch -10..22
P 0.7: apex chassis 0.123 rear 0.255 front 0.425 bothOff 0.00 s pitch -8..22
P 1: apex chassis 0.124 rear 0.310 front 0.425 bothOff 0.00 s pitch -10..22
-- snap speed (P 0.35):
rate 1 m/s: apex chassis 0.037 rear 0.111 front 0.234 bothOff 0.00 s pitch -2..13
rate 1.5 m/s: apex chassis 0.061 rear 0.220 front 0.297 bothOff 0.00 s pitch -5..17
rate 2 m/s: apex chassis 0.095 rear 0.283 front 0.320 bothOff 0.00 s pitch -8..19
rate 3 m/s: apex chassis 0.104 rear 0.305 front 0.344 bothOff 0.00 s pitch -9..21
rate 4 m/s: apex chassis 0.088 rear 0.283 front 0.379 bothOff 0.00 s pitch -9..23
-- gas through the snap (P 0.35): thrPre 0.6, thrSnap 0.6/0.8/1.0, rate 3/4.5, cap 5k/8k
thrSnap 0.6 rate 3 cap 2500: apex chassis 0.090 rear 0.293 front 0.495 bothOff 0.00 s pitch -10..28
thrSnap 0.8 rate 3 cap 2500: apex chassis 0.100 rear 0.322 front 0.513 bothOff 0.02 s pitch -11..29
thrSnap 1 rate 3 cap 2500: apex chassis 0.146 rear 0.342 front 0.535 bothOff 0.05 s pitch -11..30
thrSnap 0.8 rate 4.5 cap 2500: apex chassis 0.123 rear 0.302 front 0.572 bothOff 0.03 s pitch -10..32
thrSnap 0.8 rate 4.5 cap 4000: apex chassis 0.135 rear 0.342 front 0.569 bothOff 0.06 s pitch -12..32
thrSnap 1 rate 4.5 cap 4000: apex chassis 0.173 rear 0.359 front 0.582 bothOff 0.09 s pitch -13..33
thrSnap 1 rate 6 cap 4000: apex chassis 0.160 rear 0.350 front 0.573 bothOff 0.09 s pitch -12..33
-- preload sweep with gas through (thrPre 0.6, thrSnap 0.8, rate 4.5, cap 4k):
P 0.15: apex chassis 0.044 rear 0.141 front 0.249 bothOff 0.00 s pitch -2..17
P 0.25: apex chassis 0.062 rear 0.218 front 0.404 bothOff 0.00 s pitch -5..25
P 0.35: apex chassis 0.135 rear 0.342 front 0.569 bothOff 0.06 s pitch -12..32
P 0.45: apex chassis 0.184 rear 0.409 front 0.724 bothOff 0.09 s pitch -15..39
P 0.6: apex chassis 0.279 rear 0.429 front 0.907 bothOff 0.07 s pitch -17..48
P 0.8: apex chassis 0.350 rear 0.373 front 1.067 bothOff 0.01 s pitch -13..57
-- snap magnitude (P 0.35, rate 3):
snap to lean 1: apex chassis 0.104 rear 0.305 front 0.344 bothOff 0.00 s pitch -9..21
snap to lean 0.5: apex chassis 0.061 rear 0.223 front 0.353 bothOff 0.00 s pitch -5..22
snap to lean 0.25: apex chassis 0.048 rear 0.193 front 0.359 bothOff 0.00 s pitch -4..22
snap to lean 0: apex chassis 0.048 rear 0.166 front 0.365 bothOff 0.00 s pitch -3..23
snap to lean -0.5: apex chassis 0.048 rear 0.100 front 0.378 bothOff 0.00 s pitch 0..23

## T6 full brake from ~10 m/s at lean -1 / 0 / +1: stopping distance, min front comp, rear lifts?
lean -1: dist 5.25 m  rear off 0.33 s  min pitch -10.0  t 0.97 s
lean 0: dist 13.27 m  rear off 2.51 s  min pitch -58.4  t 2.77 s
lean 1: dist NaN m  rear off 2.78 s  min pitch NaN  t 3.20 s

## T5 in the air (launched level at 8 m/s from 3 m, no ground): pitch after 0.5 s for lean -1 / +1 / throttle / brake
none: Δpitch 0.1 deg in 0.5 s
lean-1: Δpitch 20.8 deg in 0.5 s
lean+1: Δpitch -23.9 deg in 0.5 s
thr: Δpitch 14.2 deg in 0.5 s
brake: Δpitch -18.1 deg in 0.5 s
