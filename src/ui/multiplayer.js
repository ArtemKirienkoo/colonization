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
            return Promise.reject('Socket.IO клієнт не завантажений');
        }

        console.log('Підключення до сервера:', serverUrl);
        
        // Configure Socket.IO with better error handling and retry logic
        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 20,
            reconnectionDelay: 3000,
            reconnectionDelayMax: 15000,
            timeout: 30000,
            forceNew: true,
            upgrade: true,
            allowUpgrade: true
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('Таймаут підключення після 30 секунд');
                if (this.socket) {
                    this.socket.disconnect();
                }
                reject(new Error('Таймаут підключення. Можливі причини:\n1. Сервер не запущений\n2. Фаєрвол блокує порт 3000\n3. Неправильна адреса сервера'));
            }, 30000);

            this.socket.on('connect', () => {
                clearTimeout(timeout);
                this.connected = true;
                console.log('Підключено до сервера:', this.socket.id);
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Помилка підключення:', error);
                // Provide helpful error messages
                if (error.message) {
                    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                        clearTimeout(timeout);
                        reject(new Error('Таймаут підключення. Сервер не відповідає.'));
                    } else if (error.message.includes('ECONNREFUSED')) {
                        clearTimeout(timeout);
                        reject(new Error('Відмовлено в підключенні. Перевірте, чи запущений сервер на порту 3000.'));
                    } else if (error.message.includes('websocket')) {
                        console.warn('WebSocket помилка, спробуємо polling...');
                        // Don't reject, let it try polling
                    }
                }
            });

            this.socket.on('reconnect_attempt', (attempt) => {
                console.log('Спроба перепідключення:', attempt);
            });

            this.socket.on('reconnect_failed', () => {
                clearTimeout(timeout);
                console.error('Не вдалося перепідключитися');
                reject(new Error('Не вдалося підключитися до сервера після 20 спроб.\nПеревірте:\n1. Сервер запущений (npm start)\n2. Порт 3000 не заблокований фаєрволом\n3. Обидва гравці в одній мережі (для локальної гри)'));
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Відключено:', reason);
                this.connected = false;
            });

            this.socket.on('error', (error) => {
                console.error('Socket.IO помилка:', error);
            });
        });
    }

    // Create a new room
    createRoom(roomName, playerName, maxPlayers, color) {
        this.playerName = playerName || 'Гравець';
        this.isHost = true;

        return new Promise((resolve, reject) => {
            this.socket.emit('create-room', { roomName, playerName: this.playerName, maxPlayers, color });

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
    joinRoom(roomCode, playerName, color) {
        this.playerName = playerName || 'Гравець';
        this.roomCode = roomCode.toUpperCase();

        return new Promise((resolve, reject) => {
            this.socket.emit('join-room', { roomCode: this.roomCode, playerName: this.playerName, color });

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

    // Rejoin room after page navigation (when game starts)
    rejoinRoom(roomCode, isHost) {
        this.roomCode = roomCode;
        this.isHost = isHost;
        this.socket.emit('rejoin-room', { roomCode, isHost });
    }

    // Sync a building action to all players in the room (stores on server)
    syncBuild(type, data) {
        this.socket.emit('sync-build', {
            roomCode: this.roomCode,
            type,
            data
        });
    }

    // Send game action to other players
    sendGameAction(action, data) {
        this.socket.emit('game-action', {
            roomCode: this.roomCode,
            action,
            data
        });
    }

    // Change player color
    changeColor(playerId, color) {
        this.socket.emit('change-color', {
            roomCode: this.roomCode,
            playerId,
            color
        });
    }

    // Handle color changed event
    onColorChanged(callback) {
        this.socket.on('color-changed', callback);
    }

    // Handle color change failed event
    onColorChangeFailed(callback) {
        this.socket.on('color-change-failed', callback);
    }

    // Handle sync-buildings (receiving all buildings after reconnect)
    onSyncBuildings(callback) {

        this.socket.on('sync-buildings', callback);
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

    // Handle rooms list update
    onRoomsList(callback) {
        this.socket.on('rooms-list', callback);
    }

    // Leave room explicitly
    leaveRoom() {
        if (this.roomCode) {
            this.socket.emit('leave-room', { roomCode: this.roomCode });
            this.roomCode = null;
            this.isHost = false;
        }
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