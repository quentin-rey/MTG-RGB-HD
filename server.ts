import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

async function startServer() {
  const app = express();

  app.use(cors());

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0');

  // Success is reported from the 'listening' event, not from `listen`'s callback: Express 5 runs
  // that callback whether or not the bind succeeded, so the previous shape announced
  // "Server running on http://localhost:3000" and then, on the next line, that the port was
  // already taken. Raw `net`/`http` servers do not behave this way, which is what makes it easy
  // to write and hard to notice.
  server.on('listening', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // `listen` reports its failures on the server object rather than by throwing: without a handler
  // here an EADDRINUSE surfaces as an unhandled 'error' event, which Node turns into a raw stack
  // trace with no mention of the port — the single most likely thing to go wrong when starting
  // this, and the one worth naming out loud.
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the process holding it, or free the port, then try again.`);
    } else if (error.code === 'EACCES') {
      console.error(`Not allowed to bind port ${PORT}.`);
    } else {
      console.error('The server could not start:', error);
    }
    process.exit(1);
  });

  return server;
}

// Without this, a rejection here (Vite failing to build its dev server, a missing dist/) became an
// unhandled rejection: the process still died, but on a stack trace rather than on a sentence, and
// with an exit code that depended on the Node version rather than on us.
startServer().catch((error) => {
  console.error('The server could not start:', error);
  process.exit(1);
});
