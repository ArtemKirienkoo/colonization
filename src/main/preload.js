const { contextBridge, ipcRenderer } = require('electron');

// Resolve the real, non-asar file:// base for the audio assets directory so
// that <audio> can load files inside a PACKAGED build. IMPORTANT: the renderer
// is SANDBOXED (Electron >= 20) — a preload script here may only require
// `electron`, `events`, `timers` and `url`. Requiring `fs`/`path` throws and
// kills the WHOLE preload, which silently broke `window.electronAPI`
// (e.g. the main-menu "Вийти" button stopped working). The main process now
// resolves the audio base itself and passes it via
// webPreferences.additionalArguments; here we only read it from process.argv,
// keeping the API synchronous (callers: splash.html, index.html). In dev
// (electron .) the argument is empty and the renderer falls back to relative
// asset paths (which work there).
function getAudioAssetBase() {
    try {
        const marker = 'colonization-audio-base=';
        const arg = (process.argv || []).find(a => String(a).indexOf(marker) === 0);
        if (!arg) return null;
        return arg.slice(marker.length) || null;
    } catch (e) {
        return null;
    }
}

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Game menu actions
    onNewGame: (callback) => ipcRenderer.on('new-game', callback),
    onGenerateMap: (callback) => ipcRenderer.on('generate-map', callback),
    onRollDice: (callback) => ipcRenderer.on('roll-dice', callback),
    onOpenTrade: (callback) => ipcRenderer.on('open-trade', callback),

    // Game version
    getVersion: () => '1.0.0',

    // Close game
    closeGame: () => ipcRenderer.send('close-game'),

    // Multiplayer functions
    createRoom: (roomName) => ipcRenderer.invoke('create-room', roomName),
    joinRoom: (roomCode) => ipcRenderer.invoke('join-room', roomCode),
    getRoomsList: () => ipcRenderer.invoke('get-rooms-list'),
    startMultiplayerGame: () => ipcRenderer.invoke('start-multiplayer-game'),
    
    // Server info
    getServerInfo: () => ipcRenderer.invoke('get-server-info'),

    // Відкрити посилання у системному браузері (Google OAuth тощо)
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Реальний file:// шлях до assets/audio у зібраній версії (або null у dev)
    getAudioAssetBase: () => getAudioAssetBase()
});
