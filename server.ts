import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // Proxy for EUMETView WMS to bypass CORS for canvas processing
  app.get('/api/wms', async (req, res) => {
    const eumetsatUrl = new URL('https://view.eumetsat.int/geoserver/ows');
    Object.entries(req.query).forEach(([key, value]) => {
      eumetsatUrl.searchParams.append(key, value as string);
    });

    try {
      const response = await fetch(eumetsatUrl.toString());
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      res.set('Content-Type', response.headers.get('content-type') || 'image/png');
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch (error) {
      console.error('WMS Proxy Error:', error);
      res.status(500).send('Error proxying WMS');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
