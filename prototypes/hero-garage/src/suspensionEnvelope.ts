/** Garage-only suspension timing, aligned to the authored rider's 30 fps keys.
 * This prescribes motion; it does not simulate forces or change game physics.
 */
export function suspensionEnvelope(clip: string | null, seconds: number): number {
  const keys = clip === 'compression'
    ? [[0,0],[30,0],[54,1],[78,1],[104,0],[149,0]]
    : clip === 'landing_absorption'
      ? [[0,0],[50,0],[65,1],[83,1],[108,0],[149,0]]
      : null;
  if (!keys || !Number.isFinite(seconds)) return 0;
  const frame = Math.max(0, seconds * 30);
  for (let i = 1; i < keys.length; i++) {
    const [a, from] = keys[i-1], [b, to] = keys[i];
    if (frame <= b) {
      const t = Math.min(1, Math.max(0, (frame-a)/(b-a)));
      return from + (to-from) * t*t*(3-2*t);
    }
  }
  return 0;
}
