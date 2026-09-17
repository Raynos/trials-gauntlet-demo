/**
 * The art pack's boot set, dependency-free so the boot plan (`src/boot/steps.ts`) can sum its bytes
 * from the generated table at compile time. `library.ts` imports these lists (it used to declare them).
 */
/**
 * What every track shows near its start gate (barrier strips, flags, deck decals). Ask 62: the keyed
 * photo crowd (`crowd-day`, 119 KB) left the set — the crowd is painted (`world/crowd.ts`); it comes
 * back here only with `CROWD_PHOTO_SHEET` in `world/gates.ts`.
 */
export const COMMON_IDS = ['banner-vortex-oil', 'banner-kestrel-tyres', 'banner-nordvik', 'banner-apex-suspension', 'banner-bolt-energy', 'banner-ironworks-series', 'tyremark-arc'] as const;
/** The hall's container skins (industrial + foundry). */
export const HALL_SKIN_IDS = ['stencil-hkr', 'stencil-nordvik', 'stencil-weights', 'stencil-hazard', 'stencil-serial', 'stencil-arrows', 'mask-edge-grime', 'mask-grime-spatter'] as const;
/** The boot set: the showcase biome (industrial) minus its back-wall decals. */
export const BOOT_IDS = [...COMMON_IDS, ...HALL_SKIN_IDS, 'plate-industrial'] as const;
