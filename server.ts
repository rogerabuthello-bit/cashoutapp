import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Server-side CSV parsing (The "Bible" Sync)
  app.post('/api/audit/parse-pos', async (req, res) => {
    const { csvContent } = req.body;
    if (!csvContent) {
      return res.status(400).json({ error: 'No CSV content provided' });
    }

    try {
      // Import the parser service
      const module = await import('./src/services/csvParser.ts');
      const items = module.parsePOSCSV(csvContent);
      const summary = module.summarizeByServer(items);
      res.json({ success: true, summary });
    } catch (error) {
      console.error('CSV Parse Error:', error);
      res.status(500).json({ error: 'Internal server error during parsing' });
    }
  });

  // Vite middleware for development
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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
