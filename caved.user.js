// ==UserScript==
// @name         케이브덕 커스텀 스크립트 매니저 v4.1
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  필터링/차단/마스킹 + 디버그 모드(caveduckDebug() 콘솔 명령). 공식크리에이터 차단/세계관 숨기기는 보류 중.
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       0. 설정
       ========================================================= */
    const CONFIG_KEY = 'caveduck_advanced_config_v4';

    const defaultConfig = {
        hideBanner: false,
        hideOfficial: false,
        hidePopular: false,
        filterGender: 'none',       // none | female | male  (서버 선호캐릭터 보조용)
        maskOppositeGender: false,
        preferTags: '',             // 콤마 구분 — 태그 칩과 매칭
        blockedCreators: ''         // 콤마 구분, @ 제외
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };
    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
    }

    /* =========================================================
       1. 실제 케이브덕 i18n 문자열 기준 섹션 헤딩 키워드
       (Next.js RSC 페이로드에서 직접 확인한 한국어 원문)
       ========================================================= */
    const SECTION_KEYWORDS = {
        banner: ['공식 드리미코어', '딴딴 명탕이'], // 배너는 캠페인마다 텍스트가 바뀌므로 휴리스틱도 같이 사용
        official: ['자랑스러운 공식 크리에이터'],
        popular: ['인기 캐릭터'],
        recommended: ['추천하는 캐릭터'],
        trending: ['실시간 급상승 캐릭터'],
        recent: ['최신 캐릭터 라인업']
        // 주의: '공식 크리에이터' 칸 차단과 '세계관' 칸은 이번 버전에서 보류됨 (요청에 따라 제외, 아래 DEBUG 모드로 먼저 원인 진단 필요)
    };

    /* =========================================================
       DEBUG 모드 — 콘솔에서 caveduckDebug() 호출하면
       지금 페이지에서 카드/핸들/태그칩이 실제로 어떻게 잡히는지 출력합니다.
       모자이크/차단이 안 먹힐 때, 추측 대신 이 결과를 보고 정확히 고칠 수 있습니다.
       ========================================================= */
    window.caveduckDebug = function () {
        const cards = findAllCharacterCards();
        console.log(`[케이브덕 디버그] 발견된 카드 수: ${cards.length}`);
        cards.slice(0, 10).forEach((card, i) => {
            const handle = extractHandle(card);
            const chips = extractTagChips(card);
            console.log(`--- 카드 ${i + 1} ---`);
            console.log('href:', card.href || card.getAttribute('href'));
            console.log('추출된 핸들(@):', handle);
            console.log('추출된 태그칩 후보:', chips);
            console.log('img 태그 존재 여부:', !!card.querySelector('img'));
            console.log('card outerHTML(앞 300자):', card.outerHTML.slice(0, 300));
        });
        console.log('카드가 0개로 나오면 a[href*="/character"] 선택자가 실제 DOM과 안 맞는다는 뜻입니다.');
        console.log('핸들/태그칩이 비어있으면 해당 추출 로직이 실제 마크업 구조와 안 맞는다는 뜻입니다.');
        return cards;
    };

    // 게임/캐릭터 성향 태그 (케이브덕 공식 태그 체계 기준)
    const TAG_LABELS = {
        female: ['BL', '순애', '순정', '역하렘'], // 여성향으로 분류되는 대표 태그
        male: ['백합', '하렘', 'GL']               // 남성향으로 분류되는 대표 태그
    };

    /* =========================================================
       2. 섹션 찾기 — 헤딩 텍스트 직접 스캔 (CSS :contains는 무효이므로 사용 안 함)
       ========================================================= */
    const HEADING_SELECTOR = 'h1, h2, h3, h4, p, span, div';

    function isOwnUI(el) {
        return !!(el.closest && el.closest('#cd-panel, #cd-toggle-btn, #cd-overlay'));
    }

    function findSectionsByHeadingText(keywords) {
        const found = new Set();
        const candidates = document.querySelectorAll(HEADING_SELECTOR);

        for (const el of candidates) {
            if (isOwnUI(el)) continue;

            const ownText = Array.from(el.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .join('');
            const text = ownText || el.textContent.trim();
            if (!text || text.length > 40) continue;

            const hit = keywords.some(k => text.includes(k));
            if (!hit) continue;

            // 헤딩에서 위로 올라가며 카드/리스트를 포함한 의미있는 섹션 블록 추정
            let node = el;
            let candidate = el;
            for (let depth = 0; depth < 6 && node.parentElement; depth++) {
                node = node.parentElement;
                const imgCount = node.querySelectorAll('img').length;
                const linkCount = node.querySelectorAll('a').length;
                if (imgCount >= 1 || linkCount >= 2) candidate = node;
                if (node.parentElement === document.body) break;
            }
            found.add(candidate);
        }
        return Array.from(found);
    }

    function hideSections(marker, keywords) {
        findSectionsByHeadingText(keywords).forEach(el => {
            el.setAttribute(`data-cd-hidden-${marker}`, '1');
            el.style.setProperty('display', 'none', 'important');
        });
    }

    function unhideSections(marker) {
        document.querySelectorAll(`[data-cd-hidden-${marker}]`).forEach(el => {
            el.style.removeProperty('display');
            el.removeAttribute(`data-cd-hidden-${marker}`);
        });
    }

    // 메인 상단 대형 배너 — 헤딩이 거의 없는 캐러셀이라 별도 휴리스틱
    function hideTopBannerByHeuristic() {
        const candidates = document.querySelectorAll(
            '[class*="banner" i], [class*="swiper" i], [class*="carousel" i], [class*="slide" i]'
        );
        candidates.forEach(el => {
            if (isOwnUI(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 300 || rect.height < 80) return;
            el.setAttribute('data-cd-hidden-banner', '1');
            el.style.setProperty('display', 'none', 'important');
        });
    }

    function applySectionVisibility() {
        ['banner', 'official', 'popular'].forEach(unhideSections);

        if (config.hideBanner) {
            hideSections('banner', SECTION_KEYWORDS.banner);
            hideTopBannerByHeuristic();
        }
        if (config.hideOfficial) hideSections('official', SECTION_KEYWORDS.official);
        if (config.hidePopular) hideSections('popular', SECTION_KEYWORDS.popular);
    }

    /* =========================================================
       3. 카드 처리 — 일반 카드 + 공식 크리에이터 칸 카드 모두 동일 차단 로직 적용
       ========================================================= */

    function extractHandle(card) {
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent.trim();
            if (t.startsWith('@') && t.length > 1) return t.slice(1).toLowerCase();
        }
        return null;
    }

    // 카드 안에 표시된 태그 칩 텍스트들을 모아서 반환 (짧고 반복적인 라벨 형태 텍스트 노드 위주로 수집)
    function extractTagChips(card) {
        const chips = [];
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent.trim();
            // 태그 칩은 보통 짧은 한 단어. 너무 길면 제목/설명일 확률이 높아 제외.
            if (t && t.length > 0 && t.length <= 12 && !t.startsWith('@')) {
                chips.push(t);
            }
        }
        return chips;
    }

    function findAllCharacterCards() {
        // 일반 추천/인기/신작 카드 + 공식 크리에이터 칸의 카드 모두 동일하게 a[href*="/character"] 기준으로 잡힘
        const links = document.querySelectorAll('a[href*="/character"], a[href*="/characters/"]');
        const cards = new Set();
        links.forEach(a => { if (!isOwnUI(a)) cards.add(a); });
        return Array.from(cards);
    }

    function processCharacterCards() {
        const cards = findAllCharacterCards();
        if (cards.length === 0) return { total: 0, hidden: 0, masked: 0 };

        const blockedList = config.blockedCreators
            .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const preferTags = config.preferTags
            .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        let hiddenCount = 0;
        let maskedCount = 0;

        cards.forEach(card => {
            const handle = extractHandle(card);
            const chips = extractTagChips(card).map(c => c.toLowerCase());
            const fullText = card.textContent.toLowerCase();

            let shouldHide = false;
            let shouldMask = false;

            // 차단 — 일반 카드든 공식 크리에이터 칸 카드든 동일하게 적용 (정확히 일치하는 핸들만)
            if (blockedList.length > 0 && handle && blockedList.includes(handle)) {
                shouldHide = true;
            }

            // 성향 필터 — 태그 칩을 우선 사용, 칩이 없으면 텍스트 키워드로 보조 판단
            const chipHitFemale = TAG_LABELS.female.some(t => chips.includes(t.toLowerCase()));
            const chipHitMale = TAG_LABELS.male.some(t => chips.includes(t.toLowerCase()));
            const textHitFemale = TAG_LABELS.female.some(t => fullText.includes(t.toLowerCase()));
            const textHitMale = TAG_LABELS.male.some(t => fullText.includes(t.toLowerCase()));

            const isFemaleOriented = chipHitFemale || textHitFemale;
            const isMaleOriented = chipHitMale || textHitMale;

            if (!shouldHide) {
                if (config.filterGender === 'female' && isMaleOriented && !isFemaleOriented) {
                    if (config.maskOppositeGender) shouldMask = true; else shouldHide = true;
                }
                if (config.filterGender === 'male' && isFemaleOriented && !isMaleOriented) {
                    if (config.maskOppositeGender) shouldMask = true; else shouldHide = true;
                }
            }

            // 선호 태그 — 태그 칩에 매칭되면 표시(테두리 강조), 매칭 안 되면 그대로 둠 (비선호라고 숨기진 않음)
            let prefMatched = false;
            if (!shouldHide && preferTags.length > 0) {
                prefMatched = preferTags.some(pt => chips.some(c => c.includes(pt)) || fullText.includes(pt));
            }

            if (shouldHide) {
                card.setAttribute('data-cd-card-hidden', '1');
                card.style.setProperty('display', 'none', 'important');
                hiddenCount++;
                return;
            }

            if (card.hasAttribute('data-cd-card-hidden')) {
                card.style.removeProperty('display');
                card.removeAttribute('data-cd-card-hidden');
            }

            const img = card.querySelector('img');
            if (img) {
                if (shouldMask) {
                    img.style.filter = 'blur(18px)';
                    img.style.transition = 'filter 0.25s ease';
                    if (!img.dataset.cdMaskBound) {
                        img.addEventListener('mouseenter', () => { img.style.filter = 'blur(0px)'; });
                        img.addEventListener('mouseleave', () => { img.style.filter = 'blur(18px)'; });
                        img.dataset.cdMaskBound = '1';
                    }
                    maskedCount++;
                } else {
                    img.style.filter = '';
                }
            }

            card.style.outline = prefMatched ? '2px solid #E91E63' : '';
            card.style.outlineOffset = prefMatched ? '2px' : '';
        });

        return { total: cards.length, hidden: hiddenCount, masked: maskedCount };
    }

    function applyAll() {
        applySectionVisibility();
        const stats = processCharacterCards();
        updatePreview(stats);
    }

    /* =========================================================
       4. DOM 변화 감지 (디바운스)
       ========================================================= */
    let debounceTimer = null;
    function scheduleApply() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyAll, 300);
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
            if (el && isOwnUI(el)) continue;
            scheduleApply();
            return;
        }
    });
    function startObserver() {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* =========================================================
       5. UI — 오른쪽 고정 패널 + 실시간 미리보기
       ========================================================= */
    function createUI() {
        GM_addStyle(`
            #cd-toggle-btn {
                position: fixed; top: 50%; right: 0; transform: translateY(-50%);
                background: #E91E63; color: #fff; border: none;
                border-radius: 10px 0 0 10px; width: 42px; height: 64px;
                font-size: 20px; cursor: pointer; z-index: 999990;
                box-shadow: -2px 0 10px rgba(0,0,0,0.4);
                display: flex; align-items: center; justify-content: center;
            }
            #cd-overlay {
                display: none; position: fixed; inset: 0;
                background: rgba(0,0,0,0.35); z-index: 999991;
            }
            #cd-panel {
                display: none; position: fixed; top: 0; right: 0; bottom: 0;
                width: 380px; max-width: 92vw; background: #16161a; color: #eee;
                box-shadow: -6px 0 24px rgba(0,0,0,0.5); z-index: 999992;
                overflow-y: auto; padding: 18px 18px 90px 18px; font-size: 13px; box-sizing: border-box;
            }
            #cd-panel h2 { font-size: 16px; margin: 0 0 14px; }
            #cd-panel h3 { font-size: 13px; color: #f48fb1; margin: 18px 0 8px; border-bottom: 1px solid #333; padding-bottom: 6px; }
            .cd-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 9px; }
            .cd-row input[type="checkbox"] { margin-top: 2px; width: 15px; height: 15px; cursor: pointer; }
            .cd-row label { cursor: pointer; line-height: 1.4; }
            .cd-field { margin-bottom: 12px; }
            .cd-field label { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; }
            .cd-field input[type="text"], .cd-field select {
                width: 100%; box-sizing: border-box; padding: 7px 8px;
                background: #0e0e10; color: #fff; border: 1px solid #3a3a3a; border-radius: 5px;
            }
            .cd-help { font-size: 11px; color: #777; margin-top: 3px; display: block; }
            #cd-preview-box {
                background: #0e0e10; border: 1px solid #333; border-radius: 6px;
                padding: 10px; font-size: 12px; line-height: 1.7;
            }
            #cd-preview-box b { color: #f48fb1; }
            #cd-panel-actions {
                position: sticky; bottom: -90px; margin-top: 20px;
                display: flex; gap: 8px; background: #16161a; padding-top: 10px;
            }
            .cd-btn { flex: 1; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; }
            .cd-btn-save { background: #E91E63; color: #fff; }
            .cd-btn-close { background: #3a3a3a; color: #eee; }
        `);

        const overlay = document.createElement('div');
        overlay.id = 'cd-overlay';
        document.body.appendChild(overlay);

        const btn = document.createElement('button');
        btn.id = 'cd-toggle-btn';
        btn.textContent = '🛠';
        btn.title = '케이브덕 UI 매니저 열기';
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'cd-panel';
        panel.innerHTML = `
            <h2>🦆 케이브덕 UI 매니저</h2>

            <h3>레이아웃 숨기기</h3>
            <div class="cd-row">
                <input type="checkbox" id="cd-hideBanner" ${config.hideBanner ? 'checked' : ''}>
                <label for="cd-hideBanner">메인 상단 대형 배너 숨기기</label>
            </div>
            <div class="cd-row">
                <input type="checkbox" id="cd-hideOfficial" ${config.hideOfficial ? 'checked' : ''}>
                <label for="cd-hideOfficial">'자랑스러운 공식 크리에이터' 칸 숨기기</label>
            </div>
            <div class="cd-row">
                <input type="checkbox" id="cd-hidePopular" ${config.hidePopular ? 'checked' : ''}>
                <label for="cd-hidePopular">'인기 캐릭터' 칸 숨기기</label>
            </div>

            <h3>성향 필터 / 마스킹</h3>
            <div class="cd-field">
                <label>주로 보고 싶은 성향 (태그 칩 우선 매칭)</label>
                <select id="cd-filterGender">
                    <option value="none" ${config.filterGender === 'none' ? 'selected' : ''}>모두 보기</option>
                    <option value="female" ${config.filterGender === 'female' ? 'selected' : ''}>여성향 (BL/순애/순정/역하렘) 위주</option>
                    <option value="male" ${config.filterGender === 'male' ? 'selected' : ''}>남성향 (백합/하렘/GL) 위주</option>
                </select>
                <span class="cd-help">⚠ 계정 설정 &gt; 선호 캐릭터에도 같은 옵션이 있어요. 거기서 설정해도 서버 추천이 100% 정확하지 않을 수 있어 이 필터로 한 번 더 거릅니다.</span>
            </div>
            <div class="cd-row">
                <input type="checkbox" id="cd-maskOpposite" ${config.maskOppositeGender ? 'checked' : ''}>
                <label for="cd-maskOpposite">반대 성향 카드는 숨기지 않고 <b>표지만</b> 모자이크 (제목/닉네임 노출, 마우스 올리면 해제)</label>
            </div>

            <h3>선호 태그 (강조 표시)</h3>
            <div class="cd-field">
                <label>선호 태그 — 콤마로 구분</label>
                <input type="text" id="cd-preferTags" value="${config.preferTags}" placeholder="예: 순애, 집착, 판타지">
                <span class="cd-help">태그 칩과 일치하면 카드에 분홍 테두리로 강조 표시됩니다. (정렬 변경은 아님)</span>
            </div>

            <h3>제작자 차단</h3>
            <div class="cd-field">
                <label>차단할 제작자 핸들 — 콤마로 구분, @ 제외</label>
                <input type="text" id="cd-blockedCreators" value="${config.blockedCreators}" placeholder="예: dream_core, Nae">
                <span class="cd-help">정확히 일치하는 핸들만 차단합니다. ⚠ '자랑스러운 공식 크리에이터' 칸은 카드 구조가 달라 이 버전에서는 차단이 적용되지 않을 수 있습니다 (디버그 확인 중) — 콘솔에서 caveduckDebug() 실행 후 결과를 알려주시면 다음 버전에서 정확히 고칩니다.</span>
            </div>

            <h3>실시간 미리보기</h3>
            <div id="cd-preview-box">설정을 변경하면 여기에 바로 반영됩니다.</div>

            <div id="cd-panel-actions">
                <button class="cd-btn cd-btn-close" id="cd-btn-close">닫기</button>
                <button class="cd-btn cd-btn-save" id="cd-btn-save">저장</button>
            </div>
        `;
        document.body.appendChild(panel);

        function toggle(show) {
            panel.style.display = show ? 'block' : 'none';
            overlay.style.display = show ? 'block' : 'none';
        }
        btn.addEventListener('click', () => toggle(true));
        overlay.addEventListener('click', () => toggle(false));
        panel.querySelector('#cd-btn-close').addEventListener('click', () => toggle(false));

        function readDraft() {
            return {
                hideBanner: panel.querySelector('#cd-hideBanner').checked,
                hideOfficial: panel.querySelector('#cd-hideOfficial').checked,
                hidePopular: panel.querySelector('#cd-hidePopular').checked,
                filterGender: panel.querySelector('#cd-filterGender').value,
                maskOppositeGender: panel.querySelector('#cd-maskOpposite').checked,
                preferTags: panel.querySelector('#cd-preferTags').value,
                blockedCreators: panel.querySelector('#cd-blockedCreators').value
            };
        }

        panel.querySelector('#cd-btn-save').addEventListener('click', () => {
            saveConfig(readDraft());
            applyAll();
        });

        panel.addEventListener('input', () => { config = { ...config, ...readDraft() }; applyAll(); });
        panel.addEventListener('change', () => { config = { ...config, ...readDraft() }; applyAll(); });
    }

    function updatePreview(stats) {
        const box = document.getElementById('cd-preview-box');
        if (!box) return;
        box.innerHTML = `
            현재 페이지 캐릭터 카드: <b>${stats.total}</b>개<br>
            차단/필터로 숨김: <b>${stats.hidden}</b>개<br>
            모자이크 처리: <b>${stats.masked}</b>개
        `;
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
