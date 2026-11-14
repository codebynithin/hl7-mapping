const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const hl7MappingRoutes = require('./routes/hl7-mapping.routes');
const hl7MessageRoutes = require('./routes/hl7-message.routes');
const { notFound, errorHandler } = require('./middleware/error-handler');

const DEFAULT_STATIC_ROOT = path.join(__dirname, '../../frontend/dist/frontend');

/** Angular's application builder writes either `<output>/browser` or `<output>`. */
function resolveStaticDir(explicit) {
  if (explicit) return explicit;
  const browser = path.join(DEFAULT_STATIC_ROOT, 'browser');
  if (fs.existsSync(path.join(browser, 'index.html'))) return browser;
  if (fs.existsSync(path.join(DEFAULT_STATIC_ROOT, 'index.html'))) return DEFAULT_STATIC_ROOT;
  return null;
}

function createApp({
  corsOrigin = process.env.CORS_ORIGIN || `http://localhost:${process.env.FRONTEND_PORT || 4200}`,
  staticDir = resolveStaticDir(process.env.STATIC_DIR),
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/hl7-mapping', hl7MappingRoutes);
  app.use('/api/hl7-message', hl7MessageRoutes);

  if (staticDir) {
    app.use(express.static(staticDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}index.html`)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(staticDir, 'index.html'), (err) => err && next(err));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
