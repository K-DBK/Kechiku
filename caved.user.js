// ==UserScript==
// @name         케이브덕 커스텀 매니저
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  우측 고정 슬라이드 패널, 대형 배너 완전 제거, 프리미엄 노란색 글로우 선호 태그 강조, 보기 싫은 태그 반투명 번짐(글씨 차단) 블라인드, 채팅창 상단 인라인 유틸리티
// @match        *://caveduck.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG_KEY = 'caveduck_advanced_config_v12';
    const MEMO_KEY = 'caveduck_premium_manager_memos';

    const defaultConfig = {
        hideBanner: false,
        preferTags: '',       
        blockedTags: '',      
        panelOpacity: 95
    };

    const defaultMemos = [
        {
            id: 'preset-1',
            title: '대사 반복 금지 OOC',
            content: 'OOC: PC의 대사나 행동을 또 앵무새마냥 언급하지마세요. PC의 모든 행위는 PC를 연기하는 사용자가 직접 서술합니다. NPC가 PC의 행동과 감정을 멋대로 왜곡하고 과대해석하지 않습니다.',
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

    function saveConfig(patch) {
        config = { ...config, ...patch };
        GM_setValue(CONFIG_KEY, config);
        applyAll();
    }

    function saveMemos() {
        GM_setValue(MEMO_KEY, memos);
    }

    GM_addStyle(`
        /* 우측 중앙 고정 설정 버튼 */
        #cd-toggle-btn {
            position: fixed; top: 45%; right: 0; transform: translateY(-50%);
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
        #cd-panel-container {
            display: none; position: fixed; top: 0; right: 0; bottom: 0;
            width: 440px; max-width: 95vw; background: #111115; color: #eee;
            box-shadow: -10px 0 40px rgba(0,0,0,0.8); z-index: 999992;
            box-sizing: border-box; border-left: 1px solid #2a2a35;
            opacity: var(--cd-panel-opacity-val, 0.95);
            backdrop-filter: blur(12px);
            transition: opacity 0.2s ease;
        }
        
        /* 탭 바 */
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

        /* 컨텐츠 영역 */
        #cd-panel-body { margin-left: 75px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
        .cd-tab-content { display: none; padding: 25px 20px; overflow-y: auto; flex-grow: 1; box-sizing: border-box; }
        .cd-tab-content.active { display: block; }
        .cd-panel-header { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 22px; border-left: 4px solid #FFD700; padding-left: 12px; line-height: 1.2; }
        .cd-section-title { font-size: 13px; color: #FFD700; font-weight: bold; margin: 24px 0 12px 0; border-bottom: 1px solid #22222b; padding-bottom: 8px; }

        /* 설정 폼 요소 */
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

        /* 투명도 제어 슬라이더 */
        .cd-opacity-box { background: #16161c; border: 1px solid #2d2d3a; border-radius: 10px; padding: 15px; margin-top: 15px; }
        .cd-slider-container { display: flex; align-items: center; gap: 15px; margin-top: 10px; }
        .cd-slider-container input[type="range"] { flex-grow: 1; accent-color: #FFD700; height: 6px; border-radius: 5px; cursor: pointer; }
        .cd-opacity-val { font-family: monospace; font-weight: bold; color: #FFD700; min-width: 35px; text-align: right; }

        /* 통계 및 액션 버튼 */
        #cd-preview-box { background: #16161c; border: 1px solid #2d2d3a; border-radius: 10px; padding: 15px; font-size: 12.5px; line-height: 1.9; margin-top: 20px; }
        #cd-preview-box b { color: #FFD700; }
        #cd-panel-actions { padding: 15px 20px; background: #0e0e11; border-top: 1px solid #22222b; display: flex; gap: 12px; flex-shrink: 0; }
        .cd-btn { flex: 1; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13.5px; transition: all 0.2s; }
        .cd-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .cd-btn-save { background: #FFD700; color: #111; }
        .cd-btn-close { background: #282835; color: #eee; }

        .cd-memo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .cd-memo-add-btn { background: #233446; color: #62a3ff; border: 1px dashed #3c5d80; border-radius: 8px; padding: 10px; width: 75%; font-weight: bold; cursor: pointer; text-align: center; font-size: 12.5px; transition: all 0.2s; }
        .cd-memo-add-btn:hover { background: #2b4561; color: #87baff; }
        .cd-memo-reset-btn { background: #462326; color: #ff6262; border: 1px solid #6e3538; border-radius: 8px; padding: 10px; width: 20%; font-weight: bold; cursor: pointer; text-align: center; font-size: 12.5px; transition: all 0.2s; }
        .cd-memo-reset-btn:hover { background: #612c30; }
        .cd-memo-card { background: #17171c; border: 1px solid #2d2d3a; border-radius: 10px; padding: 15px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; }
        .cd-memo-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .cd-memo-title { font-weight: bold; font-size: 13.5px; color: #fff; }
        .cd-memo-date { font-size: 11px; color: #666; margin-top: 3px; }
        .cd-memo-actions-trigger { cursor: pointer; color: #777; padding: 2px 6px; border-radius: 4px; }
        .cd-memo-actions-trigger:hover { background: #2d2d3a; color: #fff; }
        .cd-memo-body { font-size: 12px; color: #aaa; line-height: 1.55; white-space: pre-wrap; word-break: break-all; }
        .cd-memo-btn-row { display: flex; gap: 8px; margin-top: 5px; }
        .cd-memo-action-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: #25252d; color: #ddd; border: 1px solid #3c3c4a; border-radius: 6px; padding: 8px; font-size: 12px; font-weight: bold; cursor: pointer; transition: all 0.2s; }
        .cd-memo-action-btn:hover { background: #32323c; color: #fff; }
        .cd-memo-action-btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; }
        #cd-memo-editor { display: none; background: #1c1c24; border: 1px solid #3d3d4e; border-radius: 10px; padding: 15px; margin-bottom: 20px; flex-direction: column; gap: 12px; }

        /* 선호 태그 강조 카드 */
        .cd-highlight-card {
            background: rgba(255, 215, 0, 0.08) !important;
            outline: 2.5px solid #FFD700 !important;
            outline-offset: 1px !important;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.45) !important;
            border-radius: 16px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        /* 차단 태그 블라인드 카드 (투명도 50%) */
        .cd-tag-masked-card {
            opacity: 0.50 !important;
            background: rgba(15, 15, 20, 0.75) !important;
            box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.9) !important;
            border-radius: 14px !important;
            pointer-events: auto !important;
            transition: all 0.35s ease !important;
        }
        .cd-tag-masked-card img { filter: blur(16px) grayscale(50%) !important; transition: filter 0.3s ease !important; }
        /* 계정명 외의 텍스트 글씨 완전 뭉개기 */
        .cd-tag-masked-card .cd-blur-target {
            color: transparent !important;
            text-shadow: 0 0 9px rgba(230, 230, 235, 0.95) !important;
            user-select: none; transition: all 0.3s ease !important;
        }
        .cd-tag-masked-card:hover { opacity: 0.95 !important; background: transparent !important; box-shadow: none !important; }
        .cd-tag-masked-card:hover img { filter: none !important; }
        .cd-tag-masked-card:hover .cd-blur-target { color: inherit !important; text-shadow: none !important; }

        .cd-inline-btn {
            background: #2a2a35; color: #ddd; border: 1px solid #444;
            border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: bold;
            display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-family: inherit;
        }
        .cd-inline-btn:hover { background: #3f3f4e; border-color: #FFD700; color: #fff; transform: translateY(-2px); }
    `);

    function createUI() {
        const overlay = document.createElement('div');
        overlay.id = 'cd-overlay';
        document.body.appendChild(overlay);

        const btn = document.createElement('button');
        btn.id = 'cd-toggle-btn';
        btn.innerHTML = `🛠`;
        btn.title = '케이브덕 매니저 열기';
        document.body.appendChild(btn);

        const panelContainer = document.createElement('div');
        panelContainer.id = 'cd-panel-container';
        
        panelContainer.innerHTML = `
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

            <div id="cd-panel-body">
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
                    </div>

                    <div class="cd-section-title">보기 싫은 태그 블라인드</div>
                    <div class="cd-field">
                        <label>블라인드 처리할 태그/단어 (콤마로 구분)</label>
                        <input type="text" id="cd-blockedTags" value="${config.blockedTags}" placeholder="예: 공포, 고어, BL, NTR">
                    </div>

                    <div class="cd-opacity-box">
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

                <div id="cd-tab-memo" class="cd-tab-content">
                    <div class="cd-panel-header">자주 사용하는 문구 관리</div>
                    <div class="cd-memo-header">
                        <button class="cd-memo-add-btn" id="cd-memo-show-creator">+ 새 메모 추가</button>
                        <button class="cd-memo-reset-btn" id="cd-memo-clear-all">초기화</button>
                    </div>
                    <div id="cd-memo-editor">
                        <div class="cd-field">
                            <label>제목 *</label>
                            <input type="text" id="cd-editor-title" placeholder="메모 제목을 입력하세요">
                        </div>
                        <div class="cd-field">
                            <label>내용 *</label>
                            <textarea id="cd-editor-content" placeholder="메모 내용을 입력하세요."></textarea>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="cd-btn cd-btn-close" style="padding:7px;" id="cd-editor-cancel">취소</button>
                            <button class="cd-btn cd-btn-save" style="padding:7px;" id="cd-editor-submit">메모 생성</button>
                        </div>
                    </div>
                    <div id="cd-memos-container"></div>
                </div>

                <div id="cd-tab-chatroom" class="cd-tab-content">
                    <div class="cd-panel-header">채팅방 도구 및 유틸리티</div>
                    <div style="font-size:13px; color:#aaa; line-height:1.65;">
                        <p><b>💬 채팅 유틸리티 버튼 위치 안내:</b></p>
                        <p>채팅 입력창 <b>바로 위쪽</b>에 버튼이 생성됩니다.</p>
                        <ul style="padding-left:20px; margin-top:10px;">
                            <li style="margin-bottom:8px;"><b>포인트 뱃지:</b> 내 보유 깃털과 윙 잔액을 보여줍니다. (클릭 시 혜택 페이지 이동)</li>
                            <li><b>첫대화 버튼:</b> 스크롤을 맨 위의 최초 대화 시작 지점으로 부드럽게 올려줍니다.</li>
                        </ul>
                    </div>
                </div>

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
                    </div>
                </div>

                <div id="cd-panel-actions">
                    <button class="cd-btn cd-btn-close" id="cd-btn-close">닫기</button>
                    <button class="cd-btn cd-btn-save" id="cd-btn-save">설정 저장</button>
                </div>
            </div>
        `;
        document.body.appendChild(panelContainer);

        function toggle(show) {
            panelContainer.style.display = show ? 'block' : 'none';
            overlay.style.display = show ? 'block' : 'none';
            if (show) { renderMemos(); applyAll(); }
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
                panelOpacity: parseInt(panelSlider.value)
            };
        }

        panelContainer.querySelector('#cd-btn-save').addEventListener('click', () => {
            saveConfig(readDraft());
            toggle(false);
        });

        panelContainer.querySelector('#cd-hideBanner').addEventListener('change', () => { config.hideBanner = panelContainer.querySelector('#cd-hideBanner').checked; applyAll(); });
        panelContainer.querySelector('#cd-preferTags').addEventListener('input', () => { config.preferTags = panelContainer.querySelector('#cd-preferTags').value; applyAll(); });
        panelContainer.querySelector('#cd-blockedTags').addEventListener('input', () => { config.blockedTags = panelContainer.querySelector('#cd-blockedTags').value; applyAll(); });

        const memoForm = document.getElementById('cd-memo-editor');
        document.getElementById('cd-memo-show-creator').addEventListener('click', () => memoForm.style.display = 'flex');
        document.getElementById('cd-editor-cancel').addEventListener('click', () => {
            memoForm.style.display = 'none';
            document.getElementById('cd-editor-title').value = '';
            document.getElementById('cd-editor-content').value = '';
        });
        document.getElementById('cd-editor-submit').addEventListener('click', () => {
            const titleVal = document.getElementById('cd-editor-title').value.trim();
            const contentVal = document.getElementById('cd-editor-content').value.trim();
            if (!titleVal || !contentVal) return;
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            memos.unshift({ id: 'memo-' + Date.now(), title: titleVal, content: contentVal, date: dateStr });
            saveMemos(); renderMemos();
            memoForm.style.display = 'none';
            document.getElementById('cd-editor-title').value = ''; document.getElementById('cd-editor-content').value = '';
        });
        document.getElementById('cd-memo-clear-all').addEventListener('click', () => { memos = []; saveMemos(); renderMemos(); });

        document.documentElement.style.setProperty('--cd-panel-opacity-val', (config.panelOpacity / 100).toString());
    }

    function renderMemos() {
        const container = document.getElementById('cd-memos-container');
        if (!container) return;
        if (memos.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#666;">저장된 메모가 없습니다.</div>`;
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
                    <button class="cd-memo-action-btn copy-unote" data-id="${memo.id}">
                        <svg viewBox="0 0 24 24" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"></path></svg>
                        유저노트
                    </button>
                    <button class="cd-memo-action-btn copy-raw" data-id="${memo.id}">
                        <svg viewBox="0 0 24 24" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2 2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        복사
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        container.querySelectorAll('.cd-memo-actions-trigger').forEach(btn => {
            btn.addEventListener('click', () => { memos = memos.filter(m => m.id !== btn.getAttribute('data-id')); saveMemos(); renderMemos(); });
        });

        container.querySelectorAll('.inject-chat').forEach(btn => {
            btn.addEventListener('click', () => {
                const memo = memos.find(m => m.id === btn.getAttribute('data-id'));
                if (memo) {
                    const chatInput = document.querySelector('textarea[name="userInput"], textarea[placeholder*="입력"], textarea[placeholder*="대사"], textarea');
                    if (chatInput) {
                        chatInput.value = memo.content;
                        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                        chatInput.focus();
                        showFeedbackMessage('채팅창 입력칸에 문구를 주입했습니다!');
                    } else fallbackCopy(memo.content, '채팅방 입력창을 찾지 못해 클립보드에 복사했습니다!');
                }
            });
        });

        container.querySelectorAll('.copy-unote, .copy-raw').forEach(btn => {
            btn.addEventListener('click', () => {
                const memo = memos.find(m => m.id === btn.getAttribute('data-id'));
                if (memo) fallbackCopy(memo.content, '클립보드에 복사되었습니다!');
            });
        });
    }

    function fallbackCopy(text, successMsg) {
        const el = document.createElement('textarea');
        el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
        document.body.appendChild(el); el.select();
        try { document.execCommand('copy'); showFeedbackMessage(successMsg); } catch (err) { }
        document.body.removeChild(el);
    }

    function showFeedbackMessage(msg) {
        const exist = document.getElementById('cd-feedback-toast');
        if (exist) exist.remove();
        const toast = document.createElement('div');
        toast.id = 'cd-feedback-toast';
        toast.style.cssText = `position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #FFD700; color: #111; padding: 12px 24px; border-radius: 20px; font-size: 13px; font-weight: bold; z-index: 10000000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none; transition: opacity 0.3s; opacity: 1;`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2200);
    }

    function escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

    function checkAttendance() {
        const statusEl = document.getElementById('cd-attendance-status');
        const lastEl = document.getElementById('cd-attendance-last');
        const now = new Date();
        const kstTime = new Date(now.getTime() + (now.getTimezoneOffset() + 9 * 60) * 60000);
        let kstDateStr = kstTime.toISOString().split('T')[0];
        if (kstTime.getHours() < 9) kstDateStr = new Date(kstTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const lastAttendanceDay = GM_getValue('cd_last_attendance_day', '');
        if (statusEl && lastEl) {
            lastEl.innerText = lastAttendanceDay || '기록 없음';
            statusEl.innerText = (lastAttendanceDay === kstDateStr) ? '오늘 출석 완료됨' : '출석 대기중 (자동 진행)';
            statusEl.style.color = (lastAttendanceDay === kstDateStr) ? '#4facfe' : '#FFD700';
        }

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

                if (iframeDoc.body.textContent.includes('로그인') && !iframeDoc.body.textContent.includes('로그아웃') && checkAttempts === 5) {
                    clearInterval(checkInterval);
                    iframe.style.cssText = 'position:fixed; inset:50px; width:calc(100% - 100px); height:calc(100% - 100px); background:#000; z-index:999999; border:5px solid #FFD700; pointer-events:auto; opacity:1;';
                    showFeedbackMessage('⚠️ 로그인이 풀려있어 자동 출석을 못했습니다! 창 안에서 로그인해 주세요.');
                    return;
                }

                // iframe 스크래핑을 통한 정확한 윙/깃털 정보 동기화
                const spans = Array.from(iframeDoc.querySelectorAll('span'));
                const featEl = spans.find(el => el.textContent === '깃털');
                if (featEl && featEl.nextElementSibling) GM_setValue('cd_cached_feathers', featEl.nextElementSibling.textContent.trim());
                
                const wingEl = spans.find(el => el.textContent === '윙');
                if (wingEl && wingEl.nextElementSibling) GM_setValue('cd_cached_wings', wingEl.nextElementSibling.textContent.trim());

                if (lastAttendanceDay === kstDateStr) { if (checkAttempts > 5) { clearInterval(checkInterval); iframe.remove(); } return; }

                const buttons = Array.from(iframeDoc.querySelectorAll('button, span, div, a'));
                const checkInBtn = buttons.find(btn => { const txt = btn.textContent.trim(); return txt.includes('출석하고') || txt.includes('출석체크') || txt === '받기'; });

                if (checkInBtn) {
                    checkInBtn.click();
                    clearInterval(checkInterval);
                    GM_setValue('cd_last_attendance_day', kstDateStr);
                    showFeedbackMessage('🎉 오늘의 출석체크가 안전하게 완료되었습니다!');
                    setTimeout(() => iframe.remove(), 2000);
                }
            } catch (e) { }
            if (checkAttempts > 25) { clearInterval(checkInterval); iframe.remove(); }
        }, 500);
    }

    function injectInlineUtilities() {
        // 채팅방 URL이 아니면 동작하지 않음
        if (!window.location.href.includes('/talk/')) return;

        // 채팅 입력칸 찾기
        const chatInput = document.querySelector('textarea[name="userInput"], textarea[placeholder*="대사"], textarea');
        if (!chatInput) return;

        // 텍스트 영역을 감싸는 폼(Form) 컨테이너 요소 찾기
        const chatForm = chatInput.closest('form') || chatInput.closest('.flex.w-full.items-end');
        if (!chatForm) return;

        // 이미 주입되어 있으면 패스, 최신 윙/깃털 정보만 DOM에 업데이트
        if (document.getElementById('cd-chat-inline-utils')) {
            const featBadge = document.getElementById('cd-feat-val');
            const wingBadge = document.getElementById('cd-wing-val');
            if (featBadge) featBadge.innerText = GM_getValue('cd_cached_feathers', '0');
            if (wingBadge) wingBadge.innerText = GM_getValue('cd_cached_wings', '0');
            return;
        }

        // 입력 폼 상단에 완벽하게 뜨도록 absolute 포지셔닝 활용 래퍼 생성
        const wrapper = document.createElement('div');
        wrapper.id = 'cd-chat-inline-utils';
        // 폼 바로 위에 위치하도록 CSS 설정
        wrapper.style.cssText = 'position: absolute; bottom: calc(100% + 10px); right: 0; display: flex; gap: 8px; z-index: 50;';

        // 1. 윙/깃털 뱃지 (심플하게 이모지와 숫자만)
        const pointsBadge = document.createElement('button');
        pointsBadge.className = 'cd-inline-btn';
        pointsBadge.innerHTML = `🪶 <span id="cd-feat-val">${GM_getValue('cd_cached_feathers', '0')}</span> &nbsp;|&nbsp; 💸 <span id="cd-wing-val">${GM_getValue('cd_cached_wings', '0')}</span>`;
        pointsBadge.title = '포인트 상점/혜택 페이지 방문 시 실시간 동기화됩니다.';
        pointsBadge.onclick = (e) => { e.preventDefault(); window.open('https://caveduck.io/ko/earn', '_blank'); };

        // 2. 첫대화로 돌아가기 (물리적 스크롤 업 유틸리티)
        const scrollTopBtn = document.createElement('button');
        scrollTopBtn.className = 'cd-inline-btn';
        scrollTopBtn.innerHTML = `🔄 첫대화로 돌아가기`;
        scrollTopBtn.title = '대화를 지우지 않고 가장 위에 있는 최초의 대화 시작 지점으로 부드럽게 올려줍니다.';
        scrollTopBtn.onclick = (e) => {
            e.preventDefault();
            const scrollContainer = document.querySelector('div[class*="flex-col-reverse"][class*="overflow-y-auto"], .flex.flex-col-reverse.overflow-y-auto');
            if (scrollContainer) {
                const firstMsg = scrollContainer.querySelector('.flex.flex-col.p-4 > div:first-child');
                if (firstMsg) {
                    firstMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    showFeedbackMessage('가장 첫 대화 위치로 스크롤을 이동했습니다!');
                } else {
                    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
                }
            } else {
                showFeedbackMessage('채팅창 영역을 탐지하지 못했습니다.');
            }
        };

        wrapper.appendChild(pointsBadge);
        wrapper.appendChild(scrollTopBtn);

        // Form이 relative 특성을 가지고 있으므로 자식으로 편입시키면 완벽하게 그 위에 뜸
        chatForm.style.position = 'relative';
        chatForm.appendChild(wrapper);
    }

    function applyAll() {
        const prefTagsList = config.preferTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const blockTagsList = config.blockedTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        stats = { total: 0, masked: 0, highlight: 0 };

        const banners = document.querySelectorAll('.swiper-container, [class*="banner" i], [class*="swiper" i]');
        banners.forEach(b => {
            if (b.closest('#cd-panel-container, #cd-toggle-btn')) return;
            b.style.setProperty('display', config.hideBanner ? 'none' : '', 'important');
        });

        const cards = document.querySelectorAll('a[href*="/character/"], a[href*="/characters/"]');
        cards.forEach(card => {
            if (card.closest('#cd-panel-container, #cd-toggle-btn')) return;
            const cardText = card.textContent.toLowerCase();
            stats.total++;

            card.style.display = '';
            card.classList.remove('cd-highlight-card', 'cd-tag-masked-card');
            card.querySelectorAll('.cd-blur-target').forEach(el => el.classList.remove('cd-blur-target'));

            if (blockTagsList.length > 0 && blockTagsList.some(tag => cardText.includes(tag))) {
                card.classList.add('cd-tag-masked-card');
                const allElements = card.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.children.length === 0 && el.textContent.trim() && !el.textContent.includes('@')) {
                        el.classList.add('cd-blur-target');
                    }
                });
                stats.masked++;
                return;
            }

            if (prefTagsList.length > 0 && prefTagsList.some(tag => cardText.includes(tag))) {
                card.classList.add('cd-highlight-card');
                stats.highlight++;
            }
        });

        const box = document.getElementById('cd-preview-box');
        if (box) box.innerHTML = `현재 페이지 캐릭터 카드: <b>${stats.total}</b>개<br>태그 필터 반투명 블라인드: <b style="color:#4facfe">${stats.masked}</b>개<br>선호 태그 매칭: <b style="color:#FFD700">${stats.highlight}</b>개`;
    }

    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const m of mutations) {
                const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                if (el && el.closest('#cd-panel-container, #cd-toggle-btn, #cd-overlay, #cd-chat-inline-utils')) continue;
                if (m.addedNodes.length > 0) { shouldUpdate = true; break; }
            }

            // 지속적으로 채팅방 인라인 UI 유무 확인 및 갱신
            injectInlineUtilities();

            if (shouldUpdate) {
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(applyAll, 250);
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
