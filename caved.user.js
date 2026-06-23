// ==UserScript==
// @name         케이브덕 커스텀 매니저
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  사이드 패널(4탭), 자동 출석, 윙/깃털 표기, 태그 블라인드 및 강조, 입력창 오류 수정
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* --- 설정 및 저장소 --- */
    const CONFIG_KEY = 'cd_custom_config_v10';
    let config = {
        hideBanner: false,
        preferTags: '',
        blockedTags: '',
        panelOpacity: 0.9,
        ...GM_getValue(CONFIG_KEY, {})
    };

    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
        applyStyles();
    }

    /* --- CSS 스타일 --- */
    GM_addStyle(`
        #cd-side-panel { position: fixed; top: 0; right: -360px; width: 360px; height: 100vh; background: rgba(18, 18, 22, var(--panel-opacity, 0.9)); backdrop-filter: blur(15px); color: #fff; z-index: 10000; transition: right 0.3s; border-left: 1px solid #333; display: flex; }
        #cd-side-panel.open { right: 0; }
        .cd-tab-nav { width: 60px; border-right: 1px solid #333; display: flex; flex-direction: column; align-items: center; padding-top: 20px; gap: 20px; }
        .cd-tab-btn { cursor: pointer; color: #888; font-size: 12px; text-align: center; }
        .cd-tab-btn.active { color: #FFD700; }
        .cd-tab-content { flex: 1; padding: 20px; overflow-y: auto; display: none; }
        .cd-tab-content.active { display: block; }
        
        #cd-toggle-btn { position: fixed; bottom: 20px; left: 20px; z-index: 9999; background: #FFD700; color: #000; border: none; padding: 10px 15px; border-radius: 20px; font-weight: bold; cursor: pointer; }

        /* 블라인드 효과 */
        .cd-masked { opacity: 0.5 !important; filter: blur(4px) grayscale(50%) !important; }
        .cd-masked .cd-blur-target { color: transparent !important; text-shadow: 0 0 8px #eee !important; pointer-events: none; }
        
        /* 노란색 글로우 강조 */
        .cd-highlight { outline: 2px solid #FFD700 !important; box-shadow: 0 0 15px rgba(255, 215, 0, 0.35) !important; border-radius: 12px; background: rgba(255, 215, 0, 0.05) !important; }
        
        /* 채팅창 인젝션 */
        .cd-chat-bar { display: flex; gap: 10px; margin-bottom: 5px; align-items: center; font-size: 13px; color: #FFD700; }
        .cd-chat-btn { cursor: pointer; background: #333; padding: 4px 8px; border-radius: 4px; color: white; }
    `);

    /* --- 기능 구현 --- */
    function createSidebar() {
        const panel = document.createElement('div');
        panel.id = 'cd-side-panel';
        panel.style.setProperty('--panel-opacity', config.panelOpacity);
        panel.innerHTML = `
            <div class="cd-tab-nav">
                <div class="cd-tab-btn active" data-tab="main">메인</div>
                <div class="cd-tab-btn" data-tab="memo">메모</div>
                <div class="cd-tab-btn" data-tab="chat">채팅방</div>
                <div class="cd-tab-btn" data-tab="info">내정보</div>
            </div>
            <div class="cd-tab-content active" id="tab-main">
                <h2>매니저 설정</h2>
                <label>창 투명도</label>
                <input type="range" min="0.3" max="1" step="0.1" value="${config.panelOpacity}" id="cd-opacity">
                <label>선호 태그 (강조)</label>
                <input type="text" id="cd-prefer" value="${config.preferTags}" placeholder="순애, 집착">
                <label>차단 태그 (블라인드)</label>
                <input type="text" id="cd-blocked" value="${config.blockedTags}" placeholder="공포, 고어">
            </div>
            <div class="cd-tab-content" id="tab-memo">
                <h2>메모 관리</h2>
                <button id="add-memo">+ 새 메모</button>
                <div id="memo-list"></div>
            </div>
            <div class="cd-tab-content" id="tab-chat"><h2>채팅방 설정</h2></div>
            <div class="cd-tab-content" id="tab-info"><h2>내 정보</h2><button id="run-attendance">출석체크 실행</button></div>
        `;
        document.body.appendChild(panel);

        const btn = document.createElement('button');
        btn.id = 'cd-toggle-btn';
        btn.innerText = '설정';
        document.body.appendChild(btn);
        btn.onclick = () => panel.classList.toggle('open');
    }

    function applyStyles() {
        const cards = document.querySelectorAll('a[href*="/character"]');
        const prefer = config.preferTags.split(',').map(s=>s.trim().toLowerCase());
        const block = config.blockedTags.split(',').map(s=>s.trim().toLowerCase());

        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            card.classList.remove('cd-highlight', 'cd-masked');
            
            if (block.some(t => text.includes(t))) {
                card.classList.add('cd-masked');
                card.querySelectorAll('*').forEach(el => {
                    if (el.textContent && !el.textContent.includes('@')) el.classList.add('cd-blur-target');
                });
            } else if (prefer.some(t => text.includes(t))) {
                card.classList.add('cd-highlight');
            }
        });
    }

    /* --- 출석체크 자동화 --- */
    function autoAttendance() {
        if(window.location.href.includes('/earn')) {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('받기'));
            if(btn) btn.click();
        }
    }

    /* --- 채팅창 인젝션 --- */
    function injectChatUI() {
        const inputArea = document.querySelector('textarea')?.parentElement?.parentElement;
        if(inputArea && !document.querySelector('.cd-chat-bar')) {
            const bar = document.createElement('div');
            bar.className = 'cd-chat-bar';
            const wings = document.body.innerText.match(/윙\s*([\d,]+)/)?.[1] || '0';
            bar.innerHTML = `<span>윙: ${wings}</span> <div class="cd-chat-btn" onclick="window.scrollTo(0,0)">🔄 첫대화</div>`;
            inputArea.prepend(bar);
        }
    }

    function init() {
        createSidebar();
        setInterval(applyStyles, 2000);
        setInterval(injectChatUI, 2000);
        autoAttendance();
    }

    init();
})();
