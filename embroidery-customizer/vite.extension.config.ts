/**
 * Builds the storefront bundle for the Shopify theme app extension:
 *   embroidery-loader.js        tiny bootstrapper (included by the Liquid block / app embed)
 *   embroidery-configurator.js  Preact + Three.js configurator, lazy-imported by the loader
 *   embroidery-*.woff2          embroidery fonts (resolved relative to the module URL)
 * Theme app extension assets are a flat folder, so names are fixed and prefixed.
 */
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

const outDir = process.env.EMBROIDERY_OUT_DIR ?? 'extensions/embroidery-customizer/assets';

export default defineConfig({
  plugins: [preact()],
  base: './',
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2020',
    sourcemap: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        'embroidery-loader': resolve('packages/configurator/src/shopify/loader.ts'),
        'embroidery-configurator': resolve('packages/configurator/src/shopify/entry.tsx'),
      },
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'embroidery-chunk-[name].js',
        assetFileNames: 'embroidery-[name][extname]',
      },
    },
  },
});
