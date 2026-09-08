// ===== РўРµСЃС‚ Р±Р°РіР° В«РєС–РјРЅР°С‚Р° РЅР°С€Р»Р°СЃСЊ, Р° РіСЂР°РІС†СЏ РІРёРєРёРЅСѓР»Рѕ Р· room-not-foundВ» =====
// РЎС†РµРЅР°СЂС–Р№: РјР°С‚С‡РјРµР№РєС–РЅРі-РєС–РјРЅР°С‚Р° СЃС‚РІРѕСЂСЋС”С‚СЊСЃСЏ Р· splash-СЃРѕРєРµС‚Р°РјРё. Р“СЂР°РІРµС†СЊ РЅР°РІС–РіСѓС”
// splash -> index, Р°Р»Рµ Р№РѕРіРѕ rejoin РїСЂРёС…РѕРґРёС‚СЊ С–Р· Р—РђРЎРўРђР Р†Р›РРњ oldPlayerId (id С–Р·
// РїРѕРїРµСЂРµРґРЅСЊРѕС— РєР°С‚РєРё, С‰Рѕ Р»РёС€РёРІСЃСЏ РІ sessionStorage). Splash-СЃРѕРєРµС‚ СѓР¶Рµ РјРµСЂС‚РІРёР№
// (РґРёСЃРєРѕРЅРµРєС‚ РїСЂРѕС–РіРЅРѕСЂРѕРІР°РЅРѕ РІ handshake в†’ Р·Р°РїРёСЃ РќР• РїРѕРјС–С‡РµРЅРёР№ disconnected).
// Р Р°РЅС–С€Рµ: ghost-guard РєРёРґР°РІ room-not-found. РўРµРїРµСЂ: reattach Р·Р° РјРµСЂС‚РІРёРј СЃРѕРєРµС‚РѕРј.
const { spawn } = require('child_process');
const io = require('socket.io-client');

