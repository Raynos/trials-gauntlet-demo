/**
 * The boot plan's vocabulary — the ONE place the loading screen's steps, labels, weights, byte
 * sources and background items are declared (docs/tasks/loading-progress-invariant.md §4).
 *
 * Everything the loader shows is derived from these tables by `createBootPlan` (`./plan.ts`);
 * nothing downstream parses a label or sums a constant. `pnpm typecheck` fails when a step is
 * added here and not run by `main.ts` (`done` exists only on the exhausted plan type), and when a
 * file a byte source counts disappears from `public/` (`PUBLIC_BYTES` is generated with literal keys).
 *
 * Dependency-free on purpose: the inline loader bundles this file into `index.html`.
 */
/**
 * Every await of the boot, in the order they run, with its label and SETUP weight. Adding one here is a
 * compile error in main.ts until it is run. `core` weighs 0 in SETUP: it is pure download (the DOWNLOAD track).
 */
export const STEP_INFO = {
  core: { label: 'Core bundle', weight: 0 },
  evaluate: { label: 'Script parse', weight: 1 },
  renderer: { label: 'WebGL renderer', weight: 2 },
  physics: { label: 'Physics world', weight: 1 },
  audio: { label: 'Audio', weight: 1 },
  game: { label: 'Game + HUD', weight: 1 },
  front: { label: 'Front end', weight: 2 },
  track: { label: 'First track', weight: 1 },
  heroMeshes: { label: 'Hero meshes', weight: 1 },
  lighting: { label: 'Lighting', weight: 1 },
  postChain: { label: 'Post chain', weight: 1 },
  materials: { label: 'World textures', weight: 4 },
  heroModels: { label: 'Hero models', weight: 1 },
  bootArt: { label: 'World art', weight: 1 },
  shaders: { label: 'Shaders', weight: 3 },
  firstFrame: { label: 'First frame', weight: 3 },
  fonts: { label: 'Fonts', weight: 1 },
} as const satisfies Record<string, { readonly label: string; readonly weight: number }>;
export type BootStep = keyof typeof STEP_INFO;
/** The steps in declared order (string keys keep insertion order). */
export const BOOT_STEPS = Object.keys(STEP_INFO) as readonly BootStep[];

/** The steps the renderer's `prepare()` runs, through a `StepRunner` restricted to exactly these keys. */
export const PREPARE_STEPS = ['heroMeshes', 'lighting', 'postChain', 'materials', 'heroModels', 'bootArt', 'shaders', 'firstFrame'] as const satisfies readonly BootStep[];
export type PrepareStep = (typeof PREPARE_STEPS)[number];

/** The two steps the inline loader runs before the module takes the plan over. */
export const INLINE_STEPS = ['core', 'evaluate'] as const satisfies readonly BootStep[];
export type InlineStep = (typeof INLINE_STEPS)[number];
/** What `main.ts` receives from `takeBootPlan()`. */
export type ModuleStep = Exclude<BootStep, InlineStep>;

/**
 * DOWNLOAD byte sources: the bytes boot awaits, each reported by the reader that reads them and
 * CLOSED (read := total) by the step whose completion proves they were consumed. There is no
 * "needed" flag: a source is in the number because it is in this table, and it is complete
 * because its step is. `done()` therefore reads 1 by arithmetic, never by reclassification.
 */
export const BYTE_SOURCES = ['core', 'heroModels', 'bootArt'] as const;
export type ByteKey = (typeof BYTE_SOURCES)[number];
/** A byte source's label is its closing step's, lower-cased (`core bundle`, `hero models`, `world art`) — the 8 KB inline carries one table. */
export const BYTE_INFO: Record<ByteKey, { readonly closedBy: BootStep }> = {
  core: { closedBy: 'core' },
  heroModels: { closedBy: 'heroModels' },
  bootArt: { closedBy: 'bootArt' },
};
export const byteLabel = (key: ByteKey): string => STEP_INFO[BYTE_INFO[key].closedBy].label.toLowerCase();

/** Background items: shown under "streams in after start", never in a number, and there is no flag that could promote one. */
export const AFTER_KEYS = ['keyArt', 'trackArt'] as const;
export type AfterKey = (typeof AFTER_KEYS)[number];
export const AFTER_LABELS: Record<AfterKey, string> = { keyArt: 'Key art', trackArt: 'Track art' };
