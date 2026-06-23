// ==UserScript==
// @name         케이브덕 커스텀 스크립트 매니저 v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  케이브덕 메인페이지 UI 커스텀, 필터링, 마스킹 기능을 제공하는 통합 관리 툴
// @author       Your Name
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG_KEY = 'caveduck_advanced_config';
    
    // 기본 설정값 세팅
    const defaultConfig = {
        hideBanner: false,          // 1. 배너 숨기기
        preferTags: '',             // 2. 선호 태그 (콤마로 구분)
        filterGender: 'none',       // 3. 성향 필터 (none, female, male, mixed)
        hideOfficial: false,        // 6. 공식 크리에이터 섹션 숨기기
        blockedCreators: '',        // 7. 차단할 크리에이터 (콤마로 구분)
        hidePopular: false,         // 9. 인기 캐릭터 칸 차단
        hideWorld: false,           // 10. 세계관 칸 차단
        maskOppositeGender: false,  // 11. 반대 성향 캐릭터 표지 마스킹
        customCSS: '',
        customJS: ''
    };

    // 저장된 설정 불러오기
    let config = GM_getValue(CONFIG_KEY, defaultConfig);
    // 구버전 호환성을 위해 누락된 키 병합
    config = { ...defaultConfig, ...config };

    // 동적으로 CSS를 생성하고 적용하는 함수
    function applyDynamicStyles() {
        let cssString = '';

        // 1. 배너 숨기기 (메인 배너 이미지/슬라이더 컨테이너 추정 클래스 숨김)
        if (config.hideBanner) {
            cssString += `
                /* 케이브덕 메인 상단 배너를 감추기 위한 일반적인 선택자. 실제 돔에 맞춰 수정 필요할 수 있음 */
                .swiper-container, .main-banner, [class*="banner"] { display: none !important; }
            `;
        }

        // 6. 공식 크리에이터 숨기기
        if (config.hideOfficial) {
            cssString += `
                /* "자랑스러운 공식 크리에이터" 텍스트를 포함하는 섹션 숨김 */
                section:has(h2:contains("공식 크리에이터")), 
                div:has(> h2:contains("공식 크리에이터")) { display: none !important; }
            `;
        }

        // 9. 인기 캐릭터 칸 숨기기
        if (config.hidePopular) {
            cssString += `
                section:has(h2:contains("인기 캐릭터")),
                div:has(> h2:contains("인기 캐릭터")) { display: none !important; }
            `;
        }

        // 10. 세계관 칸 숨기기
        if (config.hideWorld) {
            cssString += `
                section:has(h2:contains("세계관")),
                div:has(> h2:contains("세계관")) { display: none !important; }
            `;
        }

        // 유저 커스텀 CSS 적용
        if (config.customCSS && config.customCSS.trim() !== '') {
            cssString += config.customCSS;
        }

        // 동적 CSS 주입 (기존 것이 있다면 제거 후 다시 추가)
        const existingStyle = document.getElementById('cd-dynamic-style');
        if (existingStyle) existingStyle.remove();
        
        if (cssString) {
            const styleElement = document.createElement('style');
            styleElement.id = 'cd-dynamic-style';
            styleElement.textContent = cssString;
            document.head.appendChild(styleElement);
        }
    }

    // DOM이 로드되거나 변경될 때마다 캐릭터 카드들을 검사하여 필터링/마스킹을 적용합니다.
    function processCharacterCards() {
        // 케이브덕의 캐릭터 카드를 나타내는 공통 선택자 (임의의 클래스명, 실제 사이트에 맞춰 조정 필요)
        // 보통 a 태그나 특정 div로 감싸져 있습니다.
        const characterCards = document.querySelectorAll('a[href*="/characters/"], .character-card, [class*="CharacterCard"]');
        
        if (characterCards.length === 0) return;

        const blockedList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        const preferTags = config.preferTags.split(',').map(s => s.trim().toLowerCase()).filter(s => s);

        characterCards.forEach(card => {
            const textContent = card.textContent.toLowerCase();
            let shouldHide = false;
            let shouldMask = false;

            // 7. 차단한 크리에이터 필터링
            if (blockedList.length > 0) {
                const isBlocked = blockedList.some(creator => textContent.includes(`@${creator}`) || textContent.includes(creator));
                if (isBlocked) {
                    shouldHide = true;
                }
            }

            // 3. 성향 필터 (여성향, 남성향 분리 - 텍스트 기반 휴리스틱)
            const isFemaleOriented = textContent.includes('여성향') || textContent.includes('bl') || textContent.includes('헤테로(여)');
            const isMaleOriented = textContent.includes('남성향') || textContent.includes('gl') || textContent.includes('헤테로(남)');
            
            if (config.filterGender === 'female' && isMaleOriented) shouldHide = true;
            if (config.filterGender === 'male' && isFemaleOriented) shouldHide = true;
            
            // 11. 반대 성향 마스킹 (모자이크 처리)
            if (config.maskOppositeGender && !shouldHide) {
                if (config.filterGender === 'female' && !isFemaleOriented && isMaleOriented) shouldMask = true;
                if (config.filterGender === 'male' && !isMaleOriented && isFemaleOriented) shouldMask = true;
            }

            // 2. 선호 태그 기반 강조 또는 비선호 숨김 (옵션)
            // 현재는 숨기는 로직 대신 '추천' 섹션에서 강조하는 용도로만 스크립트화 (복잡도 때문)
            // 여기서는 단순 필터링 통과 여부만 확인

            // 적용
            if (shouldHide) {
                card.style.display = 'none';
            } else {
                card.style.display = ''; // 복구
                
                // 마스킹 적용 (썸네일 이미지 찾기)
                const img = card.querySelector('img');
                if (img) {
                    if (shouldMask) {
                        img.style.filter = 'blur(15px)';
                        img.style.transition = 'filter 0.3s ease';
                        // 마우스를 올리면 마스킹이 풀리도록 할 수도 있습니다 (선택사항)
                        img.addEventListener('mouseenter', () => img.style.filter = 'blur(0px)');
                        img.addEventListener('mouseleave', () => img.style.filter = 'blur(15px)');
                    } else {
                        img.style.filter = 'none';
                    }
                }
            }
        });
    }

    // SPA(Single Page Application) 특성상 페이지 전환 없이 내용이 바뀌므로 DOM 변화를 감지합니다.
    const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        for (let mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldProcess = true;
                break;
            }
        }
        if (shouldProcess) {
            processCharacterCards();
        }
    });

    // Observer 시작 헬퍼
    function startObserver() {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function createUI() {
        // UI 기본 스타일 (이전 버전에서 업데이트)
        GM_addStyle(`
            #cd-custom-btn {
                position: fixed; bottom: 20px; right: 20px;
                background-color: #E91E63; color: white;
                border: none; border-radius: 50%; width: 55px; height: 55px;
                font-size: 24px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                transition: transform 0.2s, background-color 0.2s;
            }
            #cd-custom-btn:hover { transform: scale(1.1); background-color: #D81B60; }
            
            #cd-custom-modal {
                display: none; position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%); width: 650px; max-height: 85vh; overflow-y: auto;
                background: #1e1e1e; color: #eee; padding: 25px; border-radius: 12px;
                z-index: 1000000; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
                border: 1px solid #333; font-family: 'Pretendard', sans-serif;
            }
            
            /* 스크롤바 스타일링 */
            #cd-custom-modal::-webkit-scrollbar { width: 8px; }
            #cd-custom-modal::-webkit-scrollbar-track { background: #1e1e1e; }
            #cd-custom-modal::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }

            #cd-custom-modal h2 { margin-top: 0; font-size: 20px; color: #E91E63; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px;}
            
            .cd-setting-section { background: #2a2a2a; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            .cd-setting-section h3 { margin: 0 0 10px 0; font-size: 16px; color: #bbb; }
            
            .cd-checkbox-group { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; }
            .cd-checkbox-group input[type="checkbox"] { margin-right: 10px; width: 16px; height: 16px; cursor: pointer; }
            .cd-checkbox-group label { font-size: 14px; cursor: pointer; flex-grow: 1; }
            
            .cd-input-group { margin-bottom: 15px; }
            .cd-input-group label { display: block; margin-bottom: 5px; font-size: 13px; color: #aaa; }
            .cd-input-group input[type="text"], .cd-input-group select {
                width: 100%; padding: 8px; background: #111; color: #fff;
                border: 1px solid #444; border-radius: 4px; box-sizing: border-box;
            }
            .cd-input-group textarea {
                width: 100%; height: 100px; background: #111; color: #a5d6a7;
                border: 1px solid #444; padding: 10px; font-family: monospace;
                resize: vertical; box-sizing: border-box; border-radius: 4px;
            }
            
            .cd-button-group { text-align: right; margin-top: 25px; border-top: 1px solid #333; padding-top: 15px; }
            .cd-btn { padding: 10px 20px; margin-left: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; transition: opacity 0.2s;}
            .cd-btn:hover { opacity: 0.8; }
            .cd-btn-save { background: #E91E63; color: white; }
            .cd-btn-close { background: #555; color: white; }
            
            #cd-custom-overlay {
                display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); z-index: 999999;
            }
            
            .cd-help-text { font-size: 11px; color: #888; margin-top: 3px; display: block; }
        `);

        // 오버레이 및 버튼 생성
        const overlay = document.createElement('div');
        overlay.id = 'cd-custom-overlay';
        document.body.appendChild(overlay);

        const btn = document.createElement('button');
        btn.id = 'cd-custom-btn';
        btn.innerHTML = '🛠️';
        btn.title = '케이브덕 UI 매니저';
        document.body.appendChild(btn);

        // 설정 모달 HTML 구성
        const modal = document.createElement('div');
        modal.id = 'cd-custom-modal';
        modal.innerHTML = `
            <h2>🦆 케이브덕 UI 커스텀 매니저</h2>
            
            <div class="cd-setting-section">
                <h3>레이아웃 숨기기 (ON/OFF)</h3>
                <label class="cd-checkbox-group">
                    <input type="checkbox" id="cd-opt-banner" ${config.hideBanner ? 'checked' : ''}>
                    <span>메인 페이지 상단 대형 배너 숨기기</span>
                </label>
                <label class="cd-checkbox-group">
                    <input type="checkbox" id="cd-opt-official" ${config.hideOfficial ? 'checked' : ''}>
                    <span>'자랑스러운 공식 크리에이터' 칸 숨기기</span>
                </label>
                <label class="cd-checkbox-group">
                    <input type="checkbox" id="cd-opt-popular" ${config.hidePopular ? 'checked' : ''}>
                    <span>'인기 캐릭터' 칸 숨기기</span>
                </label>
                <label class="cd-checkbox-group">
                    <input type="checkbox" id="cd-opt-world" ${config.hideWorld ? 'checked' : ''}>
                    <span>'세계관' 관련 칸 숨기기</span>
                </label>
            </div>

            <div class="cd-setting-section">
                <h3>태그 및 성향 필터링</h3>
                <div class="cd-input-group">
                    <label>성향 전용 필터 (메인 노출 제한)</label>
                    <select id="cd-opt-gender">
                        <option value="none" ${config.filterGender === 'none' ? 'selected' : ''}>모두 보기 (기본)</option>
                        <option value="female" ${config.filterGender === 'female' ? 'selected' : ''}>여성향/BL/순정 주로 보기</option>
                        <option value="male" ${config.filterGender === 'male' ? 'selected' : ''}>남성향/GL/하렘 주로 보기</option>
                    </select>
                    <span class="cd-help-text">* 캐릭터 설명에 포함된 키워드를 기반으로 작동하여 100% 완벽하지 않을 수 있습니다.</span>
                </div>
                
                <label class="cd-checkbox-group">
                    <input type="checkbox" id="cd-opt-mask" ${config.maskOppositeGender ? 'checked' : ''}>
                    <div>
                        <span>반대 성향 캐릭터 표지 마스킹 (모자이크)</span>
                        <span class="cd-help-text" style="display:block;">* 위에서 설정한 성향과 반대되는 캐릭터의 이미지를 흐리게 처리합니다.</span>
                    </div>
                </label>

                <div class="cd-input-group" style="margin-top:15px;">
                    <label>선호 태그 강조 (콤마로 구분, 예: 순애, 집착, 판타지)</label>
                    <input type="text" id="cd-opt-prefer" value="${config.preferTags}" placeholder="케이브덕 태그 입력">
                </div>
            </div>

            <div class="cd-setting-section">
                <h3>차단 및 블랙리스트</h3>
                <div class="cd-input-group">
                    <label>특정 크리에이터 숨기기 (콤마로 구분, 예: user1, user2)</label>
                    <input type="text" id="cd-opt-block" value="${config.blockedCreators}" placeholder="닉네임 입력 ( @ 기호 제외 )">
                    <span class="cd-help-text">* 배너, 공식 크리에이터, 일반 리스트 어디서든 해당 닉네임이 포함된 카드를 가립니다.</span>
                </div>
            </div>

            <div class="cd-setting-section">
                <h3>개발자 커스텀 스크립트</h3>
                <div class="cd-input-group">
                    <label>Custom CSS</label>
                    <textarea id="cd-css-input" spellcheck="false">${config.customCSS}</textarea>
                </div>
                <div class="cd-input-group">
                    <label>Custom JS</label>
                    <textarea id="cd-js-input" spellcheck="false">${config.customJS}</textarea>
                </div>
            </div>

            <div class="cd-button-group">
                <button class="cd-btn cd-btn-close" id="cd-btn-close">취소</button>
                <button class="cd-btn cd-btn-save" id="cd-btn-save">저장 및 새로고침</button>
            </div>
        `;
        document.body.appendChild(modal);

        // 이벤트 리스너 바인딩
        const toggleModal = (show) => {
            modal.style.display = show ? 'block' : 'none';
            overlay.style.display = show ? 'block' : 'none';
        };

        btn.addEventListener('click', () => toggleModal(true));
        overlay.addEventListener('click', () => toggleModal(false));
        document.getElementById('cd-btn-close').addEventListener('click', () => toggleModal(false));

        // 저장 로직
        document.getElementById('cd-btn-save').addEventListener('click', () => {
            // UI 값 읽어오기
            const newConfig = {
                hideBanner: document.getElementById('cd-opt-banner').checked,
                hideOfficial: document.getElementById('cd-opt-official').checked,
                hidePopular: document.getElementById('cd-opt-popular').checked,
                hideWorld: document.getElementById('cd-opt-world').checked,
                
                filterGender: document.getElementById('cd-opt-gender').value,
                maskOppositeGender: document.getElementById('cd-opt-mask').checked,
                
                preferTags: document.getElementById('cd-opt-prefer').value,
                blockedCreators: document.getElementById('cd-opt-block').value,
                
                customCSS: document.getElementById('cd-css-input').value,
                customJS: document.getElementById('cd-js-input').value
            };

            // 저장
            GM_setValue(CONFIG_KEY, newConfig);
            
            // 페이지 새로고침하여 즉시 적용
            location.reload();
        });
    }

    function init() {
        // 1. UI 생성
        createUI();
        
        // 2. CSS 기반 레이아웃 숨기기 적용
        applyDynamicStyles();
        
        // 3. 커스텀 JS 실행 (안전하게)
        if (config.customJS && config.customJS.trim() !== '') {
            try {
                const userFunction = new Function(config.customJS);
                userFunction();
            } catch (error) {
                console.error('[케이브덕 매니저] 커스텀 JS 에러:', error);
            }
        }

        // 4. 초기 DOM 필터링 및 옵저버 시작
        // 페이지가 완전히 렌더링될 시간을 조금 주기 위해 setTimeout 사용
        setTimeout(() => {
            processCharacterCards();
            startObserver();
        }, 1000);
    }

    // 문서 로딩 상태에 따라 초기화 함수 실행
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }

})();
