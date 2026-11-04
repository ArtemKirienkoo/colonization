/**
 * Народження курсорів гри з атласу (1536×1024):
 * f3dc82be-3df2-4302-8c13-8d034a6c7a1f.png
 *
 * Важливо: в атласі натрілки лежать на СВІТЛО-СІРОМУ НЕПРОЗОРОМУ тлі
 * (rgb(237,237,237), alpha = 255 по всьому прямокутнику), тому простий
 * кроп по альфа-контуру давав білий прямокутник навколо курсора, а hotspot
 * рахувався від кута прямокутника, а не від вістря натрілки.
 *
 * Кроки (канвас у прихованому вікні Electron):
 *   1. вирізати ділянку атласу з натрілкою;
 *   2. зняти фон flood-fill'ом від країв ділянки (тільки те, що зв'язане з краєм);
 *   3. залишити найбільшу зв'язну компоненту — це й є натрілка без паперового тла;
 *   4. обрізати по силуету + масштабувати до цільової висоти (усі стани — однакова!);
 *   5. вписати у канвас ОДНАКОВОГО для всіх станів розміру (натрілка + PAD з усіх
 *      боків), hotspot рахуємо від вістря;
 *   6. для стану наведення — золотий ореол ПО СИЛУЕТУ натрілки (shadowBlur при
 *      малюванні), а не кругла плашка: сяйво повторює форму натрілки.
 *
 * Натрілка в усіх трьох файлах однакового розміру, канвас теж однаковий
 * (dw+2·PAD × 36+2·PAD), а hotspot рахується від вістря — тому при переході
 * «звичайний → наведення → заблоковано» вказівка не з'їжджає, і Chromium не
 * перевиділяє спрайт іншого розміру (раніше hover був 57×64 і hotspot 20 20,
 * а звичайний — 31×38 і 2 1: скидання канваса з іншим розміром і давало
 * «силуети» курсора, що лишалися на кнопках).
 * Розміри узяті компактними (36px), щоб Chromium не встигав «відставати»
 * малюванням великої картинки за мишкою.
 *
 * Запуск: npx electron tools/make-cursor.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SHEET = 'assets/textures/f3dc82be-3df2-4302-8c13-8d034a6c7a1f.png';
const OUT_DIR = 'assets/textures/cursors';

// Кандидати-межі натрілок у атласі (див. праву натрілку: x 894…1322 / y 258…800)
const REGION_GOLD = { minX: 220, minY: 238, w: 427, h: 539 };
const REGION_GRAY = { minX: 894, minY: 258, w: 429, h: 543 };

// height — висота САМОЇ натрілки в готовому файлі (усі стани однакова!)
// PAD    — прозорий запас навколо натрілки: ОДНАКОВИЙ для всіх станів, щоб
//          файли мали ідентичний розмір і hotspot не стрибав між станами
// GLOW_BLUR — розмиття ореолу наведення; менше за PAD, щоб ореол не різався краєм
// glow   — колір ореолу по силуету натрілки (лише для стану наведення)
const ARROW_H = 36;
const PAD = 7;
const GLOW_BLUR = 6;
const TARGETS = [
    // золота натрілка — звичайний курсор
    { src: REGION_GOLD, file: 'cursor-gold.png', glow: null },
    // срібна натрілка — заборонені/недоступні елементи
    { src: REGION_GRAY, file: 'cursor-gray.png', glow: null },
    // та сама золота натрілка + золотий ореол — наведення на кнопки/карти
    { src: REGION_GOLD, file: 'cursor-gold-hover.png', glow: 'rgba(242,207,126,0.6)' }
];

app.whenReady().then(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const win = new BrowserWindow({ width: 1600, height: 1200, show: false });
    const filePath = 'file:///' + path.resolve(SHEET).replace(/\\/g, '/');
    await win.loadURL(filePath);

    const payload = JSON.stringify({
        targets: TARGETS.map(t => ({ src: t.src, file: t.file, height: ARROW_H, glow: t.glow })),
        pad: PAD,
        glowBlur: GLOW_BLUR
    });

    const results = await win.webContents.executeJavaScript(`(() => {
        const { targets, pad: PAD, glowBlur: GLOW_BLUR } = ${payload};
        const img = document.querySelector('img');
        const sheet = document.createElement('canvas');
        sheet.width = img.naturalWidth;
        sheet.height = img.naturalHeight;
        sheet.getContext('2d').drawImage(img, 0, 0);

        // наскільки колір тримаємо «це ще фон» відносно кольору країв ділянки
        const TOL = 26;

        const items = targets.map(t => {
            const W = t.src.w, H = t.src.h;

            // 1. Тимчасовий канвас із потрібною ділянкою атласу
            const reg = document.createElement('canvas');
            reg.width = W;
            reg.height = H;
            const rctx = reg.getContext('2d', { willReadFrequently: true });
            rctx.drawImage(sheet, t.src.minX, t.src.minY, W, H, 0, 0, W, H);
            const px = rctx.getImageData(0, 0, W, H).data;

            // 2. Колір фону — медіана світлих пікселів по краях ділянки
            const ring = [];
            for (let x = 0; x < W; x++) ring.push(x, (H - 1) * W + x);
            for (let y = 1; y < H - 1; y++) ring.push(y * W, y * W + W - 1);
            const light = ring.filter(p => Math.min(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) > 180);
            const med = c => {
                const v = light.map(p => px[p * 4 + c]).sort((a, b) => a - b);
                return v.length ? v[v.length >> 1] : 255;
            };
            const ref = [med(0), med(1), med(2)];

            // 3. Flood-fill від країв: знімаємо лише те, що зв'язане з краєм ділянки
            const isBg = new Uint8Array(W * H);
            {
                const seen = new Uint8Array(W * H);
                const stack = [];
                const add = p => {
                    if (seen[p]) return;
                    const i = p * 4;
                    if (Math.abs(px[i] - ref[0]) > TOL ||
                        Math.abs(px[i + 1] - ref[1]) > TOL ||
                        Math.abs(px[i + 2] - ref[2]) > TOL) return;
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
            }

            // 4. Найбільша зв'язна компонента з НЕ-фонових пікселів = сама натрілка
            const label = new Int32Array(W * H).fill(-1);
            let bestId = -1, bestSize = 0, nextId = 0;
            for (let s = 0; s < W * H; s++) {
                if (isBg[s] || label[s] >= 0) continue;
                const id = nextId++;
                const stack = [s];
                label[s] = id;
                let size = 0;
                while (stack.length) {
                    const p = stack.pop();
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
                        stack.push(q);
                    }
                }
                if (size > bestSize) { bestSize = size; bestId = id; }
            }

            // 5. Чистий силует + його межі
            const mask = rctx.createImageData(W, H);
            const m = mask.data;
            let x0 = W, y0 = H, x1 = -1, y1 = -1;
            for (let p = 0; p < W * H; p++) {
                if (label[p] !== bestId) continue;
                const i = p * 4, x = p % W, y = (p / W) | 0;
                m[i] = px[i]; m[i + 1] = px[i + 1]; m[i + 2] = px[i + 2]; m[i + 3] = 255;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
            const clean = document.createElement('canvas');
            clean.width = W;
            clean.height = H;
            clean.getContext('2d').putImageData(mask, 0, 0);
            const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

            // 6. Hotspot: перший непрозорий піксель верхнього рядка силуету — вістря
            let tipX = x0, tipY = y0;
            scanTip:
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    if (m[(y * W + x) * 4 + 3] > 0) { tipX = x; tipY = y; break scanTip; }
                }
            }

            // 7. Масштаб під цільову висоту натрілки (однакова в усіх станах)
            const scale = t.height / ch;
            const dw = Math.round(cw * scale), dh = t.height;

            return {
                file: t.file,
                glow: t.glow,
                clean, x0, y0, cw, ch, dw, dh, scale, tipX, tipY,
                // діагностика: скільки тла знято і скільки пікселів лишилось у натрілці
                bgPct: Math.round(Array.prototype.reduce.call(isBg, (a, v) => a + v, 0) / (W * H) * 100),
                arrowPct: Math.round(bestSize / (W * H) * 100)
            };
        });

        // 8. Канвас ОДНАКОВОГО розміру для всіх станів: золота й срібна натрілки
        //    різняться на 1-2px по ширині, тому беремо найширшу + PAD з усіх боків.
        //    Однаковий розмір = жодного перевиділення спрайта в Chromium і жодного
        //    стрибка hotspot при зміні стану.
        const cwOut = Math.max.apply(null, items.map(i => i.dw)) + PAD * 2;
        const chOut = targets[0].height + PAD * 2;

        return items.map(it => {
            const out = document.createElement('canvas');
            out.width = cwOut;
            out.height = chOut;
            const octx = out.getContext('2d');
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = 'high';

            // 9. Ореол (лише наведення) — по СИЛУЕТУ натрілки: shadowBlur малює ту
            //    саму форму тінню, тому сяйво повторює контур натрілки, а не
            //    круглу плашку під нею. Чиста натрілка — поверх ореолу.
            if (it.glow) {
                octx.save();
                octx.shadowColor = it.glow;
                octx.shadowBlur = GLOW_BLUR;
                octx.drawImage(it.clean, it.x0, it.y0, it.cw, it.ch, PAD, PAD, it.dw, it.dh);
                octx.restore();
            }
            octx.drawImage(it.clean, it.x0, it.y0, it.cw, it.ch, PAD, PAD, it.dw, it.dh);

            return {
                file: it.file,
                dataUrl: out.toDataURL('image/png'),
                width: out.width,
                height: out.height,
                hotX: Math.round((it.tipX - it.x0) * it.scale) + PAD,
                hotY: Math.round((it.tipY - it.y0) * it.scale) + PAD,
                bgPct: it.bgPct,
                arrowPct: it.arrowPct
            };
        });
    })()`);

    const hot = {};
    for (const r of results) {
        const out = path.join(OUT_DIR, r.file);
        fs.writeFileSync(out, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
        hot[r.file] = [r.hotX, r.hotY];
        console.log(`${out}  ${r.width}x${r.height}  hotspot ${r.hotX} ${r.hotY}` +
            `  (фон знято ${r.bgPct}%, натрілка ${r.arrowPct}%)`);
    }

    // Готові рядки для CSS — щоб hotspot-и в index.html/splash.html не розходилися.
    // Другий url() у hover/disabled — фолбек: якщо Chromium ще не встиг підготувати
    // варіант стану, покаже базову золоту натрілку, а не стандартний курсор чи
    // білу руку (саме вони «блимали» поверх гри).
    const url = f => `url('../../assets/textures/cursors/${f}') ${hot[f][0]} ${hot[f][1]}`;
    console.log('\n/* вставити в «CUSTOM CURSOR» обох сторінок */');
    console.log(`html { cursor: ${url('cursor-gold.png')}, auto !important; }`);
    console.log(`/* hover */\ncursor: ${url('cursor-gold-hover.png')}, ${url('cursor-gold.png')}, pointer !important;`);
    console.log(`/* disabled */\ncursor: ${url('cursor-gray.png')}, ${url('cursor-gold.png')}, not-allowed !important;`);

    console.log('\nDone.');
    app.quit();
});
