const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork, spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const PORT = 5000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    titleBarStyle: 'default',
    show: false,
    backgroundColor: '#0a0a0b'
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    
    let serverPath;
    let cwd;
    let env = { ...process.env };
    
    if (isDev) {
      // Development: use tsx to run TypeScript
      serverPath = path.join(__dirname, '..', 'server', 'index-local.ts');
      cwd = path.join(__dirname, '..');
      env.NODE_ENV = 'development';
      
      serverProcess = spawn('npx', ['tsx', serverPath], {
        cwd: cwd,
        shell: true,
        env: env,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      // Production: use the compiled CJS server with Electron's Node
      serverPath = path.join(process.resourcesPath, 'dist-server', 'server.cjs');
      cwd = process.resourcesPath;
      env.NODE_ENV = 'production';
      env.ELECTRON_PACKAGED = 'true';
      
      // Fork uses Electron's embedded Node.js
      serverProcess = fork(serverPath, [], {
        cwd: cwd,
        env: env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      });
      
      // Listen for ready message from server
      serverProcess.on('message', (msg) => {
        if (msg === 'ready') {
          resolve();
        }
      });
    }

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Server: ${output}`);
      if (output.includes('localhost:' + PORT) || output.includes('Server:')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      console.log(`Server exited with code ${code}`);
    });

    // Fallback resolve after 8 seconds
    setTimeout(() => resolve(), 8000);
  });
}

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const http = require('http');
    
    const checkServer = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(checkServer, 500);
        } else {
          reject(new Error('Server did not respond'));
        }
      });
      
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(checkServer, 500);
        } else {
          reject(new Error('Server connection failed'));
        }
      });
      
      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(checkServer, 500);
        }
      });
    };
    
    setTimeout(checkServer, 1000); // Wait a bit before first check
  });
}

app.whenReady().then(async () => {
  try {
    console.log('Starting Betfair Dutching...');
    console.log('App packaged:', app.isPackaged);
    console.log('Resources path:', process.resourcesPath);
    
    await startServer();
    console.log('Waiting for server to be ready...');
    await waitForServer();
    console.log('Server ready, opening window...');
    
    createWindow();
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    console.error('Failed to start:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  }
});
