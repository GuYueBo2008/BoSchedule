import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createSyncApiHandler } from './sync-server.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'boschedule-lan-sync',
      configureServer(server) {
        server.middlewares.use(createSyncApiHandler());
      },
    },
  ],
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split lucide-react icons into their own chunk — it pulls ~700+ icon
          // components that are only referenced from the main bundle.
          icons: ['lucide-react'],
          // html-to-image is a PDF/image renderer used only for share-to-PNG.
          'html-to-image': ['html-to-image'],
        },
      },
    },
  },
});
