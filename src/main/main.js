const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Use a custom userData path to avoid cache conflicts between instances
// This also prevents the "Unable to move the cache: Access is denied" warnings
const devInstance = process.argv.includes('--dev-instance');
if (devInstance) {
    app.setPath('userData', path.join(app.getPath('appData'), 'Colonization-Dev'));
}

// Дозволяємо автоплей аудіо (фонова музика меню грає одразу після запуску гри,
// без вимоги першого кліку користувача — стандартна поліція браузера тут зайва,
// бо це десктопний застосунок)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Keep a global reference of the window object
let mainWindow;
let serverProcess = null;
let serverInfo = {
    publicUrl: null,
    localUrl: null
};

// Start the multiplayer server
function startServer() {
    const { startServer: startMPServer, getPublicIp, getLocalIp } = require('./server-unified.js');
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

// Resolve the real, non-asar file:// base for the audio assets directory so
// that <audio> can load files inside a PACKAGED build (Chromium's media stack
// cannot read audio/video from inside app.asar). This MUST run in the main
// process: the renderer is SANDBOXED (Electron >= 20), so preload scripts may
// only require `electron`/`events`/`timers`/`url` — `fs`/`path` would throw and
// kill the whole preload. The resolved base is handed to the sandboxed preload
// via webPreferences.additionalArguments and read there from process.argv
// (getAudioAssetBase stays synchronous for the renderer). In dev (electron .)
// it returns null and the renderer falls back to relative asset paths.
function resolveAudioAssetBase() {
    try {
        const res = process.resourcesPath;
        if (!res) return null;
        // 1) asarUnpack — аудіо розпаковано в app.asar.unpacked/assets/audio
        const unpacked = path.join(res, 'app.asar.unpacked', 'assets', 'audio');
        if (fs.existsSync(unpacked)) {
            return pathToFileURL(unpacked).href.replace(/\/$/, '') + '/';
        }
        // 2) extraResources — аудіо скопійовано в resources/assets/audio
        const er = path.join(res, 'assets', 'audio');
        if (fs.existsSync(er)) {
            return pathToFileURL(er).href.replace(/\/$/, '') + '/';
        }
    } catch (e) {}
    return null;
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
            enableRemoteModule: false,
            // Передаємо готовий file:// шлях до аудіо в sandboxed preload
            // (рендер-процес не може сам нічого перевіряти на диску).
            additionalArguments: ['colonization-audio-base=' + (resolveAudioAssetBase() || '')]
        }
    });

    // Load the splash screen (main menu) first
    mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'splash.html'));

    // Forward renderer diagnostics to terminal: [AUDIO]-tags and errors.
    // Показує точну причину, чому музика не стартувала (файл, декодер, політика).
    mainWindow.webContents.on('console-message', (_e, level, message) => {
        try {
            const s = String(message);
            if (s.includes('[AUDIO]') || level >= 3) {
                console.log('[renderer]', s);
            }
        } catch (_) {}
    });

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
    let _allowClose = false;
    mainWindow.on('close', (e) => {
        if (_allowClose) return;
        e.preventDefault();
        // Даємо рендереру шанс повідомити сервер про вихід із мультиплеєрної
        // кімнати (leave-room), щоб кімната хазяїна закривалась МИТТЄВО,
        // а не через 1-хвилинний grace-таймер. Якщо сторінка не відповість —
        // все одно закриваємось за 300мс.
        try {
            mainWindow.webContents.executeJavaScript(
                'try { typeof window.__exitMultiplayer === "function" && window.__exitMultiplayer(); } catch(_){}'
            ).catch(() => {}).finally(() => {
                setTimeout(() => {
                    _allowClose = true;
                    mainWindow.close();
                }, 180);
            });
        } catch (_) {
            setTimeout(() => {
                _allowClose = true;
                mainWindow.close();
            }, 180);
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    
    // Expose server info to renderer
    ipcMain.handle('get-server-info', () => {
        return serverInfo;
    });

    // Відкриття зовнішніх посилань (наприклад, Google OAuth) у системному браузері
    ipcMain.handle('open-external', (_event, url) => {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            return shell.openExternal(url);
        }
        throw new Error('Дозволені тільки http(s)-посилання');
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
