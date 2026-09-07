// ===== Смоук-тест правок логіки мультиплеєра =====
// Перевіряє виправлення:
//   (1) Хост, що вийшов із матчмейкінг-катки (leave-room), НЕ закриває кімнату
//       миттєво: суперник ЗРАЗУ отримує player-disconnected (таймер повернення),
//       а повторний host-disconnected (від закриття сокета) НЕ дублюється.
//   (2) find-active-room повертає гравця в незавершену катку (за сокетом
//       або за іменем серед відключених), а join-matchmaking НЕ блокується
//       застарілою кімнатою з таким самим ніком.
//   (3) rejoin-room синхронізує «суперник зараз відключений» для того,
//       хто підключається пізніше (таймер з'являється одразу).
//   (4) rejoin-room шле player-returned з previousId/playerName — клієнт
//       ремапить локальні id й одразу показує правильний нік/аватар у панелі.
//   (5) Реальний обрив хоста шле host-disconnected З playerId/playerName.
const { spawn } = require('child_process');
const io = require('socket.io-client');

const PORT = 3110;
const URL = 'http://localhost:' + PORT;

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ✅ ' + name + (extra ? ' | ' + extra : '')); }
    else { failed++; console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); }
}

function connect() {
    return new Promise((resolve, reject) => {
        const s = io(URL, { transports: ['websocket'], reconnection: false });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
        setTimeout(() => reject(new Error('connect timeout')), 10000);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Чекаємо ОДНУ подію (або null по таймауту)
function once(s, ev, timeout = 3000) {
    return new Promise((resolve) => {
        const t = setTimeout(() => { s.off(ev, h); resolve(null); }, timeout);
        const h = (d) => { clearTimeout(t); s.off(ev, h); resolve(d); };
        s.on(ev, h);
    });
}

(async () => {
    const srv = spawn('node', ['src/main/server-unified.js'], {
        env: { ...process.env, PORT: String(PORT), DISCONNECT_GRACE_MS: '60000' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    srv.stdout.on('data', () => { /* тихо */ });
    srv.stderr.on('data', d => console.error('  [server-err]', String(d).trim()));
    await sleep(1200);

    try {
        // === Матч: Alice (хост, red) vs Bob (blue) ===
        const s1 = await connect();
        const s2 = await connect();
        const f1 = once(s1, 'matchmaking-found');
        const f2 = once(s2, 'matchmaking-found');
        s1.emit('join-matchmaking', { playerName: 'Alice', avatar: 0 });
        await sleep(200);
        s2.emit('join-matchmaking', { playerName: 'Bob', avatar: 1 });
        const [m1, m2] = [await f1, await f2];
        check('Матч створено (обом прийшло matchmaking-found)', !!(m1 && m2 && m1.roomCode === m2.roomCode), 'room=' + (m1 && m1.roomCode));
        const roomCode = m1.roomCode;

        // === Rejoin обох гравців (handshake splash -> index) ===
        const r1 = await connect();
        const r2 = await connect();
        r1.emit('rejoin-room', { roomCode, isHost: true, oldPlayerId: s1.id, playerName: 'Alice' });
        await sleep(200);
        // Коли Bob повертається, Alice (уже в кімнаті) має отримати player-returned
        // з previousId (старий id, який у неї в turnOrder) і playerName —
        // за ними клієнт ремапить локальні структури й одразу малює нік/аватар
        const prP = once(r1, 'player-returned', 3000);
        r2.emit('rejoin-room', { roomCode, isHost: false, oldPlayerId: s2.id, playerName: 'Bob' });
        const pr = await prP;
        check('rejoin шле player-returned у кімнату', !!pr);
        check('player-returned.previousId = старий id (ремап панелі черги ходів)', !!pr && pr.previousId === s2.id, pr ? ('prev=' + String(pr.previousId).slice(0, 8)) : 'немає');
        check('player-returned.playerName = нік повернутого', !!pr && pr.playerName === 'Bob');
        await sleep(200);

        // Splash-сокети «навігурували» — гинуть (їх id уже перемаплені)
        s1.disconnect(); s2.disconnect();
        await sleep(200);

        // === (1) Хост виходить із катки: суперник ЗРАЗУ бачить таймер, кімната жива ===
        const pdP = once(r2, 'player-disconnected', 3000);
        const rcP = once(r2, 'room-closed', 1200);
        r1.emit('leave-room', { roomCode });
        const pd = await pdP;
        const rc = await rcP;
        check('Суперник отримав player-disconnected ОДРАЗУ', !!pd && pd.playerName === 'Alice', pd ? ('grace=' + pd.graceSeconds + 's') : 'не прийшов');
        check('Кімнату НЕ закрито миттєво (немає room-closed)', rc === null);

        // Вихід кнопкою зазвичай закриває й сокет — сервер НЕ має дублювати
        // host-disconnected (раніше він перезапускав оверлей у суперника з нуля)
        const hdP = once(r2, 'host-disconnected', 1500);
        r1.disconnect();
        const hd = await hdP;
        check('Меню-вихід хоста НЕ дублює host-disconnected', hd === null);

        // === Bob теж «втрачає з'єднання» — тепер обидва відключені ===
        const r2id = r2.id;
        r2.disconnect();
        await sleep(400);

        // === (2) find-active-room повертає в активну катку ===
        const c1 = await connect();
        const fB = once(c1, 'active-room-found', 3000);
        const nB = once(c1, 'no-active-room', 3000);
        c1.emit('find-active-room', { playerName: 'Bob' });
        const foundB = await fB;
        const noneB = await nB;
        check('find-active-room(Bob) -> active-room-found', !!foundB && foundB.roomCode === roomCode);
        check('no-active-room при цьому НЕ приходить', noneB === null);
        c1.disconnect();

        const c2 = await connect();
        const fA = once(c2, 'active-room-found', 3000);
        c2.emit('find-active-room', { playerName: 'Alice' });
        const foundA = await fA;
        check('find-active-room(Alice, відключений хост) -> знайдено', !!foundA && foundA.roomCode === roomCode);
        c2.disconnect();

        const c3 = await connect();
        const nU = once(c3, 'no-active-room', 3000);
        c3.emit('find-active-room', { playerName: 'НевідомийГравець' });
        check('find-active-room(невідомий) -> no-active-room', (await nU) !== null);
        c3.disconnect();

        // === (2b) join-matchmaking НЕ перехоплюється застарілою кімнатою:
        //     гравець із ніком «сидить у старій катці» має потрапити у чергу ===
        const q = await connect();
        const qQueued = once(q, 'matchmaking-queued', 2000);
        const qFound = once(q, 'active-room-found', 1500);
        q.emit('join-matchmaking', { playerName: 'Bob', avatar: 1 });
        const qq = await qQueued;
        const qf = await qFound;
        check('join-matchmaking(Bob) -> звичайна постановка у чергу', !!qq && qq.queueSize >= 1, qq ? ('queue=' + qq.queueSize) : 'не прийшло');
        check('Застаріла катка НЕ перехоплює пошук (немає active-room-found)', qf === null);
        q.disconnect();

        // === (3) Пізній rejoin: той, хто підключається, дізнається про відключеного суперника ===
        const r3 = await connect();
        const pd3 = once(r3, 'player-disconnected', 3000);
        r3.emit('rejoin-room', { roomCode, isHost: false, oldPlayerId: r2id, playerName: 'Bob' });
        const pdB = await pd3;
        check('Пізній rejoin синхронізує «суперник відключений»', !!pdB && pdB.playerName === 'Alice', pdB ? ('grace=' + pdB.graceSeconds + 's') : 'не прийшов');

        r1.disconnect(); r3.disconnect();

        // === (4) Реальний обрив хоста (БЕЗ leave-room): host-disconnected приходить
        //     З playerId і playerName, щоб клієнт міг прив'язати оверлей до гравця
        //     і показати його нік, а не безлике «Хазяїн» ===
        const s3 = await connect();
        const s4 = await connect();
        const f3 = once(s3, 'matchmaking-found');
        const f4 = once(s4, 'matchmaking-found');
        s3.emit('join-matchmaking', { playerName: 'Carol', avatar: 2 });
        await sleep(200);
        s4.emit('join-matchmaking', { playerName: 'Dave', avatar: 3 });
        const [m3, m4] = [await f3, await f4];
        check('Другий матч створено (Carol vs Dave)', !!(m3 && m4 && m3.roomCode === m4.roomCode));
        const room2 = m3.roomCode;

        const r4 = await connect();
        const r5 = await connect();
        r4.emit('rejoin-room', { roomCode: room2, isHost: true, oldPlayerId: s3.id, playerName: 'Carol' });
        await sleep(200);
        r5.emit('rejoin-room', { roomCode: room2, isHost: false, oldPlayerId: s4.id, playerName: 'Dave' });
        await sleep(300);
        s3.disconnect(); s4.disconnect();
        await sleep(200);

        const hd2P = once(r5, 'host-disconnected', 3000);
        const hd2Id = r4.id;
        r4.disconnect(); // обрив з'єднання: жодного leave-room
        const hd2 = await hd2P;
        check('Обрив хоста шле host-disconnected', !!hd2);
        check('host-disconnected містить playerId', !!hd2 && hd2.playerId === hd2Id, hd2 ? ('playerId=' + String(hd2.playerId).slice(0, 8)) : 'немає');
        check('host-disconnected містить playerName', !!hd2 && hd2.playerName === 'Carol');
        r5.disconnect();
    } catch (e) {
        failed++;
        console.error('  ❌ Виняток у тесті:', e.message);
    }

    srv.kill();
    await sleep(200);
    console.log('\n===== РЕЗУЛЬТАТ: ' + passed + ' passed, ' + failed + ' failed =====');
    process.exit(failed > 0 ? 1 : 0);
})();
