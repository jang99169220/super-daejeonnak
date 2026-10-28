// HEX COMMAND 88 — 게임 데이터. 밸런스 조정은 이 파일만 수정한다.
(function (root) {
  'use strict';
  const HC_DATA = {
    version: '0.11.1',
    sides: {
      blue: { name: '청군', tag: 'BLU' },
      red: { name: '적군', tag: 'RED' }
    },
    terrain: {
      plain:    { name: '평지', def: 0 },
      forest:   { name: '숲',   def: 0.2 },
      mountain: { name: '산',   def: 0.35 },
      water:    { name: '물',   def: 0 },
      city:     { name: '도시', def: 0.3 },
      capital:  { name: '수도', def: 0.4 },
      port:     { name: '항구', def: 0.2 },   // 도시처럼 점령·수입·보급. 함선은 항구에서만 생산·정박
      beach:    { name: '해안', def: 0 }      // 상륙 해안: 몸을 숨길 곳이 없음
    },
    // null = 진입 불가. 지형을 새로 만들면 모든 이동방식에 값을 넣어야 함 (node test.js가 검사)
    moveCost: {
      foot:  { plain: 1, forest: 2, mountain: 3,    water: null, city: 1,    capital: 1,    port: 1, beach: 1 },
      tread: { plain: 1, forest: 2, mountain: null, water: null, city: 1,    capital: 1,    port: 1, beach: 2 },
      wheel: { plain: 1, forest: 3, mountain: null, water: null, city: 1,    capital: 1,    port: 1, beach: 2 },
      air:   { plain: 1, forest: 1, mountain: 1,    water: 1,    city: 1,    capital: 1,    port: 1, beach: 1 },
      ship:  { plain: null, forest: null, mountain: null, water: 1, city: null, capital: null, port: 1, beach: null }
    },
    units: {
      // 유닛 1개 = 이 항목 하나. 새 유닛은 여기에만 추가하면 규칙·AI·생산·그림·에디터에 모두 반영된다.
      // name 이름 · vision 시야 · moveType 이동방식(foot/tread/wheel/air) · move 이동력
      // atkG 대지공격 · atkA 대공공격 · def 방어 · range [최소,최대] 사거리 · fuel 연료 · ammo 탄약 · cost 생산비
      // 선택: capture 점령 가능 · indirect 간접공격(이동 후 사격·반격 불가) · upkeep 항공기 턴당 연료 소모
      // AI용: value 유닛 가치(공격 우선순위·손실 회피) · order 행동 순서(작을수록 먼저)
      // sprite: 14×9 도트 그림, 오른쪽을 향하게. W = 흰 몸체, D = 검은 선, . = 투명
      INF: {
        name: '보병',       vision: 2, moveType: 'foot',  move: 3,  atkG: 5,  atkA: 1, def: 4, range: [1, 1], fuel: 99, ammo: 9, capture: true, cost: 1000,
        value: 1, order: 9,
        sprite: [
          '.....WW.......',
          '....WWWW......',
          '.....WW.......',
          '...WWWWWWWWWWW',
          '...WWWWW......',
          '....WWWW......',
          '....WW.WW.....',
          '...WW...WW....',
          '...W.....W....'
        ]
      },
      ATI: {
        name: '대전차보병', vision: 2, moveType: 'foot',  move: 2,  atkG: 7,  atkA: 1, def: 4, range: [1, 1], fuel: 99, ammo: 6, capture: true, cost: 2500,
        value: 1.8, order: 8,
        sprite: [
          '.....WW.......',
          '....WWWW......',
          '.WWWWWWWWWWWWW',
          '.WW.WWWW....WW',
          '....WWWW......',
          '....WWWW......',
          '....WW.WW.....',
          '...WW...WW....',
          '...W.....W....'
        ]
      },
      RCN: {
        name: '정찰차',     vision: 4, moveType: 'wheel', move: 8,  atkG: 4,  atkA: 1, def: 4, range: [1, 1], fuel: 70, ammo: 8, cost: 3000,
        value: 1.8, order: 7,
        sprite: [
          '..............',
          '..............',
          '.....WWW......',
          '....WWWWWWWWW.',
          '..WWWWWWWWWWWW',
          '.WWWWWWWWWWWWW',
          '.WWDDWWWWWDDWW',
          '..WDDW...WDDW.',
          '...WW.....WW..'
        ]
      },
      TNK: {
        name: '전차',       vision: 2, moveType: 'tread', move: 6,  atkG: 8,  atkA: 0, def: 7, range: [1, 1], fuel: 60, ammo: 8, cost: 7000,
        value: 3, order: 6,
        sprite: [
          '..............',
          '.....WWWW.....',
          '....WWWWWWWWWW',
          '....WWWWW.....',
          '.WWWWWWWWWWWW.',
          'WWWWWWWWWWWWWW',
          'WDWWDWWDWWDWWW',
          '.WWWWWWWWWWWW.',
          '..............'
        ]
      },
      AAA: {
        name: '대공전차',   vision: 3, moveType: 'tread', move: 5,  atkG: 3,  atkA: 9, def: 5, range: [1, 1], fuel: 60, ammo: 8, cost: 5000,
        value: 2.4, order: 5,
        sprite: [
          '.........W..W.',
          '........W..W..',
          '.......W..W...',
          '.....WWWWW....',
          '.WWWWWWWWWWWW.',
          'WWWWWWWWWWWWWW',
          'WDWWDWWDWWDWWW',
          '.WWWWWWWWWWWW.',
          '..............'
        ]
      },
      SPG: {
        name: '자주포',     vision: 2, moveType: 'tread', move: 4,  atkG: 9,  atkA: 0, def: 3, range: [2, 3], fuel: 50, ammo: 6, indirect: true, cost: 6000,
        value: 2.5, order: 1,
        sprite: [
          '............WW',
          '..........WW..',
          '........WW....',
          '...WWWWWW.....',
          '...WWWWWW.....',
          '.WWWWWWWWWWW..',
          'WWWWWWWWWWWWW.',
          'WDWWDWWDWWDWW.',
          '.WWWWWWWWWWW..'
        ]
      },
      MRL: {
        name: '로켓포',     vision: 2, moveType: 'tread', move: 4,  atkG: 10, atkA: 0, def: 2, range: [3, 5], fuel: 50, ammo: 4, indirect: true, cost: 9000,
        value: 3.2, order: 0,
        sprite: [
          '..........WWWW',
          '.......WWWWWW.',
          '....WWWWWWW...',
          '....WWWWW.....',
          'WWWWWWWWWWWW..',
          'WWWWWWWWWWWWW.',
          'WWDDWWWWWDDWW.',
          '.WDDW....WDDW.',
          '..............'
        ]
      },
      FTR: {
        name: '전투기',     vision: 4, moveType: 'air',   move: 10, atkG: 2,  atkA: 9, def: 6, range: [1, 1], fuel: 40, ammo: 6, upkeep: 2, cost: 11000,
        value: 3.4, order: 2,
        sprite: [
          '..WW..........',
          '..WWW.........',
          '..WWWWW.......',
          'WWWWWWWWWWWW..',
          '.WWWWWWWWWWWWW',
          'WWWWWWWWWWWW..',
          '..WWWWW.......',
          '..WWW.........',
          '..WW..........'
        ]
      },
      HEL: {
        name: '공격헬기',   vision: 3, moveType: 'air',   move: 7,  atkG: 7,  atkA: 2, def: 4, range: [1, 1], fuel: 30, ammo: 6, upkeep: 2, cost: 8000,
        value: 2.6, order: 4,
        sprite: [
          '..WWWWWWWWWWWW',
          '........W.....',
          '......WWWWWW..',
          'WW...WWWDDWWW.',
          'WWWWWWWWWWWWWW',
          '.....WWWWWWWW.',
          '......W....W..',
          '....WWWWWWWWW.',
          '..............'
        ]
      },
      BMB: {
        name: '폭격기',     vision: 3, moveType: 'air',   move: 8,  atkG: 11, atkA: 0, def: 5, range: [1, 1], fuel: 45, ammo: 4, upkeep: 3, cost: 13000,
        value: 3.8, order: 3,
        sprite: [
          '.....WW.......',
          '.....WW.......',
          '.....WWW......',
          '..W..WWW......',
          'WWWWWWWWWWWWWW',
          '..W..WWW......',
          '.....WWW......',
          '.....WW.......',
          '.....WW.......'
        ]
      }
    },
    combat: { factor: 6, defBase: 4 },
    // 경제: 시작 자금, 턴 시작 시 소유 도시당 수입, 진영당 최대 유닛 수
    economy: { start: 5000, city: 1000, capital: 2000, maxUnits: 20 },
    // 턴 제한: limit 턴이 끝나면 점수 판정 (유닛가치 = 비용 × HP/10, 도시당 city점)
    turnLimit: { limit: 40, city: 3000 },
    // 전장의 안개: 아군 도시가 보는 범위
    citySight: 1,
    // 컴퓨터 AI 설정: noise = 판단 실수 폭(클수록 쉬움), threat = 위험 회피 정도, stepMs = 유닛당 행동 간격
    // 게임 화면의 [난이도]/[속도] 버튼이 아래 단계 중 하나를 골라 ai 값에 덮어쓴다.
    ai: { noise: 3.5, threat: 0.07, stepMs: 605 },
    aiLevels: [
      { id: 'easy',   name: '쉬움',   noise: 6,   threat: 0.04 },
      { id: 'normal', name: '보통',   noise: 3.5, threat: 0.07 },
      { id: 'hard',   name: '어려움', noise: 0,   threat: 0.12 }
    ],
    aiSpeeds: [
      { id: 'slow',   name: '느림', stepMs: 900 },
      { id: 'normal', name: '보통', stepMs: 605 },
      { id: 'fast',   name: '빠름', stepMs: 350 }
    ],
    // 계급: 전투 경험치(xp)가 쌓이면 승급. 공격력 +atk, 받는 피해 -def (비율)
    // 경험치 = 준 피해(공격·반격) + 격파 시 kill
    ranks: [
      { name: '신병', xp: 0,  atk: 0,    def: 0 },
      { name: '숙련', xp: 10, atk: 0.05, def: 0.05 },
      { name: '정예', xp: 25, atk: 0.1,  def: 0.08 },
      { name: '영웅', xp: 45, atk: 0.15, def: 0.12 }
    ],
    xpKill: 5,
    xpMax: 45,                         // 경험치 상한 (최고 계급 기준)
    captureMax: 20,
    supply: { heal: 2 },
    legend: {
      '.': { t: 'plain' }, 'f': { t: 'forest' }, 'm': { t: 'mountain' }, 'w': { t: 'water' },
      'c': { t: 'city', owner: null }, 'b': { t: 'city', owner: 'blue' }, 'r': { t: 'city', owner: 'red' },
      'B': { t: 'capital', owner: 'blue' }, 'R': { t: 'capital', owner: 'red' },
      'p': { t: 'port', owner: null }, 'h': { t: 'port', owner: 'blue' }, 'k': { t: 'port', owner: 'red' },
      's': { t: 'beach' }
    },
    // 클래식 모드에서 양측이 쓰는 유닛 목록
    rosters: { classic: ['INF', 'ATI', 'RCN', 'TNK', 'AAA', 'SPG', 'MRL', 'FTR', 'HEL', 'BMB'] },
    // 시나리오 모드: 확장팩 파일(js/pack-*.js)이 시대(eras)·국가(nations)·유닛·시나리오를 등록한다
    eras: [],
    nations: {},
    scenarios: [],
    packFiles: ['pack-ww2.js'],
    // 맵 목록. 기호는 legend 참고. setup = 시작 배치 (적군은 좌우 대칭)
    // redBonus = 후공(적군) 시작 자금 보정. AI끼리 대전 승률이 비슷해지도록 맞춘 값
    maps: [
      {
        id: 'river', redBonus: 3000, name: '강변 회랑', note: '14×10 · 중앙 도시 4곳을 두고 싸우는 기본 맵',
        map: [
      'mm..f.ww.f..mm',
      'm..c.f..f.c..m',
      '.b..ff..ff..r.',
      '..f..m..m..f..',
      'Bb.f..cc..f.rR',
      '.b..f.mm.f..r.',
      '...ff.ww.ff...',
      'm.c..f..f..c.m',
      'mm...fwwf...mm',
      'mmm..wwww..mmm'
    ],
        setup: [
      { side: 'blue', type: 'INF', c: 1, r: 2 }, { side: 'blue', type: 'INF', c: 1, r: 5 },
      { side: 'blue', type: 'INF', c: 2, r: 3 }, { side: 'blue', type: 'TNK', c: 2, r: 4 },
      { side: 'blue', type: 'TNK', c: 3, r: 5 }, { side: 'blue', type: 'SPG', c: 0, r: 3 },
      { side: 'blue', type: 'FTR', c: 0, r: 5 }, { side: 'blue', type: 'HEL', c: 1, r: 4 },
      { side: 'red', type: 'INF', c: 12, r: 2 }, { side: 'red', type: 'INF', c: 12, r: 5 },
      { side: 'red', type: 'INF', c: 11, r: 3 }, { side: 'red', type: 'TNK', c: 11, r: 4 },
      { side: 'red', type: 'TNK', c: 10, r: 5 }, { side: 'red', type: 'SPG', c: 13, r: 3 },
      { side: 'red', type: 'FTR', c: 13, r: 5 }, { side: 'red', type: 'HEL', c: 12, r: 4 }
    ]
      },
      {
        id: 'ridge', redBonus: 4000, name: '산악 요새', note: '16×11 · 산맥 사이 좁은 고개를 뚫는 맵. 자주포·보병이 강함',
        map: [
          'mmmm..f..f..mmmm',
          'mm.c..mmmm..c.mm',
          'm..f.m....m.f..m',
          '.b...mc..cm...r.',
          'B.f...m..m...f.R',
          '.b.f..c..c..f.r.',
          '..f..m....m..f..',
          'm.c..mm..mm..c.m',
          'mm...f.mm.f...mm',
          'mmm.f..mm..f.mmm',
          'mmmm..mmmm..mmmm'
        ],
        setup: [
          { side: 'blue', type: 'INF', c: 1, r: 3 },
          { side: 'blue', type: 'INF', c: 1, r: 5 },
          { side: 'blue', type: 'INF', c: 2, r: 4 },
          { side: 'blue', type: 'TNK', c: 1, r: 4 },
          { side: 'blue', type: 'TNK', c: 3, r: 3 },
          { side: 'blue', type: 'SPG', c: 0, r: 3 },
          { side: 'blue', type: 'HEL', c: 0, r: 5 },
          { side: 'red', type: 'INF', c: 14, r: 3 },
          { side: 'red', type: 'INF', c: 14, r: 5 },
          { side: 'red', type: 'INF', c: 13, r: 4 },
          { side: 'red', type: 'TNK', c: 14, r: 4 },
          { side: 'red', type: 'TNK', c: 12, r: 3 },
          { side: 'red', type: 'SPG', c: 15, r: 3 },
          { side: 'red', type: 'HEL', c: 15, r: 5 }
        ]
      },
      {
        id: 'strait', redBonus: 7500, name: '해협 군도', note: '14×10 · 바다로 갈린 섬. 육로는 중앙 다리 하나, 항공 위주',
        map: [
          'wwwwwwwwwwwwww',
          'w..mf.ww.fm..w',
          'wb...wwww...rw',
          'w.f...cc...f.w',
          'wB..f....f..Rw',
          'w.b..wwww..r.w',
          'ww..wwwwww..ww',
          'w.c.wwwwww.c.w',
          'w..mwwwwwwm..w',
          'wwwwwwwwwwwwww'
        ],
        setup: [
          { side: 'blue', type: 'INF', c: 1, r: 2 },
          { side: 'blue', type: 'INF', c: 2, r: 5 },
          { side: 'blue', type: 'INF', c: 2, r: 2 },
          { side: 'blue', type: 'TNK', c: 2, r: 4 },
          { side: 'blue', type: 'FTR', c: 1, r: 3 },
          { side: 'blue', type: 'HEL', c: 3, r: 3 },
          { side: 'red', type: 'INF', c: 12, r: 2 },
          { side: 'red', type: 'INF', c: 11, r: 5 },
          { side: 'red', type: 'INF', c: 11, r: 2 },
          { side: 'red', type: 'TNK', c: 11, r: 4 },
          { side: 'red', type: 'FTR', c: 12, r: 3 },
          { side: 'red', type: 'HEL', c: 10, r: 3 }
        ]
      },
      {
        id: 'plains', redBonus: 9000, name: '평원 돌파', note: '16×10 · 탁 트인 평원. 전차와 로켓포의 정면 승부',
        map: [
          '..f..........f..',
          '.c...f....f...c.',
          'b...m......m...r',
          '...f..c..c..f...',
          'B.b..........r.R',
          '....f..cc..f....',
          '.b.m........m.r.',
          '...f.c....c.f...',
          '.c............c.',
          '....f......f....'
        ],
        setup: [
          { side: 'blue', type: 'INF', c: 1, r: 2 },
          { side: 'blue', type: 'INF', c: 1, r: 6 },
          { side: 'blue', type: 'INF', c: 2, r: 3 },
          { side: 'blue', type: 'TNK', c: 3, r: 4 },
          { side: 'blue', type: 'TNK', c: 1, r: 5 },
          { side: 'blue', type: 'SPG', c: 0, r: 3 },
          { side: 'blue', type: 'RCN', c: 3, r: 2 },
          { side: 'blue', type: 'AAA', c: 0, r: 6 },
          { side: 'red', type: 'INF', c: 14, r: 2 },
          { side: 'red', type: 'INF', c: 14, r: 6 },
          { side: 'red', type: 'INF', c: 13, r: 3 },
          { side: 'red', type: 'TNK', c: 12, r: 4 },
          { side: 'red', type: 'TNK', c: 14, r: 5 },
          { side: 'red', type: 'SPG', c: 15, r: 3 },
          { side: 'red', type: 'RCN', c: 12, r: 2 },
          { side: 'red', type: 'AAA', c: 15, r: 6 }
        ]
      },
      {
        id: 'forest', redBonus: 2500, name: '삼림 지대', note: '14×11 · 숲이 빽빽한 맵. 보병 매복과 헬기가 강함',
        map: [
          'mfffff..fffffm',
          'f.c.ff..ff.c.f',
          'fbff.fccf.ffrf',
          '.ff.f.ff.f.ff.',
          'Bf.ff....ff.fR',
          'fb.f.cffc.f.rf',
          '.ff.f.ff.f.ff.',
          'f.cff.ff.ffc.f',
          'ff.f.ffff.f.ff',
          'mff.ffffff.ffm',
          'mmff.ffff.ffmm'
        ],
        setup: [
          { side: 'blue', type: 'INF', c: 1, r: 2 },
          { side: 'blue', type: 'INF', c: 1, r: 5 },
          { side: 'blue', type: 'INF', c: 2, r: 4 },
          { side: 'blue', type: 'ATI', c: 0, r: 3 },
          { side: 'blue', type: 'TNK', c: 2, r: 5 },
          { side: 'blue', type: 'SPG', c: 0, r: 6 },
          { side: 'blue', type: 'HEL', c: 1, r: 4 },
          { side: 'red', type: 'INF', c: 12, r: 2 },
          { side: 'red', type: 'INF', c: 12, r: 5 },
          { side: 'red', type: 'INF', c: 11, r: 4 },
          { side: 'red', type: 'ATI', c: 13, r: 3 },
          { side: 'red', type: 'TNK', c: 11, r: 5 },
          { side: 'red', type: 'SPG', c: 13, r: 6 },
          { side: 'red', type: 'HEL', c: 12, r: 4 }
        ]
      },
      {
        id: 'final', redBonus: 6500, name: '수도 결전', note: '18×12 · 도시가 많은 큰 맵. 장기전과 경제 운영',
        map: [
          'mm..f..c..c..f..mm',
          'm.c..f......f..c.m',
          '.b..m..f..f..m..r.',
          '..f..c..mm..c..f..',
          'b..f...c..c...f..r',
          'B.b..m......m..r.R',
          '..b.f..c..c..f.r..',
          '.f...m......m...f.',
          'm..c..f....f..c..m',
          '.b..f...cc...f..r.',
          'mm..c.f....f.c..mm',
          'mmm...ff..ff...mmm'
        ],
        setup: [
          { side: 'blue', type: 'INF', c: 1, r: 2 },
          { side: 'blue', type: 'INF', c: 2, r: 5 },
          { side: 'blue', type: 'INF', c: 2, r: 6 },
          { side: 'blue', type: 'TNK', c: 1, r: 4 },
          { side: 'blue', type: 'TNK', c: 3, r: 5 },
          { side: 'blue', type: 'SPG', c: 0, r: 6 },
          { side: 'blue', type: 'AAA', c: 1, r: 5 },
          { side: 'blue', type: 'FTR', c: 0, r: 4 },
          { side: 'blue', type: 'HEL', c: 3, r: 3 },
          { side: 'red', type: 'INF', c: 16, r: 2 },
          { side: 'red', type: 'INF', c: 15, r: 5 },
          { side: 'red', type: 'INF', c: 15, r: 6 },
          { side: 'red', type: 'TNK', c: 16, r: 4 },
          { side: 'red', type: 'TNK', c: 14, r: 5 },
          { side: 'red', type: 'SPG', c: 17, r: 6 },
          { side: 'red', type: 'AAA', c: 16, r: 5 },
          { side: 'red', type: 'FTR', c: 17, r: 4 },
          { side: 'red', type: 'HEL', c: 14, r: 3 }
        ]
      }
    ],
    // 캠페인: 작전을 순서대로 진행. 이긴 작전에서 살아남은 청군 유닛(경험 많은 순, carry개)과 남은 자금 일부가 다음 작전으로 넘어감.
    // 작전 항목: map 맵 id · title 제목 · brief 브리핑 · winRule 'normal'(수도 점령/전멸/판정) | 'survive'(제한 턴까지 수도 사수)
    //           turnLimit 제한 턴 · redBonus 적군 추가 자금 · redXp 적군 시작 유닛 경험치(적 정예부대)
    //           extraUnits 작전 전용 추가 병력 [{side, type, c, r}]
    // 난이도 기준(v0.9.0): 청군 AI가 영웅 6기를 데리고 싸울 때 승률 약 60% → 마지막 작전 40%
    campaign: {
      name: '청군 반격 작전',
      carry: 6,                       // 다음 작전으로 넘어가는 유닛 수
      fundsCarry: 0.3,                // 남은 자금 중 넘어가는 비율
      fundsCarryMax: 6000,
      scenarios: [
        { map: 'river', title: '국경 회랑', turnLimit: 40, redBonus: 3000,
          brief: '적군이 국경의 강변 회랑을 넘어왔다. 중앙의 도시들을 먼저 확보해 수입을 늘리고, 적 수도를 점령해 국경을 되찾아라.' },
        { map: 'ridge', title: '산악 고개', turnLimit: 40, redBonus: 10000, redXp: 10,
          brief: '패주한 적은 산맥 너머 요새로 물러났다. 고개는 좁고 적 포병이 기다린다. 자주포로 길을 열고 보병으로 도시를 점령하라.' },
        { map: 'plains', title: '평원 돌파', turnLimit: 40, redBonus: 15000, redXp: 10,
          brief: '산을 넘자 끝없는 평원이 펼쳐진다. 적 기갑 사단이 정면으로 몰려온다. 전차와 로켓포를 아끼지 말고, 대공 엄호를 잊지 마라.' },
        { map: 'strait', title: '해협 상륙', turnLimit: 40, redBonus: 14000, redXp: 10,
          brief: '적 주력은 바다 건너 섬으로 철수했다. 육로는 중앙 다리 하나뿐이다. 제공권을 먼저 잡고 다리를 건너라.' },
        { map: 'forest', title: '삼림 방어', winRule: 'survive', turnLimit: 20, redBonus: 14500, redXp: 10,
          extraUnits: [
            { side: 'red', type: 'TNK', c: 10, r: 3 }, { side: 'red', type: 'TNK', c: 10, r: 5 },
            { side: 'red', type: 'INF', c: 11, r: 2 }, { side: 'red', type: 'INF', c: 11, r: 6 }
          ],
          brief: '적이 총반격에 나섰다. 증원이 도착할 때까지 숲을 방패 삼아 20턴 동안 수도를 지켜라. 적 수도를 먼저 점령해도 승리한다.' },
        { map: 'final', title: '수도 결전', turnLimit: 45, redBonus: 16000, redXp: 25,
          brief: '마지막 전투다. 적 수도를 둘러싼 도시들을 하나씩 빼앗아 경제를 무너뜨리고, 적 수도를 점령해 전쟁을 끝내라.' }
      ]
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = HC_DATA;
  else root.HC_DATA = HC_DATA;
})(this);
