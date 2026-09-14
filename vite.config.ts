import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

/** CONTRACT §3: JS bundle ≤ 600 KB gzipped. Fails the build when exceeded. */
const BUNDLE_BUDGET_GZ_BYTES = 600 * 1024;

function bundleBudget(): Plugin {
  return {
    name: 'trials:bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      let total = 0;
      const rows: string[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue;
        const gz = gzipSync(Buffer.from(item.code)).length;
        total += gz;
        rows.push(`  ${name.padEnd(40)} ${(gz / 1024).toFixed(1).padStart(8)} KB gz`);
      }
      const ok = total <= BUNDLE_BUDGET_GZ_BYTES;
      const line = `bundle budget: ${(total / 1024).toFixed(1)} KB gz of ${(BUNDLE_BUDGET_GZ_BYTES / 1024).toFixed(0)} KB — ${ok ? 'OK' : 'OVER BUDGET'}`;
      this.info(`\n${rows.join('\n')}\n${line}`);
      if (!ok) this.error(line);
    },
  };
}

export default defineConfig({
  // Relative base so the built bundle also works when served from a subpath
  // (Vercel preview folders, file listings, the harness preview server).
  base: './',
  plugins: [bundleBudget()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    // three is large; a dedicated chunk keeps the game bundle cacheable.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    strictPort: false,
  },
});
