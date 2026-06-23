// ==UserScript==
// @name         케이브덕 커스텀 매니저 v9 (태그 블라인드 & 제작자 차단 & 프리미엄 디자인)
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  우측 고정 슬라이드 패널, 대형 배너 완전 제거, 노란색 글로우 선호 태그 강조, 보기 싫은 태그 반투명 블라인드, 특정 제작자 완전 차단
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       1. 설정 및 상태 관리
       ========================================================= */
    const CONFIG_KEY = 'caveduck_advanced_config_v9';
    const defaultConfig = {
        hideBanner: false,
        preferTags: '',       // 콤마 구분 - 매칭 시 노란색 부드러운 글로우 강조
        blockedTags: '',      // 콤마 구분 - 매칭 시 완전히 없애지 않고 흐릿하게 블라인드
        blockedCreators: ''   // 콤마 구분 - 매칭 시 카드 완전 삭제(display: none)
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };
    let stats = { total: 0, hidden: 0, masked: 0, highlight: 0 };
    let updateTimeout = null;

    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
        applyAll();
    }

    /* =========================================================
       2. 스타일 주입 (디자인 전면 개선)
       ========================================================= */
    GM_addStyle(`
        /* 우측 중앙 고정 설정 버튼 */
        #cd-toggle-btn {
            position: fixed; top: 50%; right: 0; transform: translateY(-50%);
            background: #FFD700; color: #111; border: none;
            border-radius: 12px 0 0 12px; width: 44px; height: 68px;
            font-size: 22px; cursor: pointer; z-index: 999990;
            box-shadow: -2px 0 12px rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            transition: all 0.25s ease;
            font-weight: bold;
        }
        #cd-toggle-btn:hover { background: #ffea00; transform: translateY(-50%) scaleX(1.05); }

        /* 배경 블러 오버레이 */
        #cd-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); z-index: 999991;
            backdrop-filter: blur(3px);
        }

        /* 우측 슬라이드 패널 */
        #cd-panel {
            display: none; position: fixed; top: 0; right: 0; bottom: 0;
            width: 370px; max-width: 90vw; background: #121215; color: #eee;
            box-shadow: -8px 0 32px rgba(0,0,0,0.7); z-index: 999992;
            overflow-y: auto; padding: 24px 20px; font-size: 13px; box-sizing: border-box;
            border-left: 1px solid #2a2a35;
            transition: all 0.3s ease;
        }
        #cd-panel h2 { font-size: 17px; margin: 0 0 15px; font-weight: 800; color: #fff; border-left: 4px solid #FFD700; padding-left: 10px; }
        #cd-panel h3 { font-size: 13px; color: #FFD700; margin: 24px 0 12px; border-bottom: 1px solid #2a2a35; padding-bottom: 8px; font-weight: bold; }
        
        /* 설정 요소 스타일 */
        .cd-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .cd-row input[type="checkbox"] { width: 17px; height: 17px; cursor: pointer; accent-color: #FFD700; }
        .cd-row label { cursor: pointer; font-size: 13.5px; color: #ddd; font-weight: 500; }
        
        .cd-field { margin-bottom: 16px; }
        .cd-field label { display: block; font-size: 12.5px; color: #ccc; margin-bottom: 6px; font-weight: bold; }
        .cd-field input[type="text"] {
            width: 100%; box-sizing: border-box; padding: 9px 12px;
            background: #1a1a22; color: #fff; border: 1px solid #3e3e4f; border-radius: 8px;
            font-size: 13px; outline: none; transition: all 0.2s;
        }
        .cd-field input[type="text"]:focus { border-color: #FFD700; box-shadow: 0 0 8px rgba(255, 215, 0, 0.2); }
        .cd-help { font-size: 11px; color: #888; margin-top: 5px; display: block; line-height: 1.45; }

        /* 실시간 통계 박스 */
        #cd-preview-box {
            background: #1a1a22; border: 1px solid #2d2d3a; border-radius: 10px;
            padding: 14px; font-size: 12px; line-height: 1.8; margin-top: 18px;
        }
        #cd-preview-box b { color: #FFD700; }

        /* 패널 하단 액션 버튼 */
        #cd-panel-actions {
            margin-top: 30px; display: flex; gap: 10px;
        }
        .cd-btn { flex: 1; padding: 11px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; transition: all 0.2s; }
        .cd-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .cd-btn-save { background: #FFD700; color: #111; }
        .cd-btn-close { background: #2d2d3a; color: #eee; }

        /* [개선] 선호 태그 매칭 시 - 고급스러운 노란색 그라데이션 글로우 & 곡선 테두리 */
        .cd-highlight-card {
            outline: 2px solid #FFD700 !important;
            outline-offset: 1px !important;
            box-shadow: 0 0 15px rgba(255, 215, 0, 0.35) !important;
            border-radius: 16px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .cd-highlight-card:hover {
            box-shadow: 0 0 22px rgba(255, 215, 0, 0.55) !important;
            transform: scale(1.02);
        }

        /* [수정] 차단 태그 매칭 시 - 완전 블라인드 대신 투명화 및 모자이크(계정은 보임) */
        .cd-tag-masked-card {
            opacity: 0.18 !important;
            filter: blur(4px) grayscale(70%) !important;
            pointer-events: auto !important; /* 마우스 오버 감지 허용 */
            transition: all 0.35s ease !important;
        }
        .cd-tag-masked-card:hover {
            opacity: 0.65 !important;
            filter: blur(1px) grayscale(10%) !important; /* 마우스 올렸을 때만 대략 확인 가능 */
        }
    `);

    /* =========================================================
       3. UI 생성 및 이벤트 바인딩
       ========================================================= */
    function createUI() {
        const overlay = document.createElement('div');
        overlay.id = 'cd-overlay';
        document.body.appendChild(overlay);

        const btn = document.createElement('button');
        btn.id = 'cd-toggle-btn';
        btn.textContent = '🛠';
        btn.title = '케이브덕 매니저 열기';
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'cd-panel';
        panel.innerHTML = `
            <h2>🦆 케이브덕 매니저 (v9)</h2>

            <h3>1. 레이아웃 설정</h3>
            <div class="cd-row">
                <input type="checkbox" id="cd-hideBanner" ${config.hideBanner ? 'checked' : ''}>
                <label for="cd-hideBanner">메인 상단 대형 배너 숨기기</label>
            </div>

            <h3>2. 선호 태그 강조 (디자인 개선)</h3>
            <div class="cd-field">
                <label>강조할 선호 태그/단어 (콤마로 구분)</label>
                <input type="text" id="cd-preferTags" value="${config.preferTags}" placeholder="예: 순애, 집착, 판타지">
                <span class="cd-help">카드나 태그에 매칭되면 <b>부드러운 곡선 테두리와 황금빛 글로우 효과</b>로 예쁘게 강조됩니다.</span>
            </div>

            <h3>3. 보기 싫은 태그 블라인드</h3>
            <div class="cd-field">
                <label>블라인드 처리할 태그/단어 (콤마로 구분)</label>
                <input type="text" id="cd-blockedTags" value="${config.blockedTags}" placeholder="예: 공포, 고어, BL">
                <span class="cd-help">완전히 사라지지는 않고 <b>연한 모자이크 형태(반투명)</b>로 보이게 조절합니다. (계정/형태 확인 가능)</span>
            </div>

            <h3>4. 제작자 아예 차단</h3>
            <div class="cd-field">
                <label>완전히 차단할 제작자 (@ 제외, 콤마로 구분)</label>
                <input type="text" id="cd-blockedCreators" value="${config.blockedCreators}" placeholder="예: dream_core, Nae">
                <span class="cd-help">이곳에 작성된 제작자의 캐릭터 카드는 화면에서 흔적도 없이 완전히 숨겨집니다.</span>
            </div>

            <h3>📊 실시간 필터 미리보기</h3>
            <div id="cd-preview-box">설정을 불러오는 중...</div>

            <div id="cd-panel-actions">
                <button class="cd-btn cd-btn-close" id="cd-btn-close">닫기</button>
                <button class="cd-btn cd-btn-save" id="cd-btn-save">설정 저장</button>
            </div>
        `;
        document.body.appendChild(panel);

        // 열기/닫기 제어
        function toggle(show) {
            panel.style.display = show ? 'block' : 'none';
            overlay.style.display = show ? 'block' : 'none';
        }

        btn.addEventListener('click', () => toggle(true));
        overlay.addEventListener('click', () => toggle(false));
        panel.querySelector('#cd-btn-close').addEventListener('click', () => toggle(false));

        // 입력 값 수집 함수
        function readDraft() {
            return {
                hideBanner: panel.querySelector('#cd-hideBanner').checked,
                preferTags: panel.querySelector('#cd-preferTags').value,
                blockedTags: panel.querySelector('#cd-blockedTags').value,
                blockedCreators: panel.querySelector('#cd-blockedCreators').value
            };
        }

        // 저장 버튼 클릭
        panel.querySelector('#cd-btn-save').addEventListener('click', () => {
            saveConfig(readDraft());
            toggle(false);
        });

        // 실시간 변경 내용 반영
        panel.addEventListener('input', () => {
            config = { ...config, ...readDraft() };
            applyAll();
        });
        panel.addEventListener('change', () => {
            config = { ...config, ...readDraft() };
            applyAll();
        });
    }

    function updatePreview(stats) {
        const box = document.getElementById('cd-preview-box');
        if (!box) return;
        box.innerHTML = `
            현재 페이지 캐릭터 카드: <b>${stats.total}</b>개<br>
            제작자 차단으로 숨김: <b style="color:#FF5A5F">${stats.hidden}</b>개<br>
            태그 필터 연한 블라인드: <b style="color:#4facfe">${stats.masked}</b>개<br>
            선호 태그 매칭(황금 글로우): <b style="color:#FFD700">${stats.highlight}</b>개
        `;
    }

    /* =========================================================
       4. 제작자 닉네임 추출 헬퍼 (안정성 보장)
       ========================================================= */
    function extractHandle(card) {
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent.trim();
            if (t.startsWith('@') && t.length > 1) {
                return t.slice(1).toLowerCase();
            }
        }
        return null;
    }

    /* =========================================================
       5. 핵심 필터링 로직 (v9 개편)
       ========================================================= */
    function applyAll() {
        const prefTagsList = config.preferTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockCreatorsList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        stats = { total: 0, hidden: 0, masked: 0, highlight: 0 };

        // 5-1. 배너 노출 여부 제어 (안쪽 글씨, 슬라이더 래퍼 포함 완전 제거)
        const banners = document.querySelectorAll('.swiper-container, [class*="banner" i], [class*="swiper" i]');
        banners.forEach(b => {
            if (b.closest('#cd-panel, #cd-toggle-btn')) return;
            b.style.setProperty('display', config.hideBanner ? 'none' : '', 'important');
        });

        // 5-2. 개별 캐릭터 카드 분석
        const cards = document.querySelectorAll('a[href*="/character/"], a[href*="/characters/"]');
        
        cards.forEach(card => {
            if (card.closest('#cd-panel, #cd-toggle-btn')) return;

            const cardText = card.textContent.toLowerCase();
            const creatorHandle = extractHandle(card);
            stats.total++;

            // 상태 초기화
            card.style.display = '';
            card.classList.remove('cd-highlight-card', 'cd-tag-masked-card');

            // (A) 제작자 완전 차단 필터링 (가장 먼저 수행)
            let isCreatorBlocked = false;
            if (creatorHandle && blockCreatorsList.includes(creatorHandle)) {
                isCreatorBlocked = true;
            }

            if (isCreatorBlocked) {
                card.style.setProperty('display', 'none', 'important');
                stats.hidden++;
                return; // 완전히 차단되었으면 이후 단계 생략
            }

            // (B) 차단 태그 필터링 (연한 모자이크 블라인드 방식)
            let isTagBlocked = false;
            if (blockTagsList.length > 0) {
                isTagBlocked = blockTagsList.some(tag => cardText.includes(tag));
            }

            if (isTagBlocked) {
                card.classList.add('cd-tag-masked-card');
                stats.masked++;
                return; // 모자이크 대상인 카드도 선호 강조를 타지 않게 제어
            }

            // (C) 선호 태그 필터링 (노란 글로우 효과)
            let isPreferred = false;
            if (prefTagsList.length > 0) {
                isPreferred = prefTagsList.some(tag => cardText.includes(tag));
            }

            if (isPreferred) {
                card.classList.add('cd-highlight-card');
                stats.highlight++;
            }
        });

        updatePreview(stats);
    }

    /* =========================================================
       6. DOM 변화 감지 (디바운싱 최적화)
       ========================================================= */
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const m of mutations) {
                const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                if (el && el.closest('#cd-panel, #cd-toggle-btn, #cd-overlay')) continue;
                
                if (m.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }

            if (shouldUpdate) {
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(applyAll, 250); // 0.25초 디바운싱 적용
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* =========================================================
       7. 초기화
       ========================================================= */
    function init() {
        createUI();
        setTimeout(() => {
            applyAll();
            startObserver();
        }, 800);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();