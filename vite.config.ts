import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Required for SharedArrayBuffer support
    crossOriginIsolation(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Don't exclude onnxruntime-web - let Vite handle it
    include: ['onnxruntime-web'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          onnx: ['onnxruntime-web'],
          osmd: ['opensheetmusicdisplay'],
        },
      },
    },
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Allow serving files from node_modules for ONNX WASM
      allow: ['..'],
    },
  },
});
