// HEX COMMAND 88 — 렌더링(픽셀 단위)과 입력 처리
(function () {
  'use strict';
  const R = window.HCRules, D = R.D;

  // ---- 16색 팔레트 ----
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const PAL = {
    black: hex('#000000'), night: hex('#0a0d1c'), navy: hex('#1c2f8f'), blue: hex('#4a7bff'),
    sky: hex('#a8ccff'), cyan: hex('#58e0ee'), dgreen: hex('#1d5626'), green: hex('#3b8f37'),
    lgreen: hex('#8fd25a'), brown: hex('#7a4a1e'), tan: hex('#d0a35c'), red: hex('#e8433f'),
    pink: hex('#ffb3a1'), gray: hex('#6b6f7a'), silver: hex('#b9bcc6'), white: hex('#f4f4f4'),
    yellow: hex('#ffd23f')
  };
  const SIDE_COL = {
    blue: { X: PAL.blue, L: PAL.sky }, red: { X: PAL.red, L: PAL.pink }, done: { X: PAL.gray, L: PAL.silver }
  };

  // ---- 도트 스프라이트 (14x9 흰 실루엣, 오른쪽을 향함) — 진영색 타일 위에 그린다 ----
  // 유닛 그림은 data.js의 각 유닛 sprite 항목에서 가져온다
  const SPR = Object.fromEntries(Object.entries(D.units).map(([k, u]) => [k, u.sprite]));
  const PEAK = ['...W...', '..WTW..', '.TTBTT.', 'TBBBBBT'];
  const FLAG = ['DXXX', 'DXXX', 'D...', 'D...', 'D...'];
  const STAR = ['..Y..', 'YYYYY', '.YYY.', 'Y...Y'];
  const TGT = ['.YYY.', 'YDDDY', 'YDYDY', 'YDDDY', '.YYY.'];   // 시나리오 목표 도시 표시
  const DIG = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'], '-': ['000', '000', '111', '000', '000']
  };

  // ---- 2배 도트 확대 (Scale2x: 대각선을 둥글게 다듬음) — 고해상도 모드용 ----
  function scale2x(rows) {
    const h = rows.length, w = rows[0].length, out = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? '.' : rows[y][x];
    for (let y = 0; y < h; y++) {
      let a = '', b = '';
      for (let x = 0; x < w; x++) {
        const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), Dd = at(x, y + 1);
        let e0 = P, e1 = P, e2 = P, e3 = P;
        if (C === A && C !== Dd && A !== B) e0 = A;
        if (A === B && A !== C && B !== Dd) e1 = B;
        if (Dd === C && Dd !== B && C !== A) e2 = C;
        if (B === Dd && B !== A && Dd !== C) e3 = Dd;
        a += e0 + e1; b += e2 + e3;
      }
      out.push(a, b);
    }
    return out;
  }
  const digRows = g => g.map(r => r.replace(/0/g, '.'));
  const ART = {
    1: { SPR, PEAK, FLAG, STAR, TGT, DIG: Object.fromEntries(Object.entries(DIG).map(([k, v]) => [k, digRows(v)])) },
    2: {
      SPR: Object.fromEntries(Object.entries(SPR).map(([k, v]) => [k, scale2x(v)])),
      PEAK: scale2x(PEAK), FLAG: scale2x(FLAG), STAR: scale2x(STAR), TGT: scale2x(TGT),
      DIG: Object.fromEntries(Object.entries(DIG).map(([k, v]) => [k, scale2x(digRows(v))]))
    }
  };

  // ---- 상태 ----
  const SQ3 = Math.sqrt(3);
  let Z = 1, S = 16, HH = SQ3 * 16;     // Z = 1 레트로(저해상도), 2 고해상도
  function setQuality(hi) { Z = hi ? 2 : 1; S = 16 * Z; HH = SQ3 * S; }
  let game, CW, CH, img, hexIdx, gridEdge, outline, outlinePix, hexPix, base = null, dirty = true, terrLayer = null, terrSig = '';
  let sel = null;          // { u, mode:'move'|'action'|'target', reach:Map, targets:[], tgt }
  let inspect = null;      // 정보창에 표시할 칸 {c,r}
  let enemyView = null;    // 적 이동범위 표시용 유닛
  let anims = [];
  let banner = null;       // 'start' | 'turn' | 'win'
  let mode = 'cpu';        // 'cpu' = 컴퓨터 대전, 'hot' = 2인 핫시트
  let aiBusy = false;
  const AI = window.HCAI;
  // 난이도·속도 설정 (이 브라우저에 기억)
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 시 무시 */ } } };
  let levelIdx = Math.max(0, D.aiLevels.findIndex(l => l.id === (store.get('hc88-level') || 'normal')));
  let speedIdx = Math.max(0, D.aiSpeeds.findIndex(l => l.id === (store.get('hc88-speed') || 'normal')));
  function applyAI() {
    const L = D.aiLevels[levelIdx], V = D.aiSpeeds[speedIdx];
    D.ai.noise = L.noise; D.ai.threat = L.threat; D.ai.stepMs = V.stepMs;
  }
  applyAI();
  function cycleLevel() { levelIdx = (levelIdx + 1) % D.aiLevels.length; store.set('hc88-level', D.aiLevels[levelIdx].id); applyAI(); tone(SFX.select); refresh(); }
  function cycleSpeed() { speedIdx = (speedIdx + 1) % D.aiSpeeds.length; store.set('hc88-speed', D.aiSpeeds[speedIdx].id); applyAI(); tone(SFX.select); refresh(); }
  // 화면 설정: 배율, 주사선, 색감 (이 브라우저에 기억)
  const SCALES = [{ id: 'fit', name: '맞춤' }, { id: '1', name: '1배' }, { id: '2', name: '2배' }, { id: '3', name: '3배' }];
  const COLORS = [
    { id: 'pc98', name: 'PC-98 컬러' },
    { id: 'green', name: '녹색 모니터', stops: [[2, 14, 4], [24, 150, 50], [170, 255, 160]] },
    { id: 'amber', name: '호박색 모니터', stops: [[16, 7, 0], [205, 120, 0], [255, 225, 150]] }
  ];
  let scaleIdx = Math.max(0, SCALES.findIndex(v => v.id === (store.get('hc88-scale') || 'fit')));
  let colorIdx = Math.max(0, COLORS.findIndex(v => v.id === (store.get('hc88-color') || 'pc98')));
  let scanOn = store.get('hc88-scan') !== 'off';
  setQuality(store.get('hc88-hires') === 'on');
  function toggleHires() { setQuality(Z === 1); store.set('hc88-hires', Z === 2 ? 'on' : 'off'); setupCanvas(); tone(SFX.select); refresh(); }
  let settingsOpen = false;
  let factory = null;      // 생산 메뉴를 연 도시 {c,r}
  let saveOpen = false;    // 저장·불러오기 메뉴
  // 맵 목록 = 기본 맵 + 직접 만든 맵(브라우저에 저장)
  function customMaps() { try { return JSON.parse(store.get('hc88-maps') || '[]'); } catch (e) { return []; } }
  function saveCustomMaps(list) { store.set('hc88-maps', JSON.stringify(list)); }
  const allMaps = () => D.maps.concat(customMaps());
  let mapIdx = Math.max(0, allMaps().findIndex(m => m.id === store.get('hc88-map')));
  let editor = null;       // 맵 에디터 상태
  let musicOn = store.get('hc88-music') !== 'off';
  let cutOn = store.get('hc88-cut') !== 'off';
  let userStarted = false;   // 첫 터치 전에는 소리를 내지 않음 (브라우저 정책)
  const Music = window.HCMusic;
  function syncMusic() {
    if (!Music || !userStarted || window.HC_INTRO_ACTIVE) return;   // 인트로 중에는 인트로 음악
    if (!musicOn || !game || game.winner) Music.stop();
    else Music.play(aiBusy ? 'enemy' : 'march');
  }
  document.addEventListener('hc-intro-done', () => refresh());
  let introOn = store.get('hc88-intro') !== 'off';
  function toggleIntro() { introOn = !introOn; store.set('hc88-intro', introOn ? 'on' : 'off'); tone(SFX.select); refresh(); }
  function replayIntro() { settingsOpen = false; if (Music) Music.stop(); if (window.HCIntro) window.HCIntro.play(); refresh(); }
  function toggleMusic() { musicOn = !musicOn; store.set('hc88-music', musicOn ? 'on' : 'off'); tone(SFX.select); refresh(); }
  function toggleCut() { cutOn = !cutOn; store.set('hc88-cut', cutOn ? 'on' : 'off'); tone(SFX.select); refresh(); }
  document.addEventListener('pointerdown', () => { if (!userStarted) { userStarted = true; setTimeout(syncMusic, 0); } if (Music) Music.resume(); }, true);
  let fogOn = store.get('hc88-fog') === 'on';
  let visSet = null;       // 전장의 안개: 현재 보이는 칸
  const viewer = () => (mode === 'cpu' ? 'blue' : game.side);
  const seen = (c, r) => !fogOn || !visSet || visSet.has(c + ',' + r);
  const updateVis = () => { visSet = fogOn && !editor ? R.visible(game, viewer()) : null; };
  // 보이는 유닛만 (안개 속 적은 없는 것으로 취급)
  const seenUnitAt = (c, r) => { const u = R.unitAt(game, c, r); return u && (u.side === viewer() || seen(c, r)) ? u : null; };
  function toggleFog() { fogOn = !fogOn; store.set('hc88-fog', fogOn ? 'on' : 'off'); tone(SFX.select); refresh(); }
  // ---- 저장·불러오기 (이 브라우저에 3칸 + 자동저장) ----
  const SLOTS = ['1', '2', '3', 'auto'];
  function slotInfo(n) {
    try { const d = JSON.parse(store.get('hc88-save-' + n) || 'null'); return d ? `T${String(d.game.turn).padStart(2, '0')} ${d.mode === 'cpu' ? '1인' : '2인'}` : null; } catch (e) { return null; }
  }
  function saveSlot(n) {
    store.set('hc88-save-' + n, JSON.stringify({ v: D.version, mode, game: Object.assign({}, game, { rng: undefined }) }));
    if (n !== 'auto') { game.log.push(`슬롯 ${n}에 저장했습니다.`); tone(SFX.capture); refresh(); }
  }
  function loadSlot(n) {
    let d = null; try { d = JSON.parse(store.get('hc88-save-' + n) || 'null'); } catch (e) { d = null; }
    if (!d) return;
    game = Object.assign(R.createGame(), d.game, { rng: Math.random }); mode = d.mode || 'cpu';
    sel = null; inspect = null; enemyView = null; factory = null; saveOpen = false; anims = [];
    game.log.push(`${n === 'auto' ? '자동 저장' : '슬롯 ' + n}을 불러왔습니다.`);
    setupCanvas(); tone(SFX.turn); refresh();
  }
  const mono = () => COLORS[colorIdx].id !== 'pc98';
  function applyView() {
    const sc = SCALES[scaleIdx].id;
    const baseW = CW / Z;   // 화면 크기는 해상도와 상관없이 같게
    if (sc === 'fit') { cv.style.width = '100%'; cv.style.minWidth = Math.round(baseW * 1.5) + 'px'; }
    else { cv.style.width = Math.round(baseW * Number(sc)) + 'px'; cv.style.minWidth = '0'; }
    document.querySelector('.screen .frame').classList.toggle('noscan', !scanOn);
  }
  function cycleScale() { scaleIdx = (scaleIdx + 1) % SCALES.length; store.set('hc88-scale', SCALES[scaleIdx].id); applyView(); tone(SFX.select); refresh(); }
  function cycleColor() { colorIdx = (colorIdx + 1) % COLORS.length; store.set('hc88-color', COLORS[colorIdx].id); monoLut = null; tone(SFX.select); refresh(); }
  // 단색 모니터용 색 변환 (색마다 한 번만 계산해 캐시)
  let monoLut = null;
  function mc(col) {
    if (!mono()) return col;
    if (!monoLut) {
      const stops = COLORS[colorIdx].stops, steps = [];
      for (let k = 0; k < 6; k++) { const t = k / 5, seg = t < 0.5 ? 0 : 1, f = seg === 0 ? t * 2 : (t - 0.5) * 2; steps.push([0, 1, 2].map(j => Math.round(stops[seg][j] + (stops[seg + 1][j] - stops[seg][j]) * f))); }
      monoLut = { steps, cache: new Map() };
    }
    let v = monoLut.cache.get(col);
    if (!v) { const lum = 0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2]; v = monoLut.steps[Math.min(5, Math.floor(lum / 256 * 6))]; monoLut.cache.set(col, v); }
    return v;
  }
  function toggleScan() { scanOn = !scanOn; store.set('hc88-scan', scanOn ? 'on' : 'off'); applyView(); tone(SFX.select); refresh(); }
  // 단색 모니터: 밝기를 6단계로 줄여 한 가지 색조로 칠한다
  function monoPass(d) {
    d = d || img.data;
    const stops = COLORS[colorIdx].stops, lut = [];
    for (let k = 0; k < 6; k++) {
      const t = k / 5, seg = t < 0.5 ? 0 : 1, f = seg === 0 ? t * 2 : (t - 0.5) * 2;
      lut.push([0, 1, 2].map(j => Math.round(stops[seg][j] + (stops[seg + 1][j] - stops[seg][j]) * f)));
    }
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      const c = lut[Math.min(5, Math.floor(lum / 256 * 6))];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  const levelBtn = () => [`난이도: ${D.aiLevels[levelIdx].name}`, cycleLevel];
  const speedBtn = () => [`적 속도: ${D.aiSpeeds[speedIdx].name}`, cycleSpeed];
  let soundOn = true, actx = null;

  const $ = id => document.getElementById(id);
  // 진영 이름 (시나리오는 국가 이름). 짧은 이름은 괄호 앞부분: '연합군 (미국·영국)' → '연합군'
  const SN = s => R.sideName(s, game);
  const SNs = s => SN(s).split(' (')[0];
  const uName = u => u.name ? `${u.name} (${R.stat(u).name})` : R.stat(u).name;
  const cv = $('map'), ctx = cv.getContext('2d');

  // ---- 좌표 ----
  function center(c, r) { return [Math.round(S + c * 1.5 * S), Math.round(HH / 2 + r * HH + ((c & 1) ? HH / 2 : 0))]; }
  function cubeRound(x, z) {
    const y = -x - z; let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return [rx, rz];
  }
  function pixelHex(x, y) {
    const px = x + 0.5 - S, py = y + 0.5 - HH / 2;
    const [q, rr] = cubeRound((2 / 3 * px) / S, (-1 / 3 * px + SQ3 / 3 * py) / S);
    const c = q, r = rr + (q - (q & 1)) / 2;
    return (c >= 0 && r >= 0 && c < game.W && r < game.H) ? r * game.W + c : -1;
  }

  function setupCanvas() {
    CW = Math.ceil(2 * S + (game.W - 1) * 1.5 * S) + 1;
    CH = Math.ceil(HH * (game.H + 0.5)) + 1;
    cv.width = CW; cv.height = CH; applyView();
    img = ctx.createImageData(CW, CH);
    hexIdx = new Int16Array(CW * CH); gridEdge = new Uint8Array(CW * CH); outline = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) hexIdx[y * CW + x] = pixelHex(x, y);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = y * CW + x, h = hexIdx[i];
      if (h < 0) continue;
      const rgt = x + 1 < CW ? hexIdx[i + 1] : -1, dn = y + 1 < CH ? hexIdx[i + CW] : -1;
      const lft = x > 0 ? hexIdx[i - 1] : -1, up = y > 0 ? hexIdx[i - CW] : -1;
      gridEdge[i] = (rgt !== h || dn !== h) ? 1 : 0;
      outline[i] = (rgt !== h || dn !== h || lft !== h || up !== h) ? 1 : 0;
    }
    // 칸별 테두리 픽셀 목록 (선택 표시를 매 프레임 빠르게 그리기 위해)
    outlinePix = Array.from({ length: game.W * game.H }, () => []);
    hexPix = Array.from({ length: game.W * game.H }, () => []);
    for (let i = 0; i < CW * CH; i++) { const h = hexIdx[i]; if (h < 0) continue; hexPix[h].push(i); if (outline[i]) outlinePix[h].push(i); }
    dirty = true; terrSig = '';
  }

  // ---- 지형 픽셀 패턴 (디더링) ----
  function terrainPx(t, x, y, owner) { return Z === 2 ? terrainHi(t, x, y, owner) : terrainLo(t, x, y, owner); }
  // 고해상도 지형: 무늬를 크게, 3단 음영
  function terrainHi(t, x, y, owner) {
    switch (t) {
      case 'plain': return ((x * 7 + y * 13) % 23 === 0 || (x * 7 + y * 13) % 23 === 1) ? PAL.lgreen : ((x * 3 + y * 5) % 31 === 0) ? PAL.dgreen : PAL.green;
      case 'forest': {
        const row = (y / 12) | 0, tx = (x + (row & 1) * 6) % 12, ty = y % 12;
        const dx = tx - 6, dy = ty - 5, r2 = dx * dx + dy * dy;
        if (r2 <= 22) return (dx + dy < -3) ? PAL.lgreen : (dx + dy > 3 ? PAL.dgreen : PAL.green);
        if (ty >= 10 && Math.abs(dx) <= 0) return PAL.brown;
        return ((x + y) & 1) ? PAL.dgreen : PAL.night;
      }
      case 'mountain': {
        const d = (x + y) % 10, e = (x - y + 1000) % 10;
        if (d < 2) return PAL.tan;
        if (e === 0 && (y & 1)) return PAL.black;
        return (d > 7) ? PAL.black : PAL.brown;
      }
      case 'water': {
        const band = (y / 6) | 0, wx = (x + band * 4) % 12;
        if (y % 6 === 0 && wx < 6) return PAL.blue;
        if (y % 6 === 1 && (wx === 6 || wx === 7)) return PAL.sky;
        return ((x + y) % 2 === 0 && y % 6 === 3 && wx > 8) ? PAL.blue : PAL.navy;
      }
      case 'beach': return ((x * 5 + y * 3) % 7 === 0) ? PAL.brown : ((x + y * 2) % 11 === 0 ? PAL.white : PAL.tan);
      case 'port': {
        if (y % 14 >= 8) { const wx = (x + ((y / 14) | 0) * 5) % 10; return x % 10 === 4 ? PAL.gray : (y % 14 === 10 && wx < 4 ? PAL.blue : PAL.navy); } // 부두와 바다
        const bx = x % 7, by = y % 7, lit = owner === 'blue' ? PAL.sky : owner === 'red' ? PAL.pink : PAL.silver;
        if (bx === 0 || by === 0) return PAL.gray;
        return (bx === 3 && by === 3) ? lit : (bx === 6 || by === 6 ? PAL.black : PAL.silver);
      }
      case 'city': case 'capital': {
        const bx = x % 7, by = y % 7;
        if (bx === 0 || by === 0) return PAL.gray;
        if (bx === 6 || by === 6) return PAL.black;
        const lit = owner === 'blue' ? PAL.sky : owner === 'red' ? PAL.pink : PAL.silver;
        if ((bx === 2 || bx === 4) && (by === 2 || by === 4)) return ((((x / 7) | 0) + ((y / 7) | 0)) % 3 === 0) ? PAL.black : lit;
        return PAL.silver;
      }
    }
    return PAL.black;
  }
  function terrainLo(t, x, y, owner) {
    switch (t) {
      case 'plain': return ((x * 7 + y * 13) % 11 === 0) ? PAL.lgreen : PAL.green;
      case 'forest': {
        const tx = x % 6, ty = (y + ((x / 6 | 0) & 1) * 3) % 6;
        if (ty < 4 && Math.abs(tx - 2.5) <= ty * 0.75 - 0.2) return ty === 3 ? PAL.dgreen : PAL.green;
        return (x + y) & 1 ? PAL.dgreen : PAL.night;
      }
      case 'mountain': return ((x + y) % 4 === 0) ? PAL.tan : ((x - y + 400) % 4 === 0 && (y & 1)) ? PAL.black : PAL.brown;
      case 'water': return (y % 4 === 0 && (x + ((y >> 2) * 3)) % 7 < 3) ? PAL.blue : PAL.navy;
      case 'beach': return ((x * 5 + y * 3) % 7 === 0) ? PAL.brown : PAL.tan;
      case 'port': {
        if (y % 7 >= 4) return x % 5 === 2 ? PAL.gray : ((y % 7 === 5 && (x + y) % 6 < 2) ? PAL.blue : PAL.navy);  // 부두와 바다
        if (x % 3 === 0 || y % 7 === 0) return PAL.gray;
        const lit = owner === 'blue' ? PAL.sky : owner === 'red' ? PAL.pink : PAL.silver;
        return ((x / 3 | 0) % 2 === 0) ? lit : PAL.black;
      }
      case 'city': case 'capital': {
        if (x % 3 === 0 || y % 3 === 0) return PAL.gray;
        const lit = owner === 'blue' ? PAL.sky : owner === 'red' ? PAL.pink : PAL.silver;
        return ((x / 3 | 0) + (y / 3 | 0)) % 3 === 0 ? PAL.black : lit;
      }
    }
    return PAL.black;
  }

  // ---- 그리기 ----
  function px(x, y, col) {
    if (x < 0 || y < 0 || x >= CW || y >= CH || !col) return;
    col = mc(col);
    const i = (y * CW + x) * 4, d = img.data;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  function sprite(rows, ox, oy, map, flip) {
    const w = rows[0].length;
    rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const ch = row[flip ? w - 1 - x : x]; if (ch !== '.') px(ox + x, oy + y, map[ch]); } });
  }
  function number(n, rx, y, col) {
    const s = String(n), A = ART[Z], gw = 3 * Z, gh = 5 * Z, step = 4 * Z; let x = rx - s.length * step + Z;
    for (const ch of s) {
      const g = A.DIG[ch];
      for (let yy = -1; yy <= gh; yy++) for (let xx = -1; xx <= gw; xx++) px(x + xx, y + yy, PAL.black);
      g.forEach((row, yy) => { for (let xx = 0; xx < gw; xx++) if (row[xx] === '1') px(x + xx, y + yy, col); });
      x += step;
    }
  }

  function overlayKinds() {
    const ov = new Int8Array(game.W * game.H);
    if (enemyView) R.reachable(game, enemyView).forEach(p => { ov[p.r * game.W + p.c] = 3; });
    if (sel && sel.mode === 'move') sel.reach.forEach(p => { ov[p.r * game.W + p.c] = 1; });
    if (sel && (sel.mode === 'target' || sel.mode === 'action')) sel.targets.forEach(t => { ov[t.r * game.W + t.c] = 2; });
    return ov;
  }

  // 배경층(지형·안개·하이라이트·격자·도시 표시)은 상태가 바뀔 때만 다시 그려 캐시
  function buildBase() {
    // 1) 지형층: 지도·도시 소유·점령치·해상도·색감이 바뀔 때만 전체 픽셀 계산
    const sig = Z + '|' + colorIdx + '|' + (game.targets || []).join(';') + '|' + game.map.join('') + '|' + Object.values(game.cities).map(c => (c.owner || '-') + (c.by ? c.cap : '')).join(',');
    const d = img.data;
    if (sig !== terrSig || !terrLayer) {
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const i = y * CW + x, h = hexIdx[i];
        let col;
        if (h < 0) col = PAL.night;
        else if (gridEdge[i]) col = PAL.black;
        else { const c = h % game.W, r = (h / game.W) | 0, city = game.cities[c + ',' + r]; col = terrainPx(game.map[r][c], x, y, city && city.owner); }
        col = mc(col);
        const j = i * 4; d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
      }
      const A = ART[Z];
      for (let r = 0; r < game.H; r++) for (let c = 0; c < game.W; c++) {
        const t = game.map[r][c], [cx, cy] = center(c, r);
        if (t === 'mountain') sprite(A.PEAK, cx - 3 * Z, cy - 2 * Z, { W: PAL.white, T: PAL.tan, B: PAL.brown });
        const city = game.cities[c + ',' + r];
        if (city) {
          const fc = mono() ? (city.owner === 'blue' ? PAL.white : city.owner === 'red' ? PAL.black : PAL.gray) : city.owner ? SIDE_COL[city.owner].X : PAL.white;
          sprite(A.FLAG, cx - 6 * Z, cy - 13 * Z, { D: PAL.black, X: fc });
          if (t === 'capital') sprite(A.STAR, cx + 2 * Z, cy - 12 * Z, { Y: PAL.yellow });
          else if (game.targets && game.targets.includes(c + ',' + r)) sprite(A.TGT, cx + 2 * Z, cy - 13 * Z, { Y: PAL.yellow, D: PAL.black });
          if (city.by) {
            const w = Math.round((city.cap / D.captureMax) * 7 * Z);
            for (let k = 0; k < 7 * Z; k++) for (let q = 0; q < 2 * Z; q++) px(cx - 10 * Z + k, cy + 6 * Z + q, q < Z && k < w ? PAL.yellow : PAL.black);
          }
        }
      }
      terrLayer = new Uint8ClampedArray(d); terrSig = sig;
    } else d.set(terrLayer);
    // 2) 안개·이동범위·공격대상: 해당 칸의 픽셀만 덧칠
    const ov = overlayKinds(), N = game.W * game.H;
    const fogC = mc(PAL.night), cyan = mc(PAL.cyan), red = mc(PAL.red), pink = mc(PAL.pink);
    const put = (i, c) => { const j = i * 4; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; };
    for (let h = 0; h < N; h++) {
      const fog = visSet && !visSet.has((h % game.W) + ',' + ((h / game.W) | 0)), o = ov[h];
      if (!fog && !o) continue;
      for (const i of hexPix[h]) {
        if (gridEdge[i]) continue;
        const x = i % CW, y = (i / CW) | 0;
        let c = null;
        if (fog && ((x + y) & 1) === 0) c = fogC;
        if (o === 1 && ((x + y) & 1) === 0) c = cyan;
        else if (o === 2 && ((y >> (Z - 1)) & 1) === 0) c = red; // 공격 대상은 가로줄 무늬 (단색 화면에서도 구분)
        else if (o === 3 && ((x + y) % 3) === 0) c = pink;
        if (c) put(i, c);
      }
    }
    base = new Uint8ClampedArray(d);
    dirty = false;
  }

  function drawUnit(u) {
    const [cx, cy] = center(u.c, u.r), A = ART[Z];
    const done = u.acted && u.side === game.side, pal = done ? SIDE_COL.done : SIDE_COL[u.side];
    const air = R.isAir(u), TW = 16 * Z, TH = 11 * Z, ox = cx - 8 * Z, oy = cy - 7 * Z;
    for (let yy = 0; yy < TH; yy++) for (let xx = 0; xx < TW; xx++) {
      const edge = yy === 0 || yy === TH - 1 || xx === 0 || xx === TW - 1;
      if (air && (xx < Z || xx >= TW - Z) && (yy < Z || yy >= TH - Z)) continue; // 항공: 모서리 깎은 타일
      let col;
      if (mono()) {
        // 단색: 청군 = 밝은 타일 + 검은 그림, 적군 = 검은 타일 + 밝은 그림
        col = edge ? (u.side === 'red' ? PAL.silver : PAL.black) : (done ? PAL.gray : u.side === 'blue' ? PAL.white : PAL.black);
      } else {
        col = edge ? PAL.black : (air && yy <= Z ? pal.L : pal.X);
        // 고해상도: 위·왼쪽 밝은 테, 아래·오른쪽 어두운 테 (입체감)
        if (Z === 2 && !edge) { if (yy === 1 || xx === 1) col = pal.L; else if (yy === TH - 2 || xx === TW - 2) col = PAL.night; }
      }
      px(ox + xx, oy + yy, col);
    }
    const fg = mono() ? (done ? PAL.silver : u.side === 'blue' ? PAL.black : PAL.white) : (done ? PAL.silver : PAL.white);
    const shade = mono() ? fg : (done ? PAL.gray : PAL.silver);
    const rows = A.SPR[u.type], w = rows[0].length, flip = u.side === 'red', sx = cx - 7 * Z, sy = cy - 6 * Z;
    rows.forEach((line, y) => {
      for (let x = 0; x < w; x++) {
        const ch = line[flip ? w - 1 - x : x];
        if (ch === '.') continue;
        if (ch === 'D') { px(sx + x, sy + y, mono() ? (u.side === 'blue' && !done ? PAL.gray : PAL.black) : PAL.black); continue; }
        const below = rows[y + 1] ? rows[y + 1][flip ? w - 1 - x : x] : '.';
        px(sx + x, sy + y, Z === 2 && below === '.' ? shade : fg); // 고해상도: 아랫면 그림자
      }
    });
    // 계급 표시: 타일 왼쪽 위에 노란 점 (숙련 1, 정예 2, 영웅 3)
    const rk = R.rankOf(u);
    for (let k = 0; k < rk; k++) {
      const bx = ox + Z + k * 3 * Z, by = oy + Z, n = 2 * Z;
      for (let yy = -1; yy <= n; yy++) for (let xx = -1; xx <= n; xx++) px(bx + xx, by + yy, yy < 0 || xx < 0 || yy === n || xx === n ? PAL.black : PAL.yellow);
    }
    // 격침 목표 함선: 타일 오른쪽 위 노란 점
    if (game.sinkTypes && game.sinkTypes.includes(u.type)) for (let yy = -1; yy <= 2 * Z; yy++) for (let xx = -1; xx <= 2 * Z; xx++) px(ox + 13 * Z + xx, oy + Z + yy, yy < 0 || xx < 0 || yy === 2 * Z || xx === 2 * Z ? PAL.black : PAL.yellow);
    number(u.hp, cx + 9 * Z, cy + 5 * Z, u.hp <= 3 ? PAL.yellow : PAL.white);
  }

  function render(now) {
    now = now || performance.now();
    if (dirty || !base) buildBase();
    img.data.set(base);
    const blink = Math.floor(now / 380) % 2 === 0;
    const mark = (h, col) => { if (h < 0) return; const c = mc(col), d = img.data; for (const i of outlinePix[h]) { const j = i * 4; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; } };
    if (inspect && !sel) mark(inspect.r * game.W + inspect.c, PAL.white);
    if (sel && blink) mark(sel.u.r * game.W + sel.u.c, PAL.yellow);
    if (sel && sel.tgt) mark(sel.tgt.r * game.W + sel.tgt.c, PAL.yellow);
    for (const u of game.units) if (u.hp > 0 && (u.side === viewer() || seen(u.c, u.r))) drawUnit(u);
    // 전투 연출 (피해 숫자)
    anims = anims.filter(a => now - a.t0 < 800);
    for (const a of anims) {
      if (!seen(a.c, a.r) || now < a.t0) continue;
      const k = (now - a.t0) / 800, [cx, cy] = center(a.c, a.r);
      if (k < 0.3) for (let yy = -10 * Z; yy <= 10 * Z; yy++) for (let xx = -11 * Z; xx <= 11 * Z; xx++) if (((xx + yy) & 1) === 0) px(cx + xx, cy + yy, PAL.white);
      number(a.text, cx + 5 * Z, cy - 10 * Z - Math.round(k * 8 * Z), PAL.yellow);
    }
    ctx.putImageData(img, 0, 0);
  }

  let loopOn = false;
  // 피해 숫자가 떠 있을 때만 매 프레임, 선택 깜빡임은 바뀔 때만 다시 그림
  let lastBlink = -1;
  function loop(now) {
    const b = Math.floor(now / 380) % 2;
    if (anims.length || b !== lastBlink) { render(now); lastBlink = b; }
    if (sel || anims.length) requestAnimationFrame(loop); else loopOn = false;
  }
  function kick() { dirty = true; render(); if (!loopOn && (sel || anims.length)) { loopOn = true; requestAnimationFrame(loop); } }

  // ---- 효과음 (사각파) ----
  function tone(seq) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      let t = actx.currentTime;
      for (const [f, d, type] of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d); t += d * 0.9;
      }
    } catch (e) { /* 소리 없이 진행 */ }
  }
  const SFX = {
    select: [[880, 0.05]], move: [[440, 0.05], [660, 0.06]], cancel: [[330, 0.08]],
    hit: [[180, 0.08, 'sawtooth'], [120, 0.12, 'sawtooth']], boom: [[90, 0.1, 'sawtooth'], [60, 0.25, 'sawtooth']],
    capture: [[523, 0.08], [659, 0.08], [784, 0.14]], turn: [[392, 0.1], [523, 0.16]]
  };

  // ---- 정보창 ----
  function bar(v, max) { const n = Math.round(v / max * 10); return '█'.repeat(n) + '·'.repeat(10 - n); }
  function showInfo() {
    const box = $('info');
    if (editor) return showEditorInfo(box);
    if (sel && sel.tgt) {
      const f = R.forecast(game, sel.u, sel.tgt), a = R.stat(sel.u), t = R.stat(sel.tgt);
      box.innerHTML = `<div class="ttl">전투 예측</div>
        <p class="row"><span class="tag ${sel.u.side}">${a.name}</span> HP ${sel.u.hp} → ${Math.max(0, sel.u.hp - f.counter)}</p>
        <p class="row"><span class="tag ${sel.tgt.side}">${t.name}</span> HP ${sel.tgt.hp} → ${Math.max(0, sel.tgt.hp - f.dmg)}</p>
        <p class="dim">예상 피해 ${f.dmg} · 반격 ${f.counter} (±1 변동)</p>`;
      return;
    }
    const at = sel ? { c: sel.u.c, r: sel.u.r } : inspect;
    if (!at) { box.innerHTML = '<div class="ttl">정보</div><p class="dim">유닛이나 칸을 누르면 여기에 정보가 나옵니다.</p>'; return; }
    const u = seenUnitAt(at.c, at.r), t = game.map[at.r][at.c], tr = D.terrain[t];
    const city = game.cities[at.c + ',' + at.r];
    let html = '';
    if (u) {
      const st = R.stat(u);
      html += `<div class="ttl">${uName(u)}</div>
        <p class="row"><span class="tag ${u.side}">${SN(u.side)}</span>${u.acted ? ' <span class="dim">행동 완료</span>' : ''}</p>
        <p class="mono">HP   ${bar(u.hp, 10)} ${u.hp}</p>
        <p class="mono">연료 ${String(u.fuel).padStart(2, ' ')}/${st.fuel}  탄약 ${u.ammo}/${st.ammo}</p>
        <p class="mono">이동 ${st.move}  사거리 ${st.range[0] === st.range[1] ? st.range[0] : st.range.join('~')}</p>
        <p class="mono">대지 ${st.atkG}  대공 ${st.atkA}${st.atkS != null ? '  대함 ' + st.atkS : ''}  방어 ${st.def}</p>${st.carrier ? '<p class="dim">항공모함: 옆 칸 아군 항공기에 매 턴 연료·탄약 보급</p>' : ''}${game.sinkTypes && game.sinkTypes.includes(u.type) ? '<p class="emsg">격침 목표</p>' : ''}
        <p class="mono">계급 ${R.rankName(u)}${R.rankOf(u) < D.ranks.length - 1 ? `  경험 ${u.xp || 0}/${D.ranks[R.rankOf(u) + 1].xp}` : '  (최고 계급)'}</p>`;
    } else html += `<div class="ttl">${(game.labels && game.labels[at.c + ',' + at.r]) || tr.name}</div>`;
    const lbl = game.labels && game.labels[at.c + ',' + at.r], isTgt = game.targets && game.targets.includes(at.c + ',' + at.r);
    html += `${isTgt ? '<p class="emsg">점령 목표</p>' : ''}<p class="dim">${lbl && u ? lbl + ' · ' : ''}지형 ${tr.name} · 방어 +${Math.round(tr.def * 100)}%${city ? ' · ' + (city.owner ? SN(city.owner) + ' 소유' : '중립') : ''}${city && city.by ? ' · 점령치 ' + city.cap : ''}</p>`;
    box.innerHTML = html;
  }

  function showLog() {
    $('log').innerHTML = '<div class="ttl">통신</div>' + game.log.slice(-4).map(m => `<p>${m}</p>`).join('');
  }
  function showHeader() {
    if (editor) {
      const M = editor.M, s = $('side');
      $('turn').textContent = '맵 에디터'; s.textContent = M.name; s.className = 'tag blue';
      const cnt = side => M.setup.filter(u => u.side === side).length;
      $('cities').textContent = `${M.map[0].length}×${M.map.length} · 도시 ${Object.keys(game.cities).length} · 유닛 청${cnt('blue')}:적${cnt('red')}`;
      return;
    }
    $('turn').textContent = `${game.campaign != null ? '작전' + (game.campaign + 1) + ' ' : game.scenario ? curScen().title + ' ' : ''}TURN ${String(game.turn).padStart(2, '0')}/${game.turnLimit || D.turnLimit.limit}`;
    const s = $('side'); s.textContent = SN(game.side) + (mode === 'cpu' && game.side === 'red' ? '(컴퓨터) 행동 중' : ' 지휘 중'); s.className = 'tag ' + game.side;
    const own = c => Object.values(game.cities).filter(x => x.owner === c).length;
    const fs = mode === 'cpu' ? 'blue' : game.side;
    $('cities').textContent = `자금 ${game.funds[fs].toLocaleString()} · 수입 +${R.income(game, fs).toLocaleString()} · 도시 ${SNs('blue').slice(0, 3)}${own('blue')}:${SNs('red').slice(0, 3)}${own('red')}`;
  }

  // ---- 명령 버튼 ----
  function buttons(list) {
    const box = $('cmds'); box.innerHTML = '<div class="ttl">명령</div>';
    const wrap = document.createElement('div'); wrap.className = 'btns';
    list.forEach(([label, fn, cls, dis]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      if (cls) b.className = cls; if (dis) b.disabled = true;
      b.addEventListener('click', fn); wrap.appendChild(b);
    });
    box.appendChild(wrap);
  }
  function showCmds() {
    if (editor) return showEditorCmds();
    if (game.winner) {
      if (game.campaign != null) buttons([['결과 보기', () => showBanner(game.winner === 'blue' ? 'cwin' : 'close'), 'primary'], ['처음 화면', newGame]]);
      else buttons([['새 게임', newGame, 'primary']]);
      return;
    }
    if (aiBusy) { buttons([['적군 작전 중…', () => {}, '', true], speedBtn()]); return; }
    if (!sel) {
      const left = game.units.filter(u => u.side === game.side && u.hp > 0 && !u.acted).length;
      const list = [[`턴 종료 (미행동 ${left})`, endTurn, 'primary'], [`효과음 ${soundOn ? 'ON' : 'OFF'}`, toggleSound]];
      if (factory) {
        const ft = game.map[factory.r][factory.c];
        const list2 = ((game.rosters && game.rosters[game.side]) || D.rosters.classic).map(t => {
          const st = D.units[t], where = st.moveType === 'air' && ft !== 'capital' ? ' (수도만)' : st.moveType === 'ship' && ft !== 'port' ? ' (항구만)' : '';
          return [`${st.name} ${st.cost.toLocaleString()}${where}`, () => doProduce(t), '', !R.canProduce(game, factory.c, factory.r, t)];
        });
        list2.push(['생산 닫기', () => { factory = null; refresh(); }, 'primary']);
        buttons(list2); $('cmds').querySelector('.ttl').textContent = `생산 · 자금 ${game.funds[game.side].toLocaleString()}`;
        return;
      }
      if (saveOpen) {
        const list3 = [];
        for (const n of ['1', '2', '3']) {
          const info = slotInfo(n);
          list3.push([`저장 ${n}${info ? ' (덮어쓰기)' : ''}`, () => saveSlot(n)], [`불러오기 ${n}${info ? ' · ' + info : ' · 비어 있음'}`, () => loadSlot(n), '', !info]);
        }
        const ai = slotInfo('auto');
        list3.push([`자동 저장 불러오기${ai ? ' · ' + ai : ''}`, () => loadSlot('auto'), '', !ai], ['닫기', () => { saveOpen = false; refresh(); }, 'primary']);
        buttons(list3); $('cmds').querySelector('.ttl').textContent = '저장 · 불러오기';
        return;
      }
      if (settingsOpen) {
        buttons([[`배율: ${SCALES[scaleIdx].name}`, cycleScale], [`주사선: ${scanOn ? '켜짐' : '꺼짐'}`, toggleScan],
          [`그래픽: ${Z === 2 ? '고해상도' : '레트로'}`, toggleHires], [`색감: ${COLORS[colorIdx].name}`, cycleColor], [`전장의 안개: ${fogOn ? '켜짐' : '꺼짐'}`, toggleFog], [`배경음악: ${musicOn ? '켜짐' : '꺼짐'}`, toggleMusic], [`전투 연출: ${cutOn ? '켜짐' : '꺼짐'}`, toggleCut], [`인트로: ${introOn ? '켜짐' : '꺼짐'}`, toggleIntro], ['인트로 보기', replayIntro], ['새 게임', newGame], ['설정 닫기', () => { settingsOpen = false; refresh(); }, 'primary']]);
        return;
      }
      if (mode === 'cpu') list.push(levelBtn(), speedBtn());
      list.push(['저장·불러오기', () => { saveOpen = true; tone(SFX.select); refresh(); }], ['설정', () => { settingsOpen = true; tone(SFX.select); refresh(); }]);
      buttons(list);
    } else if (sel.mode === 'move') {
      buttons([['이 자리에서 행동', () => onHex(sel.u.c, sel.u.r)], ['선택 취소', cancel]]);
    } else if (sel.mode === 'action') {
      buttons([
        ['공격', () => { sel.mode = 'target'; sel.tgt = null; refresh(); }, 'primary', !sel.targets.length],
        ['점령', doCapture, sel.canCap ? 'primary' : '', !sel.canCap],
        ['대기', doWait], ['되돌리기', undo]
      ]);
    } else if (sel.mode === 'target') {
      buttons([['공격 실행', doAttack, 'primary', !sel.tgt], ['뒤로', () => { sel.mode = 'action'; sel.tgt = null; refresh(); }]]);
    }
  }

  function refresh() { updateVis(); showHeader(); showInfo(); showLog(); showCmds(); kick(); syncMusic(); }

  // ---- 조작 ----
  function doProduce(t) {
    const u = R.produce(game, factory.c, factory.r, t);
    if (!u) return;
    tone(SFX.capture); factory = null; refresh();
  }
  function select(u) {
    enemyView = null; factory = null;
    const reach = R.reachable(game, u);
    sel = { u, mode: 'move', reach, targets: [], tgt: null };
    tone(SFX.select); refresh();
  }
  function cancel() { sel = null; tone(SFX.cancel); refresh(); }
  function afterMove() {
    sel.mode = 'action'; sel.targets = R.attackTargets(game, sel.u).filter(t => seen(t.c, t.r)); sel.canCap = R.canCapture(game, sel.u); sel.tgt = null;
  }
  function onHex(c, r) {
    if (editor) return editTap(c, r);
    if (game.winner || banner || aiBusy || cut) return;
    const u = seenUnitAt(c, r);
    if (!sel) {
      saveOpen = false;
      inspect = { c, r };
      if (u && u.side === game.side && !u.acted) return select(u);
      enemyView = (u && u.side !== game.side) ? u : null;
      const city = game.cities[c + ',' + r];
      factory = (!u && city && city.owner === game.side) ? { c, r } : null;
      if (factory) settingsOpen = false;
      tone(SFX.select); refresh(); return;
    }
    if (sel.mode === 'move') {
      if (sel.reach.some(p => p.c === c && p.r === r)) {
        R.moveUnit(game, sel.u, c, r); afterMove(); tone(SFX.move); refresh();
      } else if (u && u.side === game.side && !u.acted && u !== sel.u) select(u);
      else cancel();
      return;
    }
    if (sel.mode === 'action' || sel.mode === 'target') {
      if (u && sel.targets.includes(u)) {
        if (sel.mode === 'target' && sel.tgt === u) return doAttack();
        sel.mode = 'target'; sel.tgt = u; tone(SFX.select); refresh();
      }
    }
  }
  function doAttack() {
    if (!sel || !sel.tgt || cut) return;
    const a = sel.u, t = sel.tgt, aHp0 = a.hp, tHp0 = t.hp, res = R.attack(game, a, t);
    if (!res) return;
    battleScene(a, t, res, aHp0, tHp0);
    const now = performance.now();
    anims.push({ c: t.c, r: t.r, text: '-' + res.dmg, t0: now });
    if (res.counter) anims.push({ c: a.c, r: a.r, text: '-' + res.counter, t0: now + 250 });
    tone(res.killed || res.attKilled ? SFX.boom : SFX.hit);
    sel = null; inspect = { c: t.c, r: t.r }; after();
  }
  function doCapture() { const u = sel.u, res = R.capture(game, u); if (!res) return; tone(res.done ? SFX.capture : SFX.move); sel = null; inspect = { c: u.c, r: u.r }; after(); }
  function doWait() { R.wait(game, sel.u); sel = null; tone(SFX.cancel); after(); }
  function undo() { R.undoMove(game, sel.u); select(sel.u); }
  function after() { if (game.winner) gameOver(); refresh(); }
  function endTurn() {
    if (aiBusy || cut) return;
    R.endTurn(game); sel = null; inspect = null; enemyView = null; factory = null;
    if (game.winner) gameOver();
    else if (mode === 'cpu' && game.side === 'red') return runAI();
    else if (mode === 'hot') { showBanner('turn'); saveSlot('auto'); }
    refresh();
  }
  function scrollToHex(c, r) {
    const sc = $('scroll'), [cx] = center(c, r);
    sc.scrollLeft = cx / CW * sc.scrollWidth - sc.clientWidth / 2;
  }
  // 컴퓨터 턴: 유닛 하나씩 D.ai.stepMs 간격으로 행동
  function runAI() {
    aiBusy = true; game.aiFog = fogOn; tone(SFX.turn); refresh();
    const list = AI.unitsInOrder(game);
    let i = 0;
    const step = () => {
      if (game.winner || i >= list.length) {
        if (!game.winner) { if (AI.produceTurn(game).length) tone(SFX.capture); R.endTurn(game); }
        aiBusy = false; inspect = null;
        if (game.winner) gameOver();
        else { saveSlot('auto'); const first = game.units.find(u => u.side === 'blue' && u.hp > 0); if (first) scrollToHex(first.c, first.r); }
        refresh(); return;
      }
      const u = list[i++];
      if (u.hp <= 0) return step();
      const p = AI.plan(game, u);
      const aHp0 = u.hp, tHp0 = p.act.target ? p.act.target.hp : 0;
      const out = AI.execute(game, u, p);
      scrollToHex(u.c, u.r);
      inspect = { c: u.c, r: u.r };
      if (out.type === 'attack') {
        const now = performance.now();
        anims.push({ c: out.target.c, r: out.target.r, text: '-' + out.res.dmg, t0: now });
        if (out.res.counter) anims.push({ c: u.c, r: u.r, text: '-' + out.res.counter, t0: now + 250 });
        tone(out.res.killed || out.res.attKilled ? SFX.boom : SFX.hit);
        refresh();
        battleScene(u, out.target, out.res, aHp0, tHp0).then(() => setTimeout(step, Math.round(D.ai.stepMs * 0.5)));
        return;
      } else tone(out.type === 'capture' ? SFX.capture : SFX.move);
      refresh();
      setTimeout(step, D.ai.stepMs);
    };
    setTimeout(step, Math.round(D.ai.stepMs * 0.9));
  }
  function toggleSound() { soundOn = !soundOn; if (soundOn) tone(SFX.select); refresh(); }

  // ---- 배너 (턴 교대 / 승리) ----
  // ---- 배너 (시작 / 턴 교대 / 승패 / 캠페인 브리핑·결과) ----
  function bannerButtons(list) {
    const box = $('bBtns'); box.innerHTML = '';
    list.forEach(([label, fn, primary]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (primary) b.className = 'primary';
      b.addEventListener('click', () => { $('banner').hidden = true; banner = null; fn(); });
      box.appendChild(b);
    });
    const first = box.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }
  const unitLabel = v => `${D.units[v.type].name}${(v.xp || 0) >= D.ranks[1].xp ? '(' + R.rankName(v) + ')' : ''}`;
  function objective(g) {
    if (g.winRule === 'capture') return `목표: ${g.turnLimit}턴 안에 ${g.targets.map(k => g.labels[k] || k).join('·')}을(를) 모두 점령 (지도의 노란 과녁). 못 하면 ${SNs('red')} 승리.`;
    if (g.winRule === 'sink') return `목표: ${g.turnLimit}턴 안에 ${SNs('red')}의 ${D.units[g.sinkTypes[0]].name} ${g.units.filter(u => g.sinkTypes.includes(u.type)).length}척을 모두 격침 (노란 점 표시). 못 하면 점수 판정.`;
    if (g.winRule === 'survive' && g.scenario) return `목표: ${g.turnLimit}턴 동안 ${g.labels[Object.keys(g.cities).find(k => g.map[k.split(',')[1]][k.split(',')[0]] === 'capital' && g.cities[k].owner === 'blue')] || '수도'}을(를) 지켜라. 적 수도를 점령해도 승리.`;
    return g.winRule === 'survive'
      ? `목표: ${g.turnLimit}턴 동안 수도를 지켜라. 적 수도를 점령하거나 적을 전멸시켜도 승리.`
      : `목표: 적 수도 점령 또는 적 전멸. ${g.turnLimit}턴이 지나면 점수로 판정.`;
  }
  function showBanner(kind) {
    banner = kind;
    const el = $('banner'), s = game.winner === 'draw' ? '' : (game.winner || game.side);
    el.className = 'banner ' + (kind === 'brief' || kind === 'cwin' || kind === 'sbrief' ? 'blue' : kind === 'close' ? 'red' : s);
    const C = D.campaign, N = C.scenarios.length;
    let title = '', text = '', btns = [];
    if (kind === 'start') {
      title = '슈퍼 대전낙';
      text = '클래식 모드: 청군 대 적군. 캠페인, 컴퓨터 대전, 2인 대전, 맵 에디터.\n시나리오 모드: 실제 국가와 병기로 역사 속 전투를 재현.';
      btns = [['클래식 모드', () => showBanner('classic'), true], ['시나리오 모드', () => showBanner('scen')]];
    } else if (kind === 'scen') {
      title = '시나리오 모드';
      text = '전투를 고르세요. 플레이어는 위쪽에 적힌 진영을 지휘합니다.';
      for (const era of D.eras) {
        text += `\n· ${era.name} (${era.years})`;
        for (const sc of D.scenarios.filter(x => x.era === era.id))
          btns.push([`${sc.date.slice(0, 4)} ${sc.title} · ${sc.sides.blue.name.split(' (')[0]} vs ${sc.sides.red.name}`, () => openScenario(sc)]);
      }
      btns.push(['처음 화면', () => showBanner('start')]);
    } else if (kind === 'sbrief') {
      const sc = curScen();
      title = `${sc.title}`;
      text = `${sc.date} · ${sc.sides.blue.name} vs ${sc.sides.red.name}\n\n${sc.brief}\n\n${objective(game)}\n\n[역사] ${sc.history}`;
      btns = [[`1인 · ${SNs('blue')} 지휘 (컴퓨터와 대전)`, () => { mode = 'cpu'; refresh(); }, true], ['2인 · 한 화면 번갈아', () => { mode = 'hot'; refresh(); }], ['시나리오 목록', () => showBanner('scen')]];
    } else if (kind === 'classic') {
      const M = allMaps()[mapIdx] || D.maps[0], prog = loadCamp();
      title = '클래식 모드';
      text = `맵: ${M.name} (${M.note})\n작전 방식을 고르세요. 청군이 먼저 움직입니다.`;
      btns = [
        [`캠페인 · ${prog.idx >= N ? '완료 (처음부터 다시)' : `작전 ${prog.idx + 1}/${N}`}`, openCampaign, true],
        ['1인 · 컴퓨터와 대전', () => { mode = 'cpu'; refresh(); }],
        ['2인 · 한 화면 번갈아', () => { mode = 'hot'; refresh(); }],
        [`맵 바꾸기 (${mapIdx + 1}/${allMaps().length})`, () => { const maps = allMaps(); mapIdx = (mapIdx + 1) % maps.length; store.set('hc88-map', maps[mapIdx].id); newGame(); }],
        ['맵 에디터', () => openEditor(allMaps()[mapIdx] || D.maps[0])],
        ['처음 화면', () => showBanner('start')]
      ];
    } else if (kind === 'turn') {
      title = `TURN ${String(game.turn).padStart(2, '0')}`;
      text = `${SN(game.side)}의 차례입니다. 상대는 화면을 넘겨주세요.`;
      btns = [['작전 개시', refresh, true]];
    } else if (kind === 'win') {
      title = game.winner === 'draw' ? '무승부' : `${SN(game.winner)} 승리`;
      text = endText();
      btns = game.scenario ? [['다시 하기', () => openScenario(curScen()), true], ['시나리오 목록', () => showBanner('scen')], ['처음 화면', newGame]] : [['새 게임', newGame, true]];
    } else if (kind === 'brief') {
      const prog = loadCamp(), sc = C.scenarios[game.campaign], M = D.maps.find(m => m.id === sc.map);
      title = `작전 ${game.campaign + 1}/${N} · ${sc.title}`;
      text = `${sc.brief}\n\n${objective(game)}\n맵: ${M.name} (${M.map[0].length}×${M.map.length})`;
      if (prog.vets && prog.vets.length) text += `\n이어지는 부대 경험: ${prog.vets.map(unitLabel).join(', ')}`;
      if (prog.funds) text += `\n이어지는 자금: +${prog.funds.toLocaleString()}`;
      btns = [['작전 개시', () => { mode = 'cpu'; refresh(); }, true]];
      if (game.campaign > 0) btns.push(['캠페인 처음부터', () => { saveCamp({ idx: 0 }); openCampaign(); }]);
      btns.push(['처음 화면', newGame]);
    } else if (kind === 'cwin') {
      const prog = loadCamp(), last = prog.idx >= N;
      title = last ? '캠페인 완료!' : '작전 성공';
      text = `${C.scenarios[game.campaign].title} — ${endText()}`;
      if (last) text += `\n\n${C.name}을 모두 마쳤습니다.\n` + prog.history.map(h => `${h.idx + 1}. ${C.scenarios[h.idx].title} · ${h.turn}턴`).join('\n');
      else {
        if (prog.vets.length) text += `\n\n다음 작전으로 이어지는 부대: ${prog.vets.map(unitLabel).join(', ')}`;
        if (prog.funds) text += `\n이어지는 자금: +${prog.funds.toLocaleString()}`;
      }
      btns = last ? [['처음 화면', newGame, true]] : [['다음 작전', openCampaign, true], ['처음 화면', newGame]];
    } else if (kind === 'close') {
      title = '작전 실패';
      text = `${C.scenarios[game.campaign].title} — ${endText()}\n같은 부대로 다시 도전할 수 있습니다. 어렵다면 [난이도]를 낮춰 보세요.`;
      btns = [['재도전', openCampaign, true], ['처음 화면', newGame]];
    }
    $('bTitle').textContent = title; $('bText').textContent = text;
    el.hidden = false; tone(SFX.turn);
    const sc = $('scroll'); sc.scrollLeft = s === 'red' && kind === 'turn' ? sc.scrollWidth : 0;
    bannerButtons(btns);
  }
  function endText() {
    const tail = game.log.slice(-2).join(' ');
    return /판정|지켜냈다|목표|방어 성공|주력 함대/.test(tail) ? game.log.slice(-2).join(' · ') : `${game.turn}턴 만에 작전 종료`;
  }

  // ---- 시나리오 모드 ----
  const curScen = () => D.scenarios.find(x => x.id === game.scenario);
  function openScenario(sc) {
    game = R.scenarioGame(sc); sel = null; inspect = null; enemyView = null; anims = []; factory = null; saveOpen = false; settingsOpen = false;
    game.log.push(`${sc.date} ${sc.title}. ${objective(game)}`);
    setupCanvas(); showBanner('sbrief'); refresh();
  }

  // ---- 캠페인 진행 저장 (이 브라우저) ----
  function loadCamp() { try { return JSON.parse(store.get('hc88-camp') || 'null') || { idx: 0 }; } catch (e) { return { idx: 0 }; } }
  function saveCamp(p) { store.set('hc88-camp', JSON.stringify(p)); }
  function openCampaign() {
    let prog = loadCamp();
    if (prog.idx >= D.campaign.scenarios.length) { prog = { idx: 0 }; saveCamp(prog); }
    mode = 'cpu';
    game = R.campaignGame(prog); sel = null; inspect = null; enemyView = null; anims = []; factory = null; saveOpen = false; settingsOpen = false;
    game.log.push(`작전 ${prog.idx + 1}: ${D.campaign.scenarios[prog.idx].title}. ${objective(game)}`);
    setupCanvas(); showBanner('brief'); refresh();
  }
  // 게임이 끝났을 때: 캠페인이면 진행 저장 후 결과 화면
  function gameOver() {
    if (game.campaign == null) return gameOver();
    if (game.campDone) return;
    game.campDone = true;
    if (game.winner === 'blue') {
      const prog = loadCamp();
      if (prog.idx === game.campaign) saveCamp(R.campaignAdvance(game, prog));
      showBanner('cwin');
    } else showBanner('close');
  }

  cv.addEventListener('pointerdown', e => {
    const rect = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * CW / rect.width), y = Math.floor((e.clientY - rect.top) * CH / rect.height);
    if (x < 0 || y < 0 || x >= CW || y >= CH) return;
    const h = hexIdx[y * CW + x]; if (h < 0) return;
    onHex(h % game.W, (h / game.W) | 0);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sel) { if (sel.mode === 'move') cancel(); else if (sel.mode === 'target') { sel.mode = 'action'; sel.tgt = null; refresh(); } } });

  function newGame() {
    game = R.createGame(null, allMaps()[mapIdx] || D.maps[0]); sel = null; inspect = null; enemyView = null; anims = []; factory = null; saveOpen = false; settingsOpen = false;
    game.log.push('작전 개시. 아군 유닛을 눌러 선택 → 시안 칸으로 이동 → 명령을 고르세요.');
    setupCanvas(); showBanner('start'); refresh();
  }

  // ---- 맵 에디터 ----
  const TOOLS = [
    { ch: '.', name: '평지' }, { ch: 'f', name: '숲' }, { ch: 'm', name: '산' }, { ch: 'w', name: '물' },
    { ch: 'c', name: '중립 도시' }, { ch: 'b', name: '청군 도시' }, { ch: 'r', name: '적군 도시' },
    { ch: 'B', name: '청군 수도' }, { ch: 'R', name: '적군 수도' }, { ch: 's', name: '해안' },
    { ch: 'p', name: '중립 항구' }, { ch: 'h', name: '청군 항구' }, { ch: 'k', name: '적군 항구' }
  ];
  const SIZES = [[12, 9], [14, 10], [16, 11], [18, 12]];
  const UTYPES = D.rosters.classic;   // 맵 에디터는 클래식 유닛으로 배치
  function openEditor(src) {
    const isCustom = !D.maps.some(m => m.id === src.id);
    editor = {
      M: { id: isCustom ? src.id : 'custom-' + Date.now().toString(36), name: isCustom ? src.name : src.name + ' (수정본)', note: '직접 만든 맵',
        redBonus: src.redBonus == null ? 3000 : src.redBonus, map: src.map.slice(), setup: src.setup.map(u => Object.assign({}, u)) },
      tool: '.', utype: 'INF', uside: 'blue', sizeIdx: 1, msg: [], code: ''
    };
    sel = null; inspect = null; enemyView = null; factory = null; settingsOpen = false; saveOpen = false;
    rebuildEditor(true);
  }
  function rebuildEditor(resize) {
    const prevW = game ? game.W : 0, prevH = game ? game.H : 0;
    game = R.createGame(null, editor.M);
    if (resize || game.W !== prevW || game.H !== prevH) setupCanvas();
    refresh();
  }
  const terrainOf = ch => D.legend[ch].t;
  function editTap(c, r) {
    const M = editor.M, rows = M.map;
    const setCh = (cc, rr, ch) => { rows[rr] = rows[rr].slice(0, cc) + ch + rows[rr].slice(cc + 1); };
    if (editor.tool === 'unit') {
      const i = M.setup.findIndex(u => u.c === c && u.r === r);
      if (i >= 0) M.setup.splice(i, 1);
      else if (D.moveCost[D.units[editor.utype].moveType][terrainOf(rows[r][c])] != null) M.setup.push({ side: editor.uside, type: editor.utype, c, r });
      else { editor.msg = [`${D.units[editor.utype].name}은(는) ${D.terrain[terrainOf(rows[r][c])].name}에 놓을 수 없습니다.`]; tone(SFX.cancel); return refresh(); }
    } else {
      const ch = editor.tool;
      if (ch === 'B' || ch === 'R') rows.forEach((row, rr) => { const k = row.indexOf(ch); if (k >= 0) setCh(k, rr, ch === 'B' ? 'b' : 'r'); });
      setCh(c, r, ch);
      M.setup = M.setup.filter(u => D.moveCost[D.units[u.type].moveType][terrainOf(rows[u.r][u.c])] != null);
    }
    editor.msg = []; editor.code = ''; tone(SFX.move); rebuildEditor(false);
  }
  function mirrorMap() {
    const M = editor.M, W = M.map[0].length, half = Math.floor(W / 2), sw = { b: 'r', B: 'R', r: 'b', R: 'B' };
    M.map = M.map.map(row => { const left = row.slice(0, half); const mid = W % 2 ? row[half] : ''; return left + mid + left.split('').reverse().map(ch => sw[ch] || ch).join(''); });
    const left = M.setup.filter(u => u.c < half);
    M.setup = left.concat(left.map(u => ({ side: u.side === 'blue' ? 'red' : 'blue', type: u.type, c: W - 1 - u.c, r: u.r })));
    editor.msg = ['왼쪽 절반을 오른쪽에 대칭으로 복사했습니다. (청↔적 바뀜)']; tone(SFX.capture); rebuildEditor(false);
  }
  function blankMap() {
    editor.sizeIdx = (editor.sizeIdx + 1) % SIZES.length;
    const [W, H] = SIZES[editor.sizeIdx], mid = Math.floor(H / 2);
    const rows = [];
    for (let r = 0; r < H; r++) { let row = '.'.repeat(W); if (r === mid) row = 'B' + 'b' + row.slice(2, W - 2) + 'r' + 'R'; rows.push(row); }
    editor.M.map = rows;
    editor.M.setup = [{ side: 'blue', type: 'INF', c: 1, r: mid }, { side: 'red', type: 'INF', c: W - 2, r: mid }];
    editor.msg = [`${W}×${H} 빈 맵을 만들었습니다.`]; tone(SFX.select); rebuildEditor(true);
  }
  function checkMap() { const e = R.validateMap(editor.M); editor.msg = e.length ? e : ['문제 없음. 저장하고 플레이할 수 있습니다.']; tone(e.length ? SFX.cancel : SFX.capture); refresh(); return !e.length; }
  function saveMap() {
    if (!checkMap()) return false;
    const list = customMaps(), i = list.findIndex(m => m.id === editor.M.id), copy = JSON.parse(JSON.stringify(editor.M));
    if (i >= 0) list[i] = copy; else { if (list.length >= 8) { editor.msg = ['직접 만든 맵은 8개까지 저장됩니다. 하나를 지운 뒤 저장하세요.']; return refresh(), false; } list.push(copy); }
    saveCustomMaps(list); editor.msg = [`"${editor.M.name}" 저장 완료. 시작 화면의 [맵 바꾸기]에서 고를 수 있습니다.`]; refresh(); return true;
  }
  function deleteMap() {
    const list = customMaps().filter(m => m.id !== editor.M.id);
    if (list.length === customMaps().length) { editor.msg = ['아직 저장하지 않은 맵입니다.']; return refresh(); }
    saveCustomMaps(list); editor.msg = ['저장된 맵을 지웠습니다. 화면의 맵은 그대로 남아 있습니다.']; tone(SFX.cancel); refresh();
  }
  function playMap() {
    if (!saveMap()) return;
    mapIdx = allMaps().findIndex(m => m.id === editor.M.id); store.set('hc88-map', editor.M.id);
    editor = null; newGame();
  }
  function exitEditor() { editor = null; newGame(); }
  function copyCode() {
    const M = editor.M;
    editor.code = JSON.stringify({ id: M.id, redBonus: M.redBonus, name: M.name, note: M.note, map: M.map, setup: M.setup }, null, 1);
    const ok = () => { editor.msg = ['맵 코드를 복사했습니다. Claude Code에 붙여넣고 "data.js maps에 추가해줘"라고 하면 기본 맵이 됩니다.']; editor.code = ''; refresh(); };
    const fail = () => { editor.msg = ['자동 복사가 안 돼서 아래에 코드를 띄웠습니다. 길게 눌러 전체 선택 후 복사하세요.']; refresh(); };
    try { navigator.clipboard.writeText(editor.code).then(ok, fail); } catch (e) { fail(); }
  }
  function showEditorInfo(box) {
    const M = editor.M;
    box.innerHTML = `<div class="ttl">맵 정보</div>
      <label class="dim" for="mapName">맵 이름</label>
      <input id="mapName" type="text" maxlength="20" value="">
      <p class="dim">적군 시작자금 보정 +${M.redBonus.toLocaleString()} (후공 보정)</p>
      ${editor.msg.map(m => `<p class="emsg">${m}</p>`).join('')}
      ${editor.code ? '<textarea id="mapCode" rows="6" readonly></textarea>' : ''}
      <p class="dim">도구를 고른 뒤 지도를 누르면 칠해집니다. 유닛 놓기에서 유닛이 있는 칸을 누르면 지워집니다.</p>`;
    const inp = $('mapName'); inp.value = M.name;
    inp.addEventListener('input', () => { M.name = inp.value.trim() || '이름 없는 맵'; showHeader(); });
    if (editor.code) $('mapCode').value = editor.code;
  }
  function showEditorCmds() {
    const box = $('cmds'); box.innerHTML = '<div class="ttl">맵 에디터</div>';
    const group = (title, items, cls) => {
      const h = document.createElement('p'); h.className = 'sub'; h.textContent = title; box.appendChild(h);
      const w = document.createElement('div'); w.className = 'btns ' + (cls || ''); box.appendChild(w);
      items.forEach(([label, fn, on, dis]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (on) b.className = 'primary'; if (dis) b.disabled = true; b.addEventListener('click', fn); w.appendChild(b); });
    };
    group('지형 칠하기', TOOLS.map(t => [t.name, () => { editor.tool = t.ch; tone(SFX.select); refresh(); }, editor.tool === t.ch]), 'tools');
    const ut = D.units[editor.utype];
    group('유닛 배치', [
      [`유닛 놓기: ${ut.name}`, () => { if (editor.tool === 'unit') editor.utype = UTYPES[(UTYPES.indexOf(editor.utype) + 1) % UTYPES.length]; editor.tool = 'unit'; tone(SFX.select); refresh(); }, editor.tool === 'unit'],
      [`진영: ${SN(editor.uside)}`, () => { editor.uside = editor.uside === 'blue' ? 'red' : 'blue'; editor.tool = 'unit'; tone(SFX.select); refresh(); }, false]
    ]);
    const [W, H] = SIZES[(editor.sizeIdx + 1) % SIZES.length];
    group('작업', [
      ['좌우 대칭 복사', mirrorMap], ['맵 검사', checkMap], ['저장', saveMap], ['이 맵으로 시작', playMap, true],
      ['코드 복사', copyCode], [`빈 맵 ${W}×${H}`, blankMap], ['저장된 맵 지우기', deleteMap], ['나가기', exitEditor]
    ], 'tools');
  }

  // ---- 전투 연출 (PC-98식 컷인: 좌 공격측, 우 방어측, HP 1당 병력 아이콘 1개) ----
  const ccv = $('cutcv'), cctx = ccv.getContext('2d'), CCW = 240, CCH = 96;
  let cut = null;
  const GROUND = { plain: [PAL.green, PAL.lgreen], forest: [PAL.dgreen, PAL.green], mountain: [PAL.brown, PAL.tan], water: [PAL.navy, PAL.blue], city: [PAL.gray, PAL.silver], capital: [PAL.gray, PAL.silver], port: [PAL.navy, PAL.gray], beach: [PAL.tan, PAL.brown] };
  function battleScene(a, t, res, aHp0, tHp0) {
    if (!cutOn || (!seen(t.c, t.r) && !seen(a.c, a.r))) return Promise.resolve();
    return new Promise(done => {
      const dur = res.counter || res.attKilled ? 2000 : 1300;
      cut = { a, t, res, aHp0, tHp0, aT: game.map[a.r][a.c], tT: game.map[t.r][t.c], t0: performance.now(), dur, done };
      const an = a.name || R.stat(a).name, tn = t.name || R.stat(t).name;
      $('cuttxt').textContent = `${SN(a.side)} ${an} → ${SN(t.side)} ${tn} · 피해 ${res.dmg}${res.counter ? ' · 반격 ' + res.counter : ''}${res.killed ? (R.isShip(t) ? ' · 격침!' : ' · 격파!') : ''}${res.attKilled ? ' · 공격측 전멸!' : ''}`;
      $('cutin').hidden = false;
      requestAnimationFrame(cutLoop);
    });
  }
  function endCut() { if (!cut) return; const d = cut.done; cut = null; $('cutin').hidden = true; refresh(); d(); }
  $('cutin').addEventListener('pointerdown', e => { e.stopPropagation(); endCut(); });
  function cpx(d, x, y, col) { if (x < 0 || y < 0 || x >= CCW || y >= CCH) return; const i = (y * CCW + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
  function cutLoop(now) {
    if (!cut) return;
    const k = now - cut.t0;
    if (k >= cut.dur) return endCut();
    const id = cctx.createImageData(CCW, CCH), d = id.data;
    // 배경: 하늘 + 각자 지형의 땅
    for (let y = 0; y < CCH; y++) for (let x = 0; x < CCW; x++) {
      const left = x < CCW / 2, ter = left ? cut.aT : cut.tT, g = GROUND[ter];
      let col = y < 44 ? ((y * 7 + x * 3) % 53 === 0 ? PAL.silver : PAL.night) : (((x * 5 + y * 11) % 7 === 0) ? g[1] : g[0]);
      if (x === CCW / 2 - 1 || x === CCW / 2) col = PAL.black;
      cpx(d, x, y, col);
    }
    // 단계: 0~500 공격측 사격, 500~900 방어측 손실, (반격) 900~1400 방어측 사격, 1400~1800 공격측 손실
    const fireA = k < 500, lossT = Math.min(1, Math.max(0, (k - 500) / 400));
    const fireT = cut.res.counter && k >= 900 && k < 1400, lossA = cut.res.counter ? Math.min(1, Math.max(0, (k - 1400) / 400)) : 0;
    const tShow = cut.tHp0 - Math.floor(cut.res.dmg * lossT), aShow = cut.aHp0 - Math.floor(cut.res.counter * lossA);
    drawSquad(d, cut.a, aShow, false, fireA, now, k >= 1400 && lossA < 1 && cut.res.counter ? aShow - 1 : -1);
    drawSquad(d, cut.t, tShow, true, fireT, now, lossT > 0 && lossT < 1 ? tShow - 1 : -1);
    if (mono()) monoPass(d);
    cctx.putImageData(id, 0, 0);
    requestAnimationFrame(cutLoop);
  }
  function drawSquad(d, u, n, right, firing, now, hit) {
    const air = R.isAir(u), rows = SPR[u.type], blink = Math.floor(now / 70) % 2 === 0;
    const body = mono() ? (u.side === 'blue' ? PAL.white : PAL.silver) : SIDE_COL[u.side].L;
    for (let i = 0; i < n; i++) {
      const col = i % 5, row = (i / 5) | 0;
      const x = right ? CCW - 10 - 14 - col * 21 : 10 + col * 21;
      const y = (air ? 10 : 52) + row * 18 + (col % 2) * 3;
      if (i === hit && blink) { for (let yy = -2; yy < 11; yy++) for (let xx = -2; xx < 16; xx++) if (((xx + yy) & 1) === 0) cpx(d, x + xx, y + yy, PAL.yellow); continue; }
      rows.forEach((line, yy) => { for (let xx = 0; xx < 14; xx++) { const ch = line[right ? 13 - xx : xx]; if (ch === '.') continue; cpx(d, x + xx + 1, y + yy + 1, PAL.black); } });
      rows.forEach((line, yy) => { for (let xx = 0; xx < 14; xx++) { const ch = line[right ? 13 - xx : xx]; if (ch === '.') continue; cpx(d, x + xx, y + yy, ch === 'D' ? PAL.black : body); } });
      if (firing && blink) {
        const mx = right ? x - 3 : x + 15, my = y + 3;
        for (let yy = -1; yy <= 1; yy++) for (let xx = 0; xx < 3; xx++) cpx(d, mx + xx, my + yy, yy === 0 ? PAL.white : PAL.yellow);
        const tx = right ? mx - ((now / 4) % 60) : mx + ((now / 4) % 60);
        cpx(d, Math.round(tx), my, PAL.yellow); cpx(d, Math.round(tx) + (right ? 1 : -1), my, PAL.yellow);
      }
    }
  }

  // 미리보기 갱신 시 진행 상황 유지
  function start(saved) {
    if (saved && saved.game) {
      window.HC_RESTORED = true;   // 미리보기 갱신으로 이어받은 게임: 인트로 생략
      game = Object.assign(R.createGame(), saved.game, { rng: Math.random }); mode = saved.mode || 'cpu';
      setupCanvas(); refresh();
    } else newGame();
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ mode, game: Object.assign({}, game, { rng: undefined }) }));
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data);
})();
