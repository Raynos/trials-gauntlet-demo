/** Cosmetic designs are independent of bike physics. Unbuilt designs have no loadable family. */
export type RiderOutfit = 'street-openface' | 'street-mustard' | 'street-charcoal' | 'race-bluewhite' | 'race-charcoalyellow';
export type RiderDesign = RiderOutfit;
export type RiderModelFamily = 'street' | 'race' | 'openface';
export type RiderPalette = 'rider_rookie' | 'rider_pro';
interface AvailablePreset { id: RiderOutfit; available: true; family: RiderModelFamily; variant: RiderPalette; label: string; detail: string; reference: string }
export const RIDER_PRESETS: readonly AvailablePreset[] = [
  { id: 'street-mustard', available: true, family: 'street', variant: 'rider_rookie', label: 'Mustard · barehead', detail: 'Hoodie, jeans & trainers', reference: '01' },
  { id: 'street-openface', available: true, family: 'openface', variant: 'rider_pro', label: 'Charcoal · open-face', detail: 'Open-face helmet, hoodie & jeans', reference: '02' },
  { id: 'race-bluewhite', available: true, family: 'race', variant: 'rider_rookie', label: 'Blue & white · Race', detail: 'Jersey, race pants & boots', reference: '03' },
  { id: 'street-charcoal', available: true, family: 'street', variant: 'rider_pro', label: 'Charcoal · barehead', detail: 'Hoodie, jeans & trainers', reference: '04' },
  { id: 'race-charcoalyellow', available: true, family: 'race', variant: 'rider_pro', label: 'Charcoal & yellow · Race', detail: 'Jersey, race pants & boots', reference: '05' },
];
export const AVAILABLE_RIDER_PRESETS = /* @__PURE__ */ RIDER_PRESETS.filter((p): p is AvailablePreset => p.available);
export const DEFAULT_RIDER_OUTFIT: RiderOutfit = 'street-mustard';
/** Boot only needs the model family; keep labels and canonical palette strings out of its bundle. */
export function normalizeRiderFamily(value: string | null | undefined): RiderModelFamily | null {
  if (value === 'street-openface') return 'openface';
  const match = /^(street)(-mustard|-charcoal)?$|^(race)(-bluewhite|-charcoalyellow)?$/.exec(value ?? '');
  return (match && (match[1] || match[3])) as RiderModelFamily | null;
}
export function riderPreset(id: RiderOutfit): AvailablePreset {
  const preset = AVAILABLE_RIDER_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error(`Unavailable rider preset: ${id}`);
  return preset;
}
export function normalizeRiderOutfit(value: unknown): RiderOutfit | null {
  if (value === 'street') return 'street-mustard';
  if (value === 'race') return 'race-bluewhite';
  return typeof value === 'string' && normalizeRiderFamily(value) ? value as RiderOutfit : null;
}
