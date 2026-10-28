import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, screen, shell } from 'electron';
import { startServer } from '../server.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let mainWindow = null;
let webServer = null;

async function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(workArea.width, Math.max(380, Math.round(Math.min(1440, workArea.width * 0.92))));
  const height = Math.min(workArea.height, Math.max(640, Math.round(Math.min(960, workArea.height * 0.92))));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 380,
    minHeight: 640,
    show: false,
    backgroundColor: '#f7f9f5',
    autoHideMenuBar: true,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: { color: '#00000000', symbolColor: '#6f7b73', height: 40 },
          roundedCorners: true,
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    try {
      webServer = await startServer(4173);
    } catch {
      webServer = await startServer(0);
    }
    const port = webServer.address().port;
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  } catch {
    await mainWindow.loadFile(path.join(root, 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  webServer?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
