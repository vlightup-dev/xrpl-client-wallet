import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-content-script',
      closeBundle() {
        // Copy content scripts to dist after build
        copyFileSync('public/content.js', 'dist/content.js');
        copyFileSync('public/pageWorld.js', 'dist/pageWorld.js');
      }
    }
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  publicDir: 'public',
});
