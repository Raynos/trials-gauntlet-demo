/**
 * Headless Chromium with a working WebGL2 context (SwiftShader via ANGLE).
 *
 * Playwright's headless shell has no GPU; without these flags WebGL context
 * creation fails silently and three throws. We try the modern flag set first
 * and fall back to the legacy `--use-gl=angle` spelling.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface WebGLProbe {
  ok: boolean;
  kind: 'webgl2' | 'webgl' | 'none';
  renderer: string;
  vendor: string;
  version: string;
  maxTextureSize: number;
}

export interface LaunchedBrowser {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  flagSet: string;
  probe: WebGLProbe;
  close(): Promise<void>;
}

const COMMON_FLAGS = [
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--mute-audio',
  '--hide-scrollbars',
  '--no-first-run',
  '--force-device-scale-factor=1',
];

const FLAG_SETS: Record<string, string[]> = {
  'angle-swiftshader': ['--use-angle=swiftshader', ...COMMON_FLAGS],
  'gl-angle-swiftshader': ['--use-gl=angle', '--use-angle=swiftshader', ...COMMON_FLAGS],
  'swiftshader-webgl': ['--use-gl=swiftshader', ...COMMON_FLAGS],
};

export interface LaunchOptions {
  width?: number;
  height?: number;
  /** Use the full chromium build instead of the headless shell. */
  fullChromium?: boolean;
  /** Extra chromium args. */
  args?: string[];
  /** Forward page console messages to stdout. */
  logConsole?: boolean;
}

/** Runs in the page: creates a throwaway canvas and inspects its GL context. */
function probeInPage(): WebGLProbe {
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
  const gl = gl2 ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
  if (!gl) return { ok: false, kind: 'none', renderer: '', vendor: '', version: '', maxTextureSize: 0 };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const vendor = String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  const result: WebGLProbe = {
    ok: true,
    kind: gl2 ? 'webgl2' : 'webgl',
    renderer,
    vendor,
    version: String(gl.getParameter(gl.VERSION)),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
  };
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return result;
}

export async function probeWebGL(page: Page): Promise<WebGLProbe> {
  return page.evaluate(probeInPage);
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<LaunchedBrowser> {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const errors: string[] = [];
  for (const [name, flags] of Object.entries(FLAG_SETS)) {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(options.fullChromium ? { channel: 'chromium' as const } : {}),
        args: [...flags, ...(options.args ?? [])],
      });
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      if (options.logConsole) {
        page.on('console', (m) => console.log(`[page:${m.type()}] ${m.text()}`));
        page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
      }
      await page.setContent('<canvas></canvas>');
      const probe = await probeWebGL(page);
      if (!probe.ok || probe.kind !== 'webgl2') {
        errors.push(`${name}: webgl2 unavailable (${probe.kind} / ${probe.renderer || 'no renderer'})`);
        await browser.close();
        continue;
      }
      const b = browser;
      return {
        browser,
        context,
        page,
        flagSet: name,
        probe,
        close: async () => {
          await b.close().catch(() => undefined);
        },
      };
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      await browser?.close().catch(() => undefined);
    }
  }
  throw new Error(`Could not launch headless Chromium with WebGL2:\n  ${errors.join('\n  ')}`);
}
