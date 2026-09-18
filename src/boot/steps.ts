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
// Rows, not keyed objects: this table is compiled into the 8 KB boot inline verbatim (ask 43 round 4 reclaimed the bytes).
const STEP_ROWS = [
  ['core', 'Core', 0],
  ['evaluate', 'Parse', 1],
  ['renderer', 'Renderer', 2],
  ['physics', 'Physics', 1],
  ['audio', 'Audio', 1],
  ['game', 'Game + HUD', 1],
  ['front', 'Front end', 2],
  ['offlinePack', 'Offline pack', 1],
  ['track', 'First track', 1],
  ['heroMeshes', 'Hero meshes', 1],
  ['lighting', 'Lighting', 1],
  ['postChain', 'Post', 1],
  ['materials', 'Textures', 4],
  ['heroModels', 'Hero models', 1],
  ['bootArt', 'World art', 1],
  ['shaders', 'Shaders', 3],
  ['firstFrame', 'First frame', 3],
  ['fonts', 'Fonts', 1],
] as const satisfies readonly (readonly [string, string, number])[];
export type BootStep = (typeof STEP_ROWS)[number][0];
export const STEP_INFO = Object.fromEntries(STEP_ROWS.map(([key, label, weight]) => [key, { label, weight }])) as Record<BootStep, { readonly label: string; readonly weight: number }>;
/** The steps in declared order. */
export const BOOT_STEPS = STEP_ROWS.map((row) => row[0]) as readonly BootStep[];

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
export const BYTE_SOURCES = ['core', 'heroModels', 'bootArt', 'offlinePack'] as const;
export type ByteKey = (typeof BYTE_SOURCES)[number];
/** The step whose completion closes a byte source: the step of the same name (core → core, heroModels → heroModels, bootArt → bootArt, offlinePack → offlinePack). */
export const closedBy = (key: ByteKey): BootStep => key;
/** A byte source's label is its closing step's, lower-cased (`core`, `hero models`, `world art`) — the 8 KB inline carries one table. */
export const byteLabel = (key: ByteKey): string => STEP_INFO[closedBy(key)].label.toLowerCase();

/** Background items: shown under "streams in after start", never in a number, and there is no flag that could promote one. */
export const AFTER_KEYS = ['keyArt', 'trackArt'] as const;
export type AfterKey = (typeof AFTER_KEYS)[number];
export const AFTER_LABELS: Record<AfterKey, string> = { keyArt: 'Key art', trackArt: 'Track art' };
