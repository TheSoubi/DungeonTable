import {app, BrowserWindow, session} from 'electron';
import log from 'electron-log';
import path from 'path';
import {fileURLToPath} from 'url';
import {exec} from 'child_process';
import os from 'os';
import getPort from 'get-port';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const backendPort = await getPort();

let mainWindow;
let secondaryWindow;

let startBackendCmd = null;
if (os.platform() === 'win32' && isDev === false) {
    startBackendCmd = path.join(process.resourcesPath, 'bin', 'backend_server.exe') + " " + backendPort;
    log.info("Windows-packaged backend server is starting on port", backendPort);
}
else if (os.platform() === 'linux' && isDev === false) {
    startBackendCmd = path.join(process.resourcesPath, 'bin', 'backend_server') + " " + backendPort;
    log.info("Linux-packaged backend server is starting on port", backendPort);
}
else if (os.platform() === 'linux' && isDev === true) {
    log.info(`NO BACKEND IS STARTED IN DEV MODE. START MANUALLY WITH 'python src/backend/backend_server.py ${backendPort}'`)
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: "Dungeon Table",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },

    });
    mainWindow.setMenuBarVisibility(false)

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
        //mainWindow.webContents.openDevTools();
    }
}

// Fonction pour créer la fenêtre secondaire
function createSecondaryWindow(url) {
    secondaryWindow = new BrowserWindow({
        width: 600,
        height: 400,
        title: "Dungeon Table (Player's Window)",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        parent: mainWindow,
        modal: false,
    });
    secondaryWindow.setMenuBarVisibility(false)

    // Charger l'URL ou le fichier HTML de la fenêtre secondaire
    secondaryWindow.loadURL(url);
    if (isDev) {
        secondaryWindow.webContents.openDevTools();
    }

    // Fermer la fenêtre secondaire quand elle est fermée
    secondaryWindow.on('closed', () => {
        secondaryWindow = null;
    });
}

app.whenReady().then(() => {

    log.info("Starting app");

    session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://localhost/api/*"] }, (details, callback) => {
        if (!details.url.match(/http:\/\/localhost:\d+\/api\//)) {
            const newUrl = details.url.replace("http://localhost/", `http://localhost:${backendPort}/`);
            log.info("Redirecting request" , details.url, "to new url", newUrl);
            callback({ redirectURL: newUrl });
        } else {
            callback({ cancel: false });
        }
    });

    if (startBackendCmd !== null) {
        log.info("Starting backend");
        exec(startBackendCmd, (error, stdout, stderr) => {
            if (error) log.error(`Erreur: ${error.message}`);
            if (stderr) log.error(`Erreur: ${stderr}`);
            if (stdout) log.error(`Output: ${stdout}`);
        });
    }
    createMainWindow();
    // Intercepter les appels à window.open
    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        createSecondaryWindow(url);
        return {action: 'deny'}; // Empêcher l'ouverture dans le navigateur externe
    });
});

app.on('window-all-closed', () => {
    log.info("App is closing.");
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
