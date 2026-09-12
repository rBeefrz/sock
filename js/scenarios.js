// Sock Tycoon test saves. Named game states for trying out a stage of the
// game without playing up to it. Loads in the browser (window.SockScenarios)
// and in Node (module.exports) so the tests can check every scenario.
(function (root, factory) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Sim = isNode ? require('./sim.js') : root.SockSim;
  const api = factory(Sim);
  if (isNode) module.exports = api;
  else root.SockScenarios = api;
})(this, function (Sim) {
  'use strict';

  const D = Sim.data;

  const researchById = {};
  D.research.forEach((r) => { researchById[r.id] = r; });

  function vehicle(typeId) {
    return { type: typeId, phase: 'loading', progress: 0, load: 0, timer: 0, delay: 0, mishap: null };
  }

  // Grant research plus everything it depends on, transitively.
  function grantResearch(s, ids) {
    const todo = ids.slice();
    while (todo.length) {
      const id = todo.pop();
      const r = researchById[id];
      if (!r || s.research[id]) continue;
      s.research[id] = true;
      ((r.requires && r.requires.research) || []).forEach((dep) => todo.push(dep));
    }
  }

  // Every machine blueprint, sock pattern and vehicle the given levels allow,
  // plus logistics research up to those levels. Doctrines are exclusive and
  // are never granted here; name them explicitly.
  function researchUpTo(factoryLevel, shopLevel) {
    return D.research
      .filter((r) => {
        if (r.branch) return false;
        const req = r.requires || {};
        const f = req.factoryLevel === undefined || req.factoryLevel <= factoryLevel;
        const sh = req.shopLevel === undefined || req.shopLevel <= shopLevel;
        return f && sh;
      })
      .map((r) => r.id);
  }

  // Build a state from a short description. Milestones are set so the
  // levels given are legitimately reachable.
  function make(now, o) {
    const s = Sim.newState(now);
    s.factoryLevel = o.factoryLevel || 0;
    s.shopLevel = o.shopLevel || 0;
    grantResearch(s, o.research || []);
    Object.keys(o.producers || {}).forEach((id) => { s.producers[id] = o.producers[id]; });
    Object.keys(o.upkeep || {}).forEach((id) => { s.upkeep[id] = o.upkeep[id]; });
    const fleet = o.vehicles || { backpack: 1 };
    s.vehicles = [];
    Object.keys(fleet).forEach((id) => {
      for (let i = 0; i < fleet[id]; i++) s.vehicles.push(vehicle(id));
    });
    (o.upgrades || []).forEach((id) => { s.upgrades[id] = true; });
    s.marketing = o.marketing || 0;
    s.sockLine = o.sockLine || 0;
    if (s.sockLine > 0) grantResearch(s, ['s_' + D.sockLines[s.sockLine].id]);
    s.money = o.money || 0;
    s.socks = o.socks || 0;
    s.factoryStock = o.factoryStock || 0;
    s.threads = o.threads || 0;
    s.claimedThreads = s.threads;
    s.retirements = o.retirements || 0;
    s.bankruptcies = o.bankruptcies || 0;
    s.playTime = o.playTime || 0;
    s.outrage = o.outrage || 0;
    s.grumble = o.grumble || 0;
    // loans: { lender, principal, owed, dueIn (seconds from now), stage }
    (o.loans || []).forEach((l) => {
      s.loans.push({ lender: l.lender, principal: l.principal, owed: l.owed || l.principal, due: s.playTime + l.dueIn, stage: l.stage || 0 });
    });
    (o.events || []).forEach((id) => {
      const d = D.events[id];
      s.events.push({ id, remaining: d.duration || null });
    });
    Sim.setMarkup(s, o.markup || 1);

    const knitted = D.factoryLevels[s.factoryLevel].requiresKnitted;
    const sold = D.shopLevels[s.shopLevel].requiresSold;
    s.lifetimeSocks = Math.max(o.lifetimeSocks || 0, knitted * 1.3, s.factoryStock + s.socks);
    s.lifetimeSold = Math.max(o.lifetimeSold || 0, sold * 1.3);
    s.lifetimeDelivered = s.lifetimeSold + s.socks;
    s.lifetimeMoney = Math.max(o.lifetimeMoney || 0, s.money, s.lifetimeSold);
    s.customers = Math.round(s.lifetimeSold / D.shopLevels[s.shopLevel].basket);
    s.clicks = Math.min(200, Math.round(s.lifetimeSocks / 10));
    return s;
  }

  const scenarios = [
    {
      id: 'fresh', name: 'Fresh start', icon: '🧦',
      desc: 'A shack, a chair, one courier. Nothing has happened yet.',
      build: (now) => make(now, {}),
    },
    {
      id: 'cottage', name: 'Granny Cottage', icon: '🏡',
      desc: 'Ten minutes in. Eight grannies, a bicycle, and just enough cash to argue about wages.',
      build: (now) => make(now, {
        factoryLevel: 1, shopLevel: 0,
        research: ['m_granny', 'v_bicycle'],
        producers: { granny: 8 },
        vehicles: { backpack: 1, bicycle: 1 },
        money: 120, socks: 6, factoryStock: 3, playTime: 600,
      }),
    },
    {
      id: 'workshop', name: 'Workshop', icon: '🏚️',
      desc: 'Looms and the first machines, a van, striped socks, a proper shop. Both doctrines are waiting to be picked.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 1,
        research: ['m_machine', 'v_van', 'l_crates', 'l_training', 's_striped'],
        producers: { granny: 15, loom: 10, machine: 3 },
        vehicles: { backpack: 1, bicycle: 2, van: 1 },
        upgrades: ['granny_0', 'needles'],
        marketing: 2, sockLine: 1,
        money: 2500, socks: 40, factoryStock: 120, playTime: 45 * 60,
      }),
    },
    {
      id: 'guild', name: 'The Knitting Guild', icon: '🧶',
      desc: 'A Workshop that went all in on grannies: forty of them, tripled by the Guild doctrine, and a community shop.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 1,
        research: ['m_loom', 'v_van', 'l_crates', 'l_training', 's_striped', 'd_guild', 'd_community'],
        producers: { granny: 40, loom: 4 },
        vehicles: { bicycle: 2, van: 1 },
        upgrades: ['granny_0', 'granny_1', 'needles'],
        marketing: 2, sockLine: 1,
        money: 1800, socks: 60, factoryStock: 90, playTime: 50 * 60,
      }),
    },
    {
      id: 'velvet', name: 'The Velvet Rope', icon: '💎',
      desc: 'An automated Workshop feeding a boutique on the Velvet Rope doctrine: argyle at 350% markup and half the foot traffic.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 2,
        research: ['m_machine', 'v_van', 'l_crates', 's_argyle', 'd_automation', 'd_velvet'],
        producers: { granny: 6, loom: 12, machine: 8 },
        vehicles: { van: 2 },
        upgrades: ['loom_0', 'needles', 'dpn'],
        marketing: 3, sockLine: 3, markup: 3.5,
        money: 4000, socks: 200, factoryStock: 150, playTime: 70 * 60,
      }),
    },
    {
      id: 'small', name: 'Small Factory', icon: '🏭',
      desc: 'The untuned middle: four Factory Lines, a lorry, a boutique selling argyle.',
      build: (now) => make(now, {
        factoryLevel: 3, shopLevel: 2,
        research: ['m_line', 'v_lorry', 'l_routes', 'l_training', 's_argyle'],
        producers: { granny: 25, loom: 25, machine: 15, line: 4 },
        vehicles: { bicycle: 2, van: 3, lorry: 1 },
        upgrades: ['granny_0', 'granny_1', 'loom_0', 'needles', 'dpn', 'qc'],
        marketing: 3, sockLine: 3,
        money: 30000, socks: 300, factoryStock: 2000, playTime: 2 * 3600,
      }),
    },
    {
      id: 'bottleneck', name: 'Delivery bottleneck', icon: '🚶',
      desc: 'Ten machines, one courier on foot. The factory floor is drowning in socks.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 1,
        research: ['m_machine', 's_striped'],
        producers: { granny: 10, loom: 10, machine: 10 },
        vehicles: { backpack: 1 },
        marketing: 3, sockLine: 1,
        money: 500, socks: 0, factoryStock: 5000, playTime: 40 * 60,
      }),
    },
    {
      id: 'glut', name: 'Shelves overflowing', icon: '📦',
      desc: 'Twenty thousand socks on the shelves, no marketing, prices at 200%. Nobody comes in.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 1,
        research: ['m_machine', 'v_van', 'l_crates', 's_striped'],
        producers: { granny: 20, loom: 15, machine: 8 },
        vehicles: { van: 2 },
        marketing: 0, sockLine: 1, markup: 2,
        money: 5000, socks: 20000, factoryStock: 300, playTime: 50 * 60,
      }),
    },
    {
      id: 'broke', name: 'Overstretched', icon: '💸',
      desc: 'A Sock Factory on 150% maintenance, a boutique that cannot sell it all, and no cash. Wages go unpaid at once.',
      build: (now) => make(now, {
        factoryLevel: 4, shopLevel: 2,
        research: ['m_mill', 'v_lorry', 'l_routes', 'l_training', 's_argyle'],
        producers: { granny: 30, loom: 30, machine: 25, line: 12, mill: 3 },
        upkeep: { granny: 1.5, loom: 1.5, machine: 1.5, line: 1.5, mill: 1.5 },
        vehicles: { van: 2, lorry: 2 },
        upgrades: ['granny_0', 'granny_1', 'loom_0', 'machine_0', 'needles', 'dpn', 'qc'],
        marketing: 2, sockLine: 3, markup: 2,
        money: 0, socks: 5000, factoryStock: 200000, playTime: 4 * 3600,
      }),
    },
    {
      id: 'loanshark', name: 'Sal wants his money', icon: '🕴️',
      desc: 'A Workshop that borrowed $2,000 from Cousin Sal. It is due in 20 seconds and there is $150 in the till. Watch the street.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 1,
        research: ['m_machine', 'v_van', 'l_crates', 's_striped'],
        producers: { granny: 12, loom: 8, machine: 2 },
        vehicles: { bicycle: 1, van: 1 },
        upgrades: ['granny_0', 'needles'],
        marketing: 2, sockLine: 1,
        loans: [{ lender: 'mafia', principal: 2000, owed: 2600, dueIn: 20 }],
        money: 150, socks: 80, factoryStock: 60, playTime: 55 * 60,
      }),
    },
    {
      id: 'foreclosure', name: 'The bank calls', icon: '🏦',
      desc: 'A Small Factory with a $60,000 bank loan due in 30 seconds and $2,000 in cash. The bailiffs will make up the difference.',
      build: (now) => make(now, {
        factoryLevel: 3, shopLevel: 2,
        research: ['m_line', 'v_lorry', 'l_routes', 'l_training', 's_argyle'],
        producers: { granny: 25, loom: 25, machine: 15, line: 4 },
        vehicles: { bicycle: 2, van: 3, lorry: 1 },
        upgrades: ['granny_0', 'loom_0', 'needles', 'qc'],
        marketing: 3, sockLine: 3,
        loans: [{ lender: 'bank', principal: 50000, owed: 60000, dueIn: 30 }],
        money: 2000, socks: 300, factoryStock: 2000, playTime: 2 * 3600,
      }),
    },
    {
      id: 'devil', name: 'Socks of sin', icon: '😈',
      desc: "A boutique selling the Devil's Sock. The devout are nearly at the end of their patience.",
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 2,
        research: ['m_machine', 'v_van', 'l_crates', 's_devil'],
        producers: { granny: 15, loom: 12, machine: 6 },
        vehicles: { bicycle: 1, van: 2 },
        upgrades: ['granny_0', 'needles'],
        marketing: 3, sockLine: 2,
        outrage: D.ruin.outrageThreshold - 40,
        money: 1500, socks: 400, factoryStock: 200, playTime: 65 * 60,
      }),
    },
    {
      id: 'sweatshop', name: 'Cut every corner', icon: '🩹',
      desc: 'Thirty grannies on 30% wages under the Cut Every Corner doctrine. A strike is about a minute away.',
      build: (now) => make(now, {
        factoryLevel: 2, shopLevel: 1,
        research: ['m_loom', 'v_van', 's_striped', 'd_corners'],
        producers: { granny: 30, loom: 6 },
        upkeep: { granny: 0.3, loom: 0.5 },
        vehicles: { bicycle: 2, van: 1 },
        upgrades: ['granny_0', 'needles'],
        marketing: 2, sockLine: 1,
        grumble: D.ruin.grumbleThreshold - 60,
        money: 900, socks: 50, factoryStock: 80, playTime: 48 * 60,
      }),
    },
    {
      id: 'retire', name: 'Ready to retire', icon: '🧵',
      desc: 'An Industrial Complex with enough lifetime earnings for five Heirloom Threads.',
      build: (now) => make(now, {
        factoryLevel: 5, shopLevel: 4,
        research: researchUpTo(5, 4).concat(['d_automation', 'd_velvet']),
        producers: { granny: 50, loom: 50, machine: 50, line: 40, mill: 25, megaplex: 6 },
        vehicles: { lorry: 3, roadtrain: 3, airship: 1 },
        upgrades: ['granny_0', 'granny_1', 'granny_2', 'loom_0', 'loom_1', 'loom_2', 'machine_0', 'machine_1', 'machine_2',
          'line_0', 'line_1', 'mill_0', 'needles', 'dpn', 'frenzy', 'delegate', 'qc', 'discount', 'subscribe', 'branding', 'pairs'],
        marketing: 6, sockLine: 7,
        money: 5e6, socks: 50000, factoryStock: 200000, lifetimeMoney: 2.5e8, playTime: 12 * 3600,
      }),
    },
    {
      id: 'second', name: 'Second generation', icon: '👶',
      desc: 'Just retired with five threads. Back in the shack, but everything is 50% faster.',
      build: (now) => {
        const s = scenarios.find((x) => x.id === 'retire').build(now);
        Sim.retire(s);
        return s;
      },
    },
    {
      id: 'endgame', name: 'Everything researched', icon: '🚀',
      desc: 'Spaceport, megastore, teleporters, twenty threads and more money than sense.',
      build: (now) => make(now, {
        factoryLevel: D.factoryLevels.length - 1, shopLevel: D.shopLevels.length - 1,
        research: D.research.filter((r) => !r.branch).map((r) => r.id).concat(['d_automation', 'd_pile']),
        producers: { granny: 100, loom: 100, machine: 100, line: 100, mill: 100, megaplex: 60, orbital: 30, quantum: 12 },
        vehicles: { airship: 4, teleporter: 3 },
        upgrades: D.upgrades.map((u) => u.id),
        marketing: D.marketing.length, sockLine: D.sockLines.length - 1, threads: 20, retirements: 3,
        money: 1e13, socks: 5e6, factoryStock: 2e7, lifetimeMoney: 5e15, playTime: 60 * 3600,
      }),
    },
  ];

  function find(id) {
    return scenarios.find((x) => x.id === id) || null;
  }

  // Build a scenario state, normalised through the save round-trip so it has
  // exactly the shape a loaded save would.
  function build(id, now) {
    const sc = find(id);
    if (!sc) return null;
    now = now || 0;
    const s = Sim.deserialize(Sim.serialize(sc.build(now)), now);
    Sim.addNews(s, 'build', `Test save loaded: ${sc.name}.`);
    s.lastTick = now;
    return s;
  }

  return {
    list: scenarios.map((x) => ({ id: x.id, name: x.name, icon: x.icon, desc: x.desc })),
    find,
    build,
  };
});
