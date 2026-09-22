/**
 * Store build flags (docs/plans/STORE_RELEASE.md P0.3). `pnpm build:store` sets `VITE_STORE=1`; Vite
 * replaces `import.meta.env.VITE_STORE` with a string literal at build time, so every branch on these
 * constants folds and the dead side — the review inbox, the bench, the Labs, the run log, the `?`-param
 * dev modes, the service worker, the update pill — is dropped from the bundle, not just hidden.
 * `src/store-build.test.ts` builds the store bundle and proves each one is absent.
 *
 * Outside Vite (tsx harness scripts, node) `import.meta.env` does not exist: that is a normal web build.
 */
const env = (import.meta as { env?: { VITE_STORE?: string; VITE_STORE_DEBUG?: string } }).env;

/** A store (App Store / Google Play) build: no dev surface, nothing that loads code or data from a server. */
export const STORE: boolean = env?.VITE_STORE === '1';

/** Dev and review surfaces (inbox, bench, Labs, run log, `?`-param modes, SW, update pill): every build but a store build. */
export const DEV_SURFACES: boolean = !STORE;

/**
 * The `window.__trials` automation hook and the `?harness=1` route: every non-release build. A store build
 * keeps it only with `VITE_STORE_DEBUG=1` (the native gate's debug build), never in the release.
 */
export const AUTOMATION_HOOK: boolean = !STORE || env?.VITE_STORE_DEBUG === '1';
