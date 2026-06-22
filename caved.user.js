// ==UserScript==
// @name         케이브덕 커스텀 스크립트 매니저 v3
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  케이브덕 메인페이지 UI 커스텀, 필터링, 마스킹, 차단 기능 (사이드 패널 + 실시간 미리보기)
// @author       You
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       0. 설정값
       ========================================================= */
    const CONFIG_KEY = 'caveduck_advanced_config_v3';

    const defaultConfig = {
        hideBanner: false,
        hideOfficial: false,
        hidePopular: false,
        hideWorld: false,
        filterGender: 'none',      // none | female | male
        maskOppositeGender: false,
        preferTags: '',            // 콤마 구분
        blockedCreators: ''        // 콤마 구분, @ 기호 없이
    };

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };

    function saveConfig(newConfig) {
        config = { ...config, ...newConfig };
        GM_setValue(CONFIG_KEY, config);
    }

    /* =========================================================
       1. 텍스트 기반 "섹션" 찾기 — 실제 동작하는 방식
       (:contains는 표준 CSS가 아니라서 절대 동작하지 않습니다.
        대신 heading 텍스트를 직접 스캔해서 그 부모 블록을 찾습니다.)
       ========================================================= */

    // 헤딩으로 흔히 쓰일 만한 태그들. 사이트마다 div/span을 헤딩처럼 쓰는 경우도 있어서
    // 너무 깊은 곳(글자 단위)까지 내려가지 않게 헤딩 후보 태그만 본다.
    const HEADING_SELECTOR = 'h1, h2, h3, h4, p, span, div';

    /**
     * keyword가 포함된 "헤딩처럼 보이는" 엘리먼트를 찾고,
     * 그 헤딩을 포함하는 의미있는 상위 섹션 블록을 추정해서 반환.
     * - 너무 위로(예: body, 메인 wrapper) 올라가서 페이지 전체를 가리는 사고를 막기 위해
     *   "형제 노드가 카드/리스트를 포함하는 블록"을 만났을 때 멈춘다.
     */
    function findSectionByHeadingText(keywords) {
        const sections = new Set();
        const all = document.querySelectorAll(HEADING_SELECTOR);

        for (const el of all) {
            // 직접 텍스트만 비교 (자식의 텍스트까지 다 합쳐진 거대 컨테이너를 헤딩으로 오인하지 않기 위해)
            const ownText = Array.from(el.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .join('');

            const text = ownText || el.textContent.trim();
            if (!text || text.length > 40) continue; // 헤딩은 보통 짧음. 긴 텍스트는 본문일 확률 높음.

            const lower = text.toLowerCase();
            const hit = keywords.some(k => lower.includes(k.toLowerCase()));
            if (!hit) continue;

            // 헤딩에서 위로 올라가며 "이 블록을 통째로 숨겨도 되는" 컨테이너를 찾는다.
            let node = el;
            let candidate = el;
            for (let depth = 0; depth < 6 && node.parentElement; depth++) {
                node = node.parentElement;
                // 후보 조건: 자식으로 카드 그리드(이미지가 여러 개 들어있는 리스트)를 포함하고 있고,
                // 너무 크지 않은(=섹션 단위) 블록일 것.
                const imgCount = node.querySelectorAll('img').length;
                const linkCount = node.querySelectorAll('a').length;
                if (imgCount >= 2 || linkCount >= 2) {
                    candidate = node;
                }
                // body 바로 아래나 너무 큰 wrapper면 더 올라가지 않고 멈춤
                if (node.parentElement === document.body) break;
            }
            sections.add(candidate);
        }
        return Array.from(sections);
    }

    // 매니저 자신의 UI(패널/버튼)는 절대 숨기지 않도록 보호
    function isOwnUI(el) {
        return !!(el.closest && el.closest('#cd-panel, #cd-toggle-btn, #cd-overlay'));
    }

    function hideSections(keywords, marker) {
        const found = findSectionByHeadingText(keywords);
        found.forEach(el => {
            if (isOwnUI(el)) return;
            el.setAttribute(`data-cd-hidden-${marker}`, '1');
            el.style.setProperty('display', 'none', 'important');
        });
        return found.length;
    }

    function unhideSections(marker) {
        document.querySelectorAll(`[data-cd-hidden-${marker}]`).forEach(el => {
            el.style.removeProperty('display');
            el.removeAttribute(`data-cd-hidden-${marker}`);
        });
    }

    function applySectionVisibility() {
        unhideSections('banner');
        unhideSections('official');
        unhideSections('popular');
        unhideSections('world');

        if (config.hideBanner) {
            hideSections(['공식 크리에이터', '소꿉친구', '명탕이'], 'banner'); // 배너 텍스트는 매번 바뀌므로 아래 별도 로직도 사용
            hideTopBannerByHeuristic();
        }
        if (config.hideOfficial) hideSections(['자랑스러운 공식 크리에이터', '공식 크리에이터'], 'official');
        if (config.hidePopular) hideSections(['인기 캐릭터', '실시간 인기'], 'popular');
        if (config.hideWorld) hideSections(['세계관'], 'world');
    }

    // 메인 상단 대형 배너는 보통 헤딩이 없는 슬라이더/캐러셀 형태라
    // 텍스트 매칭이 아니라 "페이지 최상단의 큰 이미지 캐러셀" 휴리스틱으로 따로 처리
    function hideTopBannerByHeuristic() {
        const candidates = document.querySelectorAll(
            '[class*="banner" i], [class*="swiper" i], [class*="carousel" i], [class*="slide" i]'
        );
        candidates.forEach(el => {
            if (isOwnUI(el)) return;
            // 너무 작은(아이콘 같은) 요소는 제외 — 폭이 충분히 큰 것만 배너로 간주
            const rect = el.getBoundingClientRect();
            if (rect.width < 300 || rect.height < 80) return;
            el.setAttribute('data-cd-hidden-banner', '1');
            el.style.setProperty('display', 'none', 'important');
        });
    }

    /* =========================================================
       2. 캐릭터 카드 필터링 / 마스킹 / 차단
       ========================================================= */

    const GENDER_KEYWORDS = {
        female: ['여성향', 'bl', '순정', '역하렘', '하렘(여)', '여돌'],   // 여성향 취향 텍스트 신호
        male: ['남성향', 'gl', '하렘', '백합', '남돌']                   // 남성향 취향 텍스트 신호
    };

    function getCardLinkAndName(card) {
        // 카드 안에서 "@닉네임" 형태로 표시되는 제작자 핸들을 별도로 추출.
        // (카드 전체 텍스트를 뭉쳐서 includes()하면 false positive가 잘 나서,
        //  실제 핸들 텍스트 노드를 직접 찾는다.)
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let handle = null;
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent.trim();
            if (t.startsWith('@') && t.length > 1) {
                handle = t.slice(1).toLowerCase();
                break;
            }
        }
        return handle;
    }

    function findCharacterCards() {
        // 캐릭터 상세 링크를 가진 a 태그를 카드의 기준점으로 삼는다.
        const links = document.querySelectorAll('a[href*="/character"], a[href*="/characters/"]');
        const cards = new Set();
        links.forEach(a => {
            // a 자체가 카드 컨테이너인 경우가 많지만, 혹시 더 위에 카드 wrapper가 있으면 그것을 사용
            cards.add(a);
        });
        return Array.from(cards);
    }

    function processCharacterCards() {
        const cards = findCharacterCards();
        if (cards.length === 0) return { total: 0, hidden: 0, masked: 0 };

        const blockedList = config.blockedCreators
            .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        let hiddenCount = 0;
        let maskedCount = 0;

        cards.forEach(card => {
            if (isOwnUI(card)) return;

            const fullText = card.textContent.toLowerCase();
            const handle = getCardLinkAndName(card);

            let shouldHide = false;
            let shouldMask = false;

            // 7. 차단한 제작자 — 핸들이 정확히 일치할 때만 (부분 문자열 오탐 방지)
            if (blockedList.length > 0 && handle && blockedList.includes(handle)) {
                shouldHide = true;
            }

            // 3. 성향 필터
            const isFemaleOriented = GENDER_KEYWORDS.female.some(k => fullText.includes(k));
            const isMaleOriented = GENDER_KEYWORDS.male.some(k => fullText.includes(k));

            if (!shouldHide) {
                if (config.filterGender === 'female' && isMaleOriented && !isFemaleOriented) {
                    shouldMask = config.maskOppositeGender; // 마스킹 모드면 숨기지 않고 흐리게만
                    shouldHide = !config.maskOppositeGender; // 마스킹 모드가 아니면 완전히 숨김
                }
                if (config.filterGender === 'male' && isFemaleOriented && !isMaleOriented) {
                    shouldMask = config.maskOppositeGender;
                    shouldHide = !config.maskOppositeGender;
                }
            }

            // 적용 — 카드 표지(이미지)만 마스킹, 닉네임/제목 텍스트는 그대로 노출
            if (shouldHide) {
                card.setAttribute('data-cd-card-hidden', '1');
                card.style.setProperty('display', 'none', 'important');
                hiddenCount++;
            } else {
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
            }
        });

        return { total: cards.length, hidden: hiddenCount, masked: maskedCount };
    }

    function applyAll() {
        applySectionVisibility();
        const stats = processCharacterCards();
        updatePreview(stats);
    }

    /* =========================================================
       3. DOM 변화 감지 (디바운스로 성능 문제 해결)
       ========================================================= */
    let debounceTimer = null;
    function scheduleApply() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            applyAll();
        }, 300);
    }

    const observer = new MutationObserver((mutations) => {
        // 우리 자신의 UI 조작으로 발생한 변화는 무시 (무한루프/불필요한 재계산 방지)
        for (const m of mutations) {
            if (m.target && isOwnUI(m.target)) continue;
            scheduleApply();
            return;
        }
    });

    function startObserver() {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* =========================================================
       4. UI — 오른쪽 고정 사이드 패널 + 실시간 미리보기
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
            #cd-toggle-btn:hover { background: #D81B60; }

            #cd-overlay {
                display: none; position: fixed; inset: 0;
                background: rgba(0,0,0,0.35);
                z-index: 999991;
            }

            #cd-panel {
                display: none;
                position: fixed; top: 0; right: 0; bottom: 0;
                width: 380px; max-width: 92vw;
                background: #16161a; color: #eee;
                box-shadow: -6px 0 24px rgba(0,0,0,0.5);
                z-index: 999992;
                overflow-y: auto;
                padding: 18px 18px 90px 18px;
                font-size: 13px;
                box-sizing: border-box;
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
                padding: 10px; font-size: 12px; line-height: 1.7; margin-bottom: 4px;
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
            <div class="cd-row">
                <input type="checkbox" id="cd-hideWorld" ${config.hideWorld ? 'checked' : ''}>
                <label for="cd-hideWorld">'세계관' 칸 숨기기</label>
            </div>

            <h3>성향 필터 / 마스킹</h3>
            <div class="cd-field">
                <label>주로 보고 싶은 성향</label>
                <select id="cd-filterGender">
                    <option value="none" ${config.filterGender === 'none' ? 'selected' : ''}>모두 보기</option>
                    <option value="female" ${config.filterGender === 'female' ? 'selected' : ''}>여성향 / BL / 순정 위주</option>
                    <option value="male" ${config.filterGender === 'male' ? 'selected' : ''}>남성향 / GL / 하렘 위주</option>
                </select>
                <span class="cd-help">캐릭터 설명·태그 텍스트의 키워드를 기준으로 판단합니다. 태그가 비어 있는 카드는 100% 정확하지 않을 수 있어요.</span>
            </div>
            <div class="cd-row">
                <input type="checkbox" id="cd-maskOpposite" ${config.maskOppositeGender ? 'checked' : ''}>
                <label for="cd-maskOpposite">반대 성향 카드는 숨기지 않고 <b>표지만</b> 모자이크 (제목/닉네임은 그대로 표시, 마우스 올리면 해제)</label>
            </div>

            <h3>선호 태그 (참고용 기록)</h3>
            <div class="cd-field">
                <label>선호 태그 — 콤마로 구분</label>
                <input type="text" id="cd-preferTags" value="${config.preferTags}" placeholder="예: 순애, 집착, 판타지">
                <span class="cd-help">⚠ 케이브덕이 카드에 태그를 노출하지 않는 경우 매칭이 안 될 수 있습니다. 현재는 정렬/추천 재배치 없이 기록만 합니다.</span>
            </div>

            <h3>제작자 차단</h3>
            <div class="cd-field">
                <label>차단할 제작자 핸들 — 콤마로 구분, @ 제외</label>
                <input type="text" id="cd-blockedCreators" value="${config.blockedCreators}" placeholder="예: dream_core, Nae">
                <span class="cd-help">카드에 표시된 @닉네임과 정확히 일치할 때만 차단됩니다(오탐 방지).</span>
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

        // 저장 버튼: 설정 저장 + 새로고침 없이 즉시 재적용
        panel.querySelector('#cd-btn-save').addEventListener('click', () => {
            saveConfig({
                hideBanner: panel.querySelector('#cd-hideBanner').checked,
                hideOfficial: panel.querySelector('#cd-hideOfficial').checked,
                hidePopular: panel.querySelector('#cd-hidePopular').checked,
                hideWorld: panel.querySelector('#cd-hideWorld').checked,
                filterGender: panel.querySelector('#cd-filterGender').value,
                maskOppositeGender: panel.querySelector('#cd-maskOpposite').checked,
                preferTags: panel.querySelector('#cd-preferTags').value,
                blockedCreators: panel.querySelector('#cd-blockedCreators').value
            });
            applyAll();
        });

        // 패널 안에서 값이 바뀔 때마다 "임시 미리보기" — 저장 전에도 바로 반영해서 보여줌
        panel.addEventListener('input', () => previewWithDraftValues(panel));
        panel.addEventListener('change', () => previewWithDraftValues(panel));
    }

    // 저장하지 않은 현재 입력값 기준으로 즉시 적용 + 통계 갱신 (live preview)
    function previewWithDraftValues(panel) {
        const draft = {
            hideBanner: panel.querySelector('#cd-hideBanner').checked,
            hideOfficial: panel.querySelector('#cd-hideOfficial').checked,
            hidePopular: panel.querySelector('#cd-hidePopular').checked,
            hideWorld: panel.querySelector('#cd-hideWorld').checked,
            filterGender: panel.querySelector('#cd-filterGender').value,
            maskOppositeGender: panel.querySelector('#cd-maskOpposite').checked,
            preferTags: panel.querySelector('#cd-preferTags').value,
            blockedCreators: panel.querySelector('#cd-blockedCreators').value
        };
        config = { ...config, ...draft }; // 메모리상으로만 갱신 (저장은 버튼을 눌러야 됨)
        applyAll();
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
       5. 초기화
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
