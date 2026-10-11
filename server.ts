/**
 * ARJUN server entrypoint — Next.js + Socket.IO realtime + background job runner
 * on a single HTTP server. Run with: npm run dev  (tsx server.ts)
 */
import './src/lib/env-bootstrap'; // must be first: loads .env before env.ts validates
import { createServer } from 'http';
import next from 'next';
import { attachRealtime, emitToUser } from './src/server/realtime';
import { startJobRunner } from './src/server/jobs';
import { registerNotificationEmitter } from './src/lib/notifications/service';
import { env } from './src/lib/env';

const dev = env.NODE_ENV !== 'production';
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    void handle(req, res);
  });

  const io = attachRealtime(server);
  registerNotificationEmitter((room, event, payload) => {
    if (room.startsWith('user:')) emitToUser(room.slice(5), event, payload);
    else io.to(room).emit(event, payload);
  });

  startJobRunner();

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`▲ ARJUN — The Real Trader's Hub  →  ${env.APP_URL}`);
  });
});
