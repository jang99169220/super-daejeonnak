// HEX COMMAND 88 — 게임 규칙 (DOM 참조 금지, Node 테스트 가능)
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const D = NODE ? require('./data.js') : root.HC_DATA;
  // Node(테스트)에서는 확장팩 파일을 직접 읽음. 브라우저는 index.html의 <script>로 읽음
  if (NODE && !D._packsLoaded) { D._packsLoaded = true; for (const f of D.packFiles || []) require('./' + f); }

  // ---- 헥스 좌표 (flat-top, odd-q) ----
  const NB_EVEN = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]];
  const NB_ODD = [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  function neighbors(g, c, r) {
    const t = (c & 1) ? NB_ODD : NB_EVEN, out = [];
    for (const [dc, dr] of t) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < g.W && nr < g.H) out.push([nc, nr]);
    }
    return out;
  }
  function cube(c, r) { const x = c, z = r - (c - (c & 1)) / 2; return [x, -x - z, z]; }
  function dist(c1, r1, c2, r2) {
    const a = cube(c1, r1), b = cube(c2, r2);
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  const key = (c, r) => c + ',' + r;

  // ---- 생성 ----
  // opts(선택): { turnLimit, winRule: 'normal'|'survive'|'capture'|'sink', redBonus, blueBonus, redXp, vets: [{type, xp}], campaign,
  //   시나리오용: rosters {blue:[유닛], red:[유닛]}, names {blue, red}, funds {blue, red}, incomeMul, targets ['c,r'], sinkTypes [유닛], scenario }
  function createGame(rng, mapId, opts) {
    opts = opts || {};
    const M = (mapId && typeof mapId === 'object') ? mapId : (D.maps.find(m => m.id === mapId) || D.maps[0]);
    const map = [], cities = {};
    M.map.forEach((row, r) => {
      map.push(row.split('').map((ch, c) => {
        const L = D.legend[ch];
        if (!L) throw new Error('알 수 없는 맵 기호: ' + ch);
        if (L.t === 'city' || L.t === 'capital' || L.t === 'port') cities[key(c, r)] = { owner: L.owner, cap: D.captureMax, by: null };
        return L.t;
      }));
    });
    const units = M.setup.map((s, i) => {
      const st = D.units[s.type];
      const u = { id: i + 1, type: s.type, side: s.side, c: s.c, r: s.r, hp: 10, fuel: st.fuel, ammo: st.ammo, xp: s.xp || 0, moved: false, acted: false, prev: null };
      if (s.name) u.name = s.name;   // 개별 이름 (예: 엔터프라이즈, 아카기)
      return u;
    });
    // 작전 추가 병력 (extraUnits: [{side, type, c, r}]) — 빈 칸이고 갈 수 있는 지형일 때만
    for (const e of opts.extraUnits || []) {
      const st = D.units[e.type];
      if (!st || !map[e.r] || D.moveCost[st.moveType][map[e.r][e.c]] == null || units.some(u => u.c === e.c && u.r === e.r)) continue;
      units.push({ id: units.length + 1, type: e.type, side: e.side, c: e.c, r: e.r, hp: 10, fuel: st.fuel, ammo: st.ammo, xp: 0, moved: false, acted: false, prev: null });
    }
    if (opts.redXp) units.forEach(u => { if (u.side === 'red') u.xp = opts.redXp; });
    // 캠페인 계승: 살아남은 부대의 경험치를 이번 작전 청군 시작 유닛에 이어 줌 (부대 편성은 작전 설계대로 유지)
    // 1차: 같은 종류 유닛, 2차: 같은 병과(항공/지상) 중 가격이 가장 비슷한 유닛
    if (opts.vets && opts.vets.length) {
      const slots = units.filter(u => u.side === 'blue'), used = new Set(), air = t => D.units[t].moveType === 'air';
      const give = (slot, v) => { used.add(slot.id); slot.xp = v.xp || 0; slot.vet = v.type; };
      const rest = [];
      for (const v of opts.vets) { if (!D.units[v.type]) continue; const s = slots.find(u => !used.has(u.id) && u.type === v.type); if (s) give(s, v); else rest.push(v); }
      for (const v of rest) {
        const c = D.units[v.type].cost;
        const s = slots.filter(u => !used.has(u.id) && air(u.type) === air(v.type)).sort((a, b) => Math.abs(D.units[a.type].cost - c) - Math.abs(D.units[b.type].cost - c))[0];
        if (s) give(s, v);
      }
    }
    const g = { W: map[0].length, H: map.length, map, cities, units, turn: 1, side: 'blue', winner: null, log: [], rng: rng || Math.random,
      funds: { blue: D.economy.start, red: D.economy.start }, nextId: units.length + 1, mapId: M.id,
      turnLimit: opts.turnLimit || D.turnLimit.limit, winRule: opts.winRule || 'normal', campaign: opts.campaign == null ? null : opts.campaign,
      rosters: opts.rosters || { blue: D.rosters.classic, red: D.rosters.classic }, names: opts.names || null,
      incomeMul: opts.incomeMul == null ? 1 : opts.incomeMul, targets: opts.targets || [], sinkTypes: opts.sinkTypes || [],
      labels: M.labels || {}, scenario: opts.scenario || null };
    if (opts.funds) g.funds = { blue: opts.funds.blue, red: opts.funds.red };
    else g.funds.red += opts.redBonus != null ? opts.redBonus : (M.redBonus || 0);
    g.funds.blue += opts.blueBonus || 0;
    collectIncome(g, 'blue');
    return g;
  }

  // ---- 경제 ----
  function income(g, side) {
    let sum = 0;
    for (const k in g.cities) if (g.cities[k].owner === side) sum += g.map[k.split(',')[1]][k.split(',')[0]] === 'capital' ? D.economy.capital : D.economy.city;
    const m = g.incomeMul == null ? 1 : typeof g.incomeMul === 'object' ? (g.incomeMul[side] == null ? 1 : g.incomeMul[side]) : g.incomeMul;
    return Math.round(sum * m / 100) * 100;
  }
  function collectIncome(g, side) { const v = income(g, side); g.funds[side] += v; return v; }

  // 생산 가능 여부: 아군 소유의 빈 도시/수도/항구, 그 진영 유닛 목록에 있음, 자금, 유닛 수 제한
  // 항공은 수도에서만, 함선은 항구에서만
  function canProduce(g, c, r, type) {
    const city = g.cities[key(c, r)], st = D.units[type];
    if (!st || !city || city.owner !== g.side || unitAt(g, c, r) || g.winner) return false;
    const ros = g.rosters && g.rosters[g.side];
    if (ros && !ros.includes(type)) return false;
    const t = g.map[r][c];
    if (st.moveType === 'ship' ? t !== 'port' : (st.moveType === 'air' && t !== 'capital')) return false;
    if (g.funds[g.side] < st.cost) return false;
    return g.units.filter(u => u.hp > 0 && u.side === g.side).length < D.economy.maxUnits;
  }
  function produce(g, c, r, type) {
    if (!canProduce(g, c, r, type)) return null;
    const st = D.units[type];
    g.funds[g.side] -= st.cost;
    const u = { id: g.nextId++, type, side: g.side, c, r, hp: 10, fuel: st.fuel, ammo: st.ammo, moved: true, acted: true, prev: { c, r, fuel: st.fuel } };
    g.units.push(u);
    log(g, `${sideName(g.side, g)} ${st.name} 생산 (-${st.cost})`);
    return u;
  }

  // ---- 조회 ----
  const stat = u => D.units[u.type];
  const isAir = u => stat(u).moveType === 'air';
  const isShip = u => stat(u).moveType === 'ship';
  // 공격 대상 구분: 항공 → atkA, 함선 → atkS(대함), 그 외 지상 → atkG
  const atkVs = (st, t) => isAir(t) ? st.atkA : isShip(t) ? (st.atkS || 0) : st.atkG;
  const unitName = u => u.name || stat(u).name;
  const unitAt = (g, c, r) => g.units.find(u => u.hp > 0 && u.c === c && u.r === r) || null;
  const other = s => (s === 'blue' ? 'red' : 'blue');
  // 진영 이름: 시나리오에서는 국가 이름(g.names), 클래식은 청군/적군
  const sideName = (s, g) => (g && g.names && g.names[s]) || D.sides[s].name;
  function log(g, msg) { g.log.push(msg); if (g.log.length > 50) g.log.shift(); }

  function adjacentEnemyGround(g, c, r, side) {
    return neighbors(g, c, r).some(([nc, nr]) => { const o = unitAt(g, nc, nr); return o && o.side !== side && !isAir(o) && !isShip(o); });
  }

  // 이동 가능 칸 목록 [{c,r,cost}] (현재 칸 포함)
  function reachable(g, u) {
    const st = stat(u), costT = D.moveCost[st.moveType];
    const budget = Math.min(st.move, u.fuel);
    const best = new Map([[key(u.c, u.r), 0]]);
    const q = [[0, u.c, u.r]];
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, c, r] = q.shift();
      if (d > best.get(key(c, r))) continue;
      if ((c !== u.c || r !== u.r) && st.moveType !== 'air' && st.moveType !== 'ship' && adjacentEnemyGround(g, c, r, u.side)) continue; // ZOC (지상 유닛끼리만)
      for (const [nc, nr] of neighbors(g, c, r)) {
        const cost = costT[g.map[nr][nc]];
        if (cost == null) continue;
        const nd = d + cost;
        if (nd > budget) continue;
        const o = unitAt(g, nc, nr);
        if (o && o.side !== u.side) continue;
        const k = key(nc, nr);
        if (nd < (best.has(k) ? best.get(k) : Infinity)) { best.set(k, nd); q.push([nd, nc, nr]); }
      }
    }
    const out = [];
    for (const [k, d] of best) {
      const [c, r] = k.split(',').map(Number);
      const o = unitAt(g, c, r);
      if (o && o !== u) continue;
      out.push({ c, r, cost: d });
    }
    return out;
  }

  function canHit(a, t) { return atkVs(stat(a), t) > 0; }

  function attackTargets(g, u) {
    const st = stat(u);
    if (u.ammo <= 0 || (st.indirect && u.moved)) return [];
    return g.units.filter(t => {
      if (t.hp <= 0 || t.side === u.side || !canHit(u, t)) return false;
      const d = dist(u.c, u.r, t.c, t.r);
      return d >= st.range[0] && d <= st.range[1];
    });
  }

  // ---- 계급 ----
  function rankOf(u) { let r = 0; D.ranks.forEach((k, i) => { if ((u.xp || 0) >= k.xp) r = i; }); return r; }
  function rankName(u) { return D.ranks[rankOf(u)].name; }
  function gainXp(g, u, amount) {
    if (u.hp <= 0 || amount <= 0) return;
    const before = rankOf(u); u.xp = Math.min(D.xpMax || 999, (u.xp || 0) + amount);
    if (rankOf(u) > before) log(g, `${sideName(u.side, g)} ${unitName(u)} ${rankName(u)}(으)로 승급!`);
  }

  function baseDamage(g, a, t, aHp) {
    const sa = stat(a), sd = stat(t);
    const atk = atkVs(sa, t);
    if (atk <= 0 || aHp <= 0) return 0;
    const terr = isAir(t) || isShip(t) ? 0 : D.terrain[g.map[t.r][t.c]].def;
    const ra = D.ranks[rankOf(a)], rt = D.ranks[rankOf(t)];
    return atk * (aHp / 10) * D.combat.factor / (sd.def + D.combat.defBase) * (1 - terr) * (1 + ra.atk) * (1 - rt.def);
  }
  function rollNoise(g) { const x = g.rng(); return x < 0.25 ? -1 : x >= 0.75 ? 1 : 0; }
  function clampDmg(v, hp) { return Math.max(0, Math.min(hp, v)); }

  function canCounter(g, a, t) {
    const st = stat(t);
    return !st.indirect && t.ammo > 0 && canHit(t, a) && dist(a.c, a.r, t.c, t.r) === 1;
  }

  // 예상 결과 (난수 없음)
  function forecast(g, a, t) {
    const dmg = clampDmg(Math.round(baseDamage(g, a, t, a.hp)), t.hp);
    const left = t.hp - dmg;
    let counter = 0;
    if (left > 0 && canCounter(g, a, t)) counter = clampDmg(Math.round(baseDamage(g, t, a, left)), a.hp);
    return { dmg, counter };
  }

  // ---- 행동 ----
  function canCapture(g, u) {
    const city = g.cities[key(u.c, u.r)];
    return !!(stat(u).capture && city && city.owner !== u.side);
  }

  function moveUnit(g, u, c, r) {
    if (u.side !== g.side || u.acted || u.prev) return false;
    const dest = reachable(g, u).find(p => p.c === c && p.r === r);
    if (!dest) return false;
    u.prev = { c: u.c, r: u.r, fuel: u.fuel };
    if (c !== u.c || r !== u.r) {
      const city = g.cities[key(u.c, u.r)];
      if (city && city.by === u.id) { city.cap = D.captureMax; city.by = null; }
      u.moved = true;
    }
    u.c = c; u.r = r; u.fuel -= dest.cost;
    return true;
  }

  function undoMove(g, u) {
    if (!u.prev || u.acted) return false;
    u.c = u.prev.c; u.r = u.prev.r; u.fuel = u.prev.fuel; u.prev = null; u.moved = false;
    return true;
  }

  function finish(g, u) { u.acted = true; u.prev = u.prev || { c: u.c, r: u.r, fuel: u.fuel }; checkWin(g); }

  function attack(g, u, t) {
    if (!attackTargets(g, u).includes(t)) return null;
    const res = { dmg: 0, counter: 0, killed: false, attKilled: false };
    res.dmg = clampDmg(Math.round(baseDamage(g, u, t, u.hp)) + rollNoise(g), t.hp);
    if (res.dmg === 0 && baseDamage(g, u, t, u.hp) >= 0.5) res.dmg = Math.min(1, t.hp);
    t.hp -= res.dmg; u.ammo -= 1;
    log(g, `${sideName(u.side, g)} ${unitName(u)} → ${unitName(t)} 공격, 피해 ${res.dmg}`);
    if (t.hp <= 0) { res.killed = true; log(g, `${sideName(t.side, g)} ${unitName(t)} ${isShip(t) ? '격침' : '파괴'}!`); }
    else if (canCounter(g, u, t)) {
      res.counter = clampDmg(Math.round(baseDamage(g, t, u, t.hp)) + rollNoise(g), u.hp);
      u.hp -= res.counter; t.ammo -= 1;
      log(g, `반격! ${unitName(u)} 피해 ${res.counter}`);
      if (u.hp <= 0) { res.attKilled = true; log(g, `${sideName(u.side, g)} ${unitName(u)} ${isShip(u) ? '격침' : '파괴'}!`); }
    }
    gainXp(g, u, res.dmg + (res.killed ? D.xpKill : 0));
    gainXp(g, t, res.counter + (res.attKilled ? D.xpKill : 0));
    checkObjectives(g);
    finish(g, u);
    return res;
  }

  function capture(g, u) {
    if (!canCapture(g, u) || u.acted) return null;
    const city = g.cities[key(u.c, u.r)];
    if (city.by !== u.id) { city.cap = D.captureMax; city.by = u.id; }
    city.cap -= u.hp;
    const isCap = g.map[u.r][u.c] === 'capital';
    let done = false;
    if (city.cap <= 0) {
      const loser = city.owner;
      city.owner = u.side; city.cap = D.captureMax; city.by = null; done = true;
      const label = g.labels && g.labels[key(u.c, u.r)];
      log(g, `${sideName(u.side, g)} ${label || (isCap ? '수도' : g.map[u.r][u.c] === 'port' ? '항구' : '도시')} 점령 완료!`);
      if (isCap && loser) { g.winner = u.side; log(g, `${sideName(loser, g)} 수도 함락. ${sideName(u.side, g)} 승리!`); }
      checkObjectives(g);
    } else log(g, `${sideName(u.side, g)} 점령 중… 남은 점령치 ${city.cap}`);
    finish(g, u);
    return { done, left: city.cap };
  }

  function wait(g, u) { if (u.acted) return false; finish(g, u); return true; }

  // 시나리오 목표: capture = 청군이 목표 도시(g.targets)를 모두 점령, sink = 적군의 지정 유닛(g.sinkTypes)을 모두 격파
  function checkObjectives(g) {
    if (g.winner) return;
    if (g.winRule === 'capture' && g.targets.length && g.targets.every(k => g.cities[k] && g.cities[k].owner === 'blue')) {
      g.winner = 'blue'; log(g, `목표 지점 ${g.targets.map(k => g.labels[k] || k).join('·')} 모두 점령! ${sideName('blue', g)} 승리!`);
    }
    if (g.winRule === 'sink' && g.sinkTypes.length && !g.units.some(u => u.hp > 0 && u.side === 'red' && g.sinkTypes.includes(u.type))) {
      g.winner = 'blue'; log(g, `${sideName('red', g)} 주력 함대 전멸! ${sideName('blue', g)} 승리!`);
    }
  }

  function checkWin(g) {
    if (g.winner) return g.winner;
    for (const s of ['blue', 'red']) {
      if (!g.units.some(u => u.side === s && u.hp > 0)) {
        g.winner = other(s); log(g, `${sideName(s, g)} 전멸. ${sideName(other(s), g)} 승리!`);
      }
    }
    return g.winner;
  }

  function endTurn(g) {
    if (g.winner) return;
    g.units = g.units.filter(u => u.hp > 0);
    g.units.forEach(u => { u.moved = false; u.acted = false; u.prev = null; });
    g.side = other(g.side);
    if (g.side === 'blue') g.turn++;
    if (g.turn > (g.turnLimit || D.turnLimit.limit)) { judge(g); return; }
    // 보급·유지
    for (const u of g.units) {
      if (u.hp <= 0 || u.side !== g.side) continue;
      const st = stat(u), city = g.cities[key(u.c, u.r)];
      const home = city && city.owner === u.side;
      // 항공모함: 바로 옆 칸의 아군 항공기에 연료·탄약 보급, 체력 +1
      const deck = st.moveType === 'air' && g.units.some(cv => cv.hp > 0 && cv.side === u.side && stat(cv).carrier && dist(cv.c, cv.r, u.c, u.r) <= 1);
      if (home) {
        u.hp = Math.min(10, u.hp + D.supply.heal); u.fuel = st.fuel; u.ammo = st.ammo;
      } else if (deck) {
        u.hp = Math.min(10, u.hp + 1); u.fuel = st.fuel; u.ammo = st.ammo;
      } else if (st.upkeep) {
        u.fuel = Math.max(0, u.fuel - st.upkeep);
        if (u.fuel === 0) { u.hp = 0; log(g, `${sideName(u.side, g)} ${unitName(u)} 연료 고갈로 ${st.moveType === 'air' ? '추락' : '정지'}!`); }
      }
    }
    // 점령자가 사라진 도시 점령치 초기화
    for (const k in g.cities) {
      const city = g.cities[k];
      if (city.by && !g.units.some(u => u.id === city.by && u.hp > 0 && key(u.c, u.r) === k)) { city.by = null; city.cap = D.captureMax; }
    }
    log(g, `턴 ${g.turn} · ${sideName(g.side, g)}의 차례 · 수입 +${collectIncome(g, g.side)}`);
    checkWin(g);
  }

  // ---- 턴 제한 점수 판정 ----
  function score(g, side) {
    let s = 0;
    for (const u of g.units) if (u.hp > 0 && u.side === side) s += Math.round(D.units[u.type].cost * u.hp / 10);
    for (const k in g.cities) if (g.cities[k].owner === side) s += D.turnLimit.city;
    return s;
  }
  function judge(g) {
    const b = score(g, 'blue'), r = score(g, 'red'), lim = g.turnLimit || D.turnLimit.limit;
    g.turn = lim; g.side = 'blue';
    if (g.winRule === 'survive') { g.winner = 'blue'; log(g, `${lim}턴 동안 수도를 지켜냈다!`); log(g, `${sideName('blue', g)} 방어 성공!`); return; }
    if (g.winRule === 'capture') { g.winner = 'red'; log(g, `${lim}턴 안에 목표를 점령하지 못했다.`); log(g, `${sideName('red', g)} 방어 성공!`); return; }
    g.winner = b > r ? 'blue' : r > b ? 'red' : 'draw';
    log(g, `${lim}턴 종료 · 판정 ${sideName('blue', g)} ${b.toLocaleString()} : ${sideName('red', g)} ${r.toLocaleString()}`);
    log(g, g.winner === 'draw' ? '무승부' : `${sideName(g.winner, g)} 판정승!`);
  }

  // ---- 전장의 안개: side가 볼 수 있는 칸 집합 ("c,r") ----
  function visible(g, side) {
    const seen = new Set();
    const mark = (c, r, rad) => {
      for (let cc = Math.max(0, c - rad); cc <= Math.min(g.W - 1, c + rad); cc++)
        for (let rr = Math.max(0, r - rad - 1); rr <= Math.min(g.H - 1, r + rad + 1); rr++)
          if (dist(c, r, cc, rr) <= rad) seen.add(key(cc, rr));
    };
    for (const u of g.units) if (u.hp > 0 && u.side === side) mark(u.c, u.r, D.units[u.type].vision || 2);
    for (const k in g.cities) if (g.cities[k].owner === side) { const [c, r] = k.split(',').map(Number); mark(c, r, D.citySight); }
    return seen;
  }

  // ---- 맵 검사 (에디터용): 문제 목록을 돌려줌. 빈 배열이면 통과 ----
  function validateMap(M) {
    const errs = [], rows = M.map, W = rows[0] ? rows[0].length : 0, H = rows.length;
    if (!W || rows.some(row => row.length !== W)) return ['행 길이가 서로 다릅니다.'];
    const all = rows.join('');
    const nB = (all.match(/B/g) || []).length, nR = (all.match(/R/g) || []).length;
    if (nB !== 1) errs.push(`청군 수도가 ${nB}개입니다. 정확히 1개여야 합니다.`);
    if (nR !== 1) errs.push(`적군 수도가 ${nR}개입니다. 정확히 1개여야 합니다.`);
    for (const s of ['blue', 'red']) if (!M.setup.some(u => u.side === s)) errs.push(`${sideName(s)} 시작 유닛이 없습니다.`);
    const occ = new Set();
    for (const u of M.setup) {
      const L = D.legend[rows[u.r] && rows[u.r][u.c]];
      if (!L || D.moveCost[D.units[u.type].moveType][L.t] == null) errs.push(`${sideName(u.side)} ${D.units[u.type].name}(${u.c},${u.r})이 갈 수 없는 지형에 있습니다.`);
      const k = u.c + ',' + u.r; if (occ.has(k)) errs.push(`(${u.c},${u.r})에 유닛이 겹쳐 있습니다.`); occ.add(k);
    }
    if (nB === 1 && nR === 1 && !M.naval) {
      const find = ch => { const i = all.indexOf(ch); return [i % W, (i / W) | 0]; };
      const g = { W, H }, [b, rr] = [find('B'), find('R')], seen = new Set([b + '']), q = [b];
      while (q.length) {
        const [c, r] = q.shift();
        for (const [nc, nr] of neighbors(g, c, r)) {
          const k = nc + ',' + nr, L = D.legend[rows[nr][nc]];
          if (seen.has(k) || D.moveCost.foot[L.t] == null) continue;
          seen.add(k); q.push([nc, nr]);
        }
      }
      if (!seen.has(rr + '')) errs.push('두 수도가 육로로 이어져 있지 않습니다. 보병이 갈 수 있는 길이 필요합니다.');
    }
    return errs;
  }

  // ---- 데이터 검사: 새 유닛·맵·캠페인을 추가한 뒤 node test.js 로 실행 ----
  function checkData() {
    const errs = [];
    for (const [k, u] of Object.entries(D.units)) {
      const need = ['name', 'moveType', 'move', 'atkG', 'atkA', 'def', 'range', 'fuel', 'ammo', 'cost', 'vision', 'value', 'order', 'sprite'];
      for (const f of need) if (u[f] == null) errs.push(`유닛 ${k}: ${f} 항목이 없습니다.`);
      if (u.moveType && !D.moveCost[u.moveType]) errs.push(`유닛 ${k}: 이동방식 ${u.moveType}이(가) moveCost에 없습니다.`);
      if (u.sprite && (u.sprite.length !== 9 || u.sprite.some(r => r.length !== 14 || /[^.WD]/.test(r)))) errs.push(`유닛 ${k}: sprite는 14칸×9줄, 문자는 . W D만 가능합니다.`);
      if (u.range && (u.range.length !== 2 || u.range[0] > u.range[1])) errs.push(`유닛 ${k}: range는 [최소, 최대]여야 합니다.`);
    }
    for (const [mt, tab] of Object.entries(D.moveCost)) for (const t of Object.keys(D.terrain)) if (!(t in tab)) errs.push(`이동방식 ${mt}: 지형 ${t}의 이동비용이 없습니다 (못 가면 null).`);
    for (const m of D.maps) for (const e of validateMap(m)) errs.push(`맵 ${m.id}: ${e}`);
    // 시나리오 검사
    const sids = new Set();
    for (const sc of D.scenarios) {
      const w = `시나리오 ${sc.id}`;
      if (sids.has(sc.id)) errs.push(`${w}: id 중복`); sids.add(sc.id);
      if (!D.eras.some(e => e.id === sc.era)) errs.push(`${w}: 시대 ${sc.era}이(가) eras에 없습니다.`);
      for (const s of ['blue', 'red']) {
        for (const n of sc.sides[s].nations) if (!D.nations[n]) errs.push(`${w}: 국가 ${n}이(가) nations에 없습니다.`);
      }
      for (const e of validateMap(sc.map)) errs.push(`${w}: ${e}`);
      for (const k of sc.targets || []) { const [c, r] = k.split(',').map(Number); const L = D.legend[sc.map.map[r] && sc.map.map[r][c]]; if (!L || !['city', 'capital', 'port'].includes(L.t)) errs.push(`${w}: 목표 ${k}가 도시가 아닙니다.`); }
      for (const t of sc.sinkTypes || []) if (!D.units[t]) errs.push(`${w}: 격침 목표 유닛 ${t}이(가) 없습니다.`);
      if (!['normal', 'survive', 'capture', 'sink'].includes(sc.winRule || 'normal')) errs.push(`${w}: winRule이 잘못됐습니다.`);
    }
    for (const [n, nat] of Object.entries(D.nations)) for (const t of nat.units) if (!D.units[t]) errs.push(`국가 ${n}: 유닛 ${t}이(가) 없습니다.`);
    const ids = new Set(D.maps.map(m => m.id));
    if (D.maps.length !== ids.size) errs.push('맵 id가 중복됩니다.');
    if (D.campaign) D.campaign.scenarios.forEach((s, i) => {
      if (!ids.has(s.map)) errs.push(`캠페인 ${i + 1}번 작전: 맵 ${s.map}이(가) 없습니다.`);
      if (!s.title || !s.brief) errs.push(`캠페인 ${i + 1}번 작전: title, brief가 필요합니다.`);
      if (s.winRule && !['normal', 'survive'].includes(s.winRule)) errs.push(`캠페인 ${i + 1}번 작전: winRule은 normal 또는 survive입니다.`);
      const M = D.maps.find(m => m.id === s.map);
      if (M) for (const e of s.extraUnits || []) {
        const L = D.legend[M.map[e.r] && M.map[e.r][e.c]], st = D.units[e.type];
        if (!st || !L || D.moveCost[st.moveType][L.t] == null) errs.push(`캠페인 ${i + 1}번 작전: 추가 유닛 ${e.type}(${e.c},${e.r})을 놓을 수 없습니다.`);
        else if (M.setup.some(u => u.c === e.c && u.r === e.r)) errs.push(`캠페인 ${i + 1}번 작전: 추가 유닛 ${e.type}(${e.c},${e.r})이 기본 배치와 겹칩니다.`);
      }
    });
    return errs;
  }

  // ---- 시나리오 모드 ----
  // 시나리오의 진영(sides.blue / sides.red)은 국가 여러 개의 연합일 수 있음 → 유닛 목록을 합침
  function rosterOf(side) { const out = []; for (const n of side.nations) for (const t of D.nations[n].units) if (!out.includes(t)) out.push(t); return out; }
  function scenarioGame(sc, rng) {
    return createGame(rng, sc.map, {
      turnLimit: sc.turnLimit, winRule: sc.winRule || 'normal', scenario: sc.id,
      rosters: { blue: rosterOf(sc.sides.blue), red: rosterOf(sc.sides.red) },
      names: { blue: sc.sides.blue.name, red: sc.sides.red.name },
      funds: sc.funds || { blue: D.economy.start, red: D.economy.start }, incomeMul: sc.incomeMul,
      targets: sc.targets, sinkTypes: sc.sinkTypes
    });
  }

  // ---- 캠페인 진행 (진행 상태 prog = { idx, vets, funds, history }) ----
  function campaignGame(prog, rng) {
    const sc = D.campaign.scenarios[prog.idx];
    return createGame(rng, sc.map, { turnLimit: sc.turnLimit, winRule: sc.winRule, redBonus: sc.redBonus,
      blueBonus: prog.funds || 0, redXp: sc.redXp || 0, extraUnits: sc.extraUnits, vets: prog.vets || [], campaign: prog.idx });
  }
  // 청군이 이긴 작전 → 다음 작전 진행 상태 (살아남은 유닛 중 경험 많은 순, 남은 자금 일부)
  function campaignAdvance(g, prog) {
    const C = D.campaign;
    const vets = g.units.filter(u => u.hp > 0 && u.side === 'blue')
      .sort((a, b) => (b.xp || 0) - (a.xp || 0) || D.units[b.type].value - D.units[a.type].value)
      .slice(0, C.carry).map(u => ({ type: u.type, xp: Math.min(D.xpMax || 999, u.xp || 0) }));
    const funds = Math.min(C.fundsCarryMax, Math.floor(g.funds.blue * C.fundsCarry / 100) * 100);
    return { idx: prog.idx + 1, vets, funds, history: (prog.history || []).concat([{ idx: prog.idx, turn: g.turn }]) };
  }

  const API = { scenarioGame, rosterOf, isShip, unitName, checkObjectives, campaignGame, campaignAdvance, checkData, rankOf, rankName, validateMap, score, visible, D, neighbors, dist, key, createGame, stat, isAir, unitAt, other, sideName, reachable, attackTargets, forecast, canCapture, income, canProduce, produce, moveUnit, undoMove, attack, capture, wait, endTurn, checkWin };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.HCRules = API;
})(this);
