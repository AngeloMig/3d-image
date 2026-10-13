import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { mockShopify } from './mock-shopify';

export default defineConfig({
  plugins: [
    preact(),
    {
      // Dev-only mock of the Shopify Ajax cart + app proxy for /shopify-sim.html and e2e tests.
      name: 'mock-shopify',
      configureServer(server) {
        server.middlewares.use(mockShopify());
      },
      configurePreviewServer(server) {
        server.middlewares.use(mockShopify());
      },
    },
  ],
  base: './',
  // Pre-bundle everything up front so Vite never re-optimizes mid-session (which would load a
  // second copy of Preact and break hooks during development).
  optimizeDeps: {
    include: [
      'preact',
      'preact/hooks',
      'preact/debug',
      'preact/jsx-dev-runtime',
      'three',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/controls/OrbitControls.js',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/libs/meshopt_decoder.module.js',
    ],
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'shopify-sim': resolve(__dirname, 'shopify-sim.html'),
      },
    },
  },
});
