import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { apiMiddleware } from './server/app.ts';

function apiServerPlugin(): Plugin {
  return {
    name: 'api-server-plugin',
    configureServer(server) {
      server.middlewares.use(apiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), apiServerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'dexie-vendor': ['dexie', 'dexie-react-hooks'],
          'fflate-vendor': ['fflate'],
          'papaparse-vendor': ['papaparse'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: false,
  },
});