import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/app',
  publicDir: '../../public',
  envDir: '../..',
  plugins: [react()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: { port: 3150, strictPort: true },
  preview: { port: 3151, strictPort: true },
});
