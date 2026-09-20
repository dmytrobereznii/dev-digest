import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown: on SIGTERM/SIGINT close the server, which runs the
  // onClose hooks (drains in-flight requests/SSE, closes the postgres pool).
  // Guarded so a second signal during shutdown doesn't double-close.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received — shutting down`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'error during shutdown');
      process.exit(1);
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    // `process.once` expects a void-returning listener; hand it the promise
    // explicitly rather than passing an async function it would drop.
    process.once(signal, () => void shutdown(signal));
  }

  try {
    await app.listen({ port: config.apiPort, host: config.apiHost });
    app.log.info(
      `DevDigest API listening on http://${config.apiHost}:${config.apiPort}` +
        (config.apiHost === '127.0.0.1' ? '' : ' — reachable from the network (API_HOST)'),
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
