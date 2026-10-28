// HEX COMMAND 88 — 배경음악 (오리지널 칩튠, Web Audio 사각파/삼각파/노이즈)
// 악보 표기: 8분음표 한 칸씩 공백으로 구분. 음이름(C4, Eb5, F#3), '.' = 쉼, '~' = 앞 음 늘이기.
// 드럼: k = 킥, s = 스네어, h = 하이햇, '.' = 쉼.
(function (root) {
  'use strict';
  const TRACKS = {
    // 아군 차례: 단조 행진곡
    march: {
      bpm: 132,
      lead: 'G4 ~ G4 G4 C5 ~ C5 ~ D5 ~ Eb5 ~ D5 ~ C5 ~ ' +
            'Bb4 ~ Bb4 Bb4 D5 ~ D5 ~ Eb5 ~ F5 ~ Eb5 ~ D5 ~ ' +
            'G4 ~ G4 G4 C5 ~ Eb5 ~ G5 ~ F5 Eb5 D5 ~ C5 ~ ' +
            'Bb4 ~ C5 D5 Eb5 ~ D5 C5 B4 ~ ~ ~ G4 ~ . .',
      bass: 'C3 . G2 . C3 . G2 . C3 . G2 . C3 . G2 . ' +
            'Bb2 . F2 . Bb2 . F2 . Bb2 . F2 . Bb2 . F2 . ' +
            'Ab2 . Eb2 . Ab2 . Eb2 . Ab2 . Eb2 . Ab2 . Eb2 . ' +
            'G2 . D3 . G2 . D3 . G2 . G2 . G2 G2 G2 .',
      drum: 'k . s . k k s . k . s . k k s . k . s . k k s . k . s . k k s . ' +
            'k . s . k k s . k . s . k k s . k . s . k k s . k . s . s s s s'
    },
    // 타이틀(인트로): 장조 팡파르
    title: {
      bpm: 126,
      lead: 'G4 ~ C5 ~ E5 ~ G5 ~ G5 ~ ~ ~ A5 G5 E5 ~ F5 ~ D5 ~ B4 ~ D5 ~ G5 ~ ~ ~ ~ ~ . . A4 ~ C5 ~ F5 ~ A5 ~ G5 ~ E5 ~ C5 ~ E5 ~ D5 ~ F5 ~ E5 ~ D5 ~ C5 ~ ~ ~ G4 ~ C5 .',
      bass: 'C3 . G2 . C3 . G2 . C3 . G2 . C3 . E3 . G2 . D3 . G2 . D3 . G2 . G2 . G2 G2 G2 . F2 . C3 . F2 . C3 . C3 . G2 . C3 . G2 . G2 . D3 . G2 . B2 . C3 . G2 . C3 . C3 .',
      drum: 'k . s . k k s . k . s . k k s . k . s . k k s . k . s . k k s . k . s . k k s . k . s . k k s . k . s . k k s . s s s s s s s s'
    },
    // 적군 차례: 빠른 아르페지오
    enemy: {
      bpm: 150,
      lead: 'C5 Eb5 G5 Eb5 C5 Eb5 G5 Eb5 C5 Eb5 G5 Eb5 C5 Eb5 G5 Eb5 ' +
            'Db5 F5 Ab5 F5 Db5 F5 Ab5 F5 Db5 F5 Ab5 F5 Db5 F5 Ab5 F5 ' +
            'B4 D5 F5 D5 B4 D5 F5 D5 B4 D5 F5 D5 B4 D5 F5 D5 ' +
            'C5 Eb5 G5 C6 G5 Eb5 C5 . C5 ~ ~ ~ . . . .',
      bass: 'C2 C2 C3 C2 C2 C2 C3 C2 C2 C2 C3 C2 C2 C2 C3 C2 ' +
            'Db2 Db2 Db3 Db2 Db2 Db2 Db3 Db2 Db2 Db2 Db3 Db2 Db2 Db2 Db3 Db2 ' +
            'G1 G1 G2 G1 G1 G1 G2 G1 G1 G1 G2 G1 G1 G1 G2 G1 ' +
            'C2 C2 C3 C2 C2 C2 C3 C2 C2 C2 C3 C2 C2 C2 C3 C2',
      drum: 'k . h . s . h . k . h . s . h . k . h . s . h . k . h . s . h . ' +
            'k . h . s . h . k . h . s . h . k . h . s . h . s s s s s s s s'
    }
  };
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(n) {
    const m = /^([A-G])(b|#)?(\d)$/.exec(n);
    if (!m) return 0;
    const s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12 - 9;
    return 440 * Math.pow(2, s / 12);
  }
  // 악보 문자열 → [{f, len}] (len = 칸 수, f = 0이면 쉼)
  function parse(str) {
    const tok = str.trim().split(/\s+/), out = [];
    for (let i = 0; i < tok.length; i++) {
      if (tok[i] === '~') { out.push(null); continue; }
      let len = 1; while (tok[i + len] === '~') len++;
      out.push({ f: tok[i] === '.' ? 0 : freq(tok[i]), d: tok[i], len });
    }
    return out;
  }
  const SONGS = {};
  for (const k in TRACKS) {
    const t = TRACKS[k];
    SONGS[k] = { bpm: t.bpm, lead: parse(t.lead), bass: parse(t.bass), drum: t.drum.trim().split(/\s+/) };
  }

  let ctx = null, master = null, noise = null, timer = null, cur = null, step = 0, nextT = 0, vol = 0.8;
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { ctx = null; return false; }
  }
  function tone(type, f, t, dur, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(gain, t); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function drum(kind, t) {
    if (kind === 'k') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.12);
      return;
    }
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = kind === 'h' ? 6000 : 1500;
    const len = kind === 'h' ? 0.03 : 0.12;
    g.gain.setValueAtTime(kind === 'h' ? 0.02 : 0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + len + 0.01);
  }
  function tick() {
    const song = SONGS[cur]; if (!song) return;
    const st = 60 / song.bpm / 2;
    while (nextT < ctx.currentTime + 0.15) {
      const L = song.lead[step % song.lead.length], B = song.bass[step % song.bass.length], K = song.drum[step % song.drum.length];
      if (L && L.f) tone('square', L.f, nextT, st * L.len * 0.92, 0.028);
      if (B && B.f) tone('triangle', B.f, nextT, st * B.len * 0.85, 0.07);
      if (K && K !== '.') drum(K, nextT);
      nextT += st; step++;
    }
  }
  function play(name) {
    if (cur === name || !SONGS[name] || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    stop(); cur = name; step = 0; nextT = ctx.currentTime + 0.05;
    timer = setInterval(tick, 40); tick();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; cur = null; }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function setVolume(v) { vol = v; if (master) master.gain.value = v; }

  // 짧은 효과음 (인트로 글자 타자음 등). 사용자가 화면을 누른 뒤에만 호출할 것
  function blip(f, d) { if (!ensure()) return; if (ctx.state === 'suspended') ctx.resume(); tone('square', f || 1200, ctx.currentTime, d || 0.025, 0.018); }
  root.HCMusic = { play, stop, resume, setVolume, blip, playing: () => cur, TRACKS };
})(this);
