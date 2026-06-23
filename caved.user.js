// ==UserScript==
// @name         케이브덕 커스텀 매니저 v7 (성능 최적화 & 패널 UI)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  우측 사이드 패널 제어, 메인 배너 숨기기, 텍스트 기반 성향 필터링, 표지 마스킹, 특정 제작자/태그 차단 (무거운 레이아웃 검색 제거로 극대화된 성능)
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       1. 설정 및 상태 관리 (인기 캐릭터, 세계관, 공식 크리에이터 숨기기 완전 제거)
       ========================================================= */
    const CONFIG_KEY = 'caveduck_advanced_config_v7';
    const defaultConfig = {
        hideBanner: false,
        genderFilter: 'none', // none, blockMale, blockFemale
        maskGender: 'none',   // none, maskMale, maskFemale
        blockedCreators: '',  // 콤마로 구분
        favoriteCreators: '', // 콤마로 구분 (강조 표시)
        blockedTags: '',      // 보기 싫은 태그/단어 차단
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };
    let stats = { total: 0, hidden: 0, masked: 0, highlight: 0 };
    let updateTimeout = null;

    function saveConfig() {
        GM_setValue(CONFIG_KEY, config);
        applyFilters();
        updateUIStats();
    }

    /* =========================================================
       2. 스타일 주입 (우측 사이드 패널 UI)
       ========================================================= */
    GM_addStyle(`
        /* 커스텀 UI 설정 버튼 (좌측 하단 배치) */
        #cd-settings-btn {
            position: fixed; left: 20px; bottom: 20px; z-index: 9999;
            background: #FF5A5F; color: white; border: none;
            padding: 12px 20px; border-radius: 30px; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;
            transition: all 0.2s; font-size: 14px;
        }
        #cd-settings-btn:hover { background: #ff3b41; transform: translateY(-2px); }

        /* 배경 오버레이 (클릭 시 닫기 용도) */
        #cd-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.5); z-index: 10000;
            opacity: 0; visibility: hidden; transition: all 0.3s ease;
            backdrop-filter: blur(3px);
        }
        #cd-overlay.open { opacity: 1; visibility: visible; }

        /* 우측 슬라이드 사이드 패널 */
        #cd-side-panel {
            position: fixed; top: 0; right: -400px; width: 350px; height: 100vh;
            background: #1e1e24; color: #eee; z-index: 10001;
            box-shadow: -5px 0 30px rgba(0,0,0,0.6); border-left: 1px solid #333;
            display: flex; flex-direction: column;
            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #cd-side-panel.open { right: 0; }

        /* 패널 내부 구조 */
        .cd-header { 
            padding: 20px; border-bottom: 1px solid #333; font-size: 18px; 
            font-weight: bold; display: flex; justify-content: space-between; 
            align-items: center; background: #1e1e24; flex-shrink: 0;
        }
        .cd-close { cursor: pointer; color: #888; font-size: 28px; line-height: 1; }
        .cd-close:hover { color: #fff; }
        .cd-content { 
            padding: 20px; display: flex; flex-direction: column; gap: 20px; 
            overflow-y: auto; flex-grow: 1; 
        }
        
        /* 패널 스크롤바 디자인 */
        .cd-content::-webkit-scrollbar { width: 6px; }
        .cd-content::-webkit-scrollbar-track { background: #1e1e24; }
        .cd-content::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
        .cd-content::-webkit-scrollbar-thumb:hover { background: #666; }

        .cd-stats { background: #2a2a35; padding: 15px; border-radius: 8px; font-size: 13px; line-height: 1.6; border: 1px solid #444; }
        
        /* 폼 요소 스타일 */
        .cd-group { display: flex; flex-direction: column; gap: 8px; }
        .cd-group label { font-size: 14px; font-weight: bold; color: #ddd; }
        .cd-group small { font-size: 12px; color: #999; line-height: 1.4; word-break: keep-all; }
        .cd-checkbox { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; font-weight: normal !important; color:#ccc !important; }
        .cd-checkbox input { width: 16px; height: 16px; cursor: pointer; accent-color: #FF5A5F; }
        select, textarea { 
            background: #2a2a35; color: white; border: 1px solid #444; 
            padding: 10px; border-radius: 6px; font-size: 13px; width: 100%; outline: none;
            transition: border-color 0.2s;
        }
        textarea { resize: vertical; min-height: 60px; font-family: inherit; }
        select:focus, textarea:focus { border-color: #FF5A5F; }
        
        /* 기능: 블러 및 하이라이트 클래스 */
        .cd-blur-img img { filter: blur(20px) !important; transition: filter 0.3s; }
        .cd-blur-img:hover img { filter: blur(5px) !important; } 
        
        .cd-highlight-card { 
            box-shadow: 0 0 0 3px #FF5A5F !important; 
            border-radius: inherit; 
            position: relative;
        }
        .cd-highlight-badge {
            position: absolute; top: -10px; right: -10px; background: #FF5A5F; color: white;
            font-size: 11px; padding: 4px 8px; border-radius: 12px; font-weight: bold; z-index: 10;
        }
    `);

    /* =========================================================
       3. UI 생성 및 이벤트 바인딩
       ========================================================= */
    function createUI() {
        // 열기 버튼
        const btn = document.createElement('button');
        btn.id = 'cd-settings-btn';
        btn.innerText = '⚙️ 커스텀 설정';
        document.body.appendChild(btn);

        // 오버레이 및 사이드 패널 생성
        const overlay = document.createElement('div');
        overlay.id = 'cd-overlay';
        document.body.appendChild(overlay);

        const panel = document.createElement('div');
        panel.id = 'cd-side-panel';
        panel.innerHTML = `
            <div class="cd-header">
                <span>⚙️ 커스텀 필터 설정</span>
                <span class="cd-close">&times;</span>
            </div>
            <div class="cd-content">
                <div class="cd-stats" id="cd-stats-box">통계 불러오는 중...</div>

                <div class="cd-group">
                    <label>1. 레이아웃 숨기기</label>
                    <small>새로고침 시 적용될 수 있습니다.</small>
                    <label class="cd-checkbox"><input type="checkbox" id="cd-hideBanner"> 메인 배너 숨기기</label>
                </div>

                <hr style="border-color:#333; margin: 5px 0;">

                <div class="cd-group">
                    <label>2. 성향 필터링</label>
                    <small>설명에 '여성향, 남성향, BL, GL' 등의 단어가 포함된 캐릭터 카드를 아예 숨깁니다.</small>
                    <select id="cd-genderFilter">
                        <option value="none">숨기지 않음</option>
                        <option value="blockFemale">여성향/BL 숨기기 (남성향 유저용)</option>
                        <option value="blockMale">남성향/GL 숨기기 (여성향 유저용)</option>
                    </select>
                </div>

                <div class="cd-group">
                    <label>3. 표지 모자이크</label>
                    <small>카드는 보이되 사진만 블러 처리합니다.</small>
                    <select id="cd-maskGender">
                        <option value="none">사용 안 함</option>
                        <option value="maskFemale">여성향/BL 캐릭터 사진 모자이크</option>
                        <option value="maskMale">남성향/GL 캐릭터 사진 모자이크</option>
                    </select>
                </div>

                <hr style="border-color:#333; margin: 5px 0;">

                <div class="cd-group">
                    <label>4. 보기 싫은 단어/태그 차단</label>
                    <small>콤마(,)로 구분하여 단어를 입력하세요.</small>
                    <textarea id="cd-blockedTags" placeholder="예: 공포, 얀데레, 고어"></textarea>
                </div>

                <div class="cd-group">
                    <label>5. 특정 제작자 차단</label>
                    <small>콤마(,)로 구분. (@제외)</small>
                    <textarea id="cd-blockedCreators" placeholder="예: 홍길동, user123"></textarea>
                </div>

                <div class="cd-group">
                    <label>6. 즐겨찾기 제작자 (하이라이트)</label>
                    <small>콤마(,)로 구분. 이 제작자의 캐릭터는 빨간 테두리로 강조됩니다.</small>
                    <textarea id="cd-favoriteCreators" placeholder="예: 케이브덕공식, 갓제작자"></textarea>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 패널 열기/닫기 이벤트
        const openPanel = () => {
            overlay.classList.add('open');
            panel.classList.add('open');
        };
        const closePanel = () => {
            overlay.classList.remove('open');
            panel.classList.remove('open');
        };

        btn.addEventListener('click', openPanel);
        panel.querySelector('.cd-close').addEventListener('click', closePanel);
        overlay.addEventListener('click', closePanel);

        // 값 초기화 및 리스너 등록
        const fields = ['hideBanner', 'genderFilter', 'maskGender', 'blockedTags', 'blockedCreators', 'favoriteCreators'];
        
        fields.forEach(id => {
            const el = document.getElementById(`cd-${id}`);
            if (el.type === 'checkbox') {
                el.checked = config[id];
                el.addEventListener('change', (e) => { config[id] = e.target.checked; saveConfig(); });
            } else {
                el.value = config[id];
                el.addEventListener('input', (e) => { config[id] = e.target.value; saveConfig(); });
            }
        });
    }

    function updateUIStats() {
        const box = document.getElementById('cd-stats-box');
        if (box) {
            box.innerHTML = `
                <span style="color:#aaa">발견된 캐릭터 카드:</span> <b style="color:#fff">${stats.total}개</b><br>
                <span style="color:#aaa">필터로 숨긴 카드:</span> <b style="color:#ff5a5f">${stats.hidden}개</b><br>
                <span style="color:#aaa">모자이크된 표지:</span> <b style="color:#4facfe">${stats.masked}개</b><br>
                <span style="color:#aaa">즐겨찾기 새 강조:</span> <b style="color:#ffea00">${stats.highlight}개</b>
            `;
        }
    }

    /* =========================================================
       4. 핵심 필터링 로직 (무거운 헤더/세계관/인기 검색 탐색 루프 삭제로 비약적 성능 향상)
       ========================================================= */
    function applyFilters() {
        // 배열 데이터 정리
        const blockCreatorsList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        const favCreatorsList = config.favoriteCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(s => s);

        stats = { total: 0, hidden: 0, masked: 0, highlight: 0 };

        // 메인 대형 배너 숨기기만 유지
        if (config.hideBanner) {
            const banners = document.querySelectorAll('.swiper-container, [class*="banner"]');
            banners.forEach(b => b.style.display = 'none');
        } else {
            const banners = document.querySelectorAll('.swiper-container, [class*="banner"]');
            banners.forEach(b => b.style.display = '');
        }

        // 개별 캐릭터 카드 분석
        const cards = document.querySelectorAll('a[href*="/character/"]');
        
        cards.forEach(card => {
            const cardText = card.textContent.toLowerCase();
            const rawText = card.textContent; 
            
            let creatorName = "";
            const match = rawText.match(/@([^\s]+)/);
            if (match) creatorName = match[1].toLowerCase();

            stats.total++;

            card.style.display = '';
            card.classList.remove('cd-blur-img', 'cd-highlight-card');
            const oldBadge = card.querySelector('.cd-highlight-badge');
            if (oldBadge) oldBadge.remove();

            let isHidden = false;

            if (blockCreatorsList.includes(creatorName) || blockCreatorsList.some(c => cardText.includes(c))) {
                isHidden = true;
            }

            if (!isHidden && blockTagsList.some(tag => cardText.includes(tag))) {
                isHidden = true;
            }

            const isFemaleContent = cardText.includes('여성향') || cardText.includes('bl');
            const isMaleContent = cardText.includes('남성향') || cardText.includes('gl') || cardText.includes('백합');

            if (!isHidden) {
                if (config.genderFilter === 'blockFemale' && isFemaleContent) isHidden = true;
                if (config.genderFilter === 'blockMale' && isMaleContent) isHidden = true;
            }

            if (isHidden) {
                card.style.display = 'none';
                stats.hidden++;
                return; 
            }

            let shouldMask = false;
            if (config.maskGender === 'maskFemale' && isFemaleContent) shouldMask = true;
            if (config.maskGender === 'maskMale' && isMaleContent) shouldMask = true;

            if (shouldMask) {
                card.classList.add('cd-blur-img');
                stats.masked++;
            }

            if (creatorName && favCreatorsList.includes(creatorName)) {
                card.classList.add('cd-highlight-card');
                const badge = document.createElement('div');
                badge.className = 'cd-highlight-badge';
                badge.innerText = '팔로우 제작자';
                card.appendChild(badge);
                stats.highlight++;
            }
        });

        updateUIStats();
    }

    /* =========================================================
       5. Mutation Observer (최적화)
       ========================================================= */
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (let m of mutations) {
                if (m.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }

            if (shouldUpdate) {
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => {
                    applyFilters();
                }, 300); 
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
            applyFilters();
            startObserver();
        }, 800);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();
