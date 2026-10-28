// 슈퍼 대전낙 — 인트로 (부팅 화면 → 전장 시네마틱 → 타이틀 로고 → 메뉴)
// 그림은 320×200 캔버스에 픽셀 단위로 그리고 확대한다. 글자(자막·부팅 문구)는 선명하도록 HTML로 표시.
// 화면 누르기 / Enter·Space: 다음 단계로, [건너뛰기]: 타이틀로, 타이틀에서 누르면 메뉴로.
(function () {
  'use strict';
  const D = window.HC_DATA, Music = window.HCMusic;
  const W = 320, H = 200;
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const P = {
    black: hex('#000000'), night: hex('#0a0d1c'), navy: hex('#1c2f8f'), blue: hex('#4a7bff'), sky: hex('#a8ccff'),
    cyan: hex('#58e0ee'), dgreen: hex('#1d5626'), green: hex('#3b8f37'), brown: hex('#7a4a1e'), tan: hex('#d0a35c'),
    red: hex('#e8433f'), pink: hex('#ffb3a1'), gray: hex('#6b6f7a'), silver: hex('#b9bcc6'), white: hex('#f4f4f4'), yellow: hex('#ffd23f')
  };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } } };
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BOOT = [
    'HC-88 SYSTEM BIOS  Ver 1.00',
    'MEMORY  640KB ............ OK',
    'FM SOUND BOARD ........... OK',
    `MAP DATA  ${D.maps.length} · SCENARIO ${D.scenarios.length} ..... OK`,
    `UNIT DATA  ${Object.keys(D.units).length} TYPES ......... OK`,
    '',
    '준비 완료.  화면을 누르세요 ▶'
  ];
  const CAPTIONS = [
    [0.4, '19XX년, 오래된 국경의 침묵이 깨졌다.'],
    [3.4, '전차는 평원을 가르고, 하늘은 불꽃으로 물들었다.'],
    [6.3, '지휘관, 이제 당신의 차례다.']
  ];
  const FILM_END = 8.6;

  // ---- DOM ----
  const el = document.createElement('div');
  el.id = 'intro'; el.hidden = true;
  el.innerHTML = '<div class="ibox"><div class="iscreen"><canvas id="introCv" width="320" height="200" aria-label="인트로 화면"></canvas><pre class="iboot" id="introBoot"></pre></div>' +
    '<p class="icap" id="introCap"></p></div><button type="button" class="iskip" id="introSkip">건너뛰기 ▶▶</button>';
  document.body.appendChild(el);
  const cv = el.querySelector('#introCv'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const bootEl = el.querySelector('#introBoot'), capEl = el.querySelector('#introCap'), skipEl = el.querySelector('#introSkip');

  // ---- 픽셀 도구 ----
  let shakeX = 0, shakeY = 0;   // '쿵' 할 때 화면 흔들림
  function px(x, y, c) { x = (x + shakeX) | 0; y = (y + shakeY) | 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  function rect(x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c); }
  function sprite(rows, ox, oy, s, map, flip) {
    const w = rows[0].length;
    rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const ch = row[flip ? w - 1 - x : x]; if (ch === '.' || !map[ch]) continue; rect(ox + x * s, oy + y * s, s, s, map[ch]); } });
  }
  // 결정적 난수 (매 프레임 같은 별 위치)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const STARS = Array.from({ length: 70 }, () => [rnd() * W | 0, rnd() * 112 | 0, rnd() * 6.28]);

  // ---- 배경 (밤하늘·달·별) ----
  function sky(t) {
    for (let y = 0; y < H; y++) {
      const band = y < 40 ? 0 : y < 75 ? 1 : y < 105 ? 2 : 3;
      for (let x = 0; x < W; x++) {
        let c = band === 0 ? P.black : band === 1 ? (((x + y) & 3) === 0 ? P.night : P.black) : band === 2 ? P.night : (((x + y) & 1) ? P.navy : P.night);
        px(x, y, c);
      }
    }
    for (const [x, y, ph] of STARS) if (Math.sin(t * 2.3 + ph) > -0.2) px(x, y, Math.sin(t * 2.3 + ph) > 0.7 ? P.white : P.gray);
    // 달
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (x * x + y * y <= 121) px(262 + x, 30 + y, (x * x + y * y > 90 || (x + 3) * (x + 3) + (y - 2) * (y - 2) < 9 || (x - 5) * (x - 5) + (y + 4) * (y + 4) < 5) ? P.silver : P.white);
  }
  // 탐조등 (지상에서 하늘로 흔들리는 빛줄기)
  function searchlight(x0, t, phase) {
    const a = -Math.PI / 2 + Math.sin(t * 0.7 + phase) * 0.55;
    for (let r = 0; r < 140; r++) {
      const cx = x0 + Math.cos(a) * r, cy = 148 + Math.sin(a) * r, half = 1 + r * 0.07;
      for (let k = -half; k <= half; k++) {
        const x = cx + Math.cos(a + Math.PI / 2) * k, y = cy + Math.sin(a + Math.PI / 2) * k;
        if (((x | 0) + (y | 0)) % 3 === 0) px(x, y, r < 60 ? P.sky : P.blue);
      }
    }
  }
  function hills(t, speed, base, amp, c1, c2) {
    for (let x = 0; x < W; x++) {
      const v = x + t * speed, top = base + amp * Math.sin(v / 23) + amp * 0.6 * Math.sin(v / 9);
      for (let y = top | 0; y < 152; y++) px(x, y, ((x + y) & 1) ? c1 : c2);
    }
  }
  function ground(t) {
    for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) {
      const v = (x + t * 70) | 0;
      px(x, y, y === 150 ? P.gray : ((v * 7 + y * 13) % 29 === 0 ? P.brown : (y < 160 ? P.night : P.black)));
    }
  }
  // 폭발: 지평선 위 섬광
  const BOOMS = [[1.2, 90], [2.6, 210], [3.3, 150], [4.8, 260], [5.6, 60], [6.9, 190], [7.6, 120]];
  function booms(t) {
    for (const [t0, x] of BOOMS) {
      const k = t - t0; if (k < 0 || k > 0.9) continue;
      const r = Math.min(14, k * 40), col = k < 0.15 ? P.white : k < 0.35 ? P.yellow : k < 0.6 ? P.red : P.brown;
      for (let y = -r; y <= 0; y++) for (let xx = -r; xx <= r; xx++) if (xx * xx + y * y <= r * r && ((xx + y) & 1 || k < 0.35)) px(x + xx, 128 + y, col);
    }
  }
  const SIL = { W: P.gray, D: P.black };
  const RIM = { W: P.silver, D: P.black };
  function convoy(t) {
    const list = [['TNK', 0, 34], ['SPG', 70, 30], ['TNK', 140, 34], ['AAA', 205, 28], ['RCN', 260, 40], ['MRL', 330, 26]];
    for (const [type, off, sp] of list) {
      const u = D.units[type]; if (!u) continue;
      const x = ((t * sp + off) % 420) - 50;
      sprite(u.sprite, x, 128, 2, SIL);
      sprite([u.sprite[0], u.sprite[1], u.sprite[2]], x, 128, 2, RIM);   // 달빛 테두리
      if (Math.sin(t * 5 + off) > 0.97) rect(x + 29, 132, 4, 2, P.yellow);  // 포구 섬광
    }
  }
  function aircraft(t) {
    const jets = [[0.6, 46, 140, 'FTR'], [1.0, 60, 130, 'FTR'], [3.8, 34, 120, 'BMB'], [4.4, 52, 115, 'BMB'], [5.9, 70, 150, 'FTR']];
    for (const [t0, y, sp, type] of jets) {
      const k = t - t0; if (k < 0) continue;
      const x = -40 + k * sp; if (x > W + 10) continue;
      for (let i = 4; i < 60; i += 2) px(x - i, y + 9, i < 30 ? P.silver : P.gray); // 비행운
      sprite(D.units[type].sprite, x, y, 2, { W: P.silver, D: P.black });
    }
  }

  // ---- 로고 '슈퍼 대전낙' (글꼴을 작게 그린 뒤 1비트로 만들어 픽셀화, 금속 띠 색칠) ----
  let LOGO = null;
  function buildLogo() {
    const LW = 300, LH = 96, oc = document.createElement('canvas'); oc.width = LW; oc.height = LH;
    const o = oc.getContext('2d');
    o.fillStyle = '#fff'; o.textBaseline = 'alphabetic';
    o.font = '54px "Black Han Sans", "Noto Sans KR", "Malgun Gothic", sans-serif';
    const big = '대전낙', bw = o.measureText(big).width;
    const bx = Math.round((LW - bw) / 2 + 14);
    o.fillText(big, bx, 78);
    const bigMask = o.getImageData(0, 0, LW, LH).data;
    o.clearRect(0, 0, LW, LH);
    o.font = '26px "Black Han Sans", "Noto Sans KR", "Malgun Gothic", sans-serif';
    o.fillText('슈퍼', bx - 40, 40);
    const smallMask = o.getImageData(0, 0, LW, LH).data;
    o.clearRect(0, 0, LW, LH);
    o.font = '8px "Press Start 2P", monospace';
    o.fillText('HEX COMMAND 88', Math.round((LW - o.measureText('HEX COMMAND 88').width) / 2), 94);
    const subMask = o.getImageData(0, 0, LW, LH).data;
    const raw = (m, x, y) => x >= 0 && y >= 0 && x < LW && y < LH && m[(y * LW + x) * 4 + 3] > 110;
    // 1픽셀 굵게 (어느 글꼴이 쓰여도 레트로 로고처럼 두껍게)
    const at = (m, x, y) => m === subMask ? raw(m, x, y) : raw(m, x, y) || raw(m, x - 1, y) || raw(m, x, y - 1);
    // 글자 높이 범위 (색 띠 계산용)
    let y0 = LH, y1 = 0, s0 = LH, s1 = 0;
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      if (at(bigMask, x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (at(smallMask, x, y)) { s0 = Math.min(s0, y); s1 = Math.max(s1, y); }
    }
    const pix = new Array(LW * LH).fill(null);
    const gold = (y, x) => { const k = (y - y0) / Math.max(1, y1 - y0); if (k < 0.16) return P.white; if (k < 0.34) return P.yellow; if (k < 0.46) return ((x + y) & 1) ? P.yellow : P.tan; if (k < 0.52) return P.white; if (k < 0.74) return P.tan; return ((x + y) & 1) ? P.brown : P.tan; };
    const steel = (y, x) => { const k = (y - s0) / Math.max(1, s1 - s0); return k < 0.3 ? P.white : k < 0.6 ? P.sky : ((x + y) & 1) ? P.blue : P.sky; };
    const isText = (x, y) => at(bigMask, x, y) || at(smallMask, x, y);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      if (at(bigMask, x, y)) pix[y * LW + x] = gold(y, x);
      else if (at(smallMask, x, y)) pix[y * LW + x] = steel(y, x);
      else if (at(subMask, x, y)) pix[y * LW + x] = P.cyan;
    }
    // 그림자(오른쪽 아래 빨강) → 검은 외곽선
    const out = pix.slice();
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const i = y * LW + x; if (pix[i]) continue;
      if (isText(x - 3, y - 3) || isText(x - 2, y - 2)) out[i] = P.red;
    }
    const fin = out.slice();
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const i = y * LW + x; if (out[i]) continue;
      for (let dy = -1; dy <= 1 && !fin[i]; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= LW || ny >= LH) continue;
        if (out[ny * LW + nx] && out[ny * LW + nx] !== P.black) { fin[i] = P.black; break; }
      }
    }
    LOGO = { w: LW, h: LH, pix: fin, glyph: (x, y) => isText(x, y) };
  }
  function drawLogo(ox, oy, t) {
    if (!LOGO) return;
    const glint = ((t % 3) / 3) * (LOGO.w + 120) - 60;   // 비스듬히 지나가는 반짝임
    for (let y = 0; y < LOGO.h; y++) for (let x = 0; x < LOGO.w; x++) {
      const c = LOGO.pix[y * LOGO.w + x]; if (!c) continue;
      const g = LOGO.glyph(x, y) && Math.abs((x + y * 0.6) - glint) < 3;
      px(ox + x, oy + y, g ? P.white : c);
    }
  }

  // ---- 타이틀 개그: 절벽에서 떨어지는 전차 ----
  const CLIFF = 236;            // 절벽 끝 x 좌표 (여기부터 오른쪽은 낭떠러지)
  const GAG_START = 1.3, GAG_CYCLE = 6.5;
  // 기울인 스프라이트 (행마다 옆으로 밀어 앞으로 고꾸라지는 느낌)
  function spriteTilt(rows, ox, oy, s, map, tilt) {
    const w = rows[0].length;
    rows.forEach((row, y) => { const sh = Math.round((y - rows.length / 2) * -tilt); for (let x = 0; x < w; x++) { const ch = row[x]; if (ch === '.' || !map[ch]) continue; rect(ox + x * s + sh * s, oy + y * s + Math.round(x * tilt * 0.6) * s, s, s, map[ch]); } });
  }
  function cliffGround(t) {
    for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < CLIFF) {
        const v = (x + t * 0) | 0;
        px(x, y, y === 150 ? P.gray : x >= CLIFF - 3 ? (((y >> 1) + x) & 1 ? P.brown : P.tan) : ((v * 7 + y * 13) % 29 === 0 ? P.brown : (y < 160 ? P.night : P.black)));
      } else px(x, y, y > 190 ? P.black : (((x + y) & 3) === 0 ? P.night : P.black));   // 끝이 안 보이는 낭떠러지
    }
    // 절벽 끝 경고 표지판
    rect(CLIFF - 14, 136, 1, 14, P.brown); rect(CLIFF - 19, 132, 11, 6, P.yellow); rect(CLIFF - 15, 133, 2, 3, P.black); rect(CLIFF - 15, 137, 2, 1, P.black);
  }
  // 픽셀 느낌표
  function bang(x, y) { rect(x, y, 3, 7, P.black); rect(x + 1, y + 1, 1, 4, P.yellow); rect(x, y + 8, 3, 3, P.black); rect(x + 1, y + 9, 1, 1, P.yellow); }
  // '쿵!' 글자 (한 번만 만들어 둠)
  let KUNG = null;
  function buildKung() {
    const oc = document.createElement('canvas'); oc.width = 64; oc.height = 30; const o = oc.getContext('2d');
    o.fillStyle = '#fff'; o.font = '24px "Black Han Sans", "Noto Sans KR", "Malgun Gothic", sans-serif'; o.textBaseline = 'alphabetic'; o.fillText('쿵!', 4, 25);
    const m = o.getImageData(0, 0, 64, 30).data, on = (x, y) => x >= 0 && y >= 0 && x < 64 && y < 30 && (m[(y * 64 + x) * 4 + 3] > 110 || (x > 0 && m[(y * 64 + x - 1) * 4 + 3] > 110));
    KUNG = []; for (let y = 0; y < 30; y++) for (let x = 0; x < 64; x++) {
      if (on(x, y)) KUNG.push([x, y, y < 12 ? P.yellow : P.red]);
      else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) KUNG.push([x, y, P.black]);
    }
  }
  let lastImpact = -1;
  function gag(t) {
    if (t < GAG_START) return 0;
    const cyc = Math.floor((t - GAG_START) / GAG_CYCLE), k = (t - GAG_START) % GAG_CYCLE;
    const tank = D.units.TNK.sprite, inf = D.units.INF.sprite, TW = 28;
    const tankColors = { W: P.silver, D: P.black };
    // 1) 전차가 오른쪽으로 달림 (0 ~ 2.4초)  2) 절벽을 지나 허공에서 멈춤, "!"  3) 추락  4) 쿵!
    const runEnd = 2.4, speed = (CLIFF + 6 + 30) / runEnd;
    let impactK = null;
    if (k < runEnd) {
      const x = -30 + k * speed;
      sprite(tank, x, 132, 2, tankColors);
      if (((k * 12) | 0) % 2) rect(x - 4, 146, 2, 2, P.gray);   // 흙먼지
    } else if (k < runEnd + 0.55) {
      const x = CLIFF + 6;
      sprite(tank, x, 132, 2, tankColors);
      if (k > runEnd + 0.12) bang(x + 12, 118);                 // 아래를 보고 "!"
    } else if (k < runEnd + 1.25) {
      const f = k - (runEnd + 0.55), y = 132 + 0.5 * 320 * f * f;   // 처음엔 천천히, 점점 빨리
      spriteTilt(tank, CLIFF + 6 + f * 14, y, 2, tankColors, Math.min(0.5, f * 1.1));
    } else impactK = k - (runEnd + 1.25);
    // 보병: 뒤따라오다 절벽 앞에서 멈추고, 쿵 소리 뒤 돌아서서 슬금슬금 돌아감
    const ik = k - 0.9;
    if (ik > 0) {
      const stopX = CLIFF - 34, walkX = Math.min(stopX, -20 + ik * 60);
      if (impactK == null || impactK < 0.6) sprite(inf, walkX, 132, 2, { W: P.white, D: P.black });
      else sprite(inf, stopX - (impactK - 0.6) * 45, 132, 2, { W: P.white, D: P.black }, true);
      if (impactK != null && impactK < 0.6 && impactK > 0.1) bang(walkX + 10, 118);
    }
    // 쿵!: 먼지 구름 + 글자 + 흔들림
    if (impactK != null && impactK < 1.4) {
      if (lastImpact !== cyc) { lastImpact = cyc; if (armed && Music) { Music.blip(90, 0.25); setTimeout(() => Music.blip(60, 0.3), 60); } }
      const r = 6 + impactK * 22;
      for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.15 + 0.7 * i / 8), cx = CLIFF + 26 + Math.cos(a) * r, cy = 199 + Math.sin(a) * r * 0.8; for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) if (xx * xx + yy * yy <= 9 && ((xx + yy) & 1 || impactK < 0.5)) px(cx + xx, cy + yy, impactK < 0.4 ? P.silver : P.gray); }
      if (KUNG && impactK < 1.1) { const jx = CLIFF + 10, jy = 150 - Math.min(10, impactK * 40); for (const [x, y, c] of KUNG) px(jx + x, jy + y, c); }
      return impactK < 0.35 ? Math.round((1 - impactK / 0.35) * 3) : 0;   // 흔들림 세기
    }
    return 0;
  }

  // ---- 진행 ----
  let phase = 'off', t0 = 0, rafId = 0, armed = false, typed = '', capIdx = -1, capTimer = 0, onDone = null;
  const musicOn = () => store.get('hc88-music') !== 'off';
  function setCaption(text) {
    clearInterval(capTimer); let i = 0; capEl.textContent = '';
    capTimer = setInterval(() => {
      i++; capEl.textContent = text.slice(0, i);
      if (armed && i % 2 === 0 && text[i - 1] !== ' ') Music && Music.blip(1400 + (i % 3) * 120, 0.02);
      if (i >= text.length) clearInterval(capTimer);
    }, 45);
  }
  function frame(now) {
    const t = (now - t0) / 1000;
    if (phase === 'boot' || phase === 'wait') {
      d.fill(0); for (let i = 3; i < d.length; i += 4) d[i] = 255;
      const lines = Math.min(BOOT.length, Math.floor(t / 0.32) + 1);
      if (lines >= BOOT.length && phase === 'boot') phase = 'wait';
      let txt = BOOT.slice(0, lines).join('\n');
      if (phase === 'wait' && Math.floor(t * 2) % 2) txt = txt.replace('▶', ' ');   // ▶ 깜빡임
      if (txt !== typed) { typed = txt; bootEl.textContent = txt; }
    } else if (phase === 'film') {
      sky(t); searchlight(70, t, 0); searchlight(230, t, 2.1);
      hills(t, 12, 122, 6, P.dgreen, P.night); booms(t); aircraft(t); ground(t); convoy(t);
      for (let i = CAPTIONS.length - 1; i >= 0; i--) if (t >= CAPTIONS[i][0]) { if (capIdx !== i) { capIdx = i; setCaption(CAPTIONS[i][1]); } break; }
      // 마지막 섬광 (흰 화면으로 디더링 전환)
      if (t > FILM_END - 0.6) { const k = (t - (FILM_END - 0.6)) / 0.6; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x * 7 + y * 13) % 16) / 16 < k) px(x, y, P.white); }
      if (t >= FILM_END) startTitle();
    } else if (phase === 'title') {
      shakeX = shakeY = 0;
      sky(t + 20); hills(t, 4, 132, 4, P.dgreen, P.night); cliffGround(t);
      const shake = reduced ? 0 : gag(t);                            // 절벽 개그 (흔들림 세기 반환)
      const k = reduced ? 1 : Math.min(1, t / 0.9), ease = 1 - Math.pow(1 - k, 3), bounce = k < 1 ? 0 : Math.max(0, 3 - (t - 0.9) * 10) * Math.sin((t - 0.9) * 20);
      if (shake) { shakeX = (Math.random() * 2 - 1) * shake; shakeY = (Math.random() * 2 - 1) * shake; }
      drawLogo(10, Math.round(14 - (1 - ease) * 120 + bounce + shake * 1.5), t);   // 쿵 하면 로고도 덜컹
      shakeX = shakeY = 0;
      if (t < 0.25 && !reduced) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x * 7 + y * 13) % 16) / 16 > t / 0.25) px(x, y, P.white);
      const blinkOn = Math.floor(t * 1.6) % 2 === 0;
      const txt = blinkOn ? '▶ 화면을 누르면 시작합니다' : ' ';
      if (capEl.textContent !== txt) capEl.textContent = txt;
    }
    ctx.putImageData(img, 0, 0);
    if (phase !== 'off') rafId = requestAnimationFrame(frame);
  }
  function startFilm() {
    armed = true; phase = reduced ? 'title' : 'film'; t0 = performance.now(); capIdx = -1;
    bootEl.textContent = ''; bootEl.hidden = true; skipEl.hidden = false;
    if (Music && musicOn()) Music.play('title');
    if (reduced) startTitle();
  }
  function startTitle() {
    clearInterval(capTimer); phase = 'title'; t0 = performance.now(); lastImpact = -1; bootEl.hidden = true; skipEl.hidden = true; capEl.classList.add('press');
    if (Music && musicOn() && armed && Music.playing() !== 'title') Music.play('title');
  }
  function finish() {
    phase = 'off'; cancelAnimationFrame(rafId); clearInterval(capTimer);
    el.hidden = true; capEl.classList.remove('press'); window.HC_INTRO_ACTIVE = false;
    if (Music) Music.stop();
    document.dispatchEvent(new CustomEvent('hc-intro-done'));
    if (onDone) onDone();
  }
  function advance() {
    if (phase === 'boot' || phase === 'wait') startFilm();
    else if (phase === 'film') startTitle();
    else if (phase === 'title') { if (performance.now() - t0 > 400) finish(); }
  }
  el.addEventListener('pointerdown', e => { if (e.target === skipEl) return; e.preventDefault(); advance(); });
  skipEl.addEventListener('click', e => { e.stopPropagation(); armed = true; startTitle(); });
  document.addEventListener('keydown', e => {
    if (phase === 'off') return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') { armed = true; phase === 'title' ? finish() : startTitle(); } else advance(); }
  });

  function play(done) {
    onDone = done || null;
    window.HC_INTRO_ACTIVE = true; el.hidden = false; skipEl.hidden = false; bootEl.hidden = false; bootEl.textContent = ''; capEl.textContent = ''; typed = '';
    phase = 'boot'; t0 = performance.now(); armed = false;
    cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame);
  }
  // 로고 글꼴을 기다렸다가(최대 1.5초) 로고를 만든다
  const fontsReady = (document.fonts && document.fonts.load)
    ? Promise.race([Promise.all([document.fonts.load('54px "Black Han Sans"'), document.fonts.load('8px "Press Start 2P"')]), new Promise(r => setTimeout(r, 1500))]).catch(() => {})
    : Promise.resolve();
  fontsReady.then(() => { buildLogo(); buildKung(); });

  window.HCIntro = { play, get active() { return phase !== 'off'; } };
  // 처음 열 때 자동 재생 (설정에서 끈 경우, 또는 미리보기 갱신으로 진행 중인 게임을 이어 받은 경우 제외)
  if (store.get('hc88-intro') !== 'off' && !window.HC_RESTORED) play();
})();
