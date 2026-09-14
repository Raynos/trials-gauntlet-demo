import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built bundle also works when served from a subpath
  // (Vercel preview folders, file listings, the harness preview server).
  base: './',
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
