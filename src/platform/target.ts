/** Set by Vite's native build, including the separately bundled inline loader. */
declare const __NATIVE_APP__: boolean | undefined;

/** Build target, independent of user agent, URL, or whether a bridge has loaded yet. */
export function isNativeApp(): boolean {
  return typeof __NATIVE_APP__ !== 'undefined' && __NATIVE_APP__;
}
