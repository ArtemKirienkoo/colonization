const io = require('c:/Users/Admin/Desktop/Projects/Colonization/node_modules/socket.io-client');
const SERVER = 'https://colonization.onrender.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const sock = io(SERVER, { transports: ['websocket', 'polling'], reconnection: false, timeout: 30000 });
function req(evt, payload, resEvt) {
    return new Promise((resolve, reject) => {
        const h = d => { sock.off(resEvt, h); resolve(d); };
        sock.on(resEvt, h);
        sock.emit(evt, payload);
        setTimeout(() => reject(new Error('timeout ' + resEvt)), 30000);
    });
}

let fail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); if (!c) fail++; };

(async () => {
    try {
        await new Promise((res, rej) => { sock.once('connect', res); sock.once('connect_error', rej); });
        console.log('connected to cloud server, socket id:', sock.id);

        const tag = Date.now().toString(36);
        const login = 'rtest_' + tag;
        const email = 'rtest_' + tag + '@example.com';

        const reg = await req('auth-register', { login, password: 'TempPass123' }, 'auth-register-result');
        console.log('register:', JSON.stringify(reg));
        check('register ok', reg.success === true);
        const pid = reg.playerId;

        const bind = await req('account-bind-email', { playerId: pid, email }, 'account-bind-email-result');
        console.log('bind:', JSON.stringify(bind));
        check('bind email ok', bind.success === true);

        const f = await req('auth-forgot-password', { email }, 'auth-forgot-password-result');
        console.log('RESULT devMode flag =>', f.devMode, '| full:', JSON.stringify(f));
        // devMode === true  => SMTP НЕ налаштовано (код пішов у консоль сервера)
        // devMode === false => SMTP налаштовано Й лист відправлено cпробою
        check('server accepted forgot request', f.success === true);
        if (f.success) {
            console.log('SMTP configured? ' + (f.devMode === false ? 'YES (real email send attempted)' : 'NO (dev-mode, see code in Render Logs)'));
        } else {
            console.log('Server error:', f.error);
        }
    } catch (e) {
        console.log('EXCEPTION:', e.message);
        fail++;
    }
    sock.disconnect();
    console.log(fail === 0 ? '\n=== DONE (no asserts failed) ===' : ('\n=== ASSERTS FAILED: ' + fail + ' ==='));
    process.exit(fail === 0 ? 0 : 1);
})();