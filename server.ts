// Production entry: adapter-node handler + live WebSocket on /ws.
// Build first (`npm run build`), then `node server.ts` (Node >= 22.18 strips the types).
// PORT (default 3000) and HOST (default 0.0.0.0) as in adapter-node.

import { createServer } from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { initLiveHub } from './src/lib/server/live-init.ts';
import { rejectForeignUpgrades } from './src/lib/server/ws.ts';

// Resolved at runtime so type-checking works before the first build.
const handlerUrl = pathToFileURL(`${import.meta.dirname}/build/handler.js`).href;
const { handler } = (await import(handlerUrl)) as {
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void;
};

// DB-backed rooms, restored before the first request.
const { hub, restored, store } = await initLiveHub();

const server = createServer((req, res) => handler(req, res));
hub.attach(server);
rejectForeignUpgrades(server);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
  console.log('[server] listening', { host, port, store, restoredRooms: restored });
});

function shutdown(signal: string) {
  console.log('[server] shutting down', { signal });
  hub.rooms.dispose();
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
