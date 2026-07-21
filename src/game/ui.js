// ============================================================
// BUILD BUTTONS
// ============================================================
function setBuildMode(mode) {
    document.querySelectorAll('.build-btn').forEach(btn => btn.classList.remove('active'));
    buildMode = mode;
    if (mode !== 'none') {
        const btn = document.querySelector(`.build-btn[data-mode="${mode}"]`);
        if (btn) btn.classList.add('active');
        canvas.style.cursor = 'crosshair';
    } else {
        canvas.style.cursor = 'default';
    }
    hoverEdge = null;
    hoverVertex = null;
    if (mapData) renderMap(mapData, canvas, mapHexSize);
}

document.querySelectorAll('.build-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setBuildMode(btn.dataset.mode);
    });
});

function canRollDice() {
    if (isRolling) return false;
    if (!isInitialPhaseComplete()) return false;
    return true;
}

// ============================================================
// MOUSE INTERACTION
// ============================================================
const canvas = document.getElementById('mapCanvas');

canvas.addEventListener('mousemove', (e) => {
    if (buildMode === 'none') {
        if (hoverEdge !== null || hoverVertex !== null) {
            hoverEdge = null;
            hoverVertex = null;
            renderMap(mapData, canvas, mapHexSize);
        }
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const ox = mapOffset.ox, oy = mapOffset.oy;
    let newHoverEdge = null;
    let newHoverVertex = null;
    let found = false;

    if (buildMode === 'road') {
        let minDist = Infinity;
        for (const [ek, edge] of edgeGeom.edges) {
            if (!isEdgeValidForRoad(ek)) continue;
            if (!isEdgeConnected(ek)) continue;
            const ex = edge.cx + ox, ey = edge.cy + oy;
            const d = Math.sqrt((mx - ex) ** 2 + (my - ey) ** 2);
            if (d < minDist && d < mapHexSize * 0.7) {
                minDist = d;
                newHoverEdge = ek;
            }
        }
        if (newHoverEdge) found = true;
    } else {
        let minDist = Infinity;
        for (const [vk, vert] of vertexGeom) {
            if (buildMode === 'settlement' && !canPlaceSettlement(vk)) continue;
            if (buildMode === 'city') {
                const existing = gameState.settlements.get(vk);
                if (!existing || existing.type !== 'settlement') continue;
            }
            const vx = vert.pos.x + ox, vy = vert.pos.y + oy;
            const d = Math.sqrt((mx - vx) ** 2 + (my - vy) ** 2);
            if (d < minDist && d < mapHexSize * 0.7) {
                minDist = d;
                newHoverVertex = vk;
            }
        }
        if (newHoverVertex) found = true;
    }

    if (newHoverEdge !== hoverEdge || newHoverVertex !== hoverVertex) {
        hoverEdge = newHoverEdge;
        hoverVertex = newHoverVertex;
        renderMap(mapData, canvas, mapHexSize);
    }
});

canvas.addEventListener('click', (e) => {
    if (buildMode === 'none') return;
    if (isInitialPhaseComplete()) {
        if (!hasResourcesForBuilding(buildMode)) {
            const totalEl = document.getElementById('total');
            const originalText = totalEl.textContent;
            totalEl.textContent = 'Недостатньо ресурсів!';
            totalEl.style.color = '#e74c3c';
            setTimeout(() => {
                totalEl.textContent = originalText;
                totalEl.style.color = '#f1c40f';
            }, 2000);
            return;
        }
    }

    if (buildMode === 'road' && hoverEdge) {
        if (!gameState.roads.has(hoverEdge) && isEdgeValidForRoad(hoverEdge) && isEdgeConnected(hoverEdge)) {
            if (!canBuildPiece('road')) { showLimitMessage('Ліміт доріг вичерпано (15)!'); return; }
            if (isInitialPhaseComplete()) deductResources('road');
            gameState.roads.add(hoverEdge);
            renderMap(mapData, canvas, mapHexSize);
            updateBuildStats();
        }
    } else if (buildMode === 'settlement' && hoverVertex) {
        if (canPlaceSettlement(hoverVertex)) {
            if (!canBuildPiece('settlement')) { showLimitMessage('Ліміт поселень вичерпано (5)!'); return; }
            if (isInitialPhaseComplete()) deductResources('settlement');
            gameState.settlements.set(hoverVertex, { type: 'settlement' });
            renderMap(mapData, canvas, mapHexSize);
            updateBuildStats();
        }
    } else if (buildMode === 'city' && hoverVertex) {
        const existing = gameState.settlements.get(hoverVertex);
        if (existing && existing.type === 'settlement') {
            if (!canBuildPiece('city')) { showLimitMessage('Ліміт міст вичерпано (4)!'); return; }
            if (isInitialPhaseComplete()) deductResources('city');
            gameState.settlements.set(hoverVertex, { type: 'city' });
            renderMap(mapData, canvas, mapHexSize);
            updateBuildStats();
        }
    }
});

// ============================================================
// RESOURCE COLLECTION
// ============================================================
function collectResources(diceTotal) {
    const collected = [];
    if (!mapData) return collected;
    for (const [vk, building] of gameState.settlements) {
        const vert = vertexGeom.get(vk);
        if (!vert) continue;
        const multiplier = building.type === 'city' ? 2 : 1;
        for (const hex of vert.hexes) {
            const hexKeyStr = hexKey(hex);
            const number = mapData.numbers.get(hexKeyStr);
            const resourceType = mapData.resources.get(hexKeyStr);
            if (number === diceTotal && resourceType && resourceType !== 'desert') {
                for (let i = 0; i < multiplier; i++) {
                    gameState.resourceCards[resourceType]++;
                    collected.push({ type: resourceType, icon: RESOURCES[resourceType].icon, name: RESOURCES[resourceType].name });
                }
            }
        }
    }
    return collected;
}

function showResourceNotification(collected) {
    if (collected.length === 0) return;
    updateResourceCardsDisplay();
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(26, 26, 46, 0.95);
        border: 2px solid #f39c12;
        border-radius: 12px;
        padding: 20px 30px;
        color: #fff;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 1.2em;
        z-index: 1000;
        box-shadow: 0 0 30px rgba(243, 156, 18, 0.5);
        text-align: center;
    `;
    let content = '<div style="color: #f1c40f; margin-bottom: 10px; font-weight: bold;">🎉 Отримано ресурси!</div>';
    content += '<div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">';
    const grouped = {};
    for (const item of collected) {
        if (!grouped[item.type]) grouped[item.type] = { icon: item.icon, name: item.name, count: 0 };
        grouped[item.type].count++;
    }
    for (const [type, data] of Object.entries(grouped)) {
        content += `<div style="display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
            <span style="font-size: 1.5em;">${data.icon}</span>
            <span>${data.name} ×${data.count}</span>
        </div>`;
    }
    content += '</div>';
    notification.innerHTML = content;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.transition = 'opacity 0.5s';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}

// ============================================================
// DICE ROLLING
// ============================================================
function rollDice() {
    if (!canRollDice()) {
        const totalEl = document.getElementById('total');
        const originalText = totalEl.textContent;
        totalEl.textContent = 'Потрібно: 1 поселення + 2 дороги';
        totalEl.style.color = '#e74c3c';
        setTimeout(() => {
            totalEl.textContent = originalText;
            totalEl.style.color = '#f1c40f';
        }, 2000);
        return;
    }
    isRolling = true;
    const rollBtn = document.getElementById('rollBtn');
    rollBtn.disabled = true;
    rollBtn.style.opacity = '0.6';
    rollBtn.style.cursor = 'not-allowed';

    const die1 = document.getElementById('die1');
    const die2 = document.getElementById('die2');
    const totalEl = document.getElementById('total');
    playDiceSound();
    die1.classList.add('rolling');
    die2.classList.add('rolling');

    const val1 = Math.floor(Math.random() * 6) + 1;
    const val2 = Math.floor(Math.random() * 6) + 1;
    const total = val1 + val2;

    setTimeout(() => {
        die1.classList.remove('rolling');
        die2.classList.remove('rolling');
        die1.innerHTML = `<span class="die-value">${getDieSymbol(val1)}</span>`;
        die2.innerHTML = `<span class="die-value">${getDieSymbol(val2)}</span>`;
        totalEl.textContent = `Сума: ${total}`;
        const collected = collectResources(total);
        showResourceNotification(collected);
        setTimeout(() => {
            isRolling = false;
            rollBtn.disabled = false;
            rollBtn.style.opacity = '1';
            rollBtn.style.cursor = 'pointer';
        }, 1500);
    }, 800);
}

// ============================================================
// SOUND EFFECTS
// ============================================================
function playDiceSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200 + Math.random() * 200, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(300 + Math.random() * 300, audioContext.currentTime);
            gain2.gain.setValueAtTime(0.1, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            osc2.start();
            osc2.stop(audioContext.currentTime + 0.2);
        }, 100);
    } catch (e) {}
}

function getDieSymbol(value) {
    const symbols = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
    return symbols[value] || value;
}

// ============================================================
// TRADING SYSTEM
// ============================================================
function openTradeModal() {
    const portTrades = [];
    if (mapData && vertexGeom) {
        for (const [vk, building] of gameState.settlements) {
            const vert = vertexGeom.get(vk);
            if (!vert) continue;
            for (const hex of vert.hexes) {
                const hexKeyStr = hexKey(hex);
                const oceanInfo = mapData.ocean.get(hexKeyStr);
                if (oceanInfo && (oceanInfo.type === 'port3' || oceanInfo.type === 'port2')) {
                    if (oceanInfo.portCorners && vert.pos) {
                        const hexPixel = hexToPixel(hex, mapHexSize);
                        const corners = hexCorners(hexPixel.x, hexPixel.y, mapHexSize);
                        for (const cornerIdx of oceanInfo.portCorners) {
                            const corner = corners[cornerIdx];
                            const dist = Math.sqrt((vert.pos.x - corner.x) ** 2 + (vert.pos.y - corner.y) ** 2);
                            if (dist < mapHexSize * 0.15) {
                                if (oceanInfo.type === 'port3') portTrades.push({ type: '3:1', resource: null });
                                else if (oceanInfo.type === 'port2') portTrades.push({ type: '2:1', resource: oceanInfo.resource });
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    const availableTradeTypes = [{ type: '4:1', resource: null }];
    const has3to1 = portTrades.some(p => p.type === '3:1');
    if (has3to1) availableTradeTypes.length = 0;
    if (has3to1) availableTradeTypes.push({ type: '3:1', resource: null });
    const trades2to1 = portTrades.filter(p => p.type === '2:1');
    availableTradeTypes.push(...trades2to1);

    const cards = gameState.resourceCards;

    const modal = document.createElement('div');
    modal.id = 'tradeModal';
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 2000;`;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `background: rgba(26,26,46,0.95); border: 2px solid #f39c12; border-radius: 12px; padding: 25px; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; width: 90%; box-shadow: 0 0 30px rgba(243,156,18,0.5);`;

    let html = '<h3 style="text-align: center; color: #f39c12; margin-bottom: 20px; letter-spacing: 2px;">🔄 ОБМІН РЕСУРСІВ</h3>';
    html += '<p style="text-align: center; color: #ccc; margin-bottom: 20px;">Обміняйте ресурси за кращим курсом</p>';
    html += '<div style="margin-bottom: 20px;"><h4 style="color: #e67e22; margin-bottom: 10px;">Крок 1: Виберіть тип обміну</h4>';
    html += '<div id="tradeTypeOptions" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">';
    for (const trade of availableTradeTypes) {
        let tradeLabel = trade.type;
        let tradeDesc = '';
        if (trade.type === '4:1') tradeDesc = '4:1 (загальний)';
        else if (trade.type === '3:1') tradeDesc = '3:1 (порт)';
        else if (trade.type === '2:1') tradeDesc = `2:1 (${RESOURCES[trade.resource].icon} ${RESOURCES[trade.resource].name})`;
        html += `<div class="trade-type-option" data-trade-type="${trade.type}" data-trade-resource="${trade.resource || ''}" style="padding: 10px 15px; border-radius: 8px; cursor: pointer; background: rgba(243,156,18,0.2); border: 2px solid #f39c12; transition: all 0.2s; min-width: 100px; text-align: center;">
            <div style="font-size: 1.2em; font-weight: bold; color: #f1c40f;">${tradeLabel}</div>
            <div style="font-size: 0.75em; color: #ccc;">${tradeDesc}</div>
        </div>`;
    }
    html += '</div></div>';
    html += '<div id="tradeStep2" style="display: none; margin-bottom: 20px;"><h4 style="color: #e67e22; margin-bottom: 10px;">Крок 2: Виберіть ресурс для обміну</h4><div id="giveOptions" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;"></div></div>';
    html += '<div id="tradeStep3" style="display: none; margin-bottom: 20px;"><h4 style="color: #e67e22; margin-bottom: 10px;">Крок 3: Виберіть ресурс, який хочете отримати</h4><div id="receiveOptions" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;"></div></div>';
    html += '<div id="tradeConfirm" style="display: none; text-align: center;"><button id="confirmTradeBtn" style="padding: 12px 30px; font-size: 1em; background: linear-gradient(135deg, #27ae60, #229954); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Підтвердити обмін</button></div>';
    html += '<div style="text-align: center; margin-top: 15px;"><button id="closeTradeBtn" style="padding: 8px 20px; font-size: 0.9em; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; cursor: pointer;">Скасувати</button></div>';

    modalContent.innerHTML = html;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    let selectedTradeType = null, selectedTradeResource = null, selectedGiveResource = null, selectedReceiveResource = null;

    setTimeout(() => {
        document.querySelectorAll('.trade-type-option').forEach(option => {
            option.addEventListener('click', function() {
                selectedTradeType = this.dataset.tradeType;
                selectedTradeResource = this.dataset.tradeResource || null;
                document.querySelectorAll('.trade-type-option').forEach(opt => {
                    opt.style.borderColor = opt.dataset.tradeType === selectedTradeType ? '#f1c40f' : '#f39c12';
                    opt.style.background = opt.dataset.tradeType === selectedTradeType ? 'rgba(243,156,18,0.4)' : 'rgba(243,156,18,0.2)';
                });
                document.getElementById('tradeStep2').style.display = 'block';
                const giveOptions = document.getElementById('giveOptions');
                giveOptions.innerHTML = '';
                const neededCount = selectedTradeType === '4:1' ? 4 : (selectedTradeType === '3:1' ? 3 : 2);
                const allowedGiveResources = selectedTradeType === '2:1' && selectedTradeResource ? [selectedTradeResource] : ['wood', 'brick', 'geese', 'water', 'stone'];
                for (const type of allowedGiveResources) {
                    const count = cards[type];
                    const canTrade = count >= neededCount;
                    giveOptions.innerHTML += `<div class="give-option ${canTrade ? 'available' : 'unavailable'}" data-resource="${type}" style="padding: 10px 15px; border-radius: 8px; cursor: ${canTrade ? 'pointer' : 'not-allowed'}; background: ${canTrade ? 'rgba(243,156,18,0.2)' : 'rgba(255,255,255,0.05)'}; border: 2px solid ${canTrade ? '#f39c12' : 'rgba(255,255,255,0.1)'}; opacity: ${canTrade ? '1' : '0.5'}; transition: all 0.2s;">
                        <div style="font-size: 1.5em;">${RESOURCES[type].icon}</div>
                        <div style="font-size: 0.8em; color: #ccc;">${RESOURCES[type].name}</div>
                        <div style="font-size: 1.1em; font-weight: bold; color: #f1c40f;">${count}</div>
                        <div style="font-size: 0.7em; color: #aaa;">потрібно ${neededCount}</div>
                    </div>`;
                }
                document.querySelectorAll('.give-option.available').forEach(option => {
                    option.addEventListener('click', function() {
                        selectedGiveResource = this.dataset.resource;
                        document.querySelectorAll('.give-option').forEach(opt => {
                            opt.style.borderColor = opt.dataset.resource === selectedGiveResource ? '#f1c40f' : (opt.classList.contains('available') ? '#f39c12' : 'rgba(255,255,255,0.1)');
                        });
                        document.getElementById('tradeStep3').style.display = 'block';
                        const receiveOptions = document.getElementById('receiveOptions');
                        receiveOptions.innerHTML = '';
                        const portResource = selectedTradeType === '2:1' ? selectedTradeResource : null;
                        const excludedResource = portResource || selectedGiveResource;
                        const allowedResources = ['wood', 'brick', 'geese', 'water', 'stone'].filter(r => r !== excludedResource);
                        for (const type of allowedResources) {
                            receiveOptions.innerHTML += `<div class="receive-option" data-resource="${type}" style="padding: 10px 15px; border-radius: 8px; cursor: pointer; background: rgba(243,156,18,0.2); border: 2px solid #f39c12; transition: all 0.2s;">
                                <div style="font-size: 1.5em;">${RESOURCES[type].icon}</div>
                                <div style="font-size: 0.8em; color: #ccc;">${RESOURCES[type].name}</div>
                                <div style="font-size: 1.1em; font-weight: bold; color: #f1c40f;">×1</div>
                            </div>`;
                        }
                        document.querySelectorAll('.receive-option').forEach(option => {
                            option.addEventListener('click', function() {
                                selectedReceiveResource = this.dataset.resource;
                                document.querySelectorAll('.receive-option').forEach(opt => {
                                    opt.style.borderColor = opt.dataset.resource === selectedReceiveResource ? '#f1c40f' : '#f39c12';
                                    opt.style.background = opt.dataset.resource === selectedReceiveResource ? 'rgba(243,156,18,0.4)' : 'rgba(243,156,18,0.2)';
                                });
                                document.getElementById('tradeConfirm').style.display = 'block';
                            });
                        });
                        document.getElementById('tradeConfirm').style.display = 'none';
                    });
                });
                document.getElementById('tradeStep3').style.display = 'none';
                document.getElementById('tradeConfirm').style.display = 'none';
            });
        });

        document.getElementById('confirmTradeBtn').addEventListener('click', () => {
            if (selectedGiveResource && selectedReceiveResource && selectedTradeType) {
                const cost = selectedTradeType === '4:1' ? 4 : (selectedTradeType === '3:1' ? 3 : 2);
                gameState.resourceCards[selectedGiveResource] -= cost;
                gameState.resourceCards[selectedReceiveResource]++;
                updateResourceCardsDisplay();
                modal.remove();
            }
        });

        document.getElementById('closeTradeBtn').addEventListener('click', () => { modal.remove(); });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }, 100);
}