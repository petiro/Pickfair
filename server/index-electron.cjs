// Production server for Electron (CommonJS)
const express = require('express');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Determine paths based on whether we're packaged or in development
const isPackaged = process.env.ELECTRON_PACKAGED === 'true';
const basePath = isPackaged ? process.resourcesPath : __dirname;

// Simple logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple user endpoint (no auth needed for local)
app.get('/api/auth/user', (req, res) => {
  res.json({
    id: 'local-user',
    email: 'utente@locale.it',
    firstName: 'Utente',
    lastName: 'Locale',
    profileImageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

// Serve static files from dist
const distPath = isPackaged 
  ? path.join(process.resourcesPath, 'dist', 'public')
  : path.join(__dirname, '..', 'dist', 'public');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.error('Static files not found at:', distPath);
  app.get('*', (req, res) => {
    res.status(500).send('Application not built. Run npm run build first.');
  });
}

const port = 5000;
const server = createServer(app);

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('========================================');
  console.log('  BETFAIR DUTCHING - RISULTATI ESATTI');
  console.log('========================================');
  console.log('');
  console.log(`  Server: http://localhost:${port}`);
  console.log('========================================');
  console.log('');
  
  // Signal to parent process that server is ready
  if (process.send) {
    process.send('ready');
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