const PORT = 3117;
const URL = 'http://localhost:' + PORT;

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  вњ… ' + name + (extra ? ' | ' + extra : '')); }
    else { failed++; console.log('  вќЊ ' + name + (extra ? ' | ' + extra : '')); }
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
function once(s, ev, timeout = 4000) {
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
    srv.stdout.on('data', d => process.stdout.write('[srv] ' + String(d)));
    srv.stderr.on('data', d => process.stderr.write('[srv-err] ' + String(d)));
    await sleep(1200);

    try {
        // === 1. РњР°С‚С‡: Alice vs Bob (splash-СЃРѕРєРµС‚Рё s1A/s1B) ===
        const s1A = await connect();
        const s1B = await connect();
        const fA = once(s1A, 'matchmaking-found');
        const fB = once(s1B, 'matchmaking-found');
        s1A.emit('join-matchmaking', { playerName: 'Alice', avatar: 0 });
        s1B.emit('join-matchmaking', { playerName: 'Bob', avatar: 1 });
        const mfA = await fA, mfB = await fB;
        check('РњР°С‚С‡ Р·РЅР°Р№РґРµРЅРѕ РѕР±РѕРј', !!(mfA && mfB && mfA.roomCode && mfB.roomCode && mfA.roomCode === mfB.roomCode), 'room=' + (mfA && mfA.roomCode));
        const roomCode = mfA.roomCode;

        // === 2. Alice РЅР°РІС–РіСѓС” РІ index: РЅРѕРІРёР№ СЃРѕРєРµС‚, rejoin С–Р· РџР РђР’РР›Р¬РќРРњ oldPlayerId ===
        const s2A = await connect();
        const prA = once(s2A, 'player-returned');
        const rnfA = once(s2A, 'room-not-found');
        s2A.emit('rejoin-room', { roomCode, isHost: true, oldPlayerId: s1A.id, playerName: 'Alice' });
        const prAData = await prA;
        check('Alice rejoin OK (player-returned, previousId = splash id)', !!(prAData && prAData.previousId === s1A.id), 'prev=' + (prAData && prAData.previousId));
        const rnfAearly = await rnfA; // РїРµСЂРµРєРѕРЅСѓС”РјРѕСЃСЊ, С‰Рѕ РІС–РґРјРѕРІРё РЅРµ Р±СѓР»Рѕ
        check('Alice РЅРµ РѕС‚СЂРёРјР°Р»Р° room-not-found', rnfAearly === null);

        // === 3. Bob РЅР°РІС–РіСѓС”, Р°Р»Рµ Р· Р—РђРЎРўРђР Р†Р›РРњ oldPlayerId (С–Рґ С–Р· РїРѕРїРµСЂРµРґРЅСЊРѕС— СЃРµСЃС–С—) ===
        // Р™РѕРіРѕ splash-СЃРѕРєРµС‚ s1B РїС–СЂРЅР°С” Сѓ В«РЅР°РІС–РіР°С†С–СЋВ»: РІС–РґРІР°Р»СЋС”С‚СЊСЃСЏ РџР†РЎР›РЇ С‚РѕРіРѕ, СЏРє
        // handshake С‰Рµ РЅРµ Р·Р°РІРµСЂС€РµРЅРёР№ (Alice rejoin-РЅСѓР»Р°СЃСЊ, Bob вЂ” РЅС–) в†’ disconnect
        // РїСЂРѕС–РіРЅРѕСЂРѕРІР°РЅРѕ в†’ Р·Р°РїРёСЃ Bob РќР• РїРѕРјС–С‡РµРЅРёР№ disconnected.
        const STALE_BOB_ID = 'stale-id-from-previous-game-XYZ';
        const s2B = await connect();
        const prB = once(s2B, 'player-returned');
        const rnfB = once(s2B, 'room-not-found');
        // СЃРїРµСЂС€Сѓ В«РЅР°РІС–РіР°С†С–СЏВ»: splash-СЃРѕРєРµС‚ РІС–РґРІР°Р»СЋС”С‚СЊСЃСЏ (handshake С‰Рµ РЅРµ Р·Р°РІРµСЂС€РµРЅРёР№)
        s1B.disconnect();
        await sleep(300);
        s2B.emit('rejoin-room', { roomCode, isHost: false, oldPlayerId: STALE_BOB_ID, playerName: 'Bob' });
        const prBData = await prB;
        check('Bob rejoin Р·С– Р·Р°СЃС‚Р°СЂС–Р»РёРј id вЂ” NOT kicked (player-returned)', !!prBData, prBData ? ('prev=' + prBData.previousId) : 'room-not-found!');
        const rnfBdata = await rnfB;
        check('Bob РЅРµ РѕС‚СЂРёРјР°РІ room-not-found', rnfBdata === null, rnfBdata ? ('reason=' + rnfBdata.reason) : '');

        // === 4. Р“СЂР° Р¶РёРІР°: Bob РјРѕР¶Рµ Р·Р°РїСЂРѕСЃРёС‚Рё СЃС‚Р°РЅ С– РѕС‚СЂРёРјР°С‚Рё РґР°РЅС– РєС–РјРЅР°С‚Рё ===
        const bs = once(s2B, 'game-state-sync');
        s2B.emit('request-game-state', { roomCode, oldPlayerId: STALE_BOB_ID });
        const bsData = await bs;
        check('Bob РѕС‚СЂРёРјСѓС” game-state-sync (РєС–РјРЅР°С‚Р° Р¶РёРІР°, РІС–РЅ СѓСЃРµСЂРµРґРёРЅС–)', !!bsData, bsData ? ('phase=' + bsData.gamePhase) : '');

        // === 5. РџРѕРІС‚РѕСЂРЅРёР№ РІС…С–Рґ РїС–СЃР»СЏ В«РєС–РєaВ»: find-active-room Р·РЅР°С…РѕРґРёС‚СЊ РєС–РјРЅР°С‚Сѓ Bob Р·Р° С–РјРµРЅРµРј ===
        // (РµРјСѓР»СЋС”РјРѕ, С‰Рѕ Bob РєР»С–РєРЅСѓРІ В«Р“СЂР°С‚Рё Р· Р»СЋРґРёРЅРѕСЋВ» Сѓ splash РЅР° РќРћР’РћРњРЈ СЃРѕРєРµС‚С–)
        s2B.disconnect();
        await sleep(300);
        const s3B = await connect();
        const far = once(s3B, 'active-room-found');
        const nar = once(s3B, 'no-active-room');
        s3B.emit('find-active-room', { playerName: 'Bob' });
        const farData = await far;
        const narData = await nar;
        check('find-active-room: Bob РїРѕРІРµСЂС‚Р°С”С‚СЊСЃСЏ Сѓ Р¶РёРІСѓ РєР°С‚РєСѓ', !!(farData && farData.roomCode === roomCode), farData ? ('room=' + farData.roomCode) : (narData ? 'no-active-room!' : 'timeout'));

        // === 6. РџРѕРІРЅРёР№ rejoin Р·РЅРѕРІСѓ РїСЂР°С†СЋС” (Р±РµР· РґСѓР±Р»С–РєР°С‚Р°) ===
        const pr3 = once(s3B, 'player-returned');
        s3B.emit('rejoin-room', { roomCode, isHost: false, oldPlayerId: s2B.id, playerName: 'Bob' });
        const pr3Data = await pr3;
        check('РџРѕРІС‚РѕСЂРЅРёР№ rejoin Bob OK', !!pr3Data, pr3Data ? ('prev=' + pr3Data.previousId) : '');
    } catch (e) {
        failed++;
        console.error('  вќЊ Р’РРќРЇРўРћРљ: ' + (e && e.message));
    } finally {
        console.log('\n===== Р Р•Р—РЈР›Р¬РўРђРў: ' + passed + ' passed, ' + failed + ' failed =====');
        try { srv.kill(); } catch (e) {}
        process.exit(failed === 0 ? 0 : 1);
    }
})();
