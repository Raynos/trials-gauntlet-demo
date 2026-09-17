/** Cosmetic designs are independent of bike physics. Unbuilt designs have no loadable family. */
export type RiderOutfit = 'street-openface' | 'street-mustard' | 'street-charcoal' | 'race-bluewhite' | 'race-charcoalyellow';
export type RiderDesign = RiderOutfit;
/** Boot's download-total bucket (src/boot/asset-totals.ts keys `heroModels` by it) and, in the legacy hero family, the shared file. */
export type RiderModelFamily = 'street' | 'race' | 'openface';
interface AvailablePreset { id: RiderOutfit; available: true; family: RiderModelFamily; label: string; detail: string; reference: string }
export const RIDER_PRESETS: readonly AvailablePreset[] = [
  { id: 'street-mustard', available: true, family: 'street', label: 'Mustard · barehead', detail: 'Hoodie, jeans & trainers', reference: '01' },
  { id: 'street-openface', available: true, family: 'openface', label: 'Charcoal · open-face', detail: 'Open-face helmet, hoodie & jeans', reference: '02' },
  { id: 'race-bluewhite', available: true, family: 'race', label: 'Blue & white · Race', detail: 'Jersey, race pants & boots', reference: '03' },
  { id: 'street-charcoal', available: true, family: 'street', label: 'Charcoal · barehead', detail: 'Hoodie, jeans & trainers', reference: '04' },
  { id: 'race-charcoalyellow', available: true, family: 'race', label: 'Charcoal & yellow · Race', detail: 'Jersey, race pants & boots', reference: '05' },
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
/** Self-contained (no `normalizeRiderFamily`): the 8 KB boot inline bundles this one and nothing else of the table. */
export function normalizeRiderOutfit(value: unknown): RiderOutfit | null {
  if (value === 'street') return 'street-mustard';
  if (value === 'race') return 'race-bluewhite';
  return /^(street-(openface|mustard|charcoal)|race-(bluewhite|charcoalyellow))$/.test(value as string) ? value as RiderOutfit : null;
}
