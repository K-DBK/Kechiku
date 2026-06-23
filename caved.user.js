// ==UserScript==
// @name         케이브덕 커스텀 매니저
// @namespace    http://tampermonkey.net/
// @version      9.5
// @description  우측 고정 슬라이드 패널, 대형 배너 완전 제거, 프리미엄 노란색 글로우 선호 태그 강조, 보기 싫은 태그 반투명 번짐(글씨 차단) 블라인드
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       1. 설정 및 상태 관리 (제작자 차단 기능 완전 제거)
       ========================================================= */
    const CONFIG_KEY = 'caveduck_advanced_config_v9_5';
    const defaultConfig = {
        hideBanner: false,
        preferTags: '',       // 콤마 구분 - 매칭 시 노란색 부드러운 글로우 강조
        blockedTags: '',      // 콤마 구분 - 매칭 시 50% 투명도 + 글씨 특수 번짐 블라인드
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };
    let stats = { total: 0, masked: 0, highlight: 0 };
    let updateTimeout = null;

    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
        applyAll();
    }

    /* =========================================================
       2. 스타일 주입 (디자인 및 가시성 대폭 보강)
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
        
        /* [개선] 노란색 입력 칸 가시성 대폭 상향 (조금 더 밝고 테두리가 뚜렷함) */
        .cd-field input[type="text"] {
            width: 100%; box-sizing: border-box; padding: 10px 12px;
            background: #22222b; color: #fff; border: 1px solid #4e4e5f; border-radius: 8px;
            font-size: 13px; outline: none; transition: all 0.2s;
        }
        .cd-field input[type="text"]:focus { border-color: #FFD700; box-shadow: 0 0 8px rgba(255, 215, 0, 0.3); }
        .cd-help { font-size: 11px; color: #999; margin-top: 5px; display: block; line-height: 1.45; }

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

        /* [개선] 선호 태그 매칭 시 - 은은한 노란빛 배경을 추가하여 아주 잘 보이게 디자인 개선 */
        .cd-highlight-card {
            background: rgba(255, 215, 0, 0.08) !important; /* 노란색 칸이 살짝 밝고 영롱하게 깔림 */
            outline: 2.5px solid #FFD700 !important;
            outline-offset: 1px !important;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.45) !important;
            border-radius: 16px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .cd-highlight-card:hover {
            background: rgba(255, 215, 0, 0.12) !important;
            box-shadow: 0 0 26px rgba(255, 215, 0, 0.6) !important;
            transform: scale(1.02);
        }

        /* [수정] 차단 태그 매칭 시 - 투명도 50% 변경 및 특수 번짐 효과 적용 */
        .cd-tag-masked-card {
            opacity: 0.50 !important; /* 요청하신 50% 투명도 적용 */
            background: rgba(15, 15, 20, 0.75) !important;
            box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.9) !important;
            border-radius: 14px !important;
            pointer-events: auto !important;
            transition: all 0.35s ease !important;
        }
        
        /* 이미지 모자이크 강화 */
        .cd-tag-masked-card img {
            filter: blur(16px) grayscale(50%) !important;
            transition: filter 0.3s ease !important;
        }

        /* [핵심] 글씨 번짐(Glow) 효과 - 원본 글자를 완전히 숨기고 번지게 만듦 */
        .cd-tag-masked-card .cd-blur-target {
            color: transparent !important;
            text-shadow: 0 0 9px rgba(230, 230, 235, 0.95) !important; /* 완전하고 몽환적인 번짐 */
            user-select: none;
            transition: all 0.3s ease !important;
        }

        /* 마우스 오버 시 일시 해제 */
        .cd-tag-masked-card:hover {
            opacity: 0.95 !important;
            background: transparent !important;
            box-shadow: none !important;
        }
        .cd-tag-masked-card:hover img {
            filter: none !important;
        }
        .cd-tag-masked-card:hover .cd-blur-target {
            color: inherit !important;
            text-shadow: none !important;
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
            <h2>🦆 케이브덕 매니저</h2>

            <h3>1. 레이아웃 설정</h3>
            <div class="cd-row">
                <input type="checkbox" id="cd-hideBanner" ${config.hideBanner ? 'checked' : ''}>
                <label for="cd-hideBanner">메인 상단 대형 배너 숨기기</label>
            </div>

            <h3>2. 선호 태그 강조 (디자인 대폭 보강)</h3>
            <div class="cd-field">
                <label>강조할 선호 태그/단어 (콤마로 구분)</label>
                <input type="text" id="cd-preferTags" value="${config.preferTags}" placeholder="예: 순애, 집착, 판타지">
                <span class="cd-help">카드나 태그에 매칭되면 <b>부드러운 노란색 배경 강조와 황금빛 글로우 효과</b>로 아주 화사하게 표시됩니다.</span>
            </div>

            <h3>3. 보기 싫은 태그 블라인드</h3>
            <div class="cd-field">
                <label>블라인드 처리할 태그/단어 (콤마로 구분)</label>
                <input type="text" id="cd-blockedTags" value="${config.blockedTags}" placeholder="예: 공포, 고어, BL">
                <span class="cd-help">카드가 완전히 사라지지 않고 <b>투명도 50% 및 텍스트 번짐(Glow) 효과</b>를 활용하여 계정 및 실루엣만 연하게 보이게 만듭니다. (마우스 오버 시 일시 해제)</span>
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
                blockedTags: panel.querySelector('#cd-blockedTags').value
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
            태그 필터 연한 블라인드(50%): <b style="color:#4facfe">${stats.masked}</b>개<br>
            선호 태그 매칭(황금 글로우): <b style="color:#FFD700">${stats.highlight}</b>개
        `;
    }

    /* =========================================================
       4. 핵심 필터링 로직
       ========================================================= */
    function applyAll() {
        const prefTagsList = config.preferTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        stats = { total: 0, masked: 0, highlight: 0 };

        // 4-1. 배너 노출 여부 제어 (안쪽 글씨, 슬라이더 래퍼 포함 완전 제거)
        const banners = document.querySelectorAll('.swiper-container, [class*="banner" i], [class*="swiper" i]');
        banners.forEach(b => {
            if (b.closest('#cd-panel, #cd-toggle-btn')) return;
            b.style.setProperty('display', config.hideBanner ? 'none' : '', 'important');
        });

        // 4-2. 개별 캐릭터 카드 분석
        const cards = document.querySelectorAll('a[href*="/character/"], a[href*="/characters/"]');
        
        cards.forEach(card => {
            if (card.closest('#cd-panel, #cd-toggle-btn')) return;

            const cardText = card.textContent.toLowerCase();
            stats.total++;

            // 상태 초기화
            card.style.display = '';
            card.classList.remove('cd-highlight-card', 'cd-tag-masked-card');
            card.querySelectorAll('.cd-blur-target').forEach(el => el.classList.remove('cd-blur-target'));

            // (A) 차단 태그 필터링 (연한 모자이크 블라인드 및 텍스트 번짐 적용)
            let isTagBlocked = false;
            if (blockTagsList.length > 0) {
                isTagBlocked = blockTagsList.some(tag => cardText.includes(tag));
            }

            if (isTagBlocked) {
                card.classList.add('cd-tag-masked-card');
                
                // 계정(@) 텍스트 노드를 제외한 모든 말단 텍스트 요소에 번짐 효과 클래스 부여
                const allElements = card.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.children.length === 0 && el.textContent.trim()) {
                        // 계정명(@)이 아닌 일반 카드 설명 및 제목 텍스트만 번지게 만듭니다.
                        if (!el.textContent.includes('@')) {
                            el.classList.add('cd-blur-target');
                        }
                    }
                });

                stats.masked++;
                return; // 모자이크 상태인 경우 선호 노란색 강조와 중복 적용을 피해 시각적 간섭을 막음
            }

            // (B) 선호 태그 필터링 (황금 글로우 및 배경강조 효과)
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
       5. DOM 변화 감지 (디바운싱 최적화)
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
       6. 초기화
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
