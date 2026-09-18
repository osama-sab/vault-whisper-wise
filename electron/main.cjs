const { app, BrowserWindow, Menu, dialog, session, protocol, net } = require('electron');
const path = require('path');
const url = require('url');

let appRoot;

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
    },
    icon: path.join(appRoot, 'public', 'favicon.ico'),
    title: 'Pocket Money',
    show: false,
  });

  // Load via custom protocol for secure context (enables showSaveFilePicker etc.)
  win.loadURL('app://./index.html');

  win.once('ready-to-show', () => {
    win.show();
  });

  // Show native "Save As" dialog for all downloads (CSV, PDF exports)
  session.defaultSession.on('will-download', (event, item) => {
    const defaultName = item.getFilename() || 'download';
    const ext = path.extname(defaultName).replace('.', '');
    const filters = [];
    if (ext === 'csv') filters.push({ name: 'CSV files', extensions: ['csv'] });
    else if (ext === 'pdf') filters.push({ name: 'PDF documents', extensions: ['pdf'] });
    filters.push({ name: 'All files', extensions: ['*'] });

    const savePath = dialog.showSaveDialogSync(win, {
      defaultPath: defaultName,
      filters,
    });

    if (savePath) {
      item.setSavePath(savePath);
    } else {
      item.cancel();
    }
  });

  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');

  // Register custom protocol to serve dist/ files (makes it a secure context)
  protocol.handle('app', (request) => {
    const distPath = path.join(appRoot, 'dist');
    let filePath = new URL(request.url).pathname;
    // Remove leading slash on Windows
    filePath = decodeURIComponent(filePath);
    if (filePath === '/' || filePath === '') filePath = '/index.html';
    const fullPath = path.join(distPath, filePath);
    return net.fetch(url.pathToFileURL(fullPath).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
