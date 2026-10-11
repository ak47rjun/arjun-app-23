/**
 * ARJUN server entrypoint — Next.js + Socket.IO realtime + background job runner
 * on a single HTTP server. Run with: npm run dev  (tsx server.ts)
 */
import './src/lib/env-bootstrap'; // must be first: loads .env before env.ts validates
import { createServer } from 'http';
import next from 'next';
import { attachRealtime } from './src/server/realtime';
import { startJobRunner } from './src/server/jobs';
import { env } from './src/lib/env';

const dev = env.NODE_ENV !== 'production';
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    void handle(req, res);
  });

  // Attaching also registers this Socket.IO instance with the shared realtime
  // fan-out (src/lib/realtime/server.ts), so route handlers push through it.
  attachRealtime(server);

  startJobRunner();

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`▲ ARJUN — The Real Trader's Hub  →  ${env.APP_URL}`);
  });
});
