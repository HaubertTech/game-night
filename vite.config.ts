import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/** Live rooms over WebSocket on /ws, attached to the dev and preview http servers. */
function liveWs(): Plugin {
  return {
    name: 'domaci-liga-live-ws',
    async configureServer(server) {
      if (!server.httpServer) return;
      const { initLiveHub } = await import('./src/lib/server/live-init.ts');
      const { hub } = await initLiveHub();
      hub.attach(server.httpServer as import('node:http').Server);
    },
    async configurePreviewServer(server) {
      const { initLiveHub } = await import('./src/lib/server/live-init.ts');
      const { hub } = await initLiveHub();
      hub.attach(server.httpServer as import('node:http').Server);
    },
  };
}

/**
 * Content Security Policy for the built app (SvelteKit adds nonces/hashes for its own scripts).
 * Not in dev: Vite injects inline scripts and its HMR client there.
 * Inline styles stay allowed: Svelte style directives and transitions write style attributes.
 */
const csp = {
  mode: 'auto' as const,
  directives: {
    'default-src': ['self' as const],
    'script-src': ['self' as const],
    'style-src': ['self' as const, 'unsafe-inline' as const],
    'img-src': ['self' as const, 'data:' as const, 'blob:' as const],
    'font-src': ['self' as const, 'data:' as const],
    'media-src': ['self' as const, 'blob:' as const],
    // Live rooms talk over a same-origin WebSocket (/ws); older Safari does not match ws: by 'self'.
    'connect-src': ['self' as const, 'ws:' as const, 'wss:' as const],
    'object-src': ['none' as const],
    'base-uri': ['self' as const],
    'form-action': ['self' as const],
    'frame-ancestors': ['none' as const],
    'worker-src': ['self' as const],
    'manifest-src': ['self' as const],
  },
};

export default defineConfig(({ command }) => ({
  plugins: [sveltekit({ adapter: adapter(), ...(command === 'build' ? { csp } : {}) }), liveWs()],
  // 5173 belongs to the tablet version running from the main checkout.
  server: { port: 5180, strictPort: true },
}));
