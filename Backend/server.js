import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeVoronoiWithClipping } from './voronoiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const FRONTEND_DIR = path.join(__dirname, '..', 'Frontend');

console.log('Setting up static middleware for Frontend directory:', FRONTEND_DIR);
const mapHtmlPath = path.join(FRONTEND_DIR, 'map.html');
const indexHtmlPath = path.join(FRONTEND_DIR, 'index.html');
console.log('Frontend exists:', existsSync(FRONTEND_DIR));
console.log('map.html exists:', existsSync(mapHtmlPath));
console.log('index.html exists:', existsSync(indexHtmlPath));
if (!existsSync(FRONTEND_DIR)) {
  console.error('ERROR: Frontend directory not found at', FRONTEND_DIR);
}

const stylesDir = path.join(__dirname, '..', 'Frontend', 'styles');
const imagesDir = path.join(__dirname, '..', 'Frontend', 'images');
console.log('styles directory exists:', existsSync(stylesDir));
console.log('images directory exists:', existsSync(imagesDir));

app.use((req, res, next) => {  
  if (!req.path.startsWith('/api/') && req.method === 'GET') {
    console.log('StaticFile Request:', req.path);
  }
  next();
});

app.use(express.static(FRONTEND_DIR, {
  index: false,
  extensions: ['html', 'js', 'css', 'json', 'geojson'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      console.log('  -> Serving JS:', filePath);
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      console.log('  -> Serving CSS:', filePath);
    } else if (filePath.endsWith('.json') || filePath.endsWith('.geojson')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      console.log('  -> Serving JSON/GeoJSON:', filePath);
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      console.log('  -> Serving HTML:', filePath);
    } else if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filePath)) {
      console.log('  -> Serving Image:', filePath);
    }
  }
}));

app.use('/styles', express.static(stylesDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    console.log('  -> Serving CSS from Frontend:', filePath);
  }
}));

app.use('/images', express.static(imagesDir, {
  setHeaders: (res, filePath) => {
    console.log('  -> Serving Image from Frontend:', filePath);
  }
}));

let oblastGeoJSON = { type: 'FeatureCollection', features: [] };
let obstaclesGeoJSON = { type: 'FeatureCollection', features: [] };

async function loadGeoJsonSafe(relativePath) {
  try {
    const abs = path.join(__dirname, '..', relativePath);
    const raw = await fs.readFile(abs, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Could not load ${relativePath}:`, err?.message || err);
    return { type: 'FeatureCollection', features: [] };
  }
}

await (async () => {
  oblastGeoJSON = await loadGeoJsonSafe('oblast.geojson');
  obstaclesGeoJSON = await loadGeoJsonSafe('obstacles.geojson');
})();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.post('/api/voronoi', async (req, res) => {
  try {
    const payload = req.body;
    const shoppingCenters = Array.isArray(payload) ? payload : payload?.shoppingCenters;

    if (!Array.isArray(shoppingCenters) || shoppingCenters.length === 0) {
      return res.status(400).json({ error: 'shoppingCenters must be a non-empty array' });
    }

    const result = await computeVoronoiWithClipping(shoppingCenters, oblastGeoJSON, obstaclesGeoJSON);
    if (!result) return res.status(500).json({ error: 'Voronoi computation returned no data' });
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/voronoi:', err?.stack || err);
    return res.status(500).json({ error: err?.message || 'Failed to compute Voronoi' });
  }
});

app.get('/', (req, res) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  const mapPath = path.join(FRONTEND_DIR, 'map.html');

  console.log('GET / -> attempting to serve', indexPath);
  res.sendFile(indexPath, (err) => {
    if (!err) {
      console.log('Served', indexPath);
      return;
    }
    console.warn('index.html not served, trying map.html:', err?.message || err);
    console.log('GET / -> attempting to serve', mapPath);
    res.sendFile(mapPath, (err2) => {
      if (!err2) {
        console.log('Served', mapPath);
        return;
      }
      console.error('Failed to serve frontend root page with index and map:', err2);
      res.status(500).send('Failed to load frontend');
    });
  });
});

app.get('*', (req, res, next) => {
  
  if (req.path.startsWith('/api/')) return next();

  
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  const mapPath = path.join(FRONTEND_DIR, 'map.html');
  console.log(`SPA fallback for ${req.path} -> trying ${indexPath}`);
  res.sendFile(indexPath, (err) => {
    if (!err) {
      console.log('SPA served', indexPath);
      return;
    }
    console.warn('SPA index not served, trying map.html:', err?.message || err);
    res.sendFile(mapPath, (err2) => {
      if (!err2) {
        console.log('SPA served', mapPath);
        return;
      }
      console.error('SPA fallback failed to send page:', err2);
      return res.status(500).send('Failed to load frontend');
    });
  });
});

app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
  console.log(`Serving static frontend from ${FRONTEND_DIR}`);
  console.log('API endpoints: GET /api/health, POST /api/voronoi');
});

export default app;