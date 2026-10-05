/**
 * Нарізка 6 граней грального кубика з атласа (1536×1024):
 * assets/textures/65b6d203-81a7-471c-a9df-8cf0f01966d0.png
 *
 * В атласі грані лежать у 3 стовпці × 2 рядки (читання зліва-направо, зверху-вниз
 * → 1, 2, 3 / 4, 5, 6) на плоскому темному тлі ≈ rgb(29,19,8), alpha = 255 по
 * всьому прямокутнику (як в атласі курсорів).
 *
 * Кроки (канвас у прихованому вікні Electron):
 *   1. маска «не тло» по відстані кольору до кольору країв атласа;
 *   2. порожні рядки/стовпці маски = розриви між комірками → межі 6 комірок;
 *   3. у кожній комірці flood-fill'ом від країв знімаємо тло й лишаємо найбільшу
 *      зв'язну компоненту — саму грань (м'які краї: alpha з відстані кольору +
 *      декон-тамінація кольору на напівпрозорих, щоб не було темного «обідка»);
 *   4. обрізаємо по силуету, вписуємо у квадрат 256×256 з полями 4%;
 *   5. зберігаємо assets/textures/dice/die-1.png … die-6.png.
 *
 * Грані малює `Dice3D` у src/ui/index.html: кожна грань CSS-куба отримує свою
 * текстуру як background-image (замість намальованих кодом піпсів).
 *
 * Запуск: npx electron tools/make-die-faces.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SHEET = 'assets/textures/dice/65b6d203-81a7-471c-a9df-8cf0f01966d0.png';
const OUT_DIR = 'assets/textures/dice';
const OUT_SIZE = 256;   // сторона готової грані (PNG, квадрат)
const PAD_RATIO = 0.04; // прозорі поля навколо силуету (частка сторони)
const TOL = 26;         // «це ще тло» — та сама толерантність, що в make-cursor.js
const TOL_SOFT = 70;    // вище цього — «точно грань» (alpha = 255)

app.whenReady().then(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const win = new BrowserWindow({ width: 1600, height: 1200, show: false });
    const filePath = 'file:///' + path.resolve(SHEET).replace(/\\/g, '/');
    await win.loadURL(filePath);

    const results = await win.webContents.executeJavaScript(`(() => {
        // константи з Node-скоупа всередину сторінки (сирі імена там не існують)
        const TOL = ${TOL}, TOL_SOFT = ${TOL_SOFT}, OUT_SIZE = ${OUT_SIZE}, PAD_RATIO = ${PAD_RATIO};
        const img = document.querySelector('img');
        const sheet = document.createElement('canvas');
        sheet.width = img.naturalWidth;
        sheet.height = img.naturalHeight;
        const sctx = sheet.getContext('2d', { willReadFrequently: true });
        sctx.drawImage(img, 0, 0);
        const SW = sheet.width, SH = sheet.height;
        const spx = sctx.getImageData(0, 0, SW, SH).data;

        // 1. Колір тла — медіана пікселів по всьому периметру атласа
        const ring = [];
        for (let x = 0; x < SW; x++) ring.push(x, (SH - 1) * SW + x);
        for (let y = 1; y < SH - 1; y++) ring.push(y * SW, y * SW + SW - 1);
        const med = c => {
            const v = ring.map(p => spx[p * 4 + c]).sort((a, b) => a - b);
            return v[v.length >> 1];
        };
        const bg = [med(0), med(1), med(2)];
        const distOf = p => Math.max(
            Math.abs(spx[p * 4] - bg[0]),
            Math.abs(spx[p * 4 + 1] - bg[1]),
            Math.abs(spx[p * 4 + 2] - bg[2])
        );

        // 2. Порожні рядки/стовпці (усе тло) = розриви між комірками
        const rowHas = new Uint8Array(SH), colHas = new Uint8Array(SW);
        for (let y = 0; y < SH; y++) {
            for (let x = 0; x < SW; x++) {
                if (distOf(y * SW + x) > TOL) { rowHas[y] = 1; colHas[x] = 1; }
            }
        }
        const spans = flags => {
            const out = [];
            let start = -1;
            for (let i = 0; i < flags.length; i++) {
                if (flags[i]) { if (start < 0) start = i; }
                else if (start >= 0) { out.push([start, i - 1]); start = -1; }
            }
            if (start >= 0) out.push([start, flags.length - 1]);
            // випадкові 1-2px порожні рядки всередині силуету не мають рвати
            // комірку: мінімальна її ширина — 8% атласа
            const minSpan = Math.round(flags.length * 0.08);
            return out.filter(s => (s[1] - s[0] + 1) >= minSpan);
        };
        const rows = spans(rowHas), cols = spans(colHas);
        if (rows.length !== 2 || cols.length !== 3) {
            return { error: 'очікували 3 стовпці × 2 рядки, а знайшли ' + cols.length + ' × ' + rows.length };
        }

        // 3-4. Грань у кожній комірці: зняти тло від країв + обрізати по силуету
        const out = [];
        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < cols.length; c++) {
                const cellX = cols[c][0], cellY = rows[r][0];
                const W = cols[c][1] - cellX + 1, H = rows[r][1] - cellY + 1;

                const reg = document.createElement('canvas');
                reg.width = W;
                reg.height = H;
                const rctx = reg.getContext('2d', { willReadFrequently: true });
                rctx.drawImage(sheet, cellX, cellY, W, H, 0, 0, W, H);
                const px = rctx.getImageData(0, 0, W, H).data;
                const dist = p => Math.max(
                    Math.abs(px[p * 4] - bg[0]),
                    Math.abs(px[p * 4 + 1] - bg[1]),
                    Math.abs(px[p * 4 + 2] - bg[2])
                );

                // flood-fill від країв комірки: знімаємо лише зв'язане з краєм
                const isBg = new Uint8Array(W * H);
                const seen = new Uint8Array(W * H);
                const stack = [];
                const add = p => {
                    if (seen[p] || dist(p) > TOL) return;
                    seen[p] = 1;
                    isBg[p] = 1;
                    stack.push(p);
                };
                for (let x = 0; x < W; x++) { add(x); add((H - 1) * W + x); }
                for (let y = 0; y < H; y++) { add(y * W); add(y * W + W - 1); }
                while (stack.length) {
                    const p = stack.pop();
                    const x = p % W, y = (p / W) | 0;
                    if (x > 0) add(p - 1);
                    if (x < W - 1) add(p + 1);
                    if (y > 0) add(p - W);
                    if (y < H - 1) add(p + W);
                }

                // найбільша зв'язна компонента з НЕ-фонових пікселів = сама грань
                const label = new Int32Array(W * H).fill(-1);
                let bestId = -1, bestSize = 0, nextId = 0;
                for (let s = 0; s < W * H; s++) {
                    if (isBg[s] || label[s] >= 0) continue;
                    const id = nextId++;
                    const st = [s];
                    label[s] = id;
                    let size = 0;
                    while (st.length) {
                        const p = st.pop();
                        size++;
                        const x = p % W, y = (p / W) | 0;
                        const nb = [];
                        if (x > 0) nb.push(p - 1);
                        if (x < W - 1) nb.push(p + 1);
                        if (y > 0) nb.push(p - W);
                        if (y < H - 1) nb.push(p + W);
                        for (const q of nb) {
                            if (isBg[q] || label[q] >= 0) continue;
                            label[q] = id;
                            st.push(q);
                        }
                    }
                    if (size > bestSize) { bestSize = size; bestId = id; }
                }

                // м'яка альфа: край грані анти-аліаситься в темне тло — щоб не
                // лишити темний «обідок», декон-тамінуємо напівпрозорі пікселі
                const clean = rctx.createImageData(W, H);
                const cl = clean.data;
                let x0 = W, y0 = H, x1 = -1, y1 = -1;
                for (let p = 0; p < W * H; p++) {
                    if (label[p] !== bestId) continue;
                    const i = p * 4, x = p % W, y = (p / W) | 0;
                    const d = dist(p);
                    const a = d <= TOL ? 0 : d >= TOL_SOFT ? 1 : (d - TOL) / (TOL_SOFT - TOL);
                    const un = (v, b) => Math.max(0, Math.min(255, Math.round((v - b * (1 - a)) / a)));
                    cl[i] = a >= 1 ? px[i] : un(px[i], bg[0]);
                    cl[i + 1] = a >= 1 ? px[i + 1] : un(px[i + 1], bg[1]);
                    cl[i + 2] = a >= 1 ? px[i + 2] : un(px[i + 2], bg[2]);
                    cl[i + 3] = Math.round(a * 255);
                    if (a > 0.1) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
                }
                const cleanC = document.createElement('canvas');
                cleanC.width = W;
                cleanC.height = H;
                cleanC.getContext('2d').putImageData(clean, 0, 0);

                // 4. Вписуємо силует у квадрат OUT_SIZE з полями PAD_RATIO
                const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
                const inner = OUT_SIZE * (1 - 2 * PAD_RATIO);
                const scale = Math.min(inner / cw, inner / ch);
                const dw = Math.round(cw * scale), dh = Math.round(ch * scale);
                const dst = document.createElement('canvas');
                dst.width = OUT_SIZE;
                dst.height = OUT_SIZE;
                const dctx = dst.getContext('2d');
                dctx.imageSmoothingEnabled = true;
                dctx.imageSmoothingQuality = 'high';
                dctx.drawImage(cleanC, x0, y0, cw, ch,
                    Math.round((OUT_SIZE - dw) / 2), Math.round((OUT_SIZE - dh) / 2), dw, dh);

                out.push({
                    file: 'die-' + (r * cols.length + c + 1) + '.png',
                    dataUrl: dst.toDataURL('image/png'),
                    width: OUT_SIZE,
                    height: OUT_SIZE,
                    cell: cellX + ',' + cellY + ' ' + W + '×' + H,
                    facePct: Math.round(bestSize * 100 / (W * H)),
                    bg: bg.join(',')
                });
            }
        }
        return out;
    })()`);

    if (results.error) {
        console.error('Не вдалося розкласти атлас:', results.error);
        app.quit();
        return;
    }

    for (const r of results) {
        const outFile = path.join(OUT_DIR, r.file);
        fs.writeFileSync(outFile, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
        console.log(`${outFile}  ${r.width}x${r.height}  комірка ${r.cell}  грань ${r.facePct}%  тло rgb(${r.bg})`);
    }

    console.log('\nDone.');
    app.quit();
});
