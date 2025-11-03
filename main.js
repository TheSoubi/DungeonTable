import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let secondaryWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },

  });
  mainWindow.setMenuBarVisibility(false)

  // Charger l'URL de développement ou le fichier de production
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // Ouvrir les outils de développement
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// Fonction pour créer la fenêtre secondaire
function createSecondaryWindow(url) {
  secondaryWindow = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    parent: mainWindow,
    modal: false,
  });

  // Charger l'URL ou le fichier HTML de la fenêtre secondaire
  secondaryWindow.loadURL(url);
  
  // Fermer la fenêtre secondaire quand elle est fermée
  secondaryWindow.on('closed', () => {
    secondaryWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  // Intercepter les appels à window.open
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    createSecondaryWindow(url);
    return { action: 'deny' }; // Empêcher l'ouverture dans le navigateur externe
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, recreate window when dock icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
