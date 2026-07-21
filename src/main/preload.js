const { contextBridge, ipcRenderer } = require('electron');

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
    getServerInfo: () => ipcRenderer.invoke('get-server-info')
});
