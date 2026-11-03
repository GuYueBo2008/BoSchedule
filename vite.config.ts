import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createSyncApiHandler, startDiscoveryResponder } from './sync-server.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'boschedule-lan-sync',
      configureServer(server) {
        server.middlewares.use(createSyncApiHandler());
        const startDiscovery = () => {
          const address = server.httpServer?.address();
          if (!address || typeof address === 'string') return;
          const responder = startDiscoveryResponder(address.port);
          server.httpServer?.once('close', () => responder.close());
        };
        if (server.httpServer?.listening) startDiscovery();
        else server.httpServer?.once('listening', startDiscovery);
      },
    },
  ],
  server: { host: '0.0.0.0', port: 5173 },
});
