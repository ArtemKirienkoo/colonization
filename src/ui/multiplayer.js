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
        this.pendingListeners = [];
    }

    // Safe wrapper for socket.on() - queues handlers if socket is not connected yet
    _safeOn(event, callback) {
        if (this.socket) {
            this.socket.on(event, callback);
        } else {
            this.pendingListeners.push({ event, callback });
        }
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
                try {
                    const existingPlayerId = sessionStorage.getItem('multiplayerPlayerId');
                    if (!existingPlayerId) {
                        sessionStorage.setItem('multiplayerPlayerId', this.socket.id);
                    } else {
                        console.log('Збережено старий multiplayerPlayerId для reconnect:', existingPlayerId);
                    }
                } catch (error) {
                    console.warn('Не вдалося зберегти multiplayerPlayerId:', error);
                }
                // Attach any queued listeners registered before socket creation
                for (const listener of this.pendingListeners) {
                    this.socket.on(listener.event, listener.callback);
                }
                this.pendingListeners = [];
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Помилка підключення:', error);
                // Disconnect the socket to stop Socket.IO from continuing to
                // reconnect internally. This is important when we want to
                // try a fallback server URL (e.g., cloud server) instead.
                if (this.socket) {
                    this.socket.disconnect();
                }
                clearTimeout(timeout);
                reject(error);
            });

            this.socket.on('reconnect_attempt', (attempt) => {
                console.log('Спроба перепідключення:', attempt);
            });

            this.socket.on('reconnect_failed', () => {
                if (this.socket) {
                    this.socket.disconnect();
                }
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
        let oldPlayerId = null;
        try {
            oldPlayerId = sessionStorage.getItem('multiplayerPlayerId');
        } catch (error) {
            console.warn('Не вдалося прочитати multiplayerPlayerId:', error);
        }
        this.socket.emit('rejoin-room', { roomCode, isHost, oldPlayerId });
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

    // Roll dice during initial phase
    rollDiceInitial(die1, die2) {
        this.socket.emit('dice-roll', {
            roomCode: this.roomCode,
            playerId: this.socket.id,
            die1,
            die2
        });
    }

    // Notify server that initial build is complete
    completeInitialBuild() {
        this.socket.emit('initial-build-complete', {
            roomCode: this.roomCode,
            playerId: this.socket.id
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
        this._safeOn('color-changed', callback);
    }

    // Handle color change failed event
    onColorChangeFailed(callback) {
        this._safeOn('color-change-failed', callback);
    }

    // Handle sync-buildings (receiving all buildings after reconnect)
    onSyncBuildings(callback) {
        this._safeOn('sync-buildings', callback);
    }

    // Handle incoming game actions
    onGameAction(callback) {
        this._safeOn('game-action', callback);
    }

    // Handle player joined
    onPlayerJoined(callback) {
        this._safeOn('player-joined', callback);
    }

    // Handle player left
    onPlayerLeft(callback) {
        this._safeOn('player-left', callback);
    }

    // Handle game started
    onGameStarted(callback) {
        this._safeOn('game-started', callback);
    }

    // Handle start dice phase
    onStartDicePhase(callback) {
        this._safeOn('start-dice-phase', callback);
    }

    // Handle player dice rolled (initial)
    onPlayerDiceRolled(callback) {
        this._safeOn('player-dice-rolled', callback);
    }

    // Handle initial build start
    onInitialBuildStart(callback) {
        this._safeOn('initial-build-start', callback);
    }

    // Handle initial build next player
    onInitialBuildNextPlayer(callback) {
        this._safeOn('initial-build-next-player', callback);
    }

    // Handle initial build round 2 start
    onInitialBuildRound2Start(callback) {
        this._safeOn('initial-build-round2-start', callback);
    }

    // Handle initial build - your turn!
    onInitialBuildYourTurn(callback) {
        this._safeOn('initial-build-your-turn', callback);
    }

    // Handle initial build - waiting for other player
    onInitialBuildWaiting(callback) {
        this._safeOn('initial-build-waiting', callback);
    }

    // Handle initial build - your done (turn ended, waiting)
    onInitialBuildYourDone(callback) {
        this._safeOn('initial-build-your-done', callback);
    }

    // Notify server that initial build turn is complete (with counts)
    endInitialBuildTurn(settlements, roads) {
        this.socket.emit('initial-build-end-turn', {
            roomCode: this.roomCode,
            playerId: this.socket.id,
            settlements,
            roads
        });
    }

    // ===== REGULAR TURN EVENTS =====

    // Handle "your-turn" event (it's this player's turn)
    onYourTurn(callback) {
        this._safeOn('your-turn', callback);
    }

    // Handle "waiting-for-turn" event (waiting for another player)
    onWaitingForTurn(callback) {
        this._safeOn('waiting-for-turn', callback);
    }

    // Handle regular dice rolled (during regular gameplay)
    onRegularDiceRolled(callback) {
        this._safeOn('regular-dice-rolled', callback);
    }

    // Handle resource collection (after dice roll)
    onCollectResources(callback) {
        this._safeOn('collect-resources', callback);
    }

    // Handle regular game start
    onRegularGameStart(callback) {
        this._safeOn('regular-game-start', callback);
    }

    // Handle turn ended
    onTurnEnded(callback) {
        this._safeOn('turn-ended', callback);
    }

    // Handle action error
    onActionError(callback) {
        this._safeOn('action-error', callback);
    }

    // Handle dice tie (re-roll needed)
    onDiceTie(callback) {
        this._safeOn('dice-tie', callback);
    }

    // Handle building synced (confirmation from server)
    onBuildingSynced(callback) {
        this._safeOn('building-synced', callback);
    }

    // Handle game state sync (for reconnection)
    onGameStateSync(callback) {
        this._safeOn('game-state-sync', callback);
    }

    // ===== REGULAR TURN EMITTERS =====

    // Roll dice during regular turn (2 dice)
    rollRegularDice(die1, die2) {
        this.socket.emit('regular-dice-roll', {
            roomCode: this.roomCode,
            playerId: this.socket.id,
            die1,
            die2
        });
    }

    // End current turn
    endTurn() {
        this.socket.emit('end-turn', {
            roomCode: this.roomCode,
            playerId: this.socket.id
        });
    }

    // Handle room closed (host left)
    onRoomClosed(callback) {
        this._safeOn('room-closed', callback);
    }

    // Handle rooms list update
    onRoomsList(callback) {
        this._safeOn('rooms-list', callback);
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
