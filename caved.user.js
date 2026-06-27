// ==UserScript==
// @name         케이브덕 커스텀 매니저
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  우측 고정 4분할 슬라이드 설정 패널, 메인 배너 완전 제거, 제목/소개·제작자 분리 필터링(실제 DOM 구조 기반), 필터 매칭 시각화 뱃지, 자동 출석체크, React 대응 채팅 입력 주입, 첫대화 플로팅 버튼, 윙 잔액 실시간 표기
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG_KEY = 'caveduck_premium_manager_config';
    const MEMO_KEY = 'caveduck_premium_manager_memos';

    // 기본 설정값 (배너 숨기기, 선호 태그, 차단 태그, 투명도 조절)
    const defaultConfig = {
        hideBanner: false,
        preferTags: '',       // 콤마 구분 - 매칭 시 노란색 부드러운 강조 (카드의 제목/소개란만 검사, 제작자명 제외)
        blockedTags: '',      // 콤마 구분 - 매칭 시 투명도 조절 + 번짐 차단 (카드의 제목/소개란만 검사, 제작자명 제외)
        blockedCreators: '',  // 콤마 구분 - 제작자명/슬러그 매칭 시 카드 자체를 완전 비표시
        blockedOpacity: 50,   // 블라인드 반투명도 기본값 (50%)
        panelOpacity: 95,     // 커스텀 매니저 창 투명도 기본값 (95%)
        showWingBadge: true   // 채팅방에 보유 윙 뱃지 표시 여부
    };

    // 기본 메모 목록 프리셋 제공
    const defaultMemos = [
        {
            id: 'preset-1',
            title: '대사 반복 금지 OOC',
            content: 'OOC: PC의 대사나 행동을 또 앵무새마냥 언급하지마세요. PC의 모든 행위는 PC를 연기하는 사용자가 직접 서술합니다. NPC가 PC의 행동 and 감정을 멋대로 왜곡하고 과대해석하지않습니다',
            date: '2026-03-01 22:56'
        },
        {
            id: 'preset-2',
            title: '이야기 부드러운 전개 유도',
            content: 'OOC: 대화를 급하게 끝내려 하지 말고, 주변 환경 묘사와 대화 사이의 여백을 충분히 살려 천천히 묘사하세요.',
            date: '2026-03-02 11:30'
        }
    ];

    let config = { ...defaultConfig, ...GM_getValue(CONFIG_KEY, {}) };
    let memos = GM_getValue(MEMO_KEY, defaultMemos);
    let stats = { total: 0, masked: 0, highlight: 0 };
    let updateTimeout = null;

    // 공식 케이브덕 전체 태그 사전 (탐지 정확도 보정을 위한 전역 데이터베이스)
    const CAVEDUCK_OFFICIAL_TAGS = [
        "남성", "여성", "오리지널 캐릭터", "2차 창작", "다수 인물", "시뮬레이터", "스토리", "어시스턴트", "수익화 제한",
        "남자친구", "여자친구", "연인", "플러팅", "친구", "첫사랑", "짝사랑", "동거", "연상", "연하", "애증", "소꿉친구",
        "가족", "교육", "순애", "구원", "후회", "복수", "소유욕", "참교육", "중년", "로맨스", "판타지", "현대판타지", "이세계",
        "느와르", "코미디", "힐링", "액션", "공포", "모험", "조난", "재난", "방탈출", "던전", "역사", "신화", "SF", "무협",
        "동양풍", "서양풍", "TS물", "BL", "백합", "정치물", "일상", "현대", "변신", "고스", "미스터리", "아카데미", "학원물",
        "일진", "기사", "황제", "마법사", "귀족", "탐정", "괴물", "오피스", "메이드", "집사", "밀리터리", "버튜버", "근육",
        "빙의", "비밀", "스포츠", "수영복", "마피아", "헌터", "제복", "경영", "배틀", "속박", "LGBTQ+", "베어", "츤데레",
        "쿨데레", "얀데레", "다정", "순정", "능글", "히어로/히로인", "빌런", "음침", "소심", "햇살", "까칠", "무뚝뚝", "게임",
        "애니메이션", "영화 & 티비", "책", "유명인", "코스프레", "동화", "천사", "악마", "요정", "귀신", "엘프", "오크",
        "몬무스", "뱀파이어", "외계인", "로봇", "동물", "퍼리", "공모전 당선작", "제17회 공모전", "제16회 공모전", "제15회 공모전",
        "제14회 공모전", "제13회 공모전", "제12회 공모전", "제11회 공모전", "25.07 공모전", "25.06 공모전", "2025.05 공모전 당선작",
        "25.04 공모전", "25.03 공모전", "25.01 공모전", "24.12 공모전", "24.10 공모전", "24.09 공모전", "24.08 공모전",
        "욕망", "수치", "집착", "유혹", "오메가버스", "센티넬버스", "고어물", "톰보이", "펨보이", "오지콤", "통통한", "BBW",
        "하렘", "역하렘", "NTR", "하드코어", "보어물", "마이크로/매크로", "바디 인플레이션", "방귀", "실험체", "스캇", "발",
        "도미넌트", "마조히스트", "새디스트", "서브미시브", "서큐버스", "인큐버스", "후타나리", "벌레", "촉수"
    ];

    // 카드 안에서 "제작자명" 영역과 "본문(제목·소개)" 영역을 분리해서 텍스트를 추출.
    // 실제 카드 구조(2026-06 기준):
    //   제목   -> div.truncate.leading-tight.font-bold
    //   소개   -> div.text-dgray-400.truncate.text-xs
    //   제작자 -> span.text-official-creator (예: "@WH2TEPEACH")
    // 카드 목록 화면에는 태그 칩이 별도로 렌더링되지 않으므로, "본문"은 제목+소개로 한정한다.
    function splitCardText(card) {
        const titleEl = card.querySelector('.truncate.leading-tight.font-bold');
        const descEl = card.querySelector('.text-dgray-400.truncate.text-xs');
        const creatorEl = card.querySelector('.text-official-creator');

        const bodyText = [titleEl, descEl]
            .filter(Boolean)
            .map(el => el.textContent.trim())
            .join(' ')
            .toLowerCase();

        const creatorText = creatorEl ? creatorEl.textContent.trim().toLowerCase() : '';

        return { creator: creatorText, body: bodyText };
    }

    // 카드 하단(썸네일 이미지 영역)에 "어떤 필터에 의해 강조/차단되었는지" 보여주는 작은 뱃지를 부착.
    // 썸네일 컨테이너(.relative.aspect-[4/5])가 이미 position:relative이므로 그 안에 붙인다.
    function attachFilterBadge(card, type, matchedTerms) {
        let badge = card.querySelector('.cd-filter-badge');
        if (badge) badge.remove();
        if (!matchedTerms || matchedTerms.length === 0) return;

        const thumb = card.querySelector('.relative.aspect-\\[4\\/5\\]') || card.querySelector('[class*="aspect-"]') || card;

        badge = document.createElement('div');
        badge.className = 'cd-filter-badge ' + (type === 'highlight' ? 'cd-filter-badge-highlight' : type === 'blocked-tag' ? 'cd-filter-badge-blocked' : 'cd-filter-badge-creator');

        const label = type === 'highlight' ? '강조' : type === 'blocked-tag' ? '태그차단' : '제작자차단';
        badge.innerText = `${label}: ${matchedTerms.join(', ')}`;

        const computedPos = window.getComputedStyle(thumb).position;
        if (computedPos === 'static') {
            thumb.style.position = 'relative';
        }
        thumb.appendChild(badge);
    }
    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
        applyAll();
    }

    function saveMemos() {
        GM_setValue(MEMO_KEY, memos);
    }

    GM_addStyle(`
        /* 우측 중간에 고정되는 설정 토글 탭 (스케치 반영) */
        #cd-toggle-btn {
            position: fixed; top: 40%; right: 0; transform: translateY(-50%);
            background: #FFD700; color: #111; border: none;
            border-radius: 14px 0 0 14px; width: 44px; height: 75px;
            font-size: 24px; cursor: pointer; z-index: 999990;
            box-shadow: -3px 2px 15px rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease-in-out;
        }
        #cd-toggle-btn:hover { background: #ffe23d; transform: translateY(-50%) scaleX(1.1); }

        /* 뒷배경 블러 처리 */
        #cd-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.6); z-index: 999991;
            backdrop-filter: blur(4px);
        }

        /* 탭 구조가 결합된 프리미엄 우측 고정 슬라이드 패널 */
        #cd-panel-container {
            display: none; position: fixed; top: 0; right: 0; bottom: 0;
            width: 440px; max-width: 95vw; background: #111115; color: #eee;
            box-shadow: -10px 0 40px rgba(0,0,0,0.8); z-index: 999992;
            box-sizing: border-box; border-left: 1px solid #2a2a35;
            font-family: inherit;
            /* 사용자 창 투명도 변수 바인딩 */
            opacity: var(--cd-panel-opacity-val, 0.95);
            backdrop-filter: blur(12px);
            transition: opacity 0.2s ease;
        }
        
        /* 세로 배치형 탭 바 (좌측 영역) */
        #cd-tab-bar {
            width: 75px; background: #0b0b0e; border-right: 1px solid #22222b;
            height: 100%; float: left; display: flex; flex-direction: column;
            align-items: center; padding-top: 20px; gap: 15px; box-sizing: border-box;
        }
        .cd-tab-btn {
            width: 55px; height: 55px; border-radius: 12px; border: none;
            background: transparent; color: #888; font-size: 11px; font-weight: bold;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; gap: 4px; transition: all 0.2s ease;
        }
        .cd-tab-btn svg { width: 20px; height: 20px; stroke: currentColor; fill: none; }
        .cd-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .cd-tab-btn.active { color: #FFD700; background: rgba(255,215,0,0.08); }

        /* 설정 설정 및 메모 표시 영역 (우측 영역) */
        #cd-panel-body {
            margin-left: 75px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box;
        }
        .cd-tab-content {
            display: none; padding: 25px 20px; overflow-y: auto; flex-grow: 1; box-sizing: border-box;
        }
        .cd-tab-content.active { display: block; }

        /* 헤더 장식 */
        .cd-panel-header {
            font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 22px;
            border-left: 4px solid #FFD700; padding-left: 12px; line-height: 1.2;
        }
        .cd-section-title {
            font-size: 13px; color: #FFD700; font-weight: bold; margin: 24px 0 12px 0;
            border-bottom: 1px solid #22222b; padding-bottom: 8px;
        }

        /* 폼 요소 디자인 정교화 (조금 더 밝게 수정하여 가시성 확보) */
        .cd-row { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
        .cd-row input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #FFD700; }
        .cd-row label { cursor: pointer; font-size: 13.5px; color: #ddd; font-weight: 500; }
        
        .cd-field { margin-bottom: 20px; }
        .cd-field label { display: block; font-size: 13px; color: #ccc; margin-bottom: 8px; font-weight: bold; }
        .cd-field input[type="text"], .cd-field textarea {
            width: 100%; box-sizing: border-box; padding: 11px 14px;
            background: #1e1e24; color: #fff; border: 1px solid #4a4a5a; border-radius: 8px;
            font-size: 13px; outline: none; transition: all 0.2s;
        }
        .cd-field input[type="text"]:focus, .cd-field textarea:focus { border-color: #FFD700; box-shadow: 0 0 8px rgba(255, 215, 0, 0.25); }
        .cd-help { font-size: 11px; color: #999; margin-top: 6px; display: block; line-height: 1.5; }

        /* 투명도 조절 인터페이스 */
        .cd-opacity-box {
            background: #16161c; border: 1px solid #2d2d3a; border-radius: 10px;
            padding: 15px; margin-top: 15px;
        }
        .cd-slider-container { display: flex; align-items: center; gap: 15px; margin-top: 10px; }
        .cd-slider-container input[type="range"] {
            flex-grow: 1; accent-color: #FFD700; height: 6px; border-radius: 5px; cursor: pointer;
        }
        .cd-opacity-val { font-family: monospace; font-weight: bold; color: #FFD700; min-width: 35px; text-align: right; }

        /* 실시간 통계 디자인 */
        #cd-preview-box {
            background: #16161c; border: 1px solid #2d2d3a; border-radius: 10px;
            padding: 15px; font-size: 12.5px; line-height: 1.9; margin-top: 20px;
        }
        #cd-preview-box b { color: #FFD700; }

        /* 패널 내부 액션 버튼 */
        #cd-panel-actions {
            padding: 15px 20px; background: #0e0e11; border-top: 1px solid #22222b;
            display: flex; gap: 12px; flex-shrink: 0;
        }
        .cd-btn { flex: 1; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13.5px; transition: all 0.2s; }
        .cd-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .cd-btn-save { background: #FFD700; color: #111; }
        .cd-btn-close { background: #282835; color: #eee; }

        /* =========================================================
           메모 매니저 관련 스타일 (스케치 반영)
           ========================================================= */
        .cd-memo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .cd-memo-add-btn {
            background: #233446; color: #62a3ff; border: 1px dashed #3c5d80;
            border-radius: 8px; padding: 10px; width: 75%; font-weight: bold; cursor: pointer;
            text-align: center; font-size: 12.5px; transition: all 0.2s;
        }
        .cd-memo-add-btn:hover { background: #2b4561; color: #87baff; }
        .cd-memo-reset-btn {
            background: #462326; color: #ff6262; border: 1px solid #6e3538;
            border-radius: 8px; padding: 10px; width: 20%; font-weight: bold; cursor: pointer;
            text-align: center; font-size: 12.5px; transition: all 0.2s;
        }
        .cd-memo-reset-btn:hover { background: #612c30; }

        .cd-memo-card {
            background: #17171c; border: 1px solid #2d2d3a; border-radius: 10px;
            padding: 15px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px;
        }
        .cd-memo-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .cd-memo-title { font-weight: bold; font-size: 13.5px; color: #fff; }
        .cd-memo-date { font-size: 11px; color: #666; margin-top: 3px; }
        .cd-memo-actions-trigger { cursor: pointer; color: #777; padding: 2px 6px; border-radius: 4px; }
        .cd-memo-actions-trigger:hover { background: #2d2d3a; color: #fff; }
        
        .cd-memo-body { font-size: 12px; color: #aaa; line-height: 1.55; white-space: pre-wrap; word-break: break-all; }
        .cd-memo-btn-row { display: flex; gap: 8px; margin-top: 5px; }
        .cd-memo-action-btn {
            flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
            background: #25252d; color: #ddd; border: 1px solid #3c3c4a; border-radius: 6px;
            padding: 8px; font-size: 12px; font-weight: bold; cursor: pointer; transition: all 0.2s;
        }
        .cd-memo-action-btn:hover { background: #32323c; color: #fff; }
        .cd-memo-action-btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; }

        /* 메모 추가 인라인 다이얼로그 */
        #cd-memo-editor {
            display: none; background: #1c1c24; border: 1px solid #3d3d4e; border-radius: 10px;
            padding: 15px; margin-bottom: 20px; flex-direction: column; gap: 12px;
        }

        /* =========================================================
           강조 & 모자이크 관련 핵심 CSS
           ========================================================= */
        /* 선호 태그 매칭 카드 */
        .cd-highlight-card {
            background: rgba(255, 215, 0, 0.08) !important;
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

        /* 차단 태그 매칭 카드 (투명도는 변수로 조작) */
        .cd-tag-masked-card {
            opacity: var(--cd-blocked-opacity, 0.5) !important;
            background: rgba(15, 15, 20, 0.75) !important;
            box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.9) !important;
            border-radius: 14px !important;
            pointer-events: auto !important;
            transition: all 0.35s ease !important;
        }
        
        /* 마스킹 카드 안의 이미지 블러화 */
        .cd-tag-masked-card img {
            filter: blur(16px) grayscale(50%) !important;
            transition: filter 0.3s ease !important;
        }

        /* 제작자 차단: 카드 자체를 완전히 비표시 (계정명까지 전부 안 보이게) */
        .cd-creator-blocked-card {
            display: none !important;
        }

        /* 텍스트 번짐(Glow) 효과 - 원본 글자를 완전히 유령화하고 그림자만 남김 */
        .cd-tag-masked-card .cd-blur-target {
            color: transparent !important;
            text-shadow: 0 0 10px rgba(230, 230, 235, 0.95) !important;
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

        /* 필터 매칭 시각화 뱃지 (카드 좌하단에 부착) */
        .cd-filter-badge {
            position: absolute !important; left: 6px; bottom: 6px; z-index: 5;
            font-size: 10px !important; font-weight: bold !important; padding: 3px 8px !important;
            border-radius: 6px !important; line-height: 1.4 !important;
            max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            pointer-events: none !important; box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
        }
        .cd-filter-badge-highlight { background: rgba(255, 215, 0, 0.92) !important; color: #111 !important; }
        .cd-filter-badge-blocked { background: rgba(79, 172, 254, 0.92) !important; color: #0a1a2a !important; }
        .cd-filter-badge-creator { background: rgba(255, 70, 70, 0.92) !important; color: #fff !important; }

        /* =========================================================
           채팅방 하단 인젝션 전용 스타일
           ========================================================= */
        .cd-chat-widget-btn {
            background: rgba(255, 255, 255, 0.08) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            color: #eee !important;
            font-size: 11px !important;
            font-weight: bold !important;
            padding: 5px 10px !important;
            border-radius: 20px !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            cursor: pointer !important;
            transition: all 0.2s !important;
            height: 28px !important;
        }
        .cd-chat-widget-btn:hover {
            background: rgba(255, 255, 255, 0.18) !important;
            border-color: #FFD700 !important;
            color: #FFD700 !important;
        }

        /* =========================================================
           "첫대화로 가기" 플로팅 버튼 (크랙 플랫폼 스타일 참고)
           화면 우측 하단에 절대좌표로 고정, 입력창과 분리된 독립 버튼
           ========================================================= */
        .cd-floating-scroll-wrap {
            position: fixed !important;
            bottom: 145px;
            right: max(20px, 50% - 428px);
            z-index: 99980;
            display: flex; flex-direction: column; gap: 10px;
            pointer-events: none;
        }
        .cd-floating-scroll-btn {
            pointer-events: auto;
            width: 38px; height: 38px; border-radius: 50%;
            background: rgba(30, 30, 36, 0.9); border: 1px solid rgba(255,255,255,0.15);
            color: #ddd; display: flex; align-items: center; justify-content: center;
            cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            transition: all 0.2s ease;
        }
        .cd-floating-scroll-btn:hover {
            background: rgba(255, 215, 0, 0.15); border-color: #FFD700; color: #FFD700;
            transform: translateY(-2px);
        }
    `);

    /* =========================================================
       3. UI 및 탭 기능 설계
       ========================================================= */
    function createUI() {
        const overlay = document.createElement('div');
        overlay.id = 'cd-overlay';
        document.body.appendChild(overlay);

        const btn = document.createElement('button');
        btn.id = 'cd-toggle-btn';
        btn.innerHTML = `🛠`;
        btn.title = '케이브덕 매니저 열기';
        document.body.appendChild(btn);

        // 패널 본체 생성
        const panelContainer = document.createElement('div');
        panelContainer.id = 'cd-panel-container';
        
        panelContainer.innerHTML = `
            <!-- 세로형 탭 인터페이스 (좌측 배치) -->
            <div id="cd-tab-bar">
                <button class="cd-tab-btn active" data-tab="main">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    메인
                </button>
                <button class="cd-tab-btn" data-tab="memo">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    메모
                </button>
                <button class="cd-tab-btn" data-tab="chatroom">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    채팅방
                </button>
                <button class="cd-tab-btn" data-tab="myinfo">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    내정보
                </button>
            </div>

            <!-- 영역별 컨텐츠 (우측 배치) -->
            <div id="cd-panel-body">
                
                <!-- 1. 메인 탭 -->
                <div id="cd-tab-main" class="cd-tab-content active">
                    <div class="cd-panel-header">레이아웃 및 태그 필터</div>
                    
                    <div class="cd-row">
                        <input type="checkbox" id="cd-hideBanner" ${config.hideBanner ? 'checked' : ''}>
                        <label for="cd-hideBanner">메인 상단 대형 배너 숨기기</label>
                    </div>

                    <div class="cd-section-title">선호 태그 강조</div>
                    <div class="cd-field">
                        <label>강조할 선호 태그/단어 (콤마로 구분)</label>
                        <input type="text" id="cd-preferTags" value="${config.preferTags}" placeholder="예: 순애, 집착, 오리지널 캐릭터">
                        <span class="cd-help">챗봇의 <b>제목과 소개란</b>에서 매칭되면 <b>부드러운 노란색 배경 강조와 글로우 효과</b>로 정갈하게 표시됩니다 (제작자명은 검사하지 않음).</span>
                    </div>

                    <div class="cd-section-title">보기 싫은 태그 블라인드</div>
                    <div class="cd-field">
                        <label>블라인드 처리할 태그/단어 (콤마로 구분)</label>
                        <input type="text" id="cd-blockedTags" value="${config.blockedTags}" placeholder="예: 공포, 고어, BL, NTR">
                        <span class="cd-help">챗봇의 <b>제목과 소개란</b>에서만 검사합니다 (제작자명은 검사하지 않음). 매칭되면 카드가 사라지지 않고 반투명도 설정에 따라 형태만 연하게 보이고 글씨는 흐려집니다.</span>
                    </div>

                    <div class="cd-section-title">제작자 차단</div>
                    <div class="cd-field">
                        <label>차단할 제작자명/슬러그 (콤마로 구분)</label>
                        <input type="text" id="cd-blockedCreators" value="${config.blockedCreators}" placeholder="예: dokta, @특정닉네임">
                        <span class="cd-help">제작자 닉네임/슬러그가 매칭되면 해당 제작자의 카드가 <b>계정명까지 완전히 안 보이게</b> 사라집니다.</span>
                    </div>

                    <!-- 투명도 제어 슬라이더 (메인 탭 하단 탑재) -->
                    <div class="cd-opacity-box">
                        <label style="font-weight: bold; font-size: 12.5px; color:#ddd;">블라인드 카드 반투명도 조절</label>
                        <div class="cd-slider-container">
                            <span style="font-size:11px; color:#777;">안보이게</span>
                            <input type="range" id="cd-blockedOpacity" min="5" max="100" value="${config.blockedOpacity}">
                            <span style="font-size:11px; color:#777;">잘보이게</span>
                            <span class="cd-opacity-val" id="cd-opacity-val-text">${config.blockedOpacity}%</span>
                        </div>
                    </div>

                    <!-- 커스텀 매니저 전체 창 투명도 제어 슬라이더 -->
                    <div class="cd-opacity-box" style="margin-top: 15px;">
                        <label style="font-weight: bold; font-size: 12.5px; color:#ddd;">매니저 창 투명도 조절</label>
                        <div class="cd-slider-container">
                            <span style="font-size:11px; color:#777;">투명하게</span>
                            <input type="range" id="cd-panelOpacity" min="30" max="100" value="${config.panelOpacity}">
                            <span style="font-size:11px; color:#777;">불투명</span>
                            <span class="cd-opacity-val" id="cd-panel-opacity-text">${config.panelOpacity}%</span>
                        </div>
                    </div>

                    <div id="cd-preview-box">설정을 불러오는 중...</div>
                </div>

                <!-- 2. 메모 탭 -->
                <div id="cd-tab-memo" class="cd-tab-content">
                    <div class="cd-panel-header">자주 사용하는 문구 관리</div>
                    
                    <div class="cd-memo-header">
                        <button class="cd-memo-add-btn" id="cd-memo-show-creator">+ 새 메모 추가</button>
                        <button class="cd-memo-reset-btn" id="cd-memo-clear-all">초기화</button>
                    </div>

                    <!-- 인라인 메모 추가 폼 -->
                    <div id="cd-memo-editor">
                        <div class="cd-field">
                            <label>제목 *</label>
                            <input type="text" id="cd-editor-title" placeholder="메모 제목을 입력하세요">
                        </div>
                        <div class="cd-field">
                            <label>내용 *</label>
                            <textarea id="cd-editor-content" placeholder="메모 내용을 입력하세요. 예시) OOC: ..."></textarea>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="cd-btn cd-btn-close" style="padding:7px;" id="cd-editor-cancel">취소</button>
                            <button class="cd-btn cd-btn-save" style="padding:7px;" id="cd-editor-submit">메모 생성</button>
                        </div>
                    </div>

                    <!-- 저장된 메모 리스트 렌더링 컨테이너 -->
                    <div id="cd-memos-container"></div>
                </div>

                <!-- 3. 채팅방 탭 -->
                <div id="cd-tab-chatroom" class="cd-tab-content">
                    <div class="cd-panel-header">채팅방 도구 및 유틸리티</div>

                    <div class="cd-row">
                        <input type="checkbox" id="cd-showWingBadge" ${config.showWingBadge ? 'checked' : ''}>
                        <label for="cd-showWingBadge">채팅창에 보유 윙 잔액 표기하기</label>
                    </div>

                    <div style="font-size:13px; color:#aaa; line-height:1.65;">
                        <p><b>💬 채팅 유틸리티 버튼은 어디에 있나요?</b></p>
                        <p>채팅방 하단의 '사진 추가' 버튼 옆을 확인해 주세요. 위 체크박스를 켜두면 <b>'내 보유 윙'</b> 뱃지가 함께 표시됩니다.</p>
                        <p><b>🔄 첫대화로 가기 기능:</b></p>
                        <p>화면 우측 하단에 작게 떠 있는 동그란 버튼을 누르면, 대화를 삭제하지 않고 스크롤만 맨 위의 최초 대화 시작 지점으로 부드럽게 올려줍니다.</p>
                    </div>
                </div>

                <!-- 4. 내정보 탭 -->
                <div id="cd-tab-myinfo" class="cd-tab-content">
                    <div class="cd-panel-header">정보 및 백그라운드 유틸리티</div>
                    <div class="cd-stats" style="margin-bottom:15px; font-size:12.5px;">
                        자동 출석 관리 시스템:<br>
                        - 출석 상태: <b id="cd-attendance-status" style="color:#FFD700;">비활성</b><br>
                        - 마지막 출석체크: <span id="cd-attendance-last">기록 없음</span>
                    </div>
                    <div style="font-size:12px; color:#aaa; line-height:1.6;">
                        <p><b>👻 무방해 백그라운드 출석 모드:</b></p>
                        <p>사용자의 웹서핑을 방해하지 않고 매일 오전 9시 기준 1회 자동으로 혜택 출석을 수행합니다.</p>
                        <p>만약 로그인이 풀려있다면 화면 앞으로 가져와 알려줍니다.</p>
                    </div>
                </div>

                <!-- 고정 하단 액션바 -->
                <div id="cd-panel-actions">
                    <button class="cd-btn cd-btn-close" id="cd-btn-close">닫기</button>
                    <button class="cd-btn cd-btn-save" id="cd-btn-save">설정 저장</button>
                </div>
            </div>
        `;
        document.body.appendChild(panelContainer);

        // 오버레이 및 패널 가시성 제어
        function toggle(show) {
            panelContainer.style.display = show ? 'block' : 'none';
            overlay.style.display = show ? 'block' : 'none';
            if (show) {
                renderMemos();
                applyAll();
            }
        }

        btn.addEventListener('click', () => toggle(true));
        overlay.addEventListener('click', () => toggle(false));
        panelContainer.querySelector('#cd-btn-close').addEventListener('click', () => toggle(false));

        const tabButtons = panelContainer.querySelectorAll('.cd-tab-btn');
        const tabContents = panelContainer.querySelectorAll('.cd-tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                button.classList.add('active');
                document.getElementById(`cd-tab-${targetTab}`).classList.add('active');
            });
        });

        // 반투명 슬라이더 제어
        const slider = document.getElementById('cd-blockedOpacity');
        const opacityText = document.getElementById('cd-opacity-val-text');
        
        slider.addEventListener('input', (e) => {
            const val = e.target.value;
            opacityText.innerText = `${val}%`;
            config.blockedOpacity = parseInt(val);
            document.documentElement.style.setProperty('--cd-blocked-opacity', (val / 100).toString());
            applyAll();
        });

        // 매니저 전체 창 투명도 슬라이더 제어
        const panelSlider = document.getElementById('cd-panelOpacity');
        const panelOpacityText = document.getElementById('cd-panel-opacity-text');

        panelSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            panelOpacityText.innerText = `${val}%`;
            config.panelOpacity = parseInt(val);
            document.documentElement.style.setProperty('--cd-panel-opacity-val', (val / 100).toString());
        });

        function readDraft() {
            return {
                hideBanner: panelContainer.querySelector('#cd-hideBanner').checked,
                preferTags: panelContainer.querySelector('#cd-preferTags').value,
                blockedTags: panelContainer.querySelector('#cd-blockedTags').value,
                blockedCreators: panelContainer.querySelector('#cd-blockedCreators').value,
                blockedOpacity: parseInt(slider.value),
                panelOpacity: parseInt(panelSlider.value),
                showWingBadge: panelContainer.querySelector('#cd-showWingBadge').checked
            };
        }

        panelContainer.querySelector('#cd-btn-save').addEventListener('click', () => {
            saveConfig(readDraft());
            toggle(false);
        });

        // 실시간 입력 연동
        panelContainer.querySelector('#cd-hideBanner').addEventListener('change', () => {
            config.hideBanner = panelContainer.querySelector('#cd-hideBanner').checked;
            applyAll();
        });
        panelContainer.querySelector('#cd-preferTags').addEventListener('input', () => {
            config.preferTags = panelContainer.querySelector('#cd-preferTags').value;
            applyAll();
        });
        panelContainer.querySelector('#cd-blockedTags').addEventListener('input', () => {
            config.blockedTags = panelContainer.querySelector('#cd-blockedTags').value;
            applyAll();
        });
        panelContainer.querySelector('#cd-blockedCreators').addEventListener('input', () => {
            config.blockedCreators = panelContainer.querySelector('#cd-blockedCreators').value;
            applyAll();
        });
        panelContainer.querySelector('#cd-showWingBadge').addEventListener('change', () => {
            config.showWingBadge = panelContainer.querySelector('#cd-showWingBadge').checked;
            const wingBadge = document.querySelector('.cd-chat-utility-container .cd-wing-badge');
            if (wingBadge) wingBadge.style.display = config.showWingBadge ? 'inline-flex' : 'none';
        });

        const memoForm = document.getElementById('cd-memo-editor');
        const showFormBtn = document.getElementById('cd-memo-show-creator');
        const cancelFormBtn = document.getElementById('cd-editor-cancel');
        const submitFormBtn = document.getElementById('cd-editor-submit');

        showFormBtn.addEventListener('click', () => {
            memoForm.style.display = 'flex';
        });

        cancelFormBtn.addEventListener('click', () => {
            memoForm.style.display = 'none';
            document.getElementById('cd-editor-title').value = '';
            document.getElementById('cd-editor-content').value = '';
        });

        submitFormBtn.addEventListener('click', () => {
            const titleVal = document.getElementById('cd-editor-title').value.trim();
            const contentVal = document.getElementById('cd-editor-content').value.trim();

            if (!titleVal || !contentVal) {
                return;
            }

            const now = new Date();
            const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours() >= 12 ? '오후' : '오전'} ${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;

            const newMemo = {
                id: 'memo-' + Date.now(),
                title: titleVal,
                content: contentVal,
                date: dateStr
            };

            memos.unshift(newMemo);
            saveMemos();
            renderMemos();

            // 입력 필드 초기화
            memoForm.style.display = 'none';
            document.getElementById('cd-editor-title').value = '';
            document.getElementById('cd-editor-content').value = '';
        });

        // 메모 초기화
        document.getElementById('cd-memo-clear-all').addEventListener('click', () => {
            memos = [];
            saveMemos();
            renderMemos();
        });

        // 초기 Opacity CSS 변수 매핑
        document.documentElement.style.setProperty('--cd-blocked-opacity', (config.blockedOpacity / 100).toString());
        document.documentElement.style.setProperty('--cd-panel-opacity-val', (config.panelOpacity / 100).toString());
    }

    function renderMemos() {
        const container = document.getElementById('cd-memos-container');
        if (!container) return;

        if (memos.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#666;">저장된 메모가 없습니다.<br>새로운 문구를 등록해 보세요!</div>`;
            return;
        }

        container.innerHTML = '';
        memos.forEach(memo => {
            const card = document.createElement('div');
            card.className = 'cd-memo-card';
            card.innerHTML = `
                <div class="cd-memo-card-top">
                    <div>
                        <div class="cd-memo-title">${escapeHtml(memo.title)}</div>
                        <div class="cd-memo-date">${memo.date}</div>
                    </div>
                    <div class="cd-memo-actions-trigger" data-id="${memo.id}">🗑️</div>
                </div>
                <div class="cd-memo-body">${escapeHtml(memo.content)}</div>
                <div class="cd-memo-btn-row">
                    <button class="cd-memo-action-btn inject-chat" data-id="${memo.id}">
                        <svg viewBox="0 0 24 24" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        입력창
                    </button>
                    <button class="cd-memo-action-btn copy-raw" data-id="${memo.id}">
                        <svg viewBox="0 0 24 24" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2 2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        복사
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        // 메모 제거 연결
        container.querySelectorAll('.cd-memo-actions-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-id');
                memos = memos.filter(m => m.id !== id);
                saveMemos();
                renderMemos();
            });
        });

        // 입력창 주입 액션
        container.querySelectorAll('.inject-chat').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const memo = memos.find(m => m.id === id);
                if (memo) {
                    const chatInput = document.querySelector('textarea[name="userInput"]');
                    if (chatInput) {
                        injectTextIntoReactInput(chatInput, memo.content);
                        showFeedbackMessage('채팅창 입력칸에 문구를 주입했습니다!');
                    } else {
                        fallbackCopy(memo.content, '채팅방 입력창을 찾지 못해 클립보드에 복사했습니다!');
                    }
                }
            });
        });

        // 복사 액션
        container.querySelectorAll('.copy-raw').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const memo = memos.find(m => m.id === id);
                if (memo) {
                    fallbackCopy(memo.content, '클립보드에 복사되었습니다!');
                }
            });
        });
    }

    // React로 제어되는 textarea/input은 value를 직접 대입해도 내부 상태가 갱신되지 않고
    // 다시 빈 값으로 되돌아간다. React는 자체 value setter를 오버라이드해두기 때문에,
    // 네이티브 prototype의 setter를 직접 호출해 우회한 뒤 InputEvent를 발생시켜야 React가 이를 감지한다.
    function injectTextIntoReactInput(el, text) {
        const isTextarea = el.tagName === 'TEXTAREA';
        const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;

        el.focus();
        nativeSetter.call(el, text);

        // React 16+는 'input' 이벤트를 리스닝하므로 InputEvent로 발생시켜야 합성 이벤트 핸들러가 반응함
        const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text });
        el.dispatchEvent(inputEvent);

        // 일부 폼은 change 이벤트도 함께 보고 있어 안전하게 같이 발생
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // 커서를 맨 끝으로 이동
        try {
            el.setSelectionRange(text.length, text.length);
        } catch (e) {
            // selection 미지원 입력 타입일 경우 무시
        }
    }

    // fallback 복사기 (Sandboxed Iframe 환경 안전성 최적화)
    function fallbackCopy(text, successMsg) {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        try {
            document.execCommand('copy');
            showFeedbackMessage(successMsg);
        } catch (err) {
            console.error('클립보드 복사 실패', err);
        }
        document.body.removeChild(el);
    }

    function showFeedbackMessage(msg) {
        const exist = document.getElementById('cd-feedback-toast');
        if (exist) exist.remove();

        const toast = document.createElement('div');
        toast.id = 'cd-feedback-toast';
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: #FFD700; color: #111; padding: 12px 24px; border-radius: 20px;
            font-size: 13px; font-weight: bold; z-index: 10000000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none;
            transition: opacity 0.3s; opacity: 1;
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2200);
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function updatePreview(stats) {
        const box = document.getElementById('cd-preview-box');
        if (!box) return;
        box.innerHTML = `
            현재 페이지 캐릭터 카드: <b>${stats.total}</b>개<br>
            태그 필터 반투명 블라인드: <b style="color:#4facfe">${stats.masked}</b>개<br>
            선호 태그 매칭: <b style="color:#FFD700">${stats.highlight}</b>개<br>
            제작자 차단으로 숨김: <b style="color:#ff4646">${stats.creatorBlocked || 0}</b>개
        `;
    }

    function checkAttendance() {
        const statusEl = document.getElementById('cd-attendance-status');
        const lastEl = document.getElementById('cd-attendance-last');
        
        // 현재 로컬 시간(KST 변환 용도) 확인
        const now = new Date();
        const offsetKST = 9 * 60; // KST는 UTC+9
        const kstTime = new Date(now.getTime() + (now.getTimezoneOffset() + offsetKST) * 60000);
        
        const kstHour = kstTime.getHours();
        let kstDateStr = kstTime.toISOString().split('T')[0];
        
        // 오전 9시 전이면 이전 날짜 출석체크 범주에 할당
        if (kstHour < 9) {
            const prevDay = new Date(kstTime.getTime() - 24 * 60 * 60 * 1000);
            kstDateStr = prevDay.toISOString().split('T')[0];
        }

        const lastAttendanceDay = GM_getValue('cd_last_attendance_day', '');

        if (statusEl && lastEl) {
            lastEl.innerText = lastAttendanceDay || '기록 없음';
            statusEl.innerText = (lastAttendanceDay === kstDateStr) ? '오늘 출석 완료됨' : '출석 대기중 (자동 진행)';
            statusEl.style.color = (lastAttendanceDay === kstDateStr) ? '#4facfe' : '#FFD700';
        }

        // 오늘 이미 출석했다면 중단
        if (lastAttendanceDay === kstDateStr) return;

        console.log('[케이브덕 매니저] 백그라운드 자동 출석을 감지 및 시작합니다.');

        // 비활성 iframe 방식의 무방해 출석 진행
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed; width:1px; height:1px; top:-10px; left:-10px; opacity:0; pointer-events:none; z-index:-9999;';
        iframe.src = 'https://caveduck.io/ko/earn';
        document.body.appendChild(iframe);

        let checkAttempts = 0;
        const checkInterval = setInterval(() => {
            checkAttempts++;
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc) return;

                // 로그인 만료 체크용 검사
                const isLoggedOut = iframeDoc.body.textContent.includes('로그인') && !iframeDoc.body.textContent.includes('로그아웃');
                if (isLoggedOut && checkAttempts === 5) {
                    clearInterval(checkInterval);
                    iframe.style.cssText = 'position:fixed; inset:50px; width:calc(100% - 100px); height:calc(100% - 100px); background:#000; z-index:999999; border:5px solid #FFD700;';
                    showFeedbackMessage('⚠️ 로그인이 풀려있어 자동 출석을 못했습니다! 로그인해 주세요.');
                    return;
                }

                // "출석하고 깃털 받기" 또는 "받기" 버튼을 직접 돔 스캔
                const buttons = Array.from(iframeDoc.querySelectorAll('button, span, div, a'));
                const checkInBtn = buttons.find(btn => {
                    const txt = btn.textContent.trim();
                    return txt.includes('출석하고') || txt.includes('출석체크') || txt === '받기';
                });

                if (checkInBtn) {
                    checkInBtn.click();
                    clearInterval(checkInterval);
                    GM_setValue('cd_last_attendance_day', kstDateStr);
                    showFeedbackMessage('🎉 오늘의 출석체크가 안전하게 완료되었습니다! (+깃털 수령)');
                    setTimeout(() => iframe.remove(), 2000);
                }
            } catch (e) {
                // 크로스오리진 에러가 가끔 날 수 있음 (재로딩 시 복구 유도)
            }

            if (checkAttempts > 25) { // 25회 시도(약 12.5초) 후 실패 시 파기
                clearInterval(checkInterval);
                iframe.remove();
            }
        }, 500);
    }

    function injectChatroomUtility() {
        injectWingAndScrollWidgets();
        injectFloatingScrollTopButton();
    }

    function injectWingAndScrollWidgets() {
        // 채팅 입력창(textarea[name="userInput"])을 기준으로 form 내부의 좌측 버튼 그룹을 탐색.
        // "사진 추가"는 <button>이 아니라 <div>(file input을 감싼 래퍼)이므로 div 기준으로 찾아야 함.
        const chatInput = document.querySelector('textarea[name="userInput"]');
        if (!chatInput) return;

        const form = chatInput.closest('form');
        if (!form) return;

        // order-first 클래스가 붙은, 모델 선택/메모리/사진추가 버튼들이 모여있는 좌측 그룹
        const accessoryBar = form.querySelector('.order-first');
        if (!accessoryBar) return;

        // 중복 추가 처리 방지용 가드
        if (accessoryBar.querySelector('.cd-chat-utility-container')) return;

        // 윙 뱃지 래퍼 생성
        const wrapper = document.createElement('div');
        wrapper.className = 'cd-chat-utility-container';
        wrapper.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;';

        // 남은 윙 잔액 표시하기 (실제 상점 등에서 긁어서 동기화) - 표시 여부는 설정으로 토글
        let cachedWings = GM_getValue('cd_cached_wings', '조회필요');
        const wingBadge = document.createElement('button');
        wingBadge.type = 'button';
        wingBadge.className = 'cd-chat-widget-btn cd-wing-badge';
        wingBadge.innerHTML = `💸 <span id="cd-chat-wings">${cachedWings}</span> 윙`;
        wingBadge.title = '포인트 상점/혜택 페이지 방문 시 실시간 동기화됩니다.';
        wingBadge.style.display = config.showWingBadge ? 'inline-flex' : 'none';

        wingBadge.addEventListener('click', () => {
            window.open('https://caveduck.io/ko/earn', '_blank');
        });

        wrapper.appendChild(wingBadge);

        // "사진 추가" div 바로 뒤에 윙 뱃지를 삽입. 못 찾으면 액세서리 바 맨 끝에 추가.
        const photoBtn = Array.from(accessoryBar.children).find(el => el.textContent.includes('사진'));
        if (photoBtn) {
            photoBtn.parentNode.insertBefore(wrapper, photoBtn.nextSibling);
        } else {
            accessoryBar.appendChild(wrapper);
        }
    }

    // "첫대화로 가기"를 크랙 플랫폼 스타일처럼 화면 우측 하단에 절대좌표로 고정된
    // 독립 플로팅 버튼으로 배치. 케이브덕 자체 UI에도 위/아래 스크롤 버튼이
    // (.absolute.-top-28.right-4 영역) 있지만, 요청에 따라 별도 버튼을 추가로 띄운다.
    function injectFloatingScrollTopButton() {
        const scrollContainer = document.querySelector('div[class*="flex-col-reverse"][class*="overflow-y-auto"]');
        if (!scrollContainer) {
            // 채팅방이 아니면 기존에 떠있던 버튼은 제거
            const existing = document.getElementById('cd-floating-scroll-top');
            if (existing) existing.remove();
            return;
        }

        if (document.getElementById('cd-floating-scroll-top')) return; // 이미 존재

        const floatWrap = document.createElement('div');
        floatWrap.id = 'cd-floating-scroll-top';
        floatWrap.className = 'cd-floating-scroll-wrap';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'cd-floating-scroll-btn';
        resetBtn.title = '대화를 지우지 않고 가장 위에 있는 최초의 대화 시작 지점으로 부드럽게 올려줍니다.';
        resetBtn.innerHTML = `
            <svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" width="18" height="18">
                <path d="M12 19V5"></path>
                <path d="M5 12l7-7 7 7"></path>
            </svg>
        `;

        resetBtn.addEventListener('click', () => {
            scrollToFirstMessage();
        });

        floatWrap.appendChild(resetBtn);
        document.body.appendChild(floatWrap);
    }

    // 스크롤 컨테이너 안의 .flex.flex-col.p-4 안에는 "이 대화는 AI로..." 안내 <p>가
    // 먼저 나오고, 그 다음 첫 메시지가 <div id="chat-message-...">로 나온다.
    // 따라서 단순 :first-child가 아니라 "안내문 다음에 나오는 첫 번째 chat-message div"를 찾아야 한다.
    function scrollToFirstMessage() {
        const container = document.querySelector('div[class*="flex-col-reverse"][class*="overflow-y-auto"]');
        if (!container) {
            showFeedbackMessage('채팅창 영역을 탐지하지 못했습니다.');
            return;
        }

        const messageList = container.querySelector(':scope > div.flex.flex-col.p-4') || container.querySelector('.flex.flex-col.p-4');
        const firstMsg = messageList
            ? Array.from(messageList.children).find(el => el.id && el.id.startsWith('chat-message-'))
            : null;

        if (firstMsg) {
            firstMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showFeedbackMessage('가장 첫 대화 위치로 스크롤을 이동했습니다!');
        } else {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            showFeedbackMessage('첫 메시지를 찾지 못해 맨 위로 이동했습니다.');
        }
    }

    // 윙 포인트 수집을 위한 전역 스크래핑 센서
    function scrapeUserWings() {
        // 우리가 직접 만든 윙 뱃지(.cd-wing-badge)의 텍스트는 스크래핑 대상에서 제외해야
        // "자기 표시값을 다시 읽어들이는" 자기참조 루프를 막을 수 있음
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('.cd-wing-badge, #cd-panel-container').forEach(el => el.remove());
        const bodyText = clone.textContent;

        // 헤더 혹은 포인트 정보 텍스트 상에서 "보유 윙" 이나 "숫자 윙" 형태를 수집
        const wingMatch = bodyText.match(/보유 윙\s*([\d,]+)/) || bodyText.match(/([\d,]+)\s*윙/);
        if (wingMatch) {
            const val = wingMatch[1].replace(/,/g, '');
            const prev = GM_getValue('cd_cached_wings', null);
            if (prev !== val) {
                GM_setValue('cd_cached_wings', val);
            }
            // 화면에 이미 떠있는 윙 뱃지 텍스트를 실시간으로 갱신
            const wingTextEl = document.getElementById('cd-chat-wings');
            if (wingTextEl) {
                wingTextEl.textContent = val;
            }
        }
    }

    function applyAll() {
        const prefTagsList = config.preferTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockCreatorsList = config.blockedCreators.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        stats = { total: 0, masked: 0, highlight: 0, creatorBlocked: 0 };

        // 5-1. 배너 노출 제어 (글씨 및 레이아웃 통째로 영구 삭제)
        const banners = document.querySelectorAll('.swiper-container, [class*="banner" i], [class*="swiper" i]');
        banners.forEach(b => {
            if (b.closest('#cd-panel, #cd-toggle-btn')) return;
            b.style.setProperty('display', config.hideBanner ? 'none' : '', 'important');
        });

        // 5-2. 개별 캐릭터 카드 분석
        const cards = document.querySelectorAll('a[href*="/character/"], a[href*="/characters/"]');

        cards.forEach(card => {
            if (card.closest('#cd-panel, #cd-toggle-btn')) return;

            stats.total++;

            // 상태 초기화
            card.style.display = '';
            card.classList.remove('cd-highlight-card', 'cd-tag-masked-card', 'cd-creator-blocked-card');
            card.querySelectorAll('.cd-blur-target').forEach(el => el.classList.remove('cd-blur-target'));
            const oldBadge = card.querySelector('.cd-filter-badge');
            if (oldBadge) oldBadge.remove();

            const { creator: creatorText, body: bodyText } = splitCardText(card);

            // (A) 제작자 차단 - 계정명/슬러그 매칭 시 카드 전체를 완전히 숨김 (가장 우선순위 높음)
            if (blockCreatorsList.length > 0) {
                const matchedCreators = blockCreatorsList.filter(name => creatorText.includes(name));
                if (matchedCreators.length > 0) {
                    card.classList.add('cd-creator-blocked-card');
                    stats.creatorBlocked++;
                    return; // 완전 숨김이므로 이후 처리 불필요
                }
            }

            // (B) 차단 태그 필터링 - 제목/태그/소개란(본문)에서만 검사, 제작자명은 검사하지 않음
            let isTagBlocked = false;
            let matchedBlockTags = [];
            if (blockTagsList.length > 0) {
                matchedBlockTags = blockTagsList.filter(tag => bodyText.includes(tag));
                isTagBlocked = matchedBlockTags.length > 0;
            }

            if (isTagBlocked) {
                card.classList.add('cd-tag-masked-card');

                // 블러 대상은 "본문(제목/소개)" 요소로만 한정. 제작자 표기 라인은 절대 건드리지 않음.
                const titleEl = card.querySelector('.truncate.leading-tight.font-bold');
                const descEl = card.querySelector('.text-dgray-400.truncate.text-xs');
                [titleEl, descEl].forEach(el => {
                    if (el) el.classList.add('cd-blur-target');
                });

                attachFilterBadge(card, 'blocked-tag', matchedBlockTags);
                stats.masked++;
                return; // 블라인드 대상 카드는 선호 강조 처리를 회피
            }

            // (C) 선호 태그 필터링 - 제목/태그/소개란(본문)에서만 검사
            let isPreferred = false;
            let matchedPrefTags = [];
            if (prefTagsList.length > 0) {
                matchedPrefTags = prefTagsList.filter(tag => bodyText.includes(tag));
                isPreferred = matchedPrefTags.length > 0;
            }

            if (isPreferred) {
                card.classList.add('cd-highlight-card');
                attachFilterBadge(card, 'highlight', matchedPrefTags);
                stats.highlight++;
            }
        });

        updatePreview(stats);
    }

    function startObserver() {
        let utilityTimeout = null;

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

            // 실시간 리더 센서 및 유틸리티 상시 인젝터 가동 (디바운스로 부하 억제)
            if (utilityTimeout) clearTimeout(utilityTimeout);
            utilityTimeout = setTimeout(() => {
                scrapeUserWings();
                injectChatroomUtility();
            }, 300);

            if (shouldUpdate) {
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(applyAll, 250); // 0.25초 부하 억제
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        createUI();
        setTimeout(() => {
            applyAll();
            checkAttendance();
            startObserver();
        }, 800);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();
