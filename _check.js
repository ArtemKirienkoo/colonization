const RESOURCES = {
<script>

</div>
    <div class="side-panel-tab" id="signTabRight">Р‘СѓРґС–РІРЅРёС†С‚РІРѕ в–є</div>
    </div>
        <div class="sp-row"><span class="sp-icon">рџЏ°</span> РњС–СЃС‚Рѕ <span style="opacity:0.7;font-size:0.8em;">рџ’§рџ’§рџЄЁрџЄЁрџЄЁ</span> <span id="sp-cities">0/4</span></div>
        <div class="sp-row"><span class="sp-icon">рџЏ </span> РЎРµР»Рѕ <span style="opacity:0.7;font-size:0.8em;">рџЊІрџ§±рџ¦†рџ’§</span> <span id="sp-settlements">0/5</span></div>
        <div class="sp-row"><span class="sp-icon">рџ›¤пёЏ</span> Р”РѕСЂРѕРіР° <span style="opacity:0.7;font-size:0.8em;">рџЊІрџ§±</span> <span id="sp-roads">0/15</span></div>
        <div class="sp-title">Р‘СѓРґС–РІРЅРёС†С‚РІРѕ</div>
    <div class="side-panel-content" id="signContentRight">
<div class="side-panel-wrap panel-right collapsed" id="signPanelRight">
<!-- Р’РёРІС–СЃРєР° Р±СѓРґС–РІРЅРёС†С‚РІР° (СЃРїСЂР°РІР°, РІРµР»РёРєРёР№ СЂРѕР·РјС–СЂ) -->

</div>
    <div class="side-panel-tab" id="signTabLeft">в—„ РўСЂРµРєС–РЅРіРё</div>
    </div>
        <div class="sp-row"><span class="sp-icon">рџ›¤пёЏ</span> Р”РѕСЂРѕРіР°: <span id="sp-road">0</span>/<span id="sp-road-th">5</span></div>
        <div class="sp-row"><span class="sp-icon">вљ”пёЏ</span> Р РёС†Р°СЂС–: <span id="sp-army">0</span>/<span id="sp-army-th">3</span></div>
        <div class="sp-row"><span class="sp-icon">рџЏ†</span> РџРћ: <span id="sp-vp">0</span></div>
        <div class="sp-title">РўСЂРµРєС–РЅРіРё</div>
    <div class="side-panel-content" id="signContentLeft">
<div class="side-panel-wrap panel-left collapsed" id="signPanelLeft">
<!-- Р’РёРІС–СЃРєР° С‚СЂРµРєС–РЅРіС–РІ (Р·Р»С–РІР°, СЃРµСЂРµРґРЅС–Р№ СЂРѕР·РјС–СЂ) -->
<!-- ===== Р‘РћРљРћР’Р† Р’РР’Р†РЎРљР (С‚СЂРµРєС–РЅРіРё + Р±СѓРґС–РІРЅРёС†С‚РІРѕ) ===== -->

</div>
    </div>
        <div class="dc-hint" id="disconnectHint">СЃРµРєСѓРЅРґ РґРѕ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕРіРѕ Р·Р°РІРµСЂС€РµРЅРЅСЏ РіСЂРё</div>
        <div class="dc-countdown" id="disconnectCountdown">60</div>
        <div class="dc-name" id="disconnectName"></div>
        <div class="dc-title" id="disconnectTitle">вљ пёЏ Р“СЂР°РІРµС†СЊ РІС–РґРєР»СЋС‡РёРІСЃСЏ</div>
    <div class="disconnect-box">
<div class="disconnect-overlay" id="disconnectOverlay" style="display:none;">
<!-- ===== DISCONNECT TIMER OVERLAY ===== -->

</div>
    </div>

        </div>
            </div>
                </div>
                    <button class="btn-no" id="devBuyNo">вќЊ РќС–</button>
                    <button class="btn-yes" id="devBuyYes">вњ… РўР°Рє</button>
                <div class="confirm-btns">
                </div>
                    <div class="dev-buy-cost-item stone-card" data-res="stone"><span class="res-icon">рџЄЁ</span><span class="cost-name">РљР°РјС–РЅСЊ Г—1</span></div>
                    <div class="dev-buy-cost-item water-card" data-res="water"><span class="res-icon">рџ’§</span><span class="cost-name">Р’РѕРґР° Г—1</span></div>
                    <div class="dev-buy-cost-item geese-card" data-res="geese"><span class="res-icon">рџ¦†</span><span class="cost-name">Р“СѓСЃРё Г—1</span></div>
                <div class="dev-buy-cost">
                <p>Р‘Р°Р¶Р°С”С‚Рµ РєСѓРїРёС‚Рё РєР°СЂС‚Сѓ СЂРѕР·РІРёС‚РєСѓ?</p>
                <h3>рџ“њ РљСѓРїС–РІР»СЏ РєР°СЂС‚Рё СЂРѕР·РІРёС‚РєСѓ</h3>
            <div class="confirm-box">
        <div class="confirm-overlay" id="devBuyModal" style="display:none;">
        <!-- РњРѕРґР°Р»РєР° РєСѓРїС–РІР»С– РєР°СЂС‚Рё СЂРѕР·РІРёС‚РєСѓ -->

        </div>
            </div>
                <div class="dev-hand" id="devHand"></div>
                </div>
                    <button class="buy-dev-btn" id="buyDevBtn">рџ“њ РљСѓРїРёС‚Рё РєР°СЂС‚Сѓ</button>
                    <h4>рџѓЏ РњРѕС— РєР°СЂС‚Рё СЂРѕР·РІРёС‚РєСѓ <span id="dev-count" style="color:#aaa;font-weight:400;">(0)</span></h4>
                <div class="dev-header">
            <div class="dev-section">
        <div class="bottom-left">
        <!-- Р—Р»С–РІР° Р·РЅРёР·Сѓ: РІСЃС– РєР°СЂС‚Рё РЅР° СЂСѓРєР°С… Сѓ РіСЂР°РІС†СЏ -->

        </div>
            </div>
                </div>
                    </div>
                        <span class="res-count" id="res-stone">0</span>
                        <div class="resource-card-item stone-card"></div>
                    <div class="card-with-count">
                    </div>
                        <span class="res-count" id="res-water">0</span>
                        <div class="resource-card-item water-card"></div>
                    <div class="card-with-count">
                    </div>
                        <span class="res-count" id="res-geese">0</span>
                        <div class="resource-card-item geese-card"></div>
                    <div class="card-with-count">
                    </div>
                        <span class="res-count" id="res-brick">0</span>
                        <div class="resource-card-item brick-card"></div>
                    <div class="card-with-count">
                    </div>
                        <span class="res-count" id="res-wood">0</span>
                        <div class="resource-card-item wood-card"></div>
                    <div class="card-with-count">
                <div class="resource-row">
            <div class="resource-cards-box">
        <div class="bottom-center">
        <!-- Р’РЅРёР·Сѓ: СЂРµСЃСѓСЂСЃРё С‚Р° С—С… РєС–Р»СЊРєС–СЃС‚СЊ -->

        </div>
            </div>
                <button class="roll-btn" id="endTurnBtn" style="background: linear-gradient(135deg, #27ae60, #229954) !important;">вњ… Р—Р°РІРµСЂС€РёС‚Рё С…С–Рґ</button>
                <button class="trade-btn" id="tradeBtn">рџ”„ РћР±РјС–РЅ</button>
            <div class="action-btns">
            <button class="roll-btn" id="rollBtn">рџЋІ РљРёРЅСѓС‚Рё</button>
            </div>
                <div class="total" id="total">РЎСѓРјР°: 0</div>
                </div>
                    <div class="die" id="die2"><span class="die-value">вљ…</span></div>
                    <div class="die" id="die1"><span class="die-value">вљ„</span></div>
                <div class="dice-container">
            <div class="dice-area" id="diceArea" title="РќР°С‚РёСЃРЅС–С‚СЊ, С‰РѕР± РєРёРЅСѓС‚Рё РєСѓР±РёРєРё">
            <div class="right-sec-title">РљСѓР±РёРєРё</div>

            </div>
                </div>
                    <div class="build-btn" data-mode="none" title="РЎРєР°СЃСѓРІР°С‚Рё СЂРµР¶РёРј Р±СѓРґС–РІРЅРёС†С‚РІР°"><span class="btn-icon cancel-icon-s">вњ•</span></div>
                    <span class="br-name" style="opacity:0.65;">РЎРєР°СЃСѓРІР°С‚Рё</span>
                <div class="build-row">
                </div>
                    <div class="build-btn" data-mode="city" title="Р‘СѓРґСѓРІР°С‚Рё РјС–СЃС‚Рѕ"><span class="btn-icon city-icon-s"></span></div>
                    <span class="br-cost">рџ’§рџ’§рџЄЁрџЄЁрџЄЁ</span>
                    <span class="br-count" id="stat-cities">0/4</span>
                    <span class="br-name">РњС–СЃС‚Рѕ</span>
                    <span class="btn-icon city-icon-s"></span>
                <div class="build-row">
                </div>
                    <div class="build-btn" data-mode="settlement" title="Р‘СѓРґСѓРІР°С‚Рё СЃРµР»Рѕ"><span class="btn-icon house-icon-s"></span></div>
                    <span class="br-cost">рџЊІрџ§±рџ¦†рџ’§</span>
                    <span class="br-count" id="stat-settlements">0/5</span>
                    <span class="br-name">РЎРµР»Рѕ</span>
                    </span>
                        <span class="btn-icon house-icon-s-details"></span>
                    <span class="btn-icon house-icon-s">
                <div class="build-row">
                </div>
                    <div class="build-btn" data-mode="road" title="Р‘СѓРґСѓРІР°С‚Рё РґРѕСЂРѕРіСѓ (РґРµСЂРµРІРѕ + С†РµРіР»Р°)"><span class="btn-icon road-icon-s"></span></div>
                    <span class="br-cost">рџЊІрџ§±</span>
                    <span class="br-count" id="stat-roads">0/15</span>
                    <span class="br-name">Р”РѕСЂРѕРіР°</span>
                    <span class="btn-icon road-icon-s"></span>
                <div class="build-row">
            <div class="build-panel">
            <div class="right-sec-title">Р‘СѓРґС–РІРЅРёС†С‚РІРѕ</div>

            </div>
                </div>
                    </div>
                        <div class="medal-stats">Р”РѕРІР¶РёРЅР°: <span class="medal-count" id="road-count">0</span>/<span id="road-threshold">5</span></div>
                        <div class="medal-title">Р”РѕСЂРѕРіР°</div>
                    <div class="medal-info">
                    <div class="medal-icon road-icon">рџ›¤пёЏ</div>
                <div class="medal" id="medal-road">
                </div>
                    </div>
                        <div class="medal-stats">Р РёС†Р°СЂС–РІ: <span class="medal-count" id="army-count">0</span>/<span id="army-threshold">3</span></div>
                        <div class="medal-title">Р’С–Р№СЃСЊРєРѕ</div>
                    <div class="medal-info">
                    <div class="medal-icon army-icon">вљ”пёЏ</div>
                <div class="medal" id="medal-army">
            <div class="medals">
            <div class="right-sec-title">РўСЂРµРєС–РЅРіРё <span class="vp-chip">рџЏ† <span id="stat-vp">0</span> РџРћ</span></div>
        <div class="right-panel">
        <!-- РЎРїСЂР°РІР°: С‚СЂРµРєС–РЅРіРё в†’ Р±СѓРґС–РІРЅРёС†С‚РІРѕ в†’ РєСѓР±РёРєРё в†’ РєРЅРѕРїРєРё (РІСЃСЏ РІРёСЃРѕС‚Р°, СЏРє РЅР° СЃРєСЂС–РЅС–) -->

        </div>
            <canvas id="mapCanvas"></canvas>
        <div class="map-area">
        <!-- Р¦РµРЅС‚СЂ: РєР°СЂС‚Р° -->

        </div>
            </div>
                <div class="dev-deck-label">РєР°СЂС‚Рё СЂРѕР·РІРёС‚РєСѓ<br><span class="dev-deck-hint">(РЅР°С‚РёСЃРЅС–С‚СЊ, С‰РѕР± РєСѓРїРёС‚Рё)</span></div>
                <div class="dev-deck-count" id="devDeckCount">25</div>
                </div>
                    <span class="dev-deck-icon">рџ“њ</span>
                <div class="dev-deck-back">
            <div class="dev-deck" id="devDeckBtn" title="РљСѓРїРёС‚Рё РєР°СЂС‚Сѓ СЂРѕР·РІРёС‚РєСѓ (РіСѓСЃРё + РІРѕРґР° + РєР°РјС–РЅСЊ)">
        <div class="left-panel">
        <!-- Р—Р»С–РІР° (РїС–СЃР»СЏ СЃРїРёСЃРєСѓ РіСЂР°РІС†С–РІ): РєРѕР»РѕРґР° РєР°СЂС‚ СЂРѕР·РІРёС‚РєСѓ -->

        </div>
            <div id="turnOrderList"></div>
            <div class="top-title">рџ”„ РџРћР РЇР”РћРљ РҐРћР”Р†Р’</div>
        <div id="turnOrderPanel" class="turn-order-bar">
        <!-- Р—Р»С–РІР°: РїРѕСЂСЏРґРѕРє С…РѕРґС–РІ РіСЂР°РІС†С–РІ (С–РєРѕРЅРєР°, РЅС–Рє, РєРѕР»С–СЂ, РџРћ) -->

    <div class="main-content">
<div class="container">

    </div>
        </div>
            <button id="backFromVolume" class="back-btn">РќР°Р·Р°Рґ</button>
            </div>
                <input type="range" id="sfxVolume" min="0" max="100" value="100">
                <label>Р—РІСѓРєРё: <span class="volume-value" id="sfxVolumeValue">100%</span></label>
            <div class="volume-slider-container">
            </div>
                <input type="range" id="musicVolume" min="0" max="100" value="100">
                <label>РњСѓР·РёРєР°: <span class="volume-value" id="musicVolumeValue">100%</span></label>
            <div class="volume-slider-container">
            </div>
                <input type="range" id="masterVolume" min="0" max="100" value="100">
                <label>Р—Р°РіР°Р»СЊРЅР° РіСѓС‡РЅС–СЃС‚СЊ: <span class="volume-value" id="masterVolumeValue">100%</span></label>
            <div class="volume-slider-container">
            <h3>Р“РЈР§РќР†РЎРўР¬</h3>
        <div class="settings-box">
    <div class="settings-overlay" id="volumeModal" style="display: none;">
<!-- Volume Settings Modal -->

    </div>
        </div>
            <button id="backFromSettings" class="back-btn">РќР°Р·Р°Рґ</button>
            <button id="volumeBtn">Р“СѓС‡РЅС–СЃС‚СЊ</button>
            <h3>РќРђР›РђРЁРўРЈР’РђРќРќРЇ</h3>
        <div class="settings-box">
    <div class="settings-overlay" id="settingsModal" style="display: none;">

<!-- Your Turn Overlay РІРёРґР°Р»РµРЅРѕ вЂ” С‚РµРєСЃС‚ РІРёРІРѕРґРёС‚СЊСЃСЏ РЅР° РєРЅРѕРїС†С– "endTurnBtn" -->

</div>
    </div>
        <button id="initialBuildOkBtn" style="display: none; padding: 15px 40px; font-size: 1.2em; background: linear-gradient(135deg, #3498db, #2980b9); color: #fff; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; margin-top: 15px;">РћРљ</button>
        <button id="initialBuildEndTurnBtn" style="display: none; padding: 15px 40px; font-size: 1.2em; background: linear-gradient(135deg, #27ae60, #22954c); color: #fff; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; margin-top: 15px;">вњ… РџСЂРѕРґРѕРІР¶РёС‚Рё</button>
        <div id="buildPhaseStatus" style="color: #f1c40f; font-size: 1.2em; font-weight: bold;"></div>
        <div id="buildPhaseOrder" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;"></div>
        <div id="buildPhaseInfo" style="color: #ccc; margin-bottom: 15px; font-size: 1.1em;"></div>
        <h2 style="color: #f39c12; margin-bottom: 20px; font-size: 1.8em;">рџЏ—пёЏ РџРѕС‡Р°С‚РєРѕРІР° С„Р°Р·Р°: Р‘СѓРґС–РІРЅРёС†С‚РІРѕ</h2>
    <div style="background: rgba(26,26,46,0.98); border: 3px solid #f39c12; border-radius: 20px; padding: 40px; text-align: center; max-width: 600px; box-shadow: 0 0 50px rgba(243,156,18,0.6);">
<div id="buildPhaseOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 2500; justify-content: center; align-items: center;">
        <!-- Initial Build Phase Overlay (1 round only) -->

</div>
    </div>
        <button id="rollDiceInitialBtn" style="padding: 15px 40px; font-size: 1.2em; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: #fff; border: none; border-radius: 10px; cursor: pointer; font-weight: bold;">рџЋІ РљРёРЅСѓС‚Рё РєСѓР±РёРєРё</button>
        <div id="dicePhaseResults" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;"></div>
        <div id="dicePhaseStatus" style="color: #f1c40f; margin-bottom: 20px; font-size: 1.2em; font-weight: bold;"></div>
        </div>
            <div class="initial-die" id="initialDie2" style="width: 70px; height: 70px; background: linear-gradient(135deg, #fff, #ddd); border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 2.5em; font-weight: bold; color: #333; box-shadow: 0 3px 10px rgba(0,0,0,0.3);">вљЂ</div>
            <div class="initial-die" id="initialDie1" style="width: 70px; height: 70px; background: linear-gradient(135deg, #fff, #ddd); border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 2.5em; font-weight: bold; color: #333; box-shadow: 0 3px 10px rgba(0,0,0,0.3);">вљЂ</div>
        <div style="display: flex; gap: 15px; justify-content: center; margin-bottom: 15px;">
        <p style="color: #ccc; margin-bottom: 15px; font-size: 1.1em;">РљРёРЅСЊС‚Рµ РєСѓР±РёРєРё, С‰РѕР± РІРёР·РЅР°С‡РёС‚Рё РїРѕСЂСЏРґРѕРє С…РѕРґС–РІ</p>
        <h2 style="color: #f39c12; margin-bottom: 20px; font-size: 1.8em;">рџЋІ РџРѕС‡Р°С‚РєРѕРІР° С„Р°Р·Р°: РљРёРґР°РЅРЅСЏ РєСѓР±РёРєС–РІ</h2>
    <div style="background: rgba(26,26,46,0.98); border: 3px solid #f39c12; border-radius: 20px; padding: 40px; text-align: center; max-width: 600px; box-shadow: 0 0 50px rgba(243,156,18,0.6);">
<div id="dicePhaseOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 2500; justify-content: center; align-items: center;">
        <!-- Initial Dice Phase Overlay (2 dice) -->

<div id="messageContainer"></div>
<!-- РџР»Р°РІР°СЋС‡С– С–РіСЂРѕРІС– РїРѕРІС–РґРѕРјР»РµРЅРЅСЏ РїРѕ С†РµРЅС‚СЂСѓ РµРєСЂР°РЅР° -->

</div>
    </div>
        <button class="menu-exit" id="menuExit">Р’РёР№С‚Рё</button>
        <button class="menu-settings" id="menuSettings">РќР°Р»Р°С€С‚СѓРІР°РЅРЅСЏ</button>
        <button class="menu-continue" id="menuContinue">РџСЂРѕРґРѕРІР¶РёС‚Рё</button>
    <div class="menu-content">
<div class="game-menu-popup" id="gameMenuPopup">
<!-- Game Menu Popup -->

</div>
    <span></span>
    <span></span>
    <span></span>
<div class="game-menu-btn" id="gameMenuBtn">
<!-- Game Menu Button -->
<body>
</head>
    </style>
    #tradeBtn { display: none !important; }
    /* РЎС‚Р°СЂР° РєРЅРѕРїРєР° "РћР±РјС–РЅ" вЂ” СЃС…РѕРІР°С‚Рё, С‚РµРїРµСЂ РѕР±РјС–РЅ С‡РµСЂРµР· РєР»С–Рє РїРѕ РєР°СЂС‚РєР°С… СЂРµСЃСѓСЂСЃС–РІ */
    .card-with-count { position: relative; }
    .trade-popup .tp-target:hover { border-color: #f1c40f; transform: scale(1.15); }
    }
        border: 2px solid rgba(255,255,255,0.3); transition: all 0.15s; background: rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center; font-size: 1.1em;
        width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
    .trade-popup .tp-target {
    .trade-popup .tp-target-row { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
    .trade-popup .tp-btn.cancel:hover { background: linear-gradient(135deg, #e74c3c, #c0392b); }
    .trade-popup .tp-btn.cancel { background: linear-gradient(135deg, #c0392b, #e74c3c); }
    .trade-popup .tp-btn:hover { background: linear-gradient(135deg, #2ecc71, #27ae60); }
    }
        font-size: 0.85em; font-weight: bold; white-space: nowrap; transition: all 0.15s;
        color: #fff; border: none; border-radius: 6px; cursor: pointer;
        padding: 5px 12px; background: linear-gradient(135deg, #27ae60, #229954);
    .trade-popup .tp-btn {
    }
        border: 7px solid transparent; border-top-color: #27ae60;
        content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    .trade-popup::after {
    @keyframes tp-appear { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    }
        animation: tp-appear 0.15s ease;
        min-width: 90px;
        box-shadow: 0 0 18px rgba(39,174,96,0.5);
        display: flex; flex-direction: column; gap: 6px;
        z-index: 500;
        padding: 8px 10px;
        border-radius: 10px;
        border: 2px solid #27ae60;
        background: rgba(26, 26, 46, 0.97);
        position: absolute; bottom: 105%; left: 50%; transform: translateX(-50%);
    .trade-popup {
    /* ===== TRADE POPUP (СЃРїР»РёРІР°СЋС‡Рµ РІС–РєРЅРѕ РЅР° РєР°СЂС‚С†С– СЂРµСЃСѓСЂСЃСѓ) ===== */

    .side-panel-content .sp-icon { font-size: 1.3em; }
    }
        color: #eee; font-size: 0.85em; text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        display: flex; align-items: center; gap: 6px;
    .side-panel-content .sp-row {
    }
        border-bottom: 1px solid rgba(241,196,15,0.3); padding-bottom: 6px;
        text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        font-size: 1em; color: #f1c40f; font-weight: bold;
    .side-panel-content .sp-title {
    }
        display: flex; flex-direction: column; gap: 8px;
        padding: 14px;
        box-shadow: 0 0 20px rgba(0,0,0,0.6);
        border-radius: 8px;
        border: 3px solid #b8860b;
        background-size: cover; background-position: center; background-repeat: no-repeat;
        width: 220px; min-height: 200px;
    .side-panel-content {
    .panel-right .side-panel-tab { left: -30px; border-radius: 8px 0 0 8px; writing-mode: vertical-lr; }
    .panel-left .side-panel-tab { right: -30px; border-radius: 0 8px 8px 0; }
    .side-panel-tab:hover { background: rgba(60, 40, 20, 0.95); }
    }
        transition: background 0.2s;
        z-index: 2; border-radius: 0 8px 8px 0;
        font-size: 0.78em; font-weight: bold; letter-spacing: 1px;
        writing-mode: vertical-rl; text-orientation: mixed;
        display: flex; align-items: center; justify-content: center;
        color: #f1c40f; cursor: pointer;
        border: 2px solid #b8860b;
        background: rgba(30, 20, 10, 0.9);
        width: 28px; height: 90px;
        position: absolute; top: 50%; transform: translateY(-50%);
    .side-panel-tab {
    .side-panel-wrap.collapsed.panel-right { transform: translateY(-50%) translateX(92%); }
    .side-panel-wrap.collapsed.panel-left { transform: translateY(-50%) translateX(-92%); }
    .side-panel-wrap.panel-right { right: 0; }
    .side-panel-wrap.panel-left { left: 0; }
    }
        z-index: 50; transition: transform 0.35s ease;
        position: fixed; top: 50%; transform: translateY(-50%);
    .side-panel-wrap {
    /* ===== COLLAPSIBLE SIDE PANELS (Р’РР’Р†РЎРљР) ===== */

    @keyframes dc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .disconnect-box .dc-hint { font-size: 0.85em; color: #aaa; margin-top: 8px; }
    .disconnect-box .dc-countdown.urgent { color: #e74c3c; animation: dc-pulse 1s infinite; }
    .disconnect-box .dc-countdown { font-size: 3.5em; font-weight: bold; color: #fff; margin: 10px 0; }
    .disconnect-box .dc-name { font-size: 1.1em; color: #f1c40f; margin-bottom: 16px; }
    .disconnect-box .dc-title { font-size: 1.3em; color: #e67e22; margin-bottom: 12px; font-weight: bold; }
    }
        max-width: 420px;
        box-shadow: 0 0 40px rgba(230, 126, 34, 0.5);
        color: #fff;
        text-align: center;
        padding: 30px 40px;
        border-radius: 16px;
        border: 2px solid #e67e22;
        background: rgba(26, 26, 46, 0.97);
    .disconnect-box {
    }
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        z-index: 3000; flex-direction: column;
        display: flex; justify-content: center; align-items: center;
        background: rgba(0, 0, 0, 0.65);
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    .disconnect-overlay {
    /* ===== DISCONNECT TIMER OVERLAY ===== */

    .dev-card-item.dev-card-textured .dc-name { color: #fff !important; font-size: 0.7em; }
    }
        min-width: 76px;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.7);
        color: #fff !important;
        border-width: 3px !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        background-size: cover !important;
    .dev-card-item.dev-card-textured {
    /* ===== DEV CARD TEXTURED ===== */

    .bottom-left::-webkit-scrollbar { display: none; }
    .bottom-left { scrollbar-width: none; }
    /* РЎРєСЂРѕР» Сѓ В«РњРѕС—С… РєР°СЂС‚Р°С…В» вЂ” Р±РµР· РІРёРґРёРјРѕС— СЃРјСѓРіРё */
    .action-btns button { flex: 1; min-width: 0; padding: 10px 4px; font-size: 0.88em; line-height: 1.2; }
    .action-btns { flex-direction: row; gap: 8px; flex: 0 0 auto; }
    /* РљРЅРѕРїРєРё В«РћР±РјС–РЅВ» С– В«Р—Р°РІРµСЂС€РёС‚Рё С…С–РґВ» вЂ” РїРѕСЂСѓС‡, Сѓ СЃР°РјРѕРјСѓ РЅРёР·Сѓ РїСЂР°РІРѕС— РєРѕР»РѕРЅРєРё */

    .total { font-size: 1.1em; }
    .die { width: 56px; height: 56px; font-size: 1.9em; border-radius: 10px; }
    .dice-container { gap: 12px; }
    .dice-area { flex: 0 0 auto; justify-content: center; gap: 8px; padding: 8px 10px; min-height: 0; }
    /* РљСѓР±РёРєРё: РєРѕРјРїР°РєС‚РЅР° Р·РѕРЅР° РІРЅРёР·Сѓ РїСЂР°РІРѕС— РєРѕР»РѕРЅРєРё */

    .build-btn .btn-icon.cancel-icon-s { width: auto; height: auto; font-size: 1.3em; }
    .build-btn .btn-icon { width: 26px; height: 22px; }
    }
        margin-left: 2px;
        font-size: 1em;
        justify-content: center;
        align-items: center;
        display: flex;
        border-radius: 50% !important;
        padding: 0 !important;
        min-width: 46px;
        height: 46px;
        width: 46px;
        flex-shrink: 0;
    .build-btn {
    .build-row .br-cost { flex-shrink: 0; font-size: 0.74em; opacity: 0.95; letter-spacing: -1px; white-space: nowrap; }
    .build-row.depleted .br-count { color: #e74c3c; }
    }
        text-align: right;
        min-width: 38px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.65);
        color: #fff;
        font-weight: 700;
        font-size: 0.85em;
        flex-shrink: 0;
    .build-row .br-count {
    }
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0,0,0,0.65);
        color: #ececec;
        font-size: 0.92em;
        min-width: 0;
        flex: 1;
    .build-row .br-name {
    .build-row > .btn-icon { flex-shrink: 0; }
    .build-row { display: flex; align-items: center; gap: 6px; padding: 2px 2px; min-width: 0; }
    .build-panel { display: flex; flex-direction: column; gap: 5px; min-height: 0; flex: 0 0 auto; }
    /* Р‘СѓРґС–РІРЅРёС†С‚РІРѕ: СЂСЏРґРєРё "РЅР°Р·РІР° + РєС–Р»СЊРєС–СЃС‚СЊ + РІР°СЂС‚С–СЃС‚СЊ" С– РљР РЈР“Р›Р† РєРЅРѕРїРєРё СЃРїСЂР°РІР° */

    .medal-vp { display: none; }
    .medal-icon { width: 38px; height: 38px; font-size: 1.25em; }
    .medal { padding: 5px 10px; gap: 9px; align-items: center; }
    .medals { flex: 0 0 auto; gap: 5px; }
    }
        white-space: nowrap;
        font-size: 1.05em;
        text-transform: none;
        letter-spacing: 0;
        color: #f1c40f;
    .right-sec-title .vp-chip {
    }
        padding: 0 2px;
        justify-content: space-between;
        align-items: center;
        display: flex;
        text-shadow: 0 1px 3px rgba(0,0,0,0.7);
        color: #f39c12;
        text-transform: uppercase;
        letter-spacing: 1.6px;
        font-weight: 700;
        font-size: 0.82em;
        flex: 0 0 auto;
    .right-sec-title {
    .right-panel { gap: 7px; min-height: 0; }
    /* ===== РџР РђР’Рђ РљРћР›РћРќРљРђ: С‚СЂРµРєС–РЅРіРё в†’ Р±СѓРґС–РІРЅРёС†С‚РІРѕ в†’ РєСѓР±РёРєРё в†’ РєРЅРѕРїРєРё ===== */

    .bottom-left::-webkit-scrollbar { display: none !important; }
    .bottom-left { scrollbar-width: none; }
    /* В«РњРѕС— РєР°СЂС‚РёВ»: СЃРєСЂРѕР»-Р±Р°СЂ РЅРµ РїРѕС‚СЂС–Р±РµРЅ */
    }
        background-color: transparent !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
    .turn-order-avatar.has-icon {
    /* Р†РєРѕРЅРєР° РїСЂРѕС„С–Р»СЋ = РЎРђРњРђ Р†РљРћРќРљРђ (Р±РµР· РєСЂСѓР¶РєР° Р№ РїС–РґСЃРІС–С‚РєРё), СЂРѕР·РјС–СЂРѕРј СЏРє СЃР»РѕС‚ Р°РІР°С‚Р°СЂР° */
    .turn-order-avatar svg { width: 20px !important; height: 20px !important; }
    .turn-order-avatar { width: 32px !important; height: 32px !important; }
    }
        text-shadow: 0 0 8px rgba(241,196,15,0.95), 0 1px 3px rgba(0,0,0,0.6);
        color: #fff !important;
    .turn-order-item.active-turn .turn-order-vp {
    .turn-order-item.active-turn .turn-order-sep,
    .turn-order-item.active-turn .turn-order-name,
    .turn-order-vp { color: #fff !important; }
    .turn-order-sep { color: rgba(255,255,255,0.8) !important; }
    .turn-order-name { max-width: 120px; color: #fff !important; }
    .turn-order-label { text-shadow: 0 1px 3px rgba(0,0,0,0.65); font-size: 0.95em; }
    }
        box-shadow: 0 0 16px rgba(241, 196, 15, 0.65), 0 3px 10px rgba(0,0,0,0.35) !important;
        border-color: #f1c40f !important;
    .turn-order-item.active-turn {
    }
        box-shadow: 0 3px 10px rgba(0,0,0,0.35) !important;
        overflow: hidden;
        justify-content: flex-start;
        border-radius: 10px !important;
        border: 2px solid rgba(0, 0, 0, 0.45) !important;
        padding: 6px 10px 6px 8px !important;
        min-width: 0 !important;
        flex: 0 0 auto !important;
    .turn-order-item {
    #turnOrderList::-webkit-scrollbar { display: none !important; }
    }
        flex: 1 !important;
        min-width: 0 !important;
        overflow-y: auto !important;
        gap: 6px !important;
        justify-content: flex-start !important;
        align-items: stretch !important;
        flex-wrap: nowrap !important;
        flex-direction: column !important;
        display: flex !important;
    #turnOrderList {
    #turnOrderPanel .top-title { display: none; }
    #turnOrderPanel::-webkit-scrollbar { display: none !important; }
    }
        gap: 6px !important;
        justify-content: flex-start !important;
        align-items: stretch !important;
        flex-direction: column !important;
        overflow-y: auto !important;
        padding: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        border: none !important;
        background: transparent !important;
    #turnOrderPanel {
    /* РџРѕСЂСЏРґРѕРє С…РѕРґС–РІ: РІРµСЂС‚РёРєР°Р»СЊРЅРёР№ СЃРїРёСЃРѕРє Р·Р»С–РІР°, РіСЂР°РІС†С– РїРѕ РїРѕСЂСЏРґРєСѓ С…РѕРґСѓ Р·РІРµСЂС…Сѓ РІРЅРёР· */

    .dev-card-item { min-width: 66px; }
    .dev-hand { gap: 5px; }
    .dev-section { padding: 2px 0; }
    .dev-deck-hint { font-size: 0.8em; color: #c9bda6; }
    .dev-deck-label { font-size: 0.85em; color: #f3e9d2; text-shadow: 0 1px 3px rgba(0,0,0,0.75); }
    .dev-deck-count { font-size: 1.05em; }
    .dev-deck-back { width: 110px; height: 148px; }
    .dev-deck { padding: 4px 2px; gap: 6px; width: 100%; }
    /* ===== Р›Р†Р’Рђ РљРћР›РћРќРљРђ: РєРѕР»РѕРґР° СЂРѕР·РІРёС‚РєСѓ ===== */

    }
        margin: auto;
        background: transparent !important;
        box-shadow: none !important;
        border-radius: 0 !important;
    canvas {
    }
        box-shadow: 0 0 18px rgba(255,136,0,0.45) !important;
        border-radius: 10px !important;
        border: 2px solid #ff8800 !important;
    .medal.escalated-road {
    }
        box-shadow: 0 0 18px rgba(255,68,68,0.45) !important;
        border-radius: 10px !important;
        border: 2px solid #ff4444 !important;
    .medal.escalated-army {
    }
        box-shadow: 0 0 14px rgba(243,156,18,0.3) !important;
        background: linear-gradient(135deg, rgba(243,156,18,0.18), rgba(243,156,18,0.05)) !important;
        border-radius: 10px !important;
        border: 2px solid #f39c12 !important;
    .medal.active-road {
    }
        box-shadow: 0 0 14px rgba(231,76,60,0.3) !important;
        background: linear-gradient(135deg, rgba(231,76,60,0.18), rgba(231,76,60,0.05)) !important;
        border-radius: 10px !important;
        border: 2px solid #e74c3c !important;
    .medal.active-army {
    }
        border-radius: 10px !important;
        box-shadow: 0 0 14px rgba(243,156,18,0.35) !important;
    .dice-area:hover, .dev-deck:hover {
    }
        border-radius: 0 !important;
        box-shadow: none !important;
        border: none !important;
        background: transparent !important;
    .dev-deck, .dev-section, .dice-area, .medal {
    }
        padding: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        border: none !important;
        background: transparent !important;
    .map-area, .costs-box, .stats-bar, .resource-cards-box, .medals, .build-btns-col {
    .left-panel, .right-panel, .bottom-left, .bottom-center,
    /* ===== FLAT UI OVERRIDES: Р¶РѕРґРЅРёС… РїР°РЅРµР»РµР№, РІС–РєРѕРЅ С– РїРѕР»РѕСЃРѕРє ===== */

    }
        to   { opacity: 1; transform: translateY(0); }
        from { opacity: 0; transform: translateY(-10px); }
    @keyframes message-in {
    .game-message.fade-out { opacity: 0; }
    }
        transition: opacity 0.6s ease;
        animation: message-in 0.25s ease-out;
        white-space: pre-wrap;
        border-radius: 12px;
        padding: 7px 20px;
        border: 1px solid rgba(243, 156, 18, 0.22);
        background: rgba(8, 8, 20, 0.62);
        text-shadow: 0 2px 5px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.55);
        text-align: center;
        font-weight: bold;
        font-size: 1.3em;
        color: #f1c40f;
    .game-message {
    }
        max-width: 70vw;
        pointer-events: none;
        gap: 6px;
        align-items: center;
        flex-direction: column;
        display: flex;
        z-index: 4500;
        transform: translateX(-50%);
        left: 50%;
        top: 36%;
        position: fixed;
    #messageContainer {
    /* ===== FLOATING GAME MESSAGES (РїРѕРІС–РґРѕРјР»РµРЅРЅСЏ РїРѕ С†РµРЅС‚СЂСѓ РµРєСЂР°РЅР°) ===== */

    }
        color: #f1c40f;
    .turn-order-item.active-turn .turn-order-vp {
    .turn-order-item.active-turn .turn-order-sep,
    .turn-order-item.active-turn .turn-order-name,
    .turn-order-vp { color: #f1c40f; font-weight: bold; white-space: nowrap; }
    .turn-order-sep { color: #999; }
    }
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        max-width: 110px;
        font-weight: 600;
        color: #fff;
    .turn-order-name {
    }
        line-height: 1.2;
        font-size: 0.85em;
        gap: 4px;
        align-items: baseline;
        display: flex;
    .turn-order-label {
    }
        filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35));
        height: 26px;
        width: 26px;
    .turn-order-avatar svg {
    }
        flex-shrink: 0;
        box-shadow: inset 0 -3px 6px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.35);
        justify-content: center;
        align-items: center;
        display: flex;
        border-radius: 50%;
        height: 40px;
        width: 40px;
    .turn-order-avatar {
    }
        box-shadow: 0 0 14px rgba(241, 196, 15, 0.5), inset 0 0 10px rgba(241, 196, 15, 0.12);
        background: rgba(241, 196, 15, 0.08);
        border-color: #f1c40f;
    .turn-order-item.active-turn {
    }
        transition: border-color 0.25s, box-shadow 0.25s, background 0.25s;
        border-radius: 10px;
        border: 2px solid rgba(255, 255, 255, 0.09);
        background: rgba(255, 255, 255, 0.03);
        padding: 5px 12px 5px 6px;
        flex-shrink: 0;
        gap: 8px;
        align-items: center;
        flex-direction: row;
        display: flex;
    .turn-order-item {
    }
        overflow-x: auto;
        min-width: 0;
        gap: 8px;
        align-items: center;
        flex-direction: row;
        display: flex;
    #turnOrderList {
    }
        flex-shrink: 0;
        white-space: nowrap;
        margin: 0;
        text-align: center;
        letter-spacing: 0.6px;
        font-weight: bold;
        font-size: 0.95em;
        color: #f39c12;
    #turnOrderPanel .top-title {
    #turnOrderPanel::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); }
    #turnOrderPanel::-webkit-scrollbar-thumb { background: rgba(243,156,18,0.35); border-radius: 3px; }
    #turnOrderPanel::-webkit-scrollbar { height: 6px; }
    }
        white-space: nowrap;
        min-width: 0;
        overflow-x: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
        border-radius: 12px;
        border: 1px solid rgba(243, 156, 18, 0.28);
        background: rgba(10, 10, 22, 0.9);
        padding: 6px 14px;
        gap: 12px;
        align-items: center;
        flex-direction: row;
        display: none;
    #turnOrderPanel {
    /* ===== TURN ORDER PANEL (С‡РµСЂРіР° С…РѕРґС–РІ) ===== */

        .yop-confirm-btn button:disabled { opacity: 0.4; cursor: not-allowed; }
        .yop-confirm-btn button { padding: 8px 24px; font-size: 0.9em; }
        .yop-confirm-btn { margin-top: 10px; }
        .yop-res-option .yop-name { font-size: 0.7em; color: #ccc; }
        .yop-res-option .yop-icon { font-size: 1.5em; }
        .yop-res-option.selected { border-color: #f1c40f; background: rgba(243,156,18,0.35); }
        .yop-res-option:hover { background: rgba(243,156,18,0.25); }
        }
            transition: all 0.2s; text-align: center; min-width: 56px;
            background: rgba(243,156,18,0.15); border: 2px solid rgba(243,156,18,0.3);
            padding: 8px 12px; border-radius: 6px; cursor: pointer;
        .yop-res-option {
        .yop-res-grid { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
        .yop-box .yop-sub { color: #aaa; font-size: 0.85em; margin-bottom: 12px; }
        .yop-box h3 { color: #f39c12; margin-bottom: 8px; font-size: 1.1em; }
        }
            max-width: 420px;
            text-align: center;
            box-shadow: 0 0 30px rgba(243,156,18,0.4);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #fff;
            padding: 24px;
            border-radius: 12px;
            border: 2px solid #f39c12;
            background: rgba(26,26,46,0.97);
        .yop-box {
        }
            z-index: 3000;
            display: flex; justify-content: center; align-items: center;
            background: rgba(0,0,0,0.7);
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        .yop-overlay {

        .dev-buy-cost-item.insufficient { opacity: 0.35; filter: grayscale(0.8); }
        .dev-buy-cost-item.stone-card { background: linear-gradient(135deg, #8a8d91, #6b6e72); border-color: #a5a8ac; }
        .dev-buy-cost-item.water-card { background: linear-gradient(135deg, #4a8fc2, #2e6d9e); border-color: #6aa8e0; }
        .dev-buy-cost-item.geese-card { background: linear-gradient(135deg, #8fbc6a, #6d9e4a); border-color: #a8d48a; }
        .dev-buy-cost-item .cost-name { font-size: 0.8em; color: #fff; font-weight: 600; }
        .dev-buy-cost-item .res-icon { font-size: 1.4em; }
        }
            transition: opacity 0.2s;
            min-width: 78px;
            border: 2px solid;
            border-radius: 8px;
            padding: 8px 12px;
            gap: 3px;
            align-items: center;
            flex-direction: column;
            display: flex;
        .dev-buy-cost-item {
        }
            margin: 10px 0 16px;
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px;
            display: flex;
        .dev-buy-cost {
        /* ===== DEV BUY MODAL (РІР°СЂС‚С–СЃС‚СЊ РєР°СЂС‚Рё СЂРѕР·РІРёС‚РєСѓ) ===== */

        .confirm-btns .btn-no { background: linear-gradient(135deg, #e74c3c, #c0392b) !important; }
        .confirm-btns .btn-yes { background: linear-gradient(135deg, #27ae60, #229954) !important; }
        .confirm-btns button { min-width: 90px; padding: 10px 24px; font-size: 0.95em; }
        .confirm-btns { display: flex; gap: 14px; justify-content: center; }
        .confirm-box p { color: #ccc; margin-bottom: 16px; font-size: 0.95em; }
        .confirm-box h3 { color: #f39c12; margin-bottom: 10px; font-size: 1.2em; }
        }
            max-width: 380px;
            text-align: center;
            box-shadow: 0 0 30px rgba(243,156,18,0.4);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #fff;
            padding: 24px 32px;
            border-radius: 12px;
            border: 2px solid #f39c12;
            background: rgba(26,26,46,0.97);
        .confirm-box {
        }
            z-index: 3000;
            display: flex; justify-content: center; align-items: center;
            background: rgba(0,0,0,0.7);
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        .confirm-overlay {
    /* ===== MODALS ===== */

        }
            margin-left: 8px;
            font-weight: bold;
            color: #f1c40f;
        .volume-value {
        }
            box-shadow: 0 0 0 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.55), 0 0 12px rgba(242,207,126,0.5);
            border: 2px solid #6e4a15;
            cursor: url('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23fffbe8%22/%3E%3Cstop offset=%220.45%22 stop-color=%22%23f6e2a0%22/%3E%3Cstop offset=%220.8%22 stop-color=%22%23d9a441%22/%3E%3Cstop offset=%221%22 stop-color=%22%239a6a1f%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22none%22 stroke=%22%23f2cf7e%22 stroke-width=%226%22 stroke-linejoin=%22round%22 opacity=%220.25%22/%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22none%22 stroke=%22%23f2cf7e%22 stroke-width=%223.2%22 stroke-linejoin=%22round%22 opacity=%220.45%22/%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22url(%23g)%22 stroke=%22%234a2f10%22 stroke-width=%222%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M11.4 12.6 L11.4 25 L14.6 21.2%22 fill=%22none%22 stroke=%22%23ffffff%22 stroke-opacity=%220.6%22 stroke-width=%221.4%22 stroke-linecap=%22round%22/%3E%3C/svg%3E') 10 12, pointer !important;
            background: radial-gradient(circle at 35% 30%, #fff7dd 0%, #f2cf7e 40%, #d9a441 75%, #a06e22 100%);
            border-radius: 50%;
            height: 24px;
            width: 24px;
        .volume-slider-container input[type="range"]::-moz-range-thumb {
        }
            transform: scale(1.12);
        .volume-slider-container input[type="range"]::-webkit-slider-thumb:hover {
        }
            transition: transform 0.15s;
            box-shadow: 0 0 0 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.55), 0 0 12px rgba(242,207,126,0.5);
            border: 2px solid #6e4a15;
            cursor: url('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23fffbe8%22/%3E%3Cstop offset=%220.45%22 stop-color=%22%23f6e2a0%22/%3E%3Cstop offset=%220.8%22 stop-color=%22%23d9a441%22/%3E%3Cstop offset=%221%22 stop-color=%22%239a6a1f%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22none%22 stroke=%22%23f2cf7e%22 stroke-width=%226%22 stroke-linejoin=%22round%22 opacity=%220.25%22/%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22none%22 stroke=%22%23f2cf7e%22 stroke-width=%223.2%22 stroke-linejoin=%22round%22 opacity=%220.45%22/%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22url(%23g)%22 stroke=%22%234a2f10%22 stroke-width=%222%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M11.4 12.6 L11.4 25 L14.6 21.2%22 fill=%22none%22 stroke=%22%23ffffff%22 stroke-opacity=%220.6%22 stroke-width=%221.4%22 stroke-linecap=%22round%22/%3E%3C/svg%3E') 10 12, pointer !important;
            background: radial-gradient(circle at 35% 30%, #fff7dd 0%, #f2cf7e 40%, #d9a441 75%, #a06e22 100%);
            /* РєРѕРІР°РЅР° Р·РѕР»РѕС‚Р° Р·Р°РєР»РµРїРєР° */
            border-radius: 50%;
            height: 24px;
            width: 24px;
            appearance: none;
            -webkit-appearance: none;
        .volume-slider-container input[type="range"]::-webkit-slider-thumb {
        }
            box-shadow: inset 0 2px 5px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.5);
            border: 2px solid #6e4a15;
            background: linear-gradient(to right, #4a2f18 0%, #2b1a0c 100%);
            /* РґРµСЂРµРІ'СЏРЅРёР№ Р±СЂСѓСЃ; Р·РѕР»РѕС‚Сѓ Р·Р°РїРѕРІРЅРµРЅСѓ С‡Р°СЃС‚РёРЅСѓ РјР°Р»СЋС” JS (paintRange) */
            appearance: none;
            -webkit-appearance: none;
            outline: none;
            border-radius: 8px;
            height: 14px;
            width: 100%;
        .volume-slider-container input[type="range"] {
        }
            font-weight: 700;
            font-size: 0.95em;
            margin-bottom: 6px;
            color: #f7f0dc;
            display: block;
        .volume-slider-container label {
        }
            text-align: left;
            margin: 12px 0;
        .volume-slider-container {
        /* ===== VOLUME SETTINGS ===== */

        .settings-box h3 { color: #ffd88a; margin-bottom: 16px; font-size: 1.3em; text-shadow: 1px 2px 4px rgba(0, 0, 0, 0.65); }
        }
            z-index: 1;
            position: relative;
            min-width: 320px;
            max-width: 420px;
            text-align: center;
            box-shadow: none;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #fff;
            padding: 24px 32px;
            border-radius: 12px;
            border: none;
            background: transparent;
        .settings-box {
        }
            z-index: 3000;
            display: flex; justify-content: center; align-items: center;
            background: rgba(0,0,0,0.85);
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        .settings-overlay {
    /* ===== SETTINGS MODAL ===== */

    }
        opacity: 0.7;
        pointer-events: none;
    body.is-paused canvas {
    body.is-paused .dev-card-item,
    body.is-paused .buy-dev-btn,
    body.is-paused .trade-btn,
    body.is-paused .roll-btn,
    body.is-paused .build-btn,
    body.is-paused .sidebar,
    /* ===== PAUSE OVERLAY - BLOCK ALL INTERACTIONS ===== */

        }
            color: #fff;
        .settings-box button.back-btn:hover {
        }
            color: #e2dcc6;
            mask-image: var(--btn-bg, url('../../assets/textures/buttons/stone-textures/btn-4.png'));
            -webkit-mask-image: var(--btn-bg, url('../../assets/textures/buttons/stone-textures/btn-4.png'));
            background-image: var(--btn-bg, url('../../assets/textures/buttons/stone-textures/btn-4.png'));
        .settings-box button.back-btn {
        }
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
            filter: brightness(0.94);
            transform: translateY(0);
        .settings-box button:active {
        .game-menu-popup .menu-content button:active,
        }
            color: #fff;
            box-shadow: 0 10px 24px rgba(0,0,0,0.55), 0 2px 5px rgba(0,0,0,0.45);
            filter: brightness(1.07) saturate(1.08);
            transform: translateY(-2px);
        .settings-box button:hover {
        .game-menu-popup .menu-content button:hover,
        }
            box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4);
            mask-repeat: no-repeat;
            -webkit-mask-repeat: no-repeat;
            mask-position: center;
            -webkit-mask-position: center;
            mask-size: 100% 100%;
            -webkit-mask-size: 100% 100%;
            mask-image: var(--btn-bg, url('../../assets/textures/buttons/stone-textures/btn-0.png'));
            -webkit-mask-image: var(--btn-bg, url('../../assets/textures/buttons/stone-textures/btn-0.png'));
            background-repeat: no-repeat;
            background-position: center;
            background-size: 100% 100%;
            background-image: var(--btn-bg, url('../../assets/textures/buttons/stone-textures/btn-0.png'));
            text-shadow: 1px 2px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.5);
            color: #f7f0dc;
            transition: all 0.25s;
            letter-spacing: 0.5px;
            font-weight: 700;
            cursor: pointer;
            border-radius: 0;
            border: none;
            font-size: 1.25em;
            padding: 18px 32px;
            width: 100%;
        .settings-box button {
        .game-menu-popup .menu-content button,
        /* ===== РљРђРњ'РЇРќР† РљРќРћРџРљР Р’ РњРћР”РђР›РљРђРҐ Р“Р Р ===== */

        }
            background-repeat: no-repeat;
            width: 100%;
            left: 0;
            position: absolute;
        .pendant-layer .pendant-board {
        .pendant-layer .pendant-chains,
        }
            filter: drop-shadow(0 14px 22px rgba(0, 0, 0, 0.55));
            pointer-events: none;
            z-index: 0;
            transform: translateX(-50%);
            left: 50%;
            top: 0;
            position: absolute;
        .pendant-layer {
        /* ===== Р”Р•Р Р•Р’'РЇРќР† РџР†Р”Р’Р†РЎРљР Р—Рђ РњРћР”РђР›РљРђРњР Р“Р Р ===== */
        }
            z-index: 1;
            position: relative;
            pointer-events: auto;
            box-shadow: none;
            min-width: 380px;
            gap: 18px;
            flex-direction: column;
            display: flex;
            padding: 40px 36px;
            border-radius: 20px;
            border: none;
            background: transparent;
        .game-menu-popup .menu-content {
        }
            pointer-events: auto;
            display: flex;
        .game-menu-popup.active {
        }
            pointer-events: none;
            align-items: center;
            justify-content: center;
            display: none;
            z-index: 1999;
            background: rgba(0, 0, 0, 0.9);
            height: 100%;
            width: 100%;
            left: 0;
            top: 0;
            position: fixed;
        .game-menu-popup {
        /* ===== GAME MENU POPUP ===== */

        }
            transform: rotate(-45deg) translate(5px, -5px);
        .game-menu-btn.active span:nth-child(3) {
        }
            opacity: 0;
        .game-menu-btn.active span:nth-child(2) {
        }
            transform: rotate(45deg) translate(5px, 5px);
        .game-menu-btn.active span:nth-child(1) {
        }
            transition: all 0.3s;
            border-radius: 1px;
            background: #f39c12;
            height: 2px;
            width: 22px;
            display: block;
        .game-menu-btn span {
        }
            transform: scale(1.05);
            border-color: #f39c12;
            background: rgba(243, 156, 18, 0.2);
        .game-menu-btn:hover {
        }
            transition: all 0.3s;
            padding: 8px;
            gap: 5px;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            display: flex;
            z-index: 2000;
            cursor: pointer;
            border-radius: 8px;
            border: 2px solid rgba(243, 156, 18, 0.4);
            background: rgba(26, 26, 46, 0.9);
            height: 40px;
            width: 40px;
            right: 15px;
            top: 15px;
            position: fixed;
        .game-menu-btn {
        /* ===== GAME MENU BUTTON ===== */

        .dev-card-item.nonusable:hover { transform: none; box-shadow: none; }
        .dev-card-item.nonusable { opacity: 0.55; filter: grayscale(0.6); cursor: not-allowed; }
        .dev-card-item.used:hover { transform: none; box-shadow: none; }
        .dev-card-item.used { opacity: 0.5; filter: grayscale(0.7); cursor: default; }
        .dev-card-item.roads { background: linear-gradient(135deg, #8e44ad, #9b59b6); border-color: #c39bd3; }
        .dev-card-item.monopoly { background: linear-gradient(135deg, #2980b9, #3498db); border-color: #85c1e9; }
        .dev-card-item.plenty { background: linear-gradient(135deg, #27ae60, #2ecc71); border-color: #82e0aa; }
        .dev-card-item.vp .dc-name { color: #1a1a2e; }
        .dev-card-item.vp { background: linear-gradient(135deg, #f39c12, #f1c40f); border-color: #f7dc6f; color: #1a1a2e; }
        .dev-card-item.knight { background: linear-gradient(135deg, #c0392b, #e74c3c); border-color: #f1948a; }
        .dev-card-item .dc-name { font-weight: 600; text-align: center; line-height: 1.1; font-size: 0.75em; }
        .dev-card-item .dc-icon { font-size: 1.3em; }
        .dev-card-item:hover { transform: translateY(-3px); box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
        }
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            user-select: none;
            transition: all 0.2s;
            cursor: pointer;
            border: 2px solid;
            font-size: 0.85em;
            padding: 5px 10px;
            gap: 2px;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            display: flex;
            border-radius: 6px;
            min-height: 60px;
            height: auto;
            min-width: 70px;
            flex-shrink: 0;
        .dev-card-item {
        .dev-hand { display: flex; gap: 4px; flex-wrap: wrap; padding: 2px 0; min-height: 50px; }
        .buy-dev-btn.enabled { opacity: 1; cursor: pointer !important; }
        .buy-dev-btn.disabled { opacity: 0.4; cursor: not-allowed !important; transform: none !important; }
        .buy-dev-btn:hover:not(.disabled) { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(142, 68, 173, 0.4); }
        .buy-dev-btn { padding: 4px 8px !important; font-size: 0.85em !important; background: linear-gradient(135deg, #8e44ad, #7c3aed) !important; flex-shrink: 0; white-space: nowrap; transition: all 0.2s; }
        .dev-header h4 { font-size: 1em; color: #f39c12; letter-spacing: 0.5px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dev-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; gap: 3px; flex-wrap: nowrap; }
        .dev-deck-label { font-size: 0.78em; color: #ccc; text-align: center; line-height: 1.25; }
        .dev-deck-count { font-size: 1em; color: #f1c40f; font-weight: bold; }
        .dev-deck-icon { font-size: 2.4em; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); position: relative; z-index: 1; }
        }
            border-radius: 6px;
            border: 2px dashed rgba(247, 220, 111, 0.5);
            position: absolute; inset: 6px;
            content: '';
        .dev-deck-back::before {
        }
            position: relative;
            box-shadow: inset 0 0 18px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.4);
            justify-content: center;
            align-items: center;
            display: flex;
            border: 3px solid #f7dc6f;
            background: linear-gradient(135deg, #8e44ad, #5b2c6f);
            border-radius: 8px;
            height: 124px;
            width: 92px;
        .dev-deck-back {
        .dev-deck:hover { border-color: #f39c12; box-shadow: 0 0 14px rgba(243,156,18,0.3); transform: translateY(-2px); }
        }
            width: 100%;
            user-select: none;
            transition: all 0.2s;
            cursor: pointer;
            border-radius: 12px;
            border: 1px solid rgba(243, 156, 18, 0.25);
            background: rgba(13, 27, 42, 0.6);
            padding: 10px 8px;
            gap: 6px;
            align-items: center;
            flex-direction: column;
            display: flex;
        .dev-deck {
        /* ===== DEV DECK (РєРѕР»РѕРґР° РєР°СЂС‚ СЂРѕР·РІРёС‚РєСѓ) ===== */

        }
            min-width: 0;
            flex-shrink: 0;
            border: 1px solid rgba(243, 156, 18, 0.12);
            border-radius: 8px;
            background: rgba(13, 27, 42, 0.5);
            padding: 5px 7px;
        .dev-section {
        /* ===== DEV CARDS ===== */

        .stats-bar .st-vp { margin-left: auto; color: #f1c40f; font-weight: bold; font-size: 1.2em; }
        .stats-bar .st-item.depleted .st-val { color: #e74c3c; }
        .stats-bar .st-item .st-val { color: #fff; font-weight: bold; }
        .stats-bar .st-item { display: flex; align-items: center; gap: 4px; color: #ccc; }
        }
            font-size: 1em;
            border: 1px solid rgba(243, 156, 18, 0.12);
            border-radius: 8px;
            background: rgba(13, 27, 42, 0.5);
            padding: 6px 12px;
            display: flex; gap: 8px; align-items: center;
        .stats-bar {
        /* ===== STATS ===== */

        .btn-icon.cancel-icon-s { font-size: 1.2em; color: #e74c3c; }
        .btn-icon.city-icon-s::after { content: ''; position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); width: 17px; height: 11px; background: #7B8DB3; border: 1.5px solid #5A6E8E; clip-path: polygon(10% 100%, 20% 0%, 80% 0%, 90% 100%); z-index: 2; }
        .btn-icon.city-icon-s::before { content: ''; position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%); width: 22px; height: 11px; background: #8B9DC3; border: 1.5px solid #5A6E8E; border-radius: 1px; z-index: 1; }
        .btn-icon.city-icon-s { position: relative; width: 26px; height: 22px; }
        .btn-icon.house-icon-s::after { content: ''; position: absolute; bottom: 9px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 9px solid #A0522D; z-index: 2; }
        .btn-icon.house-icon-s::before { content: ''; position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%); width: 18px; height: 10px; background: #D4A574; border: 1.5px solid #8B6914; border-radius: 1px; z-index: 1; }
        .btn-icon.house-icon-s { position: relative; width: 26px; height: 22px; }
        .btn-icon.road-icon-s::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 18px; height: 5px; background: #C4904A; border-radius: 1px; z-index: 2; }
        .btn-icon.road-icon-s::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 22px; height: 9px; background: #6B4226; border-radius: 2px; z-index: 1; }
        .btn-icon.road-icon-s { display: flex; align-items: center; justify-content: center; width: 26px; height: 22px; }
        .build-btn .btn-icon { font-size: 1.1em; width: 26px; height: 22px; display: flex; align-items: center; justify-content: center; position: relative; }
        .build-btn.active { background: rgba(243, 156, 18, 0.2); border-color: #f39c12; color: #f1c40f; box-shadow: 0 0 8px rgba(243, 156, 18, 0.15); }
        .build-btn:hover { background: rgba(243, 156, 18, 0.12); border-color: rgba(243, 156, 18, 0.3); color: #fff; }
        }
            min-width: 44px; color: #999; font-size: 0.65em;
            cursor: pointer; transition: all 0.2s;
            border-radius: 5px; background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(243, 156, 18, 0.15);
            padding: 5px 7px;
            display: flex; flex-direction: column; align-items: center; gap: 2px;
        .build-btn {
        }
            align-items: center;
            flex-shrink: 0;
            border: 1px solid rgba(243, 156, 18, 0.12);
            border-radius: 8px;
            background: rgba(13, 27, 42, 0.5);
            padding: 5px 6px;
            display: flex; flex-direction: column; gap: 4px;
        .build-btns-col {

        .cost-tag .ct-res { color: #999; }
        .cost-tag .ct-name { color: #ccc; margin-right: 2px; }
        .cost-tag .ct-icon.icon-devcard { font-size: 1.1em; }
        .cost-tag .ct-icon.icon-city::after { content: ''; position: absolute; bottom: 8px; width: 12px; height: 8px; background: #7B8DB3; border: 1px solid #5A6E8E; clip-path: polygon(15% 100%, 25% 0%, 75% 0%, 85% 100%); }
        .cost-tag .ct-icon.icon-city::before { content: ''; position: absolute; bottom: 1px; width: 16px; height: 8px; background: #8B9DC3; border: 1px solid #5A6E8E; border-radius: 1px; }
        .cost-tag .ct-icon.icon-house::after { content: ''; position: absolute; bottom: 7px; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 6px solid #A0522D; }
        .cost-tag .ct-icon.icon-house::before { content: ''; position: absolute; bottom: 1px; width: 13px; height: 7px; background: #D4A574; border: 1px solid #8B6914; border-radius: 1px; }
        .cost-tag .ct-icon.icon-road::after { content: ''; position: absolute; width: 13px; height: 3px; background: #C4904A; border-radius: 1px; }
        .cost-tag .ct-icon.icon-road::before { content: ''; position: absolute; width: 16px; height: 6px; background: #6B4226; border-radius: 1px; }
        .cost-tag .ct-icon { font-size: 1em; position: relative; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 16px; }
        }
            white-space: nowrap;
            font-size: 0.9em; background: rgba(255,255,255,0.04);
            padding: 5px 10px; border-radius: 5px;
            display: flex; align-items: center; gap: 6px;
        .cost-tag {
        .cost-line { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; flex: 0 0 auto; align-items: center; justify-content: center; }
        .costs-box .c-title { font-size: 1em; color: #f39c12; margin-bottom: 8px; letter-spacing: 0.5px; font-weight: 600; flex-shrink: 0; }
         }
             min-height: 0;
             flex-direction: column;
             display: flex;
             border: 1px solid rgba(243, 156, 18, 0.12);
             border-radius: 8px;
             background: rgba(13, 27, 42, 0.5);
             padding: 10px 12px;
             flex: 0 0 auto;
         .costs-box {
         .build-panel { display: flex; flex-direction: column; gap: 8px; align-items: stretch; flex-shrink: 0; }
         /* ===== BUILDING ===== */

        }
            text-align: center;
            min-width: 34px;
            text-shadow: 0 1px 3px rgba(0,0,0,0.7);
            color: #fff;
            font-weight: bold;
            font-size: 1.6em;
        .res-count {
        .resource-card-item:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.6); }
        .resource-card-item.stone-card { background-image: url('../../assets/textures/cards/5.png'); }
        .resource-card-item.water-card { background-image: url('../../assets/textures/cards/4.png'); }
        .resource-card-item.geese-card { background-image: url('../../assets/textures/cards/3.png'); }
        .resource-card-item.brick-card { background-image: url('../../assets/textures/cards/2.png'); }
        .resource-card-item.wood-card { background-image: url('../../assets/textures/cards/1.png'); }
        }
            flex-shrink: 0;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
            background-repeat: no-repeat;
            background-position: center;
            background-size: cover;
            border-radius: 5px;
            height: 116px;
            width: 54px;
        .resource-card-item {
        }
            gap: 10px;
            align-items: center;
            display: flex;
        .card-with-count {
        .resource-row { display: contents; }
        }
            min-height: 0;
            width: 100%;
            align-items: stretch;
            justify-content: center;
            flex-wrap: nowrap;
            gap: 18px;
            flex-direction: row;
            display: flex;
        .resource-grid {
        }
            min-height: 0;
            flex: 1;
            width: 100%;
            justify-content: center;
            align-items: stretch;
            display: flex;
        .resource-cards-box {
        /* Р РµСЃСѓСЂСЃРё: РІРµСЂС‚РёРєР°Р»СЊРЅС– РєР°СЂС‚Рё-РєР°СЂС‚РєРё (СЏРє РЅР° СЃРєСЂС–РЅС–) */
        /* ===== RESOURCE CARDS ===== */

        }
            background: linear-gradient(135deg, rgba(255, 136, 0, 0.22), rgba(255, 136, 0, 0.08)) !important;
            box-shadow: 0 0 18px rgba(255, 136, 0, 0.4) !important;
            border-color: #ff8800 !important;
        .medal.escalated-road {
        }
            background: linear-gradient(135deg, rgba(255, 68, 68, 0.22), rgba(255, 68, 68, 0.08)) !important;
            box-shadow: 0 0 18px rgba(255, 68, 68, 0.4) !important;
            border-color: #ff4444 !important;
        .medal.escalated-army {
        }
            100% { transform: scale(1); color: #ff6b6b; }
            50% { transform: scale(1.45); color: #ff0000; text-shadow: 0 0 14px rgba(255, 0, 0, 0.8); }
            0% { transform: scale(1); color: #ff6b6b; }
        @keyframes escalation-pulse {
        }
            animation: escalation-pulse 0.8s ease-in-out 2;
            text-shadow: 0 0 8px rgba(255, 107, 107, 0.6);
            font-weight: bold;
            color: #ff6b6b !important;
        .medal-stats .escalated {
        .medal.active-army .medal-vp, .medal.active-road .medal-vp { display: block; }
        }
            display: none;
            color: #f1c40f;
            background: rgba(241,196,15,0.15);
            border-radius: 12px;
            padding: 3px 10px;
            font-weight: bold;
            font-size: 1em;
        .medal-vp {
        .medal-stats .medal-count { color: #f1c40f; }
        .medal-stats { font-size: 1.2em; font-weight: bold; color: #fff; }
        .medal-title { font-size: 1em; color: #999; letter-spacing: 0.5px; }
        .medal-info { flex: 1; }
        }
            width: 19px; height: 5px; background: #C4904A; border-radius: 1px; z-index: 2;
            transform: translate(-50%, -50%);
            content: ''; position: absolute; top: 50%; left: 50%;
        .medal-icon.road-icon::after {
        }
            width: 24px; height: 10px; background: #6B4226; border-radius: 2px; z-index: 1;
            transform: translate(-50%, -50%);
            content: ''; position: absolute; top: 50%; left: 50%;
        .medal-icon.road-icon::before {
        }
            font-size: 0; /* С…РѕРІР°С”РјРѕ РµРјРѕРґР·С– вЂ” РґРѕСЂРѕРіСѓ РјР°Р»СЋС”РјРѕ CSS-Р±СЂСѓСЃРєР°РјРё */
            position: relative;
            border: 2px solid #f7dc6f;
            background: linear-gradient(135deg, #d4a017, #f1c40f);
        .medal-icon.road-icon {
        }
            border: 2px solid #f1948a;
            background: linear-gradient(135deg, #c0392b, #e74c3c);
        .medal-icon.army-icon {
        }
            flex-shrink: 0;
            font-size: 1.4em;
            display: flex; align-items: center; justify-content: center;
            border-radius: 50%;
            width: 40px; height: 40px;
        .medal-icon {
        }
            box-shadow: 0 0 14px rgba(243,156,18,0.25);
            background: linear-gradient(135deg, rgba(243,156,18,0.15), rgba(243,156,18,0.05));
            border-color: #f39c12;
        .medal.active-road {
        }
            box-shadow: 0 0 14px rgba(231,76,60,0.25);
            background: linear-gradient(135deg, rgba(231,76,60,0.15), rgba(231,76,60,0.05));
            border-color: #e74c3c;
        .medal.active-army {
        }
            transition: all 0.3s;
            border: 2px solid rgba(255,255,255,0.08);
            background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
            border-radius: 8px;
            padding: 6px 10px;
            gap: 8px;
            align-items: center;
            display: flex;
        .medal {
        }
            flex: 1;
            gap: 6px;
            flex-direction: column;
            display: flex;
        .medals {
        /* ===== MEDALS ===== */

        #buyDevBtn { display: none; }
        #rollBtn { display: none; }
        .action-btns button { width: 100%; }
        .action-btns { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
        .dice-area.disabled:hover { border-color: rgba(243, 156, 18, 0.25); box-shadow: none; }
        .dice-area.disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
        .dice-area:hover { border-color: #f39c12; box-shadow: 0 0 14px rgba(243,156,18,0.3); }
        }
            width: 100%;
            user-select: none;
            transition: all 0.2s;
            cursor: pointer;
            border-radius: 12px;
            border: 2px solid rgba(243, 156, 18, 0.25);
            background: rgba(13, 27, 42, 0.6);
            padding: 8px 10px;
            gap: 4px;
            align-items: center;
            flex-direction: column;
            display: flex;
        .dice-area {
        /* ===== DICE AREA (Р·РѕРЅР° РєРёРґР°РЅРЅСЏ РєСѓР±РёРєС–РІ) ===== */

        .trade-btn { background: linear-gradient(135deg, #27ae60, #229954) !important; }
        .roll-btn { background: linear-gradient(135deg, #9b59b6, #8e44ad) !important; }
        .dice-btns button { padding: 6px 12px; font-size: 0.8em; }
        .dice-btns { display: flex; gap: 6px; }
        .total { font-size: 1.2em; color: #f1c40f; font-weight: bold; }
        .die-value { font-size: 1.8em; color: #333; }
        }
            100% { transform: translateY(0) rotate(1440deg) scale(1); }
            80% { transform: translateY(4px) rotate(1260deg) scale(1.05); }
            60% { transform: translateY(-12px) rotate(1080deg) scale(1.1); }
            40% { transform: translateY(0) rotate(720deg) scale(1.2); }
            20% { transform: translateY(-18px) rotate(360deg) scale(1.1); }
            0% { transform: translateY(0) rotate(0deg); }
        @keyframes roll {
        .die.rolling { animation: roll 0.7s cubic-bezier(0.3, 0.7, 0.5, 1.5); }
        }
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            font-size: 2em; font-weight: bold; color: #333;
            display: flex; justify-content: center; align-items: center;
            border-radius: 10px;
            background: linear-gradient(135deg, #fff, #ddd);
            width: 60px; height: 60px;
        .die {
        .dice-container { display: flex; gap: 8px; }
        }
            flex-shrink: 0;
            gap: 4px;
            align-items: center;
            flex-direction: column;
            display: flex;
        .dice-panel {
        }
            align-items: flex-start;
            gap: 10px;
            display: flex;
        .top-section {
        /* ===== TOP SECTION ===== */

        }
            background: rgba(0, 0, 0, 0.1);
        .sidebar::-webkit-scrollbar-track {
        }
            border-radius: 4px;
            background: rgba(243, 156, 18, 0.3);
        .sidebar::-webkit-scrollbar-thumb {
        }
            width: 8px;
        .sidebar::-webkit-scrollbar {
        }
            overflow-y: auto;
            max-width: 680px;
            min-width: 580px;
            height: 100vh;
            flex-shrink: 0;
            border: 1px solid rgba(243, 156, 18, 0.3);
            border-radius: 8px;
            background: rgba(26, 26, 46, 0.75);
            margin-right: 0;
            margin-left: 0;
            padding: 10px 12px;
            gap: 8px;
            flex-direction: column;
            display: flex;
        .sidebar {
        /* === SIDEBAR === */
        
        button:active { transform: translateY(0); }
        button:hover { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(243,156,18,0.4); }
        }
            letter-spacing: 0.5px;
            transition: transform 0.2s, box-shadow 0.2s;
            font-weight: 600;
            color: #fff;
            background: linear-gradient(135deg, #f39c12, #e67e22);
            border-radius: 6px;
            border: none;
            font-size: 1em;
            padding: 10px 22px;
        button {
        }
            flex-shrink: 0; 
            gap: 12px; flex-wrap: wrap; 
            justify-content: center; 
            display: flex; 
        .controls { 
        /* Legacy cursor classes (kept for reference) */
        
        }
            cursor: crosshair;
        canvas.crosshair {
        }
            height: 100%;
            width: 100%;
            margin: 0;
            display: block;
            background: #1a1a2e;
            box-shadow: none;
            border-radius: 0;
        .map-area canvas {
        }
            min-height: 0;
            gap: 8px;
            flex-direction: column;
            display: flex;
        .left-panel, .right-panel, .bottom-left, .bottom-center {
        }
            z-index: 6;
            bottom: 12px;
            transform: translateX(-50%);
            left: 50%;
            position: absolute;
        .bottom-center {
        }
            overflow-y: auto;
            max-height: 190px;
            max-width: 330px;
            z-index: 6;
            bottom: 180px;
            left: 14px;
            position: absolute;
        .bottom-left {
        }
            z-index: 6;
            width: 264px;
            bottom: 12px;
            top: 58px;
            right: 14px;
            position: absolute;
        .right-panel {
        }
            z-index: 6;
            transform: translateY(-50%);
            top: 20%;
            left: 280px;
            position: absolute;
        .left-panel {
        }
            overflow-y: auto;
            max-width: 220px;
            width: auto;
            z-index: 6;
            bottom: 12px;
            top: 60px;
            left: 14px;
            position: absolute;
        #turnOrderPanel {
        }
            justify-content: center;
            align-items: center;
            display: flex;
            z-index: 0;
            inset: 0;
            position: absolute;
        .map-area {
        }
            overflow: hidden;
            padding: 0;
            max-width: 100%;
            width: 100%;
            min-height: 100vh;
            height: 100vh;
            flex: 1;
            position: relative;
        .main-content {
           РµРєСЂР°РЅР°, РїР°РЅРµР»С– РїР»Р°РІР°СЋС‚СЊ РџРћР’Р•Р РҐ РєР°СЂС‚Рё вЂ” Р¶РѕРґРЅРёС… РєРѕР»РѕРЅРѕРє С– РїСѓСЃС‚РѕС‚ ===== */
        /* ===== РћР’Р•Р Р›Р•Р™-Р РћР—РљР›РђР”РљРђ: РєР°РЅРІР°СЃ = РІРµСЃСЊ РµРєСЂР°РЅ, РґРѕС€РєР° СЂС–РІРЅРѕ РІ С†РµРЅС‚СЂС–
        .subtitle { display: none; }
        h1 { display: none; }
        }
            max-height: 100vh;
            height: 100vh;
            max-width: 100%;
            width: 100%;
            padding: 0;
            gap: 0;
            align-items: flex-start;
            flex-direction: row;
            display: flex; 
        .container { 
        input, textarea, select { text-shadow: none; }
        }
            text-shadow: 1px 2px 4px rgba(0, 0, 0, 0.85), 0 0 10px rgba(0, 0, 0, 0.35);
            color: #f7f0dc;
            font-weight: 600;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
               СЃС‚РёР»РµРј: РЅР°РїС–РІР¶РёСЂРЅРёР№, С‚РµРїР»РёР№ РІС–РґС‚С–РЅРѕРє, С‚РµРјРЅР° С‚С–РЅСЊ */
            /* Р„РґРёРЅРёР№ С€СЂРёС„С‚ UI = С€СЂРёС„С‚ С‚РµРєСЃС‚Р° РЅР° РєРЅРѕРїРєР°С…, Р· С—С…РЅС–Рј С…Р°СЂР°РєС‚РµСЂРЅРёРј
            min-height: 100vh;
            align-items: center;
            justify-content: flex-start;
            display: flex;
            background: #1a1a2e;
        body {
        html, body { height: 100%; overflow: hidden; }
        }
            cursor: url('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23d6d6d6%22/%3E%3Cstop offset=%221%22 stop-color=%22%23808080%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=%22M7 8 L7 24 L12 18 L16 24 L20 20 L14 14 L23 14 Z%22 fill=%22url(%23g)%22 stroke=%22%233f3f3f%22 stroke-width=%221.6%22 stroke-linejoin=%22round%22 opacity=%220.9%22/%3E%3C/svg%3E') 8 8, not-allowed !important;
        button[disabled], .build-btn.disabled, .dev-card-item.used, .dev-card-item.nonusable, .buy-dev-btn.disabled {
        /* Disabled: gray arrow */
        }
            cursor: url('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23fffbe8%22/%3E%3Cstop offset=%220.45%22 stop-color=%22%23f6e2a0%22/%3E%3Cstop offset=%220.8%22 stop-color=%22%23d9a441%22/%3E%3Cstop offset=%221%22 stop-color=%22%239a6a1f%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22none%22 stroke=%22%23f2cf7e%22 stroke-width=%226%22 stroke-linejoin=%22round%22 opacity=%220.25%22/%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22none%22 stroke=%22%23f2cf7e%22 stroke-width=%223.2%22 stroke-linejoin=%22round%22 opacity=%220.45%22/%3E%3Cpath d=%22M9 10 L9 30 L15 22 L20 30 L26 24 L18 17 L30 17 Z%22 fill=%22url(%23g)%22 stroke=%22%234a2f10%22 stroke-width=%222%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M11.4 12.6 L11.4 25 L14.6 21.2%22 fill=%22none%22 stroke=%22%23ffffff%22 stroke-opacity=%220.6%22 stroke-width=%221.4%22 stroke-linecap=%22round%22/%3E%3C/svg%3E') 10 12, pointer !important;
        button, .build-btn, .dev-card-item, .game-menu-btn, .menu-content button, .yop-res-option, .yop-minus, .yop-plus, .room-item, .mode-btn, .back-btn, .menu-btn, .primary, .secondary, .exit-btn, .volume-slider-container input[type="range"] {
        /* Hover: BIG WHITE arrow with golden glow on all interactive elements */
        body, body * { cursor: inherit !important; }
        html { cursor: url('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23fdf6d8%22/%3E%3Cstop offset=%220.45%22 stop-color=%22%23f2cf7e%22/%3E%3Cstop offset=%220.8%22 stop-color=%22%23d9a441%22/%3E%3Cstop offset=%221%22 stop-color=%22%238a5a24%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d=%22M7 8 L7 24 L12 18 L16 24 L20 20 L14 14 L23 14 Z%22 transform=%22translate(1.6 2)%22 fill=%22%23000000%22 opacity=%220.3%22/%3E%3Cpath d=%22M7 8 L7 24 L12 18 L16 24 L20 20 L14 14 L23 14 Z%22 fill=%22url(%23g)%22 stroke=%22%234a2f10%22 stroke-width=%221.6%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M9.2 11.2 L9.2 19.8 L11.8 16.6%22 fill=%22none%22 stroke=%22%23ffffff%22 stroke-opacity=%220.55%22 stroke-width=%221.3%22 stroke-linecap=%22round%22/%3E%3C/svg%3E') 8 8, auto !important; }
        /* Default: golden mouse cursor arrow */
        /* ===== CUSTOM CURSOR ===== */
        
        * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
    <style>
    <script src="multiplayer.js"></script>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <title>Colonization</title>
