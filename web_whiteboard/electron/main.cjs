const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = process.env.PORT || 5000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Prevent multiple instances
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function checkServerReady(retries = 30, delay = 300) {
  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      http.get(`${SERVER_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      }).on('error', () => {
        if (attempts >= retries) {
          clearInterval(interval);
          resolve(false);
        }
      });
    }, delay);
  });
}

function startBackendServer() {
  const serverScript = path.join(__dirname, '../server/server.js');
  serverProcess = spawn('node', [serverScript], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: SERVER_PORT },
    stdio: 'ignore',
    detached: false
  });

  serverProcess.on('error', (err) => {
    console.warn('[Electron] Could not spawn internal node server:', err.message);
  });
}

async function createWindow() {
  // Check if server is already running (e.g. from standalone batch/service)
  const isRunning = await checkServerReady(3, 200);
  if (!isRunning) {
    startBackendServer();
    await checkServerReady(25, 300);
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 840,
    minHeight: 580,
    title: 'Collaborative Whiteboard',
    icon: path.join(__dirname, '../client/public/icon-512.png'),
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (e) {}
  }
});
