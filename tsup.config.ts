import { defineConfig } from 'tsup';

export default defineConfig([
  // ── Node.js builds (ESM + CJS, tree-shakeable) ──────────────────────────
  {
    entry: {
      index: 'src/index.ts',
      'cache/index': 'src/cache/index.ts',
      'logger/index': 'src/logger/index.ts',
      'retry/index': 'src/retry/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    outDir: 'dist',
  },

  // ── Browser CDN build (IIFE — exposes window.rezilia) ───────────────────
  {
    entry: {
      'browser/rezilia': 'src/browser.ts',
    },
    format: ['iife'],
    globalName: 'rezilia',
    platform: 'browser',
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    outDir: 'dist',
    outExtension: () => ({ js: '.js' }),
  },

  // ── Browser CDN build — minified version ────────────────────────────────
  {
    entry: {
      'browser/rezilia.min': 'src/browser.ts',
    },
    format: ['iife'],
    globalName: 'rezilia',
    platform: 'browser',
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: true,
    outDir: 'dist',
    outExtension: () => ({ js: '.js' }),
  },
]);import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cache/index': 'src/cache/index.ts',
    'logger/index': 'src/logger/index.ts',
    'retry/index': 'src/retry/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  outDir: 'dist',
});
