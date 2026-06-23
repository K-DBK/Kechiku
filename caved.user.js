// ==UserScript==
// @name         케이브덕 커스텀 매니저 v5 (최적화 & 버그픽스)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  케이브덕 메인페이지 UI 커스텀, 텍스트 기반 성향 필터링, 표지 마스킹, 섹션 숨기기
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
    const CONFIG_KEY = 'caveduck_advanced_config_v5';
    const defaultConfig = {
        hideBanner: false,
        hideOfficial: false,
        hidePopular: false,
        hideWorld: false,
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
       2. 스타일 주입 (UI 및 하이라이트 용)
       ========================================================= */
    GM_addStyle(`
        /* 커스텀 UI 설정 버튼 (좌측 하단 배치로 우측 채널톡과 안겹치게) */
        #cd-settings-btn {
            position: fixed; left: 20px; bottom: 20px; z-index: 9999;
            background: #FF5A5F; color: white; border: none;
            padding: 12px 20px; border-radius: 30px; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;
            transition: all 0.2s; font-size: 14px;
        }
        #cd-settings-btn:hover { background: #ff3b41; transform: translateY(-2px); }

        /* 커스텀 모달 창 */
        #cd-modal-bg {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.7); z-index: 10000; display: none;
            justify-content: center; align-items: center; backdrop-filter: blur(5px);
        }
        #cd-modal {
            background: #1e1e24; color: #eee; width: 90%; max-width: 500px;
            max-height: 85vh; overflow-y: auto; border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333;
            display: flex; flex-direction: column;
        }
        .cd-header { padding: 20px; border-bottom: 1px solid #333; font-size: 18px; font-weight: bold; display: flex; justify-content: space-between; position:sticky; top:0; background:#1e1e24; z-index:10; }
        .cd-close { cursor: pointer; color: #888; font-size: 24px; line-height: 1; }
        .cd-close:hover { color: #fff; }
        .cd-content { padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .cd-stats { background: #2a2a35; padding: 15px; border-radius: 8px; font-size: 13px; line-height: 1.6; border: 1px solid #444; }
        
        /* 폼 요소 스타일 */
        .cd-group { display: flex; flex-direction: column; gap: 5px; }
        .cd-group label { font-size: 14px; font-weight: bold; color: #ddd; }
        .cd-group small { font-size: 11px; color: #999; }
        .cd-checkbox { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
        .cd-checkbox input { width: 16px; height: 16px; cursor: pointer; }
        select, textarea { 
            background: #2a2a35; color: white; border: 1px solid #444; 
            padding: 10px; border-radius: 6px; font-size: 13px; width: 100%; outline: none;
        }
        textarea { resize: vertical; min-height: 60px; }
        select:focus, textarea:focus { border-color: #FF5A5F; }
        
        /* 기능: 블러 및 하이라이트 클래스 */
        .cd-blur-img img { filter: blur(20px) !important; transition: filter 0.3s; }
        .cd-blur-img:hover img { filter: blur(5px) !important; } /* 마우스 올리면 살짝 보이게 */
        
        .cd-highlight-card { 
            box-shadow: 0 0 0 3px #FF5A5F !important; 
            border-radius: inherit; 
            position: relative;
        }
        .cd-highlight-badge {
            position: absolute; top: -10px; right: -10px; background: #FF5A5F; color: white;
            font-size: 10px; padding: 3px 8px; border-radius: 10px; font-weight: bold; z-index: 10;
        }
    `);

    /* =========================================================
       3. UI 생성 및 이벤트 바인딩
       ========================================================= */
    function createUI() {
        // 열기 버튼
        const btn = document.createElement('button');
        btn.id = 'cd-settings-btn';
        btn.innerText = '⚙️ 케이브덕 설정';
        document.body.appendChild(btn);

        // 모달 컨테이너
        const modalBg = document.createElement('div');
        modalBg.id = 'cd-modal-bg';
        modalBg.innerHTML = `
            <div id="cd-modal">
                <div class="cd-header">
                    <span>⚙️ 커스텀 필터 설정</span>
                    <span class="cd-close">&times;</span>
                </div>
                <div class="cd-content">
                    <div class="cd-stats" id="cd-stats-box">
                        통계 불러오는 중...
                    </div>

                    <div class="cd-group">
                        <label>1. 레이아웃 숨기기 (새로고침 시 적용될 수 있음)</label>
                        <label class="cd-checkbox"><input type="checkbox" id="cd-hideBanner"> 메인 배너 숨기기</label>
                        <label class="cd-checkbox"><input type="checkbox" id="cd-hideOfficial"> '자랑스러운 공식 크리에이터' 숨기기</label>
                        <label class="cd-checkbox"><input type="checkbox" id="cd-hidePopular"> '지금 인기있는 캐릭터' 숨기기</label>
                        <label class="cd-checkbox"><input type="checkbox" id="cd-hideWorld"> '세계관' 영역 숨기기</label>
                    </div>

                    <hr style="border-color:#333;">

                    <div class="cd-group">
                        <label>2. 성향 필터링 (카드 텍스트 분석)</label>
                        <small>설명에 '여성향, 남성향, BL, GL' 등의 단어가 포함된 캐릭터를 숨깁니다.</small>
                        <select id="cd-genderFilter">
                            <option value="none">숨기지 않음</option>
                            <option value="blockFemale">여성향/BL 숨기기 (남성향 유저용)</option>
                            <option value="blockMale">남성향/GL 숨기기 (여성향 유저용)</option>
                        </select>
                    </div>

                    <div class="cd-group">
                        <label>3. 표지 모자이크 (텍스트 분석)</label>
                        <small>카드는 보이되 사진만 블러 처리합니다. (제작자 이름은 보임)</small>
                        <select id="cd-maskGender">
                            <option value="none">사용 안 함</option>
                            <option value="maskFemale">여성향/BL 캐릭터 사진 모자이크</option>
                            <option value="maskMale">남성향/GL 캐릭터 사진 모자이크</option>
                        </select>
                    </div>

                    <hr style="border-color:#333;">

                    <div class="cd-group">
                        <label>4. 보기 싫은 단어/태그 차단</label>
                        <small>콤마(,)로 구분. 제목이나 설명에 이 단어가 있으면 카드를 숨깁니다.</small>
                        <textarea id="cd-blockedTags" placeholder="예: 공포, 얀데레, 고어"></textarea>
                    </div>

                    <div class="cd-group">
                        <label>5. 특정 제작자 차단</label>
                        <small>콤마(,)로 구분. @는 빼고 적으세요.</small>
                        <textarea id="cd-blockedCreators" placeholder="예: 홍길동, user123"></textarea>
                    </div>

                    <div class="cd-group">
                        <label>6. 즐겨찾기 제작자 (하이라이트)</label>
                        <small>콤마(,)로 구분. 이 제작자의 캐릭터는 빨간 테두리로 강조됩니다.</small>
                        <textarea id="cd-favoriteCreators" placeholder="예: 케이브덕공식, 갓제작자"></textarea>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalBg);

        // 이벤트 연결
        btn.addEventListener('click', () => modalBg.style.display = 'flex');
        modalBg.querySelector('.cd-close').addEventListener('click', () => modalBg.style.display = 'none');
        modalBg.addEventListener('click', (e) => { if (e.target === modalBg) modalBg.style.display = 'none'; });

        // 값 초기화 및 리스너 등록
        const fields = ['hideBanner', 'hideOfficial', 'hidePopular', 'hideWorld', 'genderFilter', 'maskGender', 'blockedTags', 'blockedCreators', 'favoriteCreators'];
        
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
       4. 핵심 필터링 로직
       ========================================================= */
    function applyFilters() {
        // 배열 데이터 정리
        const blockCreatorsList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        const favCreatorsList = config.favoriteCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(s => s);

        stats = { total: 0, hidden: 0, masked: 0, highlight: 0 };

        // 4-1. 전체 섹션(칸) 숨기기 (XPath 기반 초강력 섹션 파괴)
        function hideSectionContainer(keyword) {
            try {
                // 문서 전체에서 해당 키워드가 포함된 텍스트 노드를 정확히 탐색
                const elements = document.evaluate(
                    `.//*[contains(text(), '${keyword}')]`,
                    document.body,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );

                for (let i = 0; i < elements.snapshotLength; i++) {
                    let el = elements.snapshotItem(i);
                    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

                    // 해당 엘리먼트가 직접 키워드 텍스트를 가지고 있는지 확인 (엉뚱한 부모가 지워지는 것 방지)
                    let hasDirectText = Array.from(el.childNodes).some(node => 
                        node.nodeType === Node.TEXT_NODE && node.nodeValue.includes(keyword)
                    );
                    if (!hasDirectText) continue;

                    // 글씨를 찾았으면 부모를 타고 올라가며 캐릭터 목록(swiper)을 포함하는 거대한 컨테이너를 찾음
                    let parent = el.parentElement;
                    let targetToHide = el.parentElement; 
                    
                    for (let j = 0; j < 8; j++) { // 최대 8단계 상위 박스까지 추적
                        if (!parent || parent.tagName === 'MAIN' || parent.tagName === 'BODY') break;
                        
                        // 케이브덕 섹션의 특징: 'swiper'(슬라이드)를 포함하거나 큰 여백(mb-) 클래스가 있음
                        if (parent.innerHTML.includes('swiper') || parent.className.includes('mb-') || parent.className.includes('py-')) {
                            targetToHide = parent;
                        }
                        parent = parent.parentElement;
                    }
                    
                    // 찾아낸 거대 래퍼 박스를 강제로 숨김 처리 (절대 뚫리지 않도록 important 속성 부여)
                    if (targetToHide) {
                        targetToHide.style.setProperty('display', 'none', 'important');
                        targetToHide.style.setProperty('height', '0px', 'important');
                        targetToHide.style.setProperty('overflow', 'hidden', 'important');
                        targetToHide.style.setProperty('margin', '0', 'important');
                        targetToHide.style.setProperty('padding', '0', 'important');
                    }
                }
            } catch (e) {
                console.error("섹션 숨기기 에러:", e);
            }
        }

        // 혹시 사이트에서 텍스트가 살짝 바뀔 것을 대비해 일부 핵심 단어만으로 추적
        if (config.hideOfficial) hideSectionContainer('공식 크리에이터');
        if (config.hidePopular) hideSectionContainer('인기있는');
        if (config.hideWorld) hideSectionContainer('세계관');

        // 배너 숨기기 (보통 최상단 스와이퍼나 큰 이미지 래퍼)
        if (config.hideBanner) {
            const banners = document.querySelectorAll('.swiper-container, [class*="banner"]');
            banners.forEach(b => b.style.display = 'none');
        }

        // 4-2. 개별 캐릭터 카드 분석
        // 캐릭터 카드는 링크 형태를 띄고 있음
        const cards = document.querySelectorAll('a[href*="/character/"]');
        
        cards.forEach(card => {
            // (1) 카드 내부 텍스트 긁어오기 (제목, 설명, 제작자 등 모두 포함)
            const cardText = card.textContent.toLowerCase();
            const rawText = card.textContent; 
            
            // 제작자 이름 추출 로직 (보통 @닉네임 형태)
            let creatorName = "";
            const match = rawText.match(/@([^\s]+)/);
            if (match) creatorName = match[1].toLowerCase();

            stats.total++;

            // 초기화
            card.style.display = '';
            card.classList.remove('cd-blur-img', 'cd-highlight-card');
            const oldBadge = card.querySelector('.cd-highlight-badge');
            if (oldBadge) oldBadge.remove();

            let isHidden = false;

            // (2) 제작자 차단 확인
            if (blockCreatorsList.includes(creatorName) || blockCreatorsList.some(c => cardText.includes(c))) {
                isHidden = true;
            }

            // (3) 태그/단어 차단 확인
            if (!isHidden && blockTagsList.some(tag => cardText.includes(tag))) {
                isHidden = true;
            }

            // (4) 성향(Gender) 텍스트 분석
            const isFemaleContent = cardText.includes('여성향') || cardText.includes('bl');
            const isMaleContent = cardText.includes('남성향') || cardText.includes('gl') || cardText.includes('백합');

            // 숨기기 처리
            if (!isHidden) {
                if (config.genderFilter === 'blockFemale' && isFemaleContent) isHidden = true;
                if (config.genderFilter === 'blockMale' && isMaleContent) isHidden = true;
            }

            if (isHidden) {
                // 완전히 숨기기
                card.style.display = 'none';
                stats.hidden++;
                return; // 다음 카드로 넘어감
            }

            // (5) 표지 모자이크 처리 (숨겨지지 않은 카드 대상)
            let shouldMask = false;
            if (config.maskGender === 'maskFemale' && isFemaleContent) shouldMask = true;
            if (config.maskGender === 'maskMale' && isMaleContent) shouldMask = true;

            if (shouldMask) {
                card.classList.add('cd-blur-img');
                stats.masked++;
            }

            // (6) 즐겨찾기 제작자 신작 강조 표시
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
       5. Mutation Observer (동적 로딩 감지 및 최적화)
       ========================================================= */
    // 케이브덕은 스크롤을 내릴때마다 카드가 로드되므로 감시가 필요함
    // 디바운스(Debounce)를 적용하여 로딩 속도 저하 방지
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
                }, 300); // 0.3초 딜레이 (여러번 호출되는 것 방지)
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* =========================================================
       6. 초기화
       ========================================================= */
    function init() {
        createUI();
        // 페이지가 살짝 그려질 시간을 준 후 적용
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
