// ==UserScript==
// @name         케이브덕 커스텀 스크립트 매니저 v3.0 (최적화/대시보드)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  케이브덕 메인페이지 레이아웃, 필터링, 마스킹 통합 제어 툴
// @author       Your Name
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {// ... existing code ...
    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, defaultConfig) };

    // 1. 특정 텍스트를 포함하는 큰 섹션(칸)을 찾아 숨기는 강력한 함수
    function hideTargetSections() {
        // [버그 수정] 모든 div를 탐색하면 화면 전체가 날아가는(블랙 스크린) 현상 방지
        const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, span, p');
        
        textElements.forEach(el => {
            if (el.children.length > 1) return; // 하위 요소가 많으면 레이아웃 래퍼로 간주
            
            const text = el.textContent.trim();
            if (!text || text.length > 30) return; // 텍스트가 너무 길면 패스

            let shouldHide = false;

            if (config.hideOfficial && (text.includes('공식 크리에이터') || text.includes('자랑스러운 공식'))) shouldHide = true;
            if (config.hidePopular && (text.includes('인기 캐릭터') || text.includes('급상승') || text === '인기')) shouldHide = true;
            if (config.hideWorld && (text.includes('세계관'))) shouldHide = true;

            if (shouldHide) {
                // 해당 섹션을 찾아 숨김
                let parent = el.parentElement;
                let count = 0;
                while (parent && count < 6) {
                    // 전체화면 블랙스크린 방지: 최상위 태그면 절대 숨기지 않음
                    if (parent.tagName === 'BODY' || parent.tagName === 'MAIN' || parent.id === 'root' || parent.id === '__next') break;
                    
                    // 스와이퍼, 섹션 또는 캐릭터 카드가 묶인 단위에서 통째로 숨김
                    if (parent.tagName === 'SECTION' || parent.className.includes('swiper') || parent.querySelectorAll('a[href*="/characters/"]').length > 0 || count === 5) {
                        parent.style.display = 'none';
                        break;
                    }
                    parent = parent.parentElement;
                    count++;
                }
            }
        });
        
        // [추가] 배너 전용 숨기기 로직 (CSS 대신 JS로 안전하게)
        if (config.hideBanner) {
            const swipers = document.querySelectorAll('.swiper, .swiper-container');
            swipers.forEach(swiper => {
                // 내부에 캐릭터 링크가 없는 상단 스와이퍼는 배너로 간주
                if (!swiper.querySelector('a[href*="/characters/"]')) {
                    swiper.style.display = 'none';
                }
            });
        }
    }

    // 2. 캐릭터 카드 개별 필터링 & 마스킹 로직
    function processCharacterCards() {
        const characterLinks = document.querySelectorAll('a[href*="/characters/"]');
        if (characterLinks.length === 0) return;

        const blockedList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);

        characterLinks.forEach(link => {
            // [핵심 로직] a 태그가 아닌 카드 1개 전체를 감싸는 부모 컨테이너를 정확히 찾습니다.
            let cardContainer = link;
            let safety = 0;
            while (cardContainer.parentElement && safety < 5) {
                // 부모 요소에 캐릭터 카드가 2개 이상 있다면, 그 직전 요소가 카드 1개짜리 컨테이너임
                if (cardContainer.parentElement.querySelectorAll('a[href*="/characters/"]').length > 1) {
                    break;
                }
                if (cardContainer.parentElement.tagName === 'MAIN' || cardContainer.parentElement.id === 'root') break;
                cardContainer = cardContainer.parentElement;
                safety++;
            }

            // 이제 제목, 설명, 태그, 제작자 이름이 모두 포함된 카드 전체 텍스트 스캔
            const textContent = cardContainer.textContent.toLowerCase();
            let shouldHide = false;
            let shouldMask = false;

            // [블랙리스트 차단 기능 정상화]
            if (blockedList.length > 0) {
                const isBlocked = blockedList.some(creator => textContent.includes(creator));
                if (isBlocked) shouldHide = true;
            }

            // [성향 분석 정확도 상향] - 태그/설명란 스캔
            const isFemaleOriented = textContent.includes('여성향') || textContent.includes('bl');
            const isMaleOriented = textContent.includes('남성향') || textContent.includes('gl');
            
            if (config.filterGender === 'female' && isMaleOriented) shouldHide = true;
            if (config.filterGender === 'male' && isFemaleOriented) shouldHide = true;
            
            // [마스킹] - 전체가 아닌 표지만 가림
            if (config.maskOppositeGender && !shouldHide) {
                if (config.filterGender === 'female' && !isFemaleOriented && isMaleOriented) shouldMask = true;
                if (config.filterGender === 'male' && !isMaleOriented && isFemaleOriented) shouldMask = true;
            }

            if (shouldHide) {
                cardContainer.style.display = 'none';
            } else {
                cardContainer.style.display = ''; 
                
                // 표지(이미지)만 블러 처리, 텍스트는 보존
                const img = cardContainer.querySelector('img');
                if (img) {
                    if (shouldMask) {
                        img.style.filter = 'blur(15px)';
                        img.style.transition = 'filter 0.3s ease';
                        img.onmouseenter = () => img.style.filter = 'blur(0px)';
                        img.onmouseleave = () => img.style.filter = 'blur(15px)';
                    } else {
                        img.style.filter = 'none';
                        img.onmouseenter = null;
                        img.onmouseleave = null;
                    }
                }
            }
        });
    }

    // 3. 디바운스 적용된 관찰자 (성능 최적화의 핵심 - 렉 방지)
