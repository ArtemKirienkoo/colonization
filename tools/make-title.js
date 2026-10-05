/**
 * Назва гри («COLONIZATION») з наданого файлу в асет для UI:
 *   assets/textures/75c64ad4-8136-482d-8d87-899d88d69f78.png (2172×724, альфа)
 *   → assets/textures/menu/game-title.png
 *
 * У наданому файлі навколо напису великі прозорі поля (вміст — x 51…2124,
 * y 213…537), тому його підрізаємо по альфі й зводимо до ширини 1600px, щоб
 * у CSS можна було задавати ширину без «повітря» навколо.
 *
 * Малюють його: splash.html — .logo (головне меню) і .loading-logo (екран
 * загрузки сервера), index.html — .mm-loading-logo (вікно запуску катки).
 *
 * Запуск: npx electron tools/make-title.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SRC = 'assets/textures/75c64ad4-8136-482d-8d87-899d88d69f78.png';
const OUT = 'assets/textures/menu/game-title.png';
const OUT_WIDTH = 1600;
const ALPHA_MIN = 8; // усе, що прозоріше — порожнє поле

app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1600, height: 1200, show: false });
    await win.loadURL('file:///' + path.resolve(SRC).replace(/\\/g, '/'));

    const res = await win.webContents.executeJavaScript(`(() => {
        const img = document.querySelector('img');
        const src = document.createElement('canvas');
        src.width = img.naturalWidth;
        src.height = img.naturalHeight;
        const sctx = src.getContext('2d', { willReadFrequently: true });
        sctx.drawImage(img, 0, 0);
        const W = src.width, H = src.height;
        const px = sctx.getImageData(0, 0, W, H).data;

        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (px[(y * W + x) * 4 + 3] <= ${ALPHA_MIN}) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return { error: 'файл повністю прозорий' };

        const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
        const scale = Math.min(1, ${OUT_WIDTH} / cw);
        const dw = Math.round(cw * scale), dh = Math.round(ch * scale);
        const dst = document.createElement('canvas');
        dst.width = dw;
        dst.height = dh;
        const dctx = dst.getContext('2d');
        dctx.imageSmoothingEnabled = true;
        dctx.imageSmoothingQuality = 'high';
        dctx.drawImage(src, x0, y0, cw, ch, 0, 0, dw, dh);
        return { dataUrl: dst.toDataURL('image/png'), width: dw, height: dh, crop: cw + '×' + ch + ' @ ' + x0 + ',' + y0, srcSize: W + '×' + H };
    })()`);

    if (res.error) {
        console.error('Помилка:', res.error);
        app.quit();
        return;
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(res.dataUrl.split(',')[1], 'base64'));
    console.log(`${OUT}  ${res.width}x${res.height}  (джерело ${res.srcSize}, вміст ${res.crop}, пропорція ${(res.width / res.height).toFixed(3)})`);
    console.log('\nDone.');
    app.quit();
});
