import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/** Live rooms over WebSocket on /ws, attached to the dev and preview http servers. */
function liveWs(): Plugin {
  return {
    name: 'domaci-liga-live-ws',
    async configureServer(server) {
      if (!server.httpServer) return;
      const { getLiveHub } = await import('./src/lib/server/ws.ts');
      getLiveHub().attach(server.httpServer as import('node:http').Server);
    },
    async configurePreviewServer(server) {
      const { getLiveHub } = await import('./src/lib/server/ws.ts');
      getLiveHub().attach(server.httpServer as import('node:http').Server);
    },
  };
}

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() }), liveWs()],
  // 5173 belongs to the tablet version running from the main checkout.
  server: { port: 5180, strictPort: true },
});
