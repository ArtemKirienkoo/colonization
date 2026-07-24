const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Use a custom userData path to avoid cache conflicts between instances
// This also prevents the "Unable to move the cache: Access is denied" warnings
const devInstance = process.argv.includes('--dev-instance');
if (devInstance) {
    app.setPath('userData', path.join(app.getPath('appData'), 'Colonization-Dev'));
}

// Keep a global reference of the window object
let mainWindow;
let serverProcess = null;
let serverInfo = {
    publicUrl: null,
    localUrl: null
};

// Start the multiplayer server
function startServer() {
    const { startServer: startMPServer, getPublicIp, getLocalIp } = require('./server.js');
    startMPServer();
    
    // Get server URLs after a longer delay to ensure server is fully ready
    setTimeout(() => {
        const localIp = getLocalIp();
        serverInfo.localUrl = `http://${localIp}:3000`;
        
        getPublicIp().then(publicIp => {
            if (publicIp) {
                serverInfo.publicUrl = `http://${publicIp}:3000`;
            }
        });
    }, 3000); // Increased to 3 seconds to ensure server is fully ready
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: 'Colonization',
        icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png'),
        backgroundColor: '#1a1a2e',
        show: false,
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false
        }
    });

    // Load the splash screen (main menu) first
    mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'splash.html'));

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Remove default menu bar (no "Гра", "Дії", "Вид", "Довідка")
    Menu.setApplicationMenu(null);

    // Handle close-game request from renderer
    ipcMain.on('close-game', () => {
        mainWindow.close();
    });

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    
    // Expose server info to renderer
    ipcMain.handle('get-server-info', () => {
        return serverInfo;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    // Local server is disabled - using cloud server only (https://colonization.onrender.com)
    // startServer(); // Disabled: only cloud multiplayer is supported
    createWindow();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
