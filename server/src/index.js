// Development entry point: runs the API on a fixed port for the Vite dev server / Electron in dev mode.
import { startServer } from './server.js';
import { PORT, APP_NAME } from './config.js';

const accessToken = process.env.SYNCHRONIA_ACCESS_TOKEN || undefined;
const srv = await startServer({ port: PORT, accessToken });
console.log(`${APP_NAME} API on http://127.0.0.1:${srv.port}  (database: ${srv.dbPath})`);
if (!process.env.SYNCHRONIA_ACCESS_TOKEN) {
  console.log(`Open in a browser for debugging: http://127.0.0.1:${srv.port}/api/open?token=${srv.accessToken}`);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => srv.close().then(() => process.exit(0)));
