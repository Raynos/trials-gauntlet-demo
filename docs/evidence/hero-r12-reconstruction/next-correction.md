# Stopped reconstruction: proposed next correction

The official run stopped at blockout 3/3 after recording rejection of neutral06.
No additional shape correction is authorized by the skill until the user answers
the pending request. Do not reset history, silently raise limits, or regenerate.

Read-only diagnosis found that each frustum is a cone intersected with a box.
Hard internal caps survive the short 10–21 mm overlap and smooth union. Field
extraction amplifies the visible circumferential seams. Neutral materials use
smooth shading and no texture maps; toggling shading cannot correct the shape.

Measured face-to-vertex normal disagreement averages 9.27 degrees at the elbow,
11.79 at the knee and 10.44 at the ankle, versus 1.62–2.74 on nearby shafts.
These are diagnostic samples, not a complete normal or topology gate.

If the user permits another correction, proposed initial parameters are:

- Extend internal taper ends 40 mm along their axes, extrapolating radius from
  the existing taper. Keep terminal cuff and ankle ends fixed.
- Blend elbow and knee at 25 mm, ankle at 20 mm.
- Reduce shoulder-cap radii from [.090,.080,.092] to [.075,.065,.085] metres
  and upper-sleeve proximal radius from .083 to .075 metres.
- Remove the bulbous hem ellipse and extend the abdomen to the hem plane.
  Add a restrained jeans waistband centered [0,.965,-.006], radii
  [.181,.065,.112], and move the top clip plane to Y=1.005 inside the hoodie.
- Suppress visible pocket detail meshes in blockout while retaining their
  semantic IDs and original source evidence.

Recapture the same camera and all orbit views. Judge surface transitions,
shoulder slope, waist coverage and silhouette. Head likeness, hand anatomy,
shoe shape, triangle budget, materials and animation remain unaccepted.
