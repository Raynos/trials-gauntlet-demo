/**
 * Capacitor shells for the App Store (iPhone) and Google Play (docs/plans/STORE_RELEASE.md Phase 5).
 *
 * The shells wrap the store bundle, built into its own directory so a web build (`dist/`, which other builders
 * rebuild at any time in this one checkout) can never be copied into an app: `node scripts/store-build.mjs release`
 * builds `VITE_STORE=1` into `store/build/web` and runs `cap sync`; `debug` adds `VITE_STORE_DEBUG=1` and the native
 * gate's recordings (harness/native/README.md). Never `cap sync` by hand — the script always rebuilds first.
 *
 * Every asset is bundled; the app needs no network (no `server.url`, no remote config, no analytics).
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jakeverbaten.rockhop',
  appName: 'Rockhop',
  webDir: 'store/build/web',
  // Brand deep teal (A-brand #0F5C63): what the WebView paints before the page's first frame, matching the launch screen.
  backgroundColor: '#0F5C63',
  // Console lines reach Xcode / logcat in debug builds only; the native gate reads its results from them.
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // Capacitor's built-in SystemBars: status bar and (iOS) home indicator hidden from launch — a full-screen game.
    SystemBars: { hidden: true },
  },
  android: {
    // `webContentsDebuggingEnabled` is left unset: Capacitor enables WebView debugging in debuggable builds only,
    // which is what the native gate attaches to over CDP (harness/native/android.ts). Release builds never have it.
    allowMixedContent: false,
    captureInput: false,
  },
};

export default config;