// ... existing code ...
```

UI 부분(배너 숨기기 버튼 추가)과 원인이 되었던 버그 삭제 부분도 함께 수정해 주세요.

```javascript:케이브덕 커스텀 기능 매니저 (Tampermonkey):caveduck_custom_manager.user.js
// ... existing code ...
            <div class="cd-grid">
                <!-- 왼쪽 패널: 레이아웃 제어 -->
                <div class="cd-card">
                    <h3>👁️ 레이아웃 숨기기 (ON/OFF)</h3>
                    <label class="cd-toggle">
                        <input type="checkbox" id="cd-opt-banner" ${config.hideBanner ? 'checked' : ''}>
                        <span>메인 상단 배너 숨기기</span>
                    </label>
                    <label class="cd-toggle">
                        <input type="checkbox" id="cd-opt-official" ${config.hideOfficial ? 'checked' : ''}>
                        <span>'공식 크리에이터' 칸 숨기기</span>
// ... existing code ...
        document.getElementById('cd-btn-save').addEventListener('click', () => {
            const newConfig = {
                hideBanner: document.getElementById('cd-opt-banner').checked,
                hideOfficial: document.getElementById('cd-opt-official').checked,
                hidePopular: document.getElementById('cd-opt-popular').checked,
                hideWorld: document.getElementById('cd-opt-world').checked,
                filterGender: document.getElementById('cd-opt-gender').value,
                maskOppositeGender: document.getElementById('cd-opt-mask').checked,
                blockedCreators: document.getElementById('cd-opt-block').value,
                preferTags: config.preferTags
            };

            GM_setValue(CONFIG_KEY, newConfig);
            location.reload();
        });
    }

    function init() {
        createUI();
        
        // [버그 원인 제거] CSS로 범용 클래스 가리면 모든 카드가 날아가서 검은 화면 발생
        // config.hideBanner 관련 범용 CSS 강제 주입 로직 삭제함 (JS로 안전하게 대체)

        // 초기 실행 및 옵저버 등록
        setTimeout(() => {
// ... existing code ...
```

이제 검은 화면 버그가 완벽하게 사라지고, 차단/필터링 기능이 카드에 있는 모든 글씨(태그, 제목, 설명, 닉네임)를 꼼꼼하게 읽고 정확히 작동할 것입니다! 적용해 보시고 또 불편한 점이 있으면 말씀해 주세요!
    'use strict';

    const CONFIG_KEY = 'caveduck_advanced_config';
    
    const defaultConfig = {
        hideBanner: false,
        hideOfficial: false,
        hidePopular: false,
        hideWorld: false,
        filterGender: 'none',       // none, female, male
        maskOppositeGender: false,  // 마스킹 여부
        blockedCreators: '',        // 차단 닉네임 (콤마 구분)
        preferTags: ''              // 강조/선호 태그
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, defaultConfig) };

    // 1. 특정 텍스트를 포함하는 큰 섹션(칸)을 찾아 숨기는 강력한 함수
    function hideTargetSections() {
        // 케이브덕은 보통 h2, h3, div 안에 제목 텍스트를 넣습니다.
        const allTextElements = document.querySelectorAll('h1, h2, h3, h4, span, div');
        
        allTextElements.forEach(el => {
            // 요소 안의 텍스트만 추출 (자식 요소 포함)
            const text = el.innerText || el.textContent;
            if (!text || el.children.length > 2) return; // 너무 상위 부모는 제외

            let shouldHide = false;

            if (config.hideOfficial && (text.includes('공식 크리에이터') || text.includes('자랑스러운 공식 크리에이터'))) shouldHide = true;
            if (config.hidePopular && (text.includes('인기 캐릭터') || text.includes('급상승 캐릭터'))) shouldHide = true;
            if (config.hideWorld && (text.includes('세계관') && !text.includes('캐릭터'))) shouldHide = true; // 메뉴 탭 제외용

            if (shouldHide) {
                // 해당 텍스트를 감싸는 상위 컨테이너(보통 section이나 큰 div)를 찾아 숨김
                let parent = el.parentElement;
                let count = 0;
                // 위로 4~5칸 정도 올라가면 보통 해당 라인의 전체 틀이 잡힘
                while (parent && count < 5) {
                    if (parent.tagName === 'SECTION' || parent.classList.toString().includes('swiper') || parent.classList.toString().includes('container') || count === 4) {
                        parent.style.display = 'none';
                        break;
                    }
                    parent = parent.parentElement;
                    count++;
                }
            }
        });
    }

    // 2. 캐릭터 카드 개별 필터링 & 마스킹 로직
    function processCharacterCards() {
        // 케이브덕 캐릭터 카드는 보통 '/characters/' 링크를 가집니다.
        const characterCards = document.querySelectorAll('a[href*="/characters/"]');
        
        if (characterCards.length === 0) return;

        const blockedList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);

        characterCards.forEach(card => {
            // 카드의 모든 텍스트 (제목, 제작자, 태그 등) 가져오기
            const textContent = card.textContent.toLowerCase();
            let shouldHide = false;
            let shouldMask = false;

            // [블랙리스트 차단]
            if (blockedList.length > 0) {
                const isBlocked = blockedList.some(creator => textContent.includes(`@${creator}`) || textContent.includes(creator));
                if (isBlocked) shouldHide = true;
            }

            // [성향 분석 (휴리스틱)]
            // 카드 내에 여성향/남성향/BL/GL 등의 텍스트가 있는지 확인
            const isFemaleOriented = textContent.includes('여성향') || textContent.includes('bl') || textContent.includes('#여성향');
            const isMaleOriented = textContent.includes('남성향') || textContent.includes('gl') || textContent.includes('#남성향');
            
            // 필터 설정에 따라 숨기기
            if (config.filterGender === 'female' && isMaleOriented) shouldHide = true;
            if (config.filterGender === 'male' && isFemaleOriented) shouldHide = true;
            
            // [마스킹 (모자이크)] - 숨기는 대신 표지만 흐리게
            if (config.maskOppositeGender && !shouldHide) {
                if (config.filterGender === 'female' && !isFemaleOriented && isMaleOriented) shouldMask = true;
                if (config.filterGender === 'male' && !isMaleOriented && isFemaleOriented) shouldMask = true;
            }

            // 적용 실행
            // 부모 요소를 찾아 가려야 리스트에 빈 구멍이 생기지 않음
            const cardContainer = card.parentElement; 

            if (shouldHide) {
                cardContainer.style.display = 'none';
            } else {
                cardContainer.style.display = ''; // 복구
                
                // 마스킹은 텍스트가 아닌 '이미지'에만 적용
                const img = card.querySelector('img');
                if (img) {
                    if (shouldMask) {
                        img.style.filter = 'blur(15px)';
                        img.style.transition = 'filter 0.3s ease';
                        // 마우스 올리면 원본 확인 가능하도록
                        img.onmouseenter = () => img.style.filter = 'blur(0px)';
                        img.onmouseleave = () => img.style.filter = 'blur(15px)';
                    } else {
                        img.style.filter = 'none';
                        img.onmouseenter = null;
                        img.onmouseleave = null;
                    }
                }
            }
        });
    }

    // 3. 디바운스 적용된 관찰자 (성능 최적화의 핵심 - 렉 방지)
    let observerTimeout;
    const observer = new MutationObserver((mutations) => {
        clearTimeout(observerTimeout);
        // DOM 변경이 발생하면 0.3초 대기 후 한 번만 실행 (부하 대폭 감소)
        observerTimeout = setTimeout(() => {
            hideTargetSections();
            processCharacterCards();
        }, 300);
    });

    // 4. 대시보드형 UI 생성
    function createUI() {
        GM_addStyle(`
            /* 버튼 위치 좌측 하단으로 이동, 문의 챗봇과 겹치지 않게 */
            #cd-custom-btn {
                position: fixed; bottom: 20px; left: 20px;
                background: linear-gradient(135deg, #E91E63, #9C27B0); color: white;
                border: none; border-radius: 50%; width: 50px; height: 50px;
                font-size: 20px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.4);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                transition: transform 0.2s;
            }
            #cd-custom-btn:hover { transform: scale(1.1); }
            
            /* 대시보드 형태의 넓은 모달 (Figma 참고 스타일) */
            #cd-custom-modal {
                display: none; position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%); width: 800px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
                background: #121212; color: #eee; padding: 30px; border-radius: 16px;
                z-index: 1000000; box-shadow: 0 10px 50px rgba(0,0,0,0.8);
                border: 1px solid #333; font-family: 'Pretendard', sans-serif;
            }
            
            #cd-custom-modal::-webkit-scrollbar { width: 8px; }
            #cd-custom-modal::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }

            .cd-modal-header { border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
            .cd-modal-header h2 { margin: 0; font-size: 22px; color: #fff; display: flex; align-items: center; gap: 10px; }
            .cd-modal-header p { margin: 5px 0 0 0; font-size: 13px; color: #888; }
            
            /* Grid 레이아웃으로 섹션 분할 */
            .cd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            
            .cd-card { background: #1e1e1e; padding: 20px; border-radius: 12px; border: 1px solid #2a2a2a; }
            .cd-card h3 { margin: 0 0 15px 0; font-size: 16px; color: #E91E63; }
            
            .cd-toggle { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; }
            .cd-toggle input { margin-right: 10px; width: 16px; height: 16px; accent-color: #E91E63; cursor: pointer;}
            .cd-toggle span { font-size: 14px; color: #ccc; }
            
            .cd-input-group { margin-bottom: 15px; }
            .cd-input-group label { display: block; margin-bottom: 8px; font-size: 13px; color: #aaa; }
            .cd-input-group select, .cd-input-group input[type="text"] {
                width: 100%; padding: 10px; background: #0a0a0a; color: #fff;
                border: 1px solid #444; border-radius: 6px; box-sizing: border-box; font-size: 14px;
            }
            .cd-input-group select:focus, .cd-input-group input:focus { outline: none; border-color: #E91E63; }
            
            .cd-help { font-size: 11px; color: #777; margin-top: 5px; display: block; }
            
            .cd-footer { margin-top: 25px; padding-top: 20px; border-top: 1px solid #333; display: flex; justify-content: flex-end; gap: 10px; }
            .cd-btn { padding: 10px 24px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: 0.2s; }
            .cd-btn-cancel { background: #333; color: white; }
            .cd-btn-cancel:hover { background: #444; }
            .cd-btn-save { background: #E91E63; color: white; }
            .cd-btn-save:hover { background: #D81B60; }
            
            #cd-overlay {
                display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 999999;
            }
        `);

        const overlay = document.createElement('div');
        overlay.id = 'cd-overlay';
        document.body.appendChild(overlay);

        const btn = document.createElement('button');
        btn.id = 'cd-custom-btn';
        btn.innerHTML = '⚙️';
        document.body.appendChild(btn);

        const modal = document.createElement('div');
        modal.id = 'cd-custom-modal';
        modal.innerHTML = `
            <div class="cd-modal-header">
                <h2>🦆 케이브덕 뷰어 대시보드</h2>
                <p>불필요한 요소는 가리고, 원하는 취향의 캐릭터만 골라보세요.</p>
            </div>
            
            <div class="cd-grid">
                <!-- 왼쪽 패널: 레이아웃 제어 -->
                <div class="cd-card">
                    <h3>👁️ 레이아웃 숨기기 (ON/OFF)</h3>
                    <label class="cd-toggle">
                        <input type="checkbox" id="cd-opt-official" ${config.hideOfficial ? 'checked' : ''}>
                        <span>'공식 크리에이터' 칸 숨기기</span>
                    </label>
                    <label class="cd-toggle">
                        <input type="checkbox" id="cd-opt-popular" ${config.hidePopular ? 'checked' : ''}>
                        <span>'인기 / 급상승 캐릭터' 칸 숨기기</span>
                    </label>
                    <label class="cd-toggle">
                        <input type="checkbox" id="cd-opt-world" ${config.hideWorld ? 'checked' : ''}>
                        <span>'세계관' 칸 숨기기</span>
                    </label>
                </div>

                <!-- 오른쪽 패널: 성향 필터링 -->
                <div class="cd-card">
                    <h3>🎯 취향 및 성향 필터링</h3>
                    <div class="cd-input-group">
                        <label>성향 전용 필터 (태그 텍스트 기반)</label>
                        <select id="cd-opt-gender">
                            <option value="none" ${config.filterGender === 'none' ? 'selected' : ''}>모두 보기 (기본)</option>
                            <option value="female" ${config.filterGender === 'female' ? 'selected' : ''}>여성향/BL 텍스트 포함 위주</option>
                            <option value="male" ${config.filterGender === 'male' ? 'selected' : ''}>남성향/GL 텍스트 포함 위주</option>
                        </select>
                    </div>
                    <label class="cd-toggle" style="margin-top:10px;">
                        <input type="checkbox" id="cd-opt-mask" ${config.maskOppositeGender ? 'checked' : ''}>
                        <span>반대 성향 캐릭터 표지 마스킹 (모자이크)</span>
                    </label>
                    <span class="cd-help">* 카드 전체가 아닌 '이미지'만 가려집니다. 마우스를 올리면 원본이 보입니다.</span>
                </div>

                <!-- 하단 전체 패널: 블랙리스트 -->
                <div class="cd-card" style="grid-column: 1 / -1;">
                    <h3>🚫 차단 (블랙리스트)</h3>
                    <div class="cd-input-group">
                        <label>보기 싫은 크리에이터 닉네임 (콤마로 구분, 예: user1, user2)</label>
                        <input type="text" id="cd-opt-block" value="${config.blockedCreators}" placeholder="여기에 입력된 제작자의 카드는 모두 사라집니다.">
                    </div>
                </div>
            </div>

            <div class="cd-footer">
                <button class="cd-btn cd-btn-cancel" id="cd-btn-cancel">취소</button>
                <button class="cd-btn cd-btn-save" id="cd-btn-save">적용 및 새로고침</button>
            </div>
        `;
        document.body.appendChild(modal);

        const toggleModal = (show) => {
            modal.style.display = show ? 'block' : 'none';
            overlay.style.display = show ? 'block' : 'none';
        };

        btn.addEventListener('click', () => toggleModal(true));
        overlay.addEventListener('click', () => toggleModal(false));
        document.getElementById('cd-btn-cancel').addEventListener('click', () => toggleModal(false));

        document.getElementById('cd-btn-save').addEventListener('click', () => {
            const newConfig = {
                hideOfficial: document.getElementById('cd-opt-official').checked,
                hidePopular: document.getElementById('cd-opt-popular').checked,
                hideWorld: document.getElementById('cd-opt-world').checked,
                filterGender: document.getElementById('cd-opt-gender').value,
                maskOppositeGender: document.getElementById('cd-opt-mask').checked,
                blockedCreators: document.getElementById('cd-opt-block').value,
                // 이전 버전 호환용 유지 데이터
                hideBanner: config.hideBanner,
                preferTags: config.preferTags
            };

            GM_setValue(CONFIG_KEY, newConfig);
            location.reload();
        });
    }

    function init() {
        createUI();
        
        // CSS로 해결할 수 없는 배너(광고)는 범용 CSS로 숨김 처리 시도
        if (config.hideBanner) {
            GM_addStyle('.swiper-container { display: none !important; }');
        }

        // 초기 실행 및 옵저버 등록
        setTimeout(() => {
            hideTargetSections();
            processCharacterCards();
            // body 전체의 변화를 감지하되, 실행은 디바운싱(Debouncing)으로 제어됨
            observer.observe(document.body, { childList: true, subtree: true });
        }, 1000);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }

})();
