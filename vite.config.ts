import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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