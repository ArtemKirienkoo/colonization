// Multiplayer Client for Colonization
// This file handles the multiplayer connection and game state synchronization

class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.isHost = false;
        this.playerName = 'Гравець';
        this.players = [];
        this.connected = false;
    }

    // Connect to server
    connect(serverUrl = 'http://localhost:3000') {
        if (typeof io === 'undefined') {
            console.error('Socket.IO client not loaded');
            return Promise.reject('Socket.IO not loaded');
        }

        this.socket = io(serverUrl);

        return new Promise((resolve, reject) => {
            this.socket.on('connect', () => {
                this.connected = true;
                console.log('Connected to server:', this.socket.id);
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                reject(error);
            });
        });
    }

    // Create a new room
    createRoom(roomName, playerName, maxPlayers) {
        this.playerName = playerName || 'Гравець';
        this.isHost = true;

        return new Promise((resolve, reject) => {
            this.socket.emit('create-room', { roomName, playerName: this.playerName, maxPlayers });

            const onRoomCreated = (data) => {
                this.roomCode = data.roomCode;
                this.players = data.players;
                this.socket.off('room-created', onRoomCreated);
                this.socket.off('join-error', onJoinError);
                resolve(data);
            };

            const onJoinError = (error) => {
                this.socket.off('room-created', onRoomCreated);
                this.socket.off('join-error', onJoinError);
                reject(error.message);
            };

            this.socket.on('room-created', onRoomCreated);
            this.socket.on('join-error', onJoinError);
        });
    }

    // Join an existing room
    joinRoom(roomCode, playerName) {
        this.playerName = playerName || 'Гравець';
        this.roomCode = roomCode.toUpperCase();

        return new Promise((resolve, reject) => {
            this.socket.emit('join-room', { roomCode: this.roomCode, playerName: this.playerName });

            const onRoomJoined = (data) => {
                this.players = data.players;
                this.socket.off('room-joined', onRoomJoined);
                this.socket.off('join-error', onJoinError);
                resolve(data);
            };

            const onJoinError = (error) => {
                this.socket.off('room-joined', onRoomJoined);
                this.socket.off('join-error', onJoinError);
                reject(error.message);
            };

            this.socket.on('room-joined', onRoomJoined);
            this.socket.on('join-error', onJoinError);
        });
    }

    // Get list of active rooms
    getRoomsList() {
        return new Promise((resolve) => {
            this.socket.emit('get-rooms');
            const onRoomsList = (rooms) => {
                this.socket.off('rooms-list', onRoomsList);
                resolve(rooms);
            };
            this.socket.on('rooms-list', onRoomsList);
        });
    }

    // Start the game (host only)
    startGame() {
        if (!this.isHost) return;
        this.socket.emit('start-game', { roomCode: this.roomCode });
    }

    // Store map state (host sends map to server)
    storeMap(mapData) {
        if (!this.isHost) return;
        this.socket.emit('store-map', { roomCode: this.roomCode, mapData });
    }

    // Send game action to other players
    sendGameAction(action, data) {
        this.socket.emit('game-action', {
            roomCode: this.roomCode,
            action,
            data
        });
    }

    // Handle incoming game actions
    onGameAction(callback) {
        this.socket.on('game-action', callback);
    }

    // Handle player joined
    onPlayerJoined(callback) {
        this.socket.on('player-joined', callback);
    }

    // Handle player left
    onPlayerLeft(callback) {
        this.socket.on('player-left', callback);
    }

    // Handle game started
    onGameStarted(callback) {
        this.socket.on('game-started', callback);
    }

    // Handle room closed (host left)
    onRoomClosed(callback) {
        this.socket.on('room-closed', callback);
    }

    // Disconnect from server
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultiplayerClient;
} else {
    window.MultiplayerClient = MultiplayerClient;
}