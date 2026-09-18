const { app, BrowserWindow, Menu, dialog, session, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');

/** Content types for the files the renderer bundle actually ships. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

let appRoot;
let mainWindow = null;

/**
 * Pin the data directory.
 *
 * app.getPath('userData') is derived from app.getName(), which reads
 * package.json's productName ?? name. Existing installs keep their data in
 * %APPDATA%/pocket-money, so anything that changes the resolved app name
 * silently relocates the folder and the app opens with no transactions in it.
 * Setting it explicitly makes the location independent of that.
 */
app.setPath('userData', path.join(app.getPath('appData'), 'pocket-money'));

// Must be called before app.whenReady() — registers 'app://' as a privileged scheme
// so IndexedDB, crypto.randomUUID, showSaveFilePicker etc. all work
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(appRoot, 'public', 'favicon.ico'),
    title: 'Pocket Money',
    show: false,
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  // Keep the clean chrome-free look, but only visually: the menu stays
  // installed so its keyboard accelerators still work, and Alt reveals it.
  win.autoHideMenuBar = true;
  win.setMenuBarVisibility(false);

  // Load via custom protocol for secure context (enables showSaveFilePicker etc.)
  win.loadURL('app://./index.html');

  win.once('ready-to-show', () => {
    win.show();
  });

  // Open any external link in the real browser rather than inside the app.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  return win;
}

/**
 * A minimal menu.
 *
 * setApplicationMenu(null) removed the menu AND the accelerators bound to the
 * standard Edit roles, so Ctrl+C / V / X / A / Z stopped working in every text
 * field — which matters a lot in an app built around typing payees and amounts.
 * The menu bar itself stays hidden; the accelerators come back.
 */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const menu = Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

/**
 * Show a native "Save As" dialog for downloads (CSV, PDF exports).
 *
 * Registered ONCE against the shared default session. It used to be registered
 * inside createWindow(), so reopening the window (the 'activate' path) added a
 * second listener and every later export prompted twice.
 */
function registerDownloadHandler() {
  session.defaultSession.on('will-download', (event, item) => {
    const defaultName = item.getFilename() || 'download';
    const ext = path.extname(defaultName).replace('.', '').toLowerCase();
    const filters = [];
    if (ext === 'csv') filters.push({ name: 'CSV files', extensions: ['csv'] });
    else if (ext === 'pdf') filters.push({ name: 'PDF documents', extensions: ['pdf'] });
    filters.push({ name: 'All files', extensions: ['*'] });

    const savePath = mainWindow && !mainWindow.isDestroyed()
      ? dialog.showSaveDialogSync(mainWindow, { defaultPath: defaultName, filters })
      : dialog.showSaveDialogSync({ defaultPath: defaultName, filters });

    if (savePath) item.setSavePath(savePath);
    else item.cancel();
  });
}

app.whenReady().then(() => {
  // app.getAppPath() resolves in every layout: the project directory in dev,
  // and resources/app.asar once packaged. The previous hardcoded
  // resources/app is where @electron/packager put an unpacked build, but
  // electron-builder produces an asar, so the packaged app served nothing.
  appRoot = app.getAppPath();

  // Logged so a relocated data folder is diagnosable rather than looking like
  // the app lost everything.
  console.log('[pocket-money] userData:', app.getPath('userData'));

  const distPath = path.join(appRoot, 'dist');

  // Register custom protocol to serve dist/ files (makes it a secure context).
  //
  // Files are read with fs rather than net.fetch(file://...): Electron patches
  // fs to see inside an asar archive, but Chromium's network stack does not,
  // so a file:// fetch cannot read the packaged bundle.
  protocol.handle('app', async (request) => {
    let filePath;
    try {
      filePath = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (filePath === '/' || filePath === '') filePath = '/index.html';

    // Containment check: without it an encoded traversal ("..%2f..") resolves
    // outside the bundle and the handler will serve any file on disk.
    const fullPath = path.resolve(distPath, '.' + filePath);
    if (fullPath !== distPath && !fullPath.startsWith(distPath + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const body = await fs.promises.readFile(fullPath);
      const type = MIME[path.extname(fullPath).toLowerCase()] || 'application/octet-stream';
      return new Response(body, { headers: { 'content-type': type } });
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
        return new Response('Not found', { status: 404 });
      }
      return new Response('Internal error', { status: 500 });
    }
  });

  buildMenu();
  registerDownloadHandler();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
