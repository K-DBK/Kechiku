// ==UserScript==
// @name         케이브덕 커스텀 매니저 v8 (초경량 & 태그 차단 필터)
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  우측 고정 슬라이드 패널 디자인, 메인 배너 숨기기, 선호 태그 분홍 테두리 강조, 보기 싫은 단어/태그 완벽 차단 및 숨김 (초경량 성능 최적화)
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       1. 설정 및 상태 관리 (불필요한 숨김, 성향 필터, 제작자 차단 완벽 제거)
       ========================================================= */
    const CONFIG_KEY = 'caveduck_advanced_config_v8';
    const defaultConfig = {
        hideBanner: false,
        preferTags: '',  // 콤마 구분 - 매칭 시 분홍색 테두리 강조
        blockedTags: ''  // 콤마 구분 - 매칭 시 카드 블라인드(숨김)
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };
    let stats = { total: 0, hidden: 0, highlight: 0 };
    let updateTimeout = null;

    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
        applyAll();
    }

    /* =========================================================
       2. 스타일 주입 (우측 슬라이드 패널 UI 및 카드 디자인)
       ========================================================= */
    GM_addStyle(`
        /* 우측 중앙 고정 설정 버튼 (우측 하단 문의창과 안 겹치게 배치) */
        #cd-toggle-btn {
            position: fixed; top: 50%; right: 0; transform: translateY(-50%);
            background: #E91E63; color: #fff; border: none;
            border-radius: 10px 0 0 10px; width: 42px; height: 64px;
            font-size: 20px; cursor: pointer; z-index: 999990;
            box-shadow: -2px 0 10px rgba(0,0,0,0.4);
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        #cd-toggle-btn:hover { background: #ff2c78; }

        /* 배경 블러 오버레이 */
        #cd-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.4); z-index: 999991;
            backdrop-filter: blur(2px);
        }

        /* 우측 슬라이드 패널 */
        #cd-panel {
            display: none; position: fixed; top: 0; right: 0; bottom: 0;
            width: 360px; max-width: 90vw; background: #16161a; color: #eee;
            box-shadow: -6px 0 24px rgba(0,0,0,0.5); z-index: 999992;
            overflow-y: auto; padding: 20px; font-size: 13px; box-sizing: border-box;
            border-left: 1px solid #2d2d35;
        }
        #cd-panel h2 { font-size: 16px; margin: 0 0 15px; font-weight: bold; color: #fff; }
        #cd-panel h3 { font-size: 13px; color: #f48fb1; margin: 20px 0 10px; border-bottom: 1px solid #2d2d35; padding-bottom: 6px; font-weight: bold; }
        
        /* 설정 요소 스타일 */
        .cd-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .cd-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #E91E63; }
        .cd-row label { cursor: pointer; font-size: 13px; color: #ddd; }
        
        .cd-field { margin-bottom: 15px; }
        .cd-field label { display: block; font-size: 12px; color: #aaa; margin-bottom: 6px; font-weight: bold; }
        .cd-field input[type="text"] {
            width: 100%; box-sizing: border-box; padding: 8px 10px;
            background: #0e0e10; color: #fff; border: 1px solid #3a3a3a; border-radius: 6px;
            font-size: 13px; outline: none; transition: border-color 0.2s;
        }
        .cd-field input[type="text"]:focus { border-color: #E91E63; }
        .cd-help { font-size: 11px; color: #777; margin-top: 4px; display: block; line-height: 1.4; }

        /* 실시간 통계 박스 */
        #cd-preview-box {
            background: #0e0e10; border: 1px solid #2d2d35; border-radius: 8px;
            padding: 12px; font-size: 12px; line-height: 1.8; margin-top: 15px;
        }
        #cd-preview-box b { color: #f48fb1; }

        /* 패널 하단 액션 버튼 */
        #cd-panel-actions {
            margin-top: 25px; display: flex; gap: 10px;
        }
        .cd-btn { flex: 1; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: opacity 0.2s; }
        .cd-btn:hover { opacity: 0.9; }
        .cd-btn-save { background: #E91E63; color: #fff; }
        .cd-btn-close { background: #3a3a3a; color: #eee; }

        /* 선호 태그 매칭 시 분홍빛 카드 테두리 강조 효과 */
        .cd-highlight-card {
            outline: 2.5px solid #E91E63 !important;
            outline-offset: 2px !important;
            border-radius: inherit !important;
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
            <h2>🦆 케이브덕 매니저 (v8)</h2>

            <h3>1. 레이아웃 설정</h3>
            <div class="cd-row">
                <input type="checkbox" id="cd-hideBanner" ${config.hideBanner ? 'checked' : ''}>
                <label for="cd-hideBanner">메인 상단 대형 배너 숨기기</label>
            </div>

            <h3>2. 선호 태그 강조</h3>
            <div class="cd-field">
                <label>강조할 선호 태그/단어 (콤마로 구분)</label>
                <input type="text" id="cd-preferTags" value="${config.preferTags}" placeholder="예: 순애, 집착, 판타지">
                <span class="cd-help">카드 본문이나 태그에 매칭되면 <b>분홍색 테두리</b>로 예쁘게 강조 표시됩니다.</span>
            </div>

            <h3>3. 보기 싫은 태그 차단</h3>
            <div class="cd-field">
                <label>완전히 차단할 태그/단어 (콤마로 구분)</label>
                <input type="text" id="cd-blockedTags" value="${config.blockedTags}" placeholder="예: 공포, 얀데레, 고어, BL">
                <span class="cd-help">제목, 설명, 태그 중 하나라도 이 단어가 포함되면 해당 카드가 아예 보이지 않게 감춥니다.</span>
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

        // 입력 값 변경 시 실시간 필터 반영 (저장은 안 됨)
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
            태그 필터로 차단(숨김): <b style="color:#FF5A5F">${stats.hidden}</b>개<br>
            선호 태그 매칭(강조): <b style="color:#ffea00">${stats.highlight}</b>개
        `;
    }

    /* =========================================================
       4. 초경량 필터링 로직
       ========================================================= */
    function applyAll() {
        // 데이터 준비
        const prefTagsList = config.preferTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        stats = { total: 0, hidden: 0, highlight: 0 };

        // 4-1. 배너 노출 여부 제어
        const banners = document.querySelectorAll('.swiper-container, [class*="banner" i], [class*="swiper" i]');
        banners.forEach(b => {
            if (b.closest('#cd-panel, #cd-toggle-btn')) return;
            b.style.display = config.hideBanner ? 'none' : '';
        });

        // 4-2. 개별 캐릭터 카드 분석 (a태그 기반)
        const cards = document.querySelectorAll('a[href*="/character/"], a[href*="/characters/"]');
        
        cards.forEach(card => {
            if (card.closest('#cd-panel, #cd-toggle-btn')) return;

            const cardText = card.textContent.toLowerCase();
            stats.total++;

            // 스타일 및 상태 초기화
            card.style.display = '';
            card.classList.remove('cd-highlight-card');

            let isBlocked = false;

            // (A) 차단할 태그 검색
            if (blockTagsList.length > 0) {
                isBlocked = blockTagsList.some(tag => cardText.includes(tag));
            }

            if (isBlocked) {
                card.style.display = 'none';
                stats.hidden++;
                return; // 가려진 카드는 강조 연산을 생략하여 성능 향상
            }

            // (B) 선호 태그 검색 및 강조 테두리 적용
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
       5. DOM 변화 감지 (디바운스로 CPU 과부하 완벽 억제)
       ========================================================= */
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const m of mutations) {
                // 자신이 추가한 매니저 UI로 인해 무한 루프 도는 것 방지
                const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                if (el && el.closest('#cd-panel, #cd-toggle-btn, #cd-overlay')) continue;
                
                if (m.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }

            if (shouldUpdate) {
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(applyAll, 300); // 0.3초 대기 후 일괄 처리
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
