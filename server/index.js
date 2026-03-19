import express from 'express';
import http from 'http';
import { HOST, PORT, OPENCLAW_DIR, DATA_DIR } from './config.js';
import { setupWebSocket } from './broadcast.js';
import { setupMiddleware } from './middleware.js';
import router from './routes.js';

const app = express();
const server = http.createServer(app);

setupWebSocket(server);
setupMiddleware(app);
app.use(router);

if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
  console.warn(
    `\x1b[33m[WARN]\x1b[0m HOST is set to ${HOST}. Dashboard is exposed beyond localhost.`
  );
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  \x1b[35m⚡ OpenClawBoard\x1b[0m');
  console.log('');
  console.log(`  Dashboard:    \x1b[36mhttp://${HOST}:${PORT}\x1b[0m`);
  console.log(`  OpenClaw dir: \x1b[90m${OPENCLAW_DIR}\x1b[0m`);
  console.log(`  Data dir:     \x1b[90m${DATA_DIR}\x1b[0m`);
  console.log('');

});
