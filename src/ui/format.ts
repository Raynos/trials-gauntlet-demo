/** `m:ss.mmm` (the Trials read-out). */
export function formatTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** Signed delta `+0:01.234` / `-0:00.500`. */
export function formatDelta(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  return sign + formatTime(Math.abs(seconds));
}

export const MEDAL_LABEL = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const;
