import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, shell } from 'electron';
import { startServer } from '../server.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

async function pickPort() {
  try {
    return (await startServer(4173, '0.0.0.0')).address().port;
  } catch {
    return (await startServer(0, '0.0.0.0')).address().port;
  }
}

async function createWindow() {
  const port = await pickPort();
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 520,
    minHeight: 560,
    backgroundColor: '#f3f1ea',
    autoHideMenuBar: true,
    title: '波日程 BoSchedule',
    icon: path.join(root, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
