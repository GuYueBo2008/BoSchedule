import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createSyncApiHandler } from './sync-server.mjs';
import { createMediaApiHandler } from './media-server.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'boschedule-lan-sync',
      configureServer(server) {
        server.middlewares.use(createSyncApiHandler());
        server.middlewares.use(createMediaApiHandler());
      },
    },
  ],
  server: { host: '0.0.0.0', port: 5173 },
});
