/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// The Dead Zone server listens on 8787; in dev we proxy /ws to it so the client
// can always connect to the same origin it was served from.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    // The ship art rides inside the bundle, so the single-file build carries it.
    assetsInlineLimit: 8 * 1024 * 1024,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
