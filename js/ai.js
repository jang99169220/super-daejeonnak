// HEX COMMAND 88 — 컴퓨터 AI (2차). DOM 참조 금지, Node 테스트 가능.
// 1차(탐욕형)에 더해: 실제 이동경로 거리, 보병 점령 목표 분담, 수도 방어, 집중 공격,
// 탄약·체력 부족 시 도시로 후퇴 보급, 전장의 안개 존중(g.aiFog = true일 때).
(function (root) {
  'use strict';
  const R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.HCRules;
  const D = R.D;

  // 유닛 가치 (공격 우선순위와 손실 회피에 사용)
  // 유닛 가치·행동 순서는 data.js 각 유닛의 value / order 항목. 계급이 높을수록 가치 상승.
  const VAL = u => (D.units[u.type].value || 1) * (1 + 0.2 * R.rankOf(u));
  const ORD = t => D.units[t].order == null ? 50 : D.units[t].order;
  const K = { path: 0.6, capture: 0.9, home: 1.2, defend: 0.5, focus: 0.3, guard: 4 };

  // 공격값: 항공 → atkA, 함선 → atkS, 지상 → atkG (rules.js와 같은 규칙)
  const atkVs = (st, t) => R.isAir(t) ? st.atkA : R.isShip(t) ? (st.atkS || 0) : st.atkG;
  const cityList = (g, pred) => Object.keys(g.cities).filter(k => pred(g.cities[k], k)).map(k => k.split(',').map(Number));
  function minDist(c, r, list) { let m = Infinity; for (const [x, y] of list) m = Math.min(m, R.dist(c, r, x, y)); return m; }

  // 지형만 고려한 이동비용 거리장 (여러 출발점 다익스트라). 유닛은 무시.
  const FIELDS = new WeakMap(); // 지도별 거리장 캐시
  function costField(g, moveType, sources) {
    let cache = FIELDS.get(g.map); if (!cache) { cache = new Map(); FIELDS.set(g.map, cache); }
    const ck = moveType + '|' + sources.map(s => s[0] + ',' + s[1]).sort().join(';');
    if (cache.has(ck)) return cache.get(ck);
    if (cache.size > 4000) cache.clear();
    const f = buildField(g, moveType, sources); cache.set(ck, f); return f;
  }
  function buildField(g, moveType, sources) {
    const cost = D.moveCost[moveType], N = g.W * g.H, f = new Float32Array(N).fill(Infinity), q = [];
    for (const [c, r] of sources) { f[r * g.W + c] = 0; q.push([0, c, r]); }
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, c, r] = q.shift();
      if (d > f[r * g.W + c]) continue;
      for (const [nc, nr] of R.neighbors(g, c, r)) {
        const k = cost[g.map[nr][nc]];
        if (k == null) continue;
        const nd = d + k, i = nr * g.W + nc;
        if (nd < f[i]) { f[i] = nd; q.push([nd, nc, nr]); }
      }
    }
    return f;
  }

  // 이번 턴 판단 재료 (적 목록은 안개 설정을 따름)
  const CTX = new WeakMap(); // 턴마다 한 번 계산하는 점령 분담 캐시
  function context(g) {
    const side = g.side, stamp = g.turn + side;
    const vis = g.aiFog ? R.visible(g, side) : null;
    const enemies = g.units.filter(x => x.hp > 0 && x.side !== side && (!vis || vis.has(R.key(x.c, x.r))));
    const capKey = Object.keys(g.cities).find(k => g.cities[k].owner === side && g.map[k.split(',')[1]][k.split(',')[0]] === 'capital');
    const capital = capKey ? capKey.split(',').map(Number) : null;
    const homes = cityList(g, c => c.owner === side);
    const targets = cityList(g, c => c.owner !== side);
    // 지킬 곳: 수도 + (목표 점령 시나리오의 방어측이면) 목표 도시들
    const objectives = (g.targets || []).map(k => k.split(',').map(Number));
    const defendSpots = (capital ? [capital] : []).concat(g.winRule === 'capture' && side === 'red' ? objectives : []);
    const capThreat = enemies.filter(e => D.units[e.type].capture && defendSpots.some(([x, y]) => R.dist(e.c, e.r, x, y) <= 4)).length;
    // 항공기 보급처: 아군 도시 + 아군 항공모함
    const carriers = g.units.filter(x => x.hp > 0 && x.side === side && D.units[x.type].carrier).map(x => [x.c, x.r]);
    // 점령 목표 분담: 보병류마다 서로 다른 도시를 배정 (점령 중이면 그 도시 유지). 턴당 1회 계산.
    const cached = CTX.get(g);
    const base = { side, vis, enemies, capital, homes, targets, capThreat, defendSpots, carriers, objectives };
    if (cached && cached.stamp === stamp) return Object.assign(base, { assign: cached.assign });
    const assign = new Map(), taken = new Set();
    const capturers = g.units.filter(u => u.hp > 0 && u.side === side && D.units[u.type].capture);
    for (const u of capturers) {
      const k = Object.keys(g.cities).find(k2 => g.cities[k2].by === u.id && g.cities[k2].owner !== side);
      if (k) { assign.set(u.id, k.split(',').map(Number)); taken.add(k); }
    }
    const pairs = [], assault = g.winRule === 'survive' && side === 'red'; // 방어 작전: 적군 AI는 청군 수도 총공격
    const objKeys = new Set(g.winRule === 'capture' && side === 'blue' ? g.targets : []); // 목표 점령 작전: 청군은 목표 도시 우선
    for (const t of targets) {
      const f = costField(g, 'foot', [t]);
      const bonus = (g.map[t[1]][t[0]] === 'capital' ? (assault ? -12 : -2) : 0) + (objKeys.has(R.key(t[0], t[1])) ? -10 : 0);
      for (const u of capturers) if (!assign.has(u.id)) pairs.push([f[u.r * g.W + u.c] + bonus, u.id, t]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [d, id, t] of pairs) {
      const k = R.key(t[0], t[1]);
      if (d === Infinity || assign.has(id) || taken.has(k)) continue;
      assign.set(id, t); taken.add(k);
    }
    CTX.set(g, { stamp, assign });
    return Object.assign(base, { assign });
  }

  // 한 유닛의 최선 행동 계산 → { c, r, act: {type, target}, score }
  function plan(g, u, ctx) {
    ctx = ctx || context(g);
    const rng = g.rng || Math.random;
    const st = R.stat(u), air = R.isAir(u);
    const origin = { c: u.c, r: u.r, moved: u.moved };
    const { enemies, capital } = ctx;
    const homes = air ? ctx.homes.concat(ctx.carriers) : ctx.homes;   // 항공기는 항공모함도 보급처
    const hittable = enemies.filter(t => atkVs(st, t) > 0);
    const foeSpots = (hittable.length ? hittable : enemies).map(t => [t.c, t.r]);
    const goalSpots = foeSpots.length ? foeSpots : ctx.targets;

    // 역할 결정
    const lowFuel = air && homes.length && u.fuel <= (st.upkeep || 0) * 2 + minDist(u.c, u.r, homes) + 2;
    const needRepair = !air && homes.length && (u.ammo === 0 || (u.hp <= 3 && !st.capture));
    const capGoal = st.capture ? ctx.assign.get(u.id) : null;
    let field, weight = K.path;
    if (lowFuel || needRepair) { field = costField(g, st.moveType, homes); weight = K.home; }
    else if (capGoal) { field = costField(g, st.moveType, [capGoal]); weight = K.capture; }
    else if (g.winRule === 'survive' && u.side === 'red') {
      // 방어 작전의 공격측: 청군 수도를 향해 진격하면서 길목의 적을 친다
      const cap = Object.keys(g.cities).find(k => g.cities[k].owner !== u.side && g.map[k.split(',')[1]][k.split(',')[0]] === 'capital');
      field = costField(g, st.moveType, cap ? [cap.split(',').map(Number)] : goalSpots);
    }
    else if (g.winRule === 'capture' && u.side === 'blue' && ctx.objectives.length && !air) {
      // 목표 점령 작전의 공격측: 목표 도시 방향으로 밀고 나감
      field = costField(g, st.moveType, ctx.objectives.filter(([x, y]) => g.cities[R.key(x, y)].owner !== 'blue'));
    }
    else field = costField(g, st.moveType, goalSpots.length ? goalSpots : homes);
    const capField = (ctx.capThreat && ctx.defendSpots.length && !capGoal && !air) ? costField(g, st.moveType, ctx.defendSpots) : null;

    let best = null;
    for (const p of R.reachable(g, u)) {
      u.c = p.c; u.r = p.r; u.moved = (p.c !== origin.c || p.r !== origin.r);
      const i = p.r * g.W + p.c, terr = air || st.moveType === 'ship' ? 0 : D.terrain[g.map[p.r][p.c]].def;
      let pos = 0;
      if (st.indirect && !(lowFuel || needRepair)) pos = -Math.abs(minDist(p.c, p.r, goalSpots) - (st.range[0] + st.range[1]) / 2 - 0.5) * 0.6;
      else if (st.carrier) pos = -Math.abs(minDist(p.c, p.r, goalSpots) - 5) * 0.6;   // 항공모함: 적과 5칸 정도 거리 유지
      else pos = -(isFinite(field[i]) ? field[i] : 40) * weight;
      if ((lowFuel || needRepair) && homes.some(([x, y]) => x === p.c && y === p.r)) pos += 3;
      if (capField) pos -= Math.min(capField[i], 12) * K.defend;
      pos += terr * 2;
      // 위협: 다음 턴에 이 칸을 칠 수 있는 적의 예상 화력
      let threat = 0;
      for (const e of enemies) {
        const se = R.stat(e), atk = atkVs(se, u);
        if (atk <= 0) continue;
        if (R.dist(e.c, e.r, p.c, p.r) <= se.move * 0.7 + se.range[1]) threat += atk * (e.hp / 10) * 6 / (st.def + 4) * (1 - terr);
      }
      pos -= threat * VAL(u) * (D.ai ? D.ai.threat : 0.12);

      let act = { type: 'wait' }, actScore = 0;
      if (R.canCapture(g, u)) {
        const city = g.cities[R.key(p.c, p.r)];
        actScore = (g.map[p.r][p.c] === 'capital' ? 50 : 12) + (city.by === u.id ? 6 : 0);
        act = { type: 'capture' };
      }
      for (const t of R.attackTargets(g, u)) {
        if (ctx.vis && !ctx.vis.has(R.key(t.c, t.r))) continue;
        const f = R.forecast(g, u, t);
        let s = f.dmg * VAL(t) - f.counter * VAL(u) * 0.9;
        if (f.dmg >= t.hp) s += VAL(t) * 4;
        s += (10 - t.hp) * K.focus * VAL(t) * (f.dmg > 0 ? 1 : 0);          // 집중 공격
        const tc = g.cities[R.key(t.c, t.r)];
        if (tc && tc.owner === ctx.side && tc.by === t.id) s += K.guard;              // 우리 도시 점령 중인 적
        if (capital && R.dist(t.c, t.r, capital[0], capital[1]) <= 3) s += K.guard;    // 수도 근처의 적
        if (u.side === 'blue' && g.winRule === 'sink' && g.sinkTypes.includes(t.type)) s += K.guard * 3; // 격침 목표 함선
        if (D.units[t.type].carrier) s += K.guard;                                     // 항공모함은 언제나 우선 표적
        if (s > actScore) { actScore = s; act = { type: 'attack', target: t }; }
      }
      const score = pos + actScore + (D.ai ? (rng() - 0.5) * D.ai.noise : 0);
      if (!best || score > best.score) best = { c: p.c, r: p.r, act, score };
    }
    u.c = origin.c; u.r = origin.r; u.moved = origin.moved;
    return best;
  }

  // 계획 실행 → 결과 요약 반환
  function execute(g, u, p) {
    R.moveUnit(g, u, p.c, p.r);
    if (p.act.type === 'attack' && p.act.target.hp > 0) {
      const res = R.attack(g, u, p.act.target);
      if (res) return { type: 'attack', target: p.act.target, res };
    }
    if (p.act.type === 'capture') { const res = R.capture(g, u); if (res) return { type: 'capture', res }; }
    R.wait(g, u);
    return { type: 'wait' };
  }

  // 행동 순서: 간접포(이동 전 사격) → 항공 → 지상 → 보병
  function unitsInOrder(g) {
    return g.units.filter(u => u.side === g.side && u.hp > 0 && !u.acted).sort((a, b) => ORD(a.type) - ORD(b.type));
  }

  function playTurn(g) {
    for (const u of unitsInOrder(g)) { if (g.winner) break; if (u.hp > 0) execute(g, u, plan(g, u)); }
    if (!g.winner) produceTurn(g);
  }

  // ---- 생산: 적에게 가까운 도시부터, 상황에 맞는 유닛 선택 ----
  // 유닛 종류를 하드코딩하지 않고 능력치로 역할을 판단 → 새 유닛도 자동으로 생산 후보가 됨
  const U = D.units, TYPES = Object.keys(U);
  const isAirT = t => U[t].moveType === 'air';
  const isAA = t => U[t].atkA >= 8;                                         // 대공 역할
  const isShipT = t => U[t].moveType === 'ship';
  const isBrawler = t => !isAirT(t) && !isShipT(t) && !U[t].indirect && !U[t].capture;   // 지상 정면 전투
  const pick = (list, rng) => list.length ? list[Math.floor(rng() * list.length)] : null;
  function chooseType(g, c, r, rng, ctx) {
    const side = g.side, mine = g.units.filter(u => u.hp > 0 && u.side === side), foes = ctx.enemies;
    const ok = t => R.canProduce(g, c, r, t);
    const has = pred => mine.filter(u => pred(u.type)).length;
    const avail = ((g.rosters && g.rosters[side]) || TYPES).filter(ok);
    if (!avail.length) return null;
    // 수도 위협: 가장 튼튼한 지상 전투 유닛
    if (ctx.capThreat) { const b = avail.filter(isBrawler).sort((a, b) => (U[b].atkG + U[b].def) - (U[a].atkG + U[a].def))[0]; if (b) return b; }
    // 적 항공 우세: 대공 유닛
    if (foes.filter(u => R.isAir(u)).length > has(isAA)) { const aa = pick(avail.filter(isAA), rng); if (aa) return aa; }
    // 점령 병력 부족: 점령 가능 유닛 (가끔 강한 쪽)
    const caps = avail.filter(t => U[t].capture).sort((a, b) => U[a].cost - U[b].cost);
    if (has(t => U[t].capture) < Math.min(4, ctx.targets.length + 1)) return caps.length ? (caps.length > 1 && rng() < 0.35 ? caps[caps.length - 1] : caps[0]) : null;
    // 적 기갑이 많으면 대지공격 높은 점령 유닛 비중↑
    if (foes.filter(u => isBrawler(u.type) && U[u.type].def >= 6).length >= 3 && caps.length > 1 && rng() < 0.3) return caps[caps.length - 1];
    // 그 외: 비싼 유닛 위주로 무작위
    const pool = avail.sort((a, b) => U[b].cost - U[a].cost);
    for (const t of pool) if (rng() < 0.55) return t;
    return pool[0];
  }
  function produceTurn(g) {
    const rng = g.rng || Math.random, made = [], ctx = context(g);
    const foes = ctx.enemies.length ? ctx.enemies.map(u => [u.c, u.r]) : ctx.targets;
    const spots = ctx.homes.slice().sort((a, b) => minDist(a[0], a[1], foes) - minDist(b[0], b[1], foes));
    for (const [c, r] of spots) {
      if (R.unitAt(g, c, r)) continue;
      const t = chooseType(g, c, r, rng, ctx);
      if (t) { const u = R.produce(g, c, r, t); if (u) made.push(u); }
    }
    return made;
  }

  const API = { plan, execute, unitsInOrder, playTurn, produceTurn, context };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.HCAI = API;
})(this);
