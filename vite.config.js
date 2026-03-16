import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Inject the app host into the storefront script at build time
    'REPLACE_WITH_HOST': JSON.stringify(process.env.HOST || ''),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8888',
      '/auth': 'http://localhost:8888',
    },
  },
});
