// Sock Tycoon simulation. Pure state transformations, no DOM, no timers.
// Loads in the browser (window.SockSim) and in Node (module.exports).
(function (root, factory) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./data.js') : root.SockData;
  const api = factory(D);
  if (isNode) module.exports = api;
  else root.SockSim = api;
})(this, function (D) {
  'use strict';

  const SAVE_VERSION = 5;

  function newVehicle(typeId) {
    return { type: typeId, phase: 'loading', progress: 0, load: 0, timer: 0 };
  }

  function newState(now) {
    const producers = {};
    D.producers.forEach((p) => { producers[p.id] = 0; });
    return {
      version: SAVE_VERSION,
      money: 0,
      socks: 0,               // socks on the shop shelves
      factoryStock: 0,        // socks waiting at the factory for a vehicle
      lifetimeMoney: 0,
      lifetimeSocks: 0,       // socks knitted, ever (gates factory upgrades)
      lifetimeSold: 0,        // socks sold to customers, ever (gates shop upgrades)
      lifetimeDelivered: 0,
      customers: 0,
      clicks: 0,              // socks finished by hand
      knitting: null,         // seconds left on the sock you are hand-knitting, or null
      producers,
      upkeep: {},             // { producerId: level } wage/maintenance setting, default 1 (100%)
      outages: [],            // [{ producer, units, remaining }] units currently on a break or broken
      unpaid: false,          // true while cash cannot cover upkeep
      news: [],               // [{ t, kind, text }] newest first
      lifetimeLost: 0,        // socks lost in delivery mishaps, raids and seizures, ever
      lifetimeSkimmed: 0,     // socks skimmed off production by uninvited staff, ever
      loans: [],              // [{ lender, principal, owed, due, stage }] due is a playTime
      events: [],             // [{ id, remaining, guarded?, vars? }] trouble in progress; remaining null = until resolved
      cooldowns: {},          // { eventId: seconds } before a self-spawning event may return
      resolved: {},           // { eventId: times bought off } (buyout prices climb)
      serenade: null,         // id of the track Sock Radio drifted onto by itself (not saved)
      offer: null,            // { customer, icon, socks, premium, expires } a bulk order on the table
      order: null,            // { customer, icon, socks, filled, premium, due } one being filled
      ordersDone: 0,
      protection: false,      // paying Sal's Neighbourhood Insurance
      protectionOffered: false,
      dirty: 0,               // laundered cash not yet washed through the tills
      lifetimeFines: 0,
      outrage: 0,             // how upset the devout are (points, see D.ruin)
      grumble: 0,             // how close the grannies are to striking (points, see D.ruin)
      upgrades: {},
      research: {},           // { researchId: true }
      activeResearch: null,   // { id, remaining } or null
      vehicles: [newVehicle('backpack')],
      marketing: 0,           // number of marketing tiers bought
      sockLine: 0,            // index into D.sockLines of the product on sale
      shopLevel: 0,           // index into D.shopLevels
      factoryLevel: 0,        // index into D.factoryLevels
      markup: 1,
      threads: 0,             // heirloom threads currently held
      claimedThreads: 0,      // total threads ever claimed
      retirements: 0,
      bankruptcies: 0,
      playTime: 0,
      lastTick: now || 0,
    };
  }

  // ---- lookups ----------------------------------------------------------

  function indexBy(list) {
    const m = {};
    list.forEach((x) => { m[x.id] = x; });
    return m;
  }
  const producerById = indexBy(D.producers);
  const upgradeById = indexBy(D.upgrades);
  const researchById = indexBy(D.research);
  const vehicleTypeById = indexBy(D.vehicleTypes);
  const lenderById = indexBy(D.lenders);
  const sockLineIndex = {};
  D.sockLines.forEach((l, i) => { sockLineIndex[l.id] = i; });

  // ---- effects ----------------------------------------------------------
  // Upgrades and research both carry effects (`effect` or `effects`). An
  // effect may target one producer (`producer`) or every producer of one
  // care kind (`care`); otherwise it applies to all.

  function itemEffects(item) {
    return item.effects || (item.effect ? [item.effect] : []);
  }

  // Only effects with a numeric value count; research unlock effects
  // (`{ type: 'producer', id }`) are descriptive and have none.
  function activeEffects(s, type) {
    const out = [];
    const take = (e) => { if (e.type === type && typeof e.value === 'number') out.push(e); };
    D.upgrades.forEach((u) => { if (s.upgrades[u.id]) itemEffects(u).forEach(take); });
    D.research.forEach((r) => { if (s.research[r.id]) itemEffects(r).forEach(take); });
    return out;
  }

  function targets(e, p) {
    if (!p) return !e.producer && !e.care;
    if (e.producer && e.producer !== p.id) return false;
    if (e.care && e.care !== p.care.id) return false;
    return true;
  }

  // Product of every active effect of this type that applies to producer p
  // (or every untargeted one when p is omitted).
  function mult(s, type, p) {
    return activeEffects(s, type).filter((e) => targets(e, p)).reduce((acc, e) => acc * e.value, 1);
  }

  function sum(s, type) {
    return activeEffects(s, type).reduce((acc, e) => acc + e.value, 0);
  }

  // ---- multipliers ------------------------------------------------------

  function threadBonus(s) {
    return 1 + s.threads * D.prestige.bonusPerThread;
  }

  function costMult(s) {
    return mult(s, 'cost');
  }

  function priceMult(s) {
    return mult(s, 'price') * threadBonus(s);
  }

  function marketingMult(s) {
    let m = 1;
    for (let i = 0; i < s.marketing && i < D.marketing.length; i++) m *= D.marketing[i].mult;
    return m;
  }

  // ---- news ---------------------------------------------------------------

  function addNews(s, kind, text) {
    s.news.unshift({ t: s.playTime, kind, text });
    if (s.news.length > D.newsLimit) s.news.length = D.newsLimit;
  }

  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  function fmtSeconds(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }

  function fmtMoney(n) {
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    return '$' + n.toFixed(2);
  }

  function listText(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  // ---- upkeep: wages and maintenance --------------------------------------

  const U = D.upkeep;
  const R = D.ruin;

  function upkeepLevel(s, id) {
    const v = s.upkeep[id];
    return typeof v === 'number' ? v : 1;
  }

  function setUpkeep(s, id, level) {
    const v = Number(level);
    if (!isFinite(v) || !producerById[id]) return;
    s.upkeep[id] = Math.min(U.maxLevel, Math.max(U.minLevel, v));
  }

  function upkeepRateFor(s, id) {
    const p = producerById[id];
    return s.producers[id] * p.upkeep * upkeepLevel(s, id) * mult(s, 'upkeep', p);
  }

  function upkeepRate(s) {
    return D.producers.reduce((acc, p) => acc + upkeepRateFor(s, p.id), 0);
  }

  // How much more (or less) often outages happen at this upkeep level.
  function outageFactor(level) {
    if (level <= 1) return U.factorAtZero - (U.factorAtZero - 1) * level;
    return 1 - (1 - U.factorAtMax) * (level - 1) / (U.maxLevel - 1);
  }

  function effectiveUpkeepLevel(s, id) {
    return s.unpaid ? 0 : upkeepLevel(s, id);
  }

  // Seconds between outages for this type right now.
  function outageInterval(s, id) {
    return U.eventInterval / (outageFactor(effectiveUpkeepLevel(s, id)) * mult(s, 'outage', producerById[id]));
  }

  // Long-run share of a type's units that are working.
  function availability(s, id) {
    const down = U.batchFraction * U.duration / outageInterval(s, id);
    return 1 - Math.min(0.9, down);
  }

  function downUnits(s, id) {
    return s.outages.reduce((acc, o) => acc + (o.producer === id ? o.units : 0), 0);
  }

  function payUpkeep(s, dt) {
    const cost = upkeepRate(s) * dt;
    if (cost <= 0) { s.unpaid = false; return; }
    if (s.money >= cost) {
      s.money -= cost;
      if (s.unpaid) addNews(s, 'money', 'Wages and maintenance are being paid again. Grumbling subsides.');
      s.unpaid = false;
    } else if (!s.unpaid) {
      s.unpaid = true;
      addNews(s, 'money', 'You cannot cover wages and maintenance. Grannies are furious and machines are being neglected.');
    }
  }

  function rollOutages(s, dt, rng) {
    D.producers.forEach((p) => {
      const count = s.producers[p.id];
      if (count <= 0) return;
      const chance = dt / outageInterval(s, p.id);
      if (rng() >= chance) return;
      const working = count - downUnits(s, p.id);
      const units = Math.min(working, Math.max(1, Math.round(count * U.batchFraction)));
      if (units < 1) return;
      const remaining = U.duration * (0.75 + 0.5 * rng());
      s.outages.push({ producer: p.id, units, remaining });
      addNews(s, p.care.id === 'wages' ? 'staff' : 'machine',
        fill(p.outageStart, { n: units, plural: units === 1 ? p.name : p.plural, t: fmtSeconds(remaining) }));
    });
  }

  function tickOutages(s, dt) {
    for (let i = s.outages.length - 1; i >= 0; i--) {
      const o = s.outages[i];
      o.remaining -= dt;
      if (o.remaining > 0) continue;
      s.outages.splice(i, 1);
      const p = producerById[o.producer];
      if (p) addNews(s, 'staff', fill(p.outageEnd, { n: o.units, plural: o.units === 1 ? p.name : p.plural, t: '' }));
    }
  }

  // ---- production -------------------------------------------------------

  // The track Sock Radio drifted onto, and who in the factory likes it.
  function serenadeFor(s) {
    return s.serenade ? D.radio.serenades.find((x) => x.track === s.serenade) || null : null;
  }

  function serenadeMult(s, p) {
    const e = serenadeFor(s);
    return e && targets(e, p) ? e.mult : 1;
  }

  // Units that would notice this track.
  function serenadeAudience(s, entry) {
    return D.producers.reduce((acc, p) => acc + (targets(entry, p) ? s.producers[p.id] : 0), 0);
  }

  // Tell the sim which track the radio drifted onto (null when it is off,
  // or when the player tuned it). Hidden mechanic: only a drifted track
  // gets anyone working faster.
  function setSerenade(s, trackId) {
    trackId = trackId || null;
    if (s.serenade === trackId) return false;
    const before = serenadeFor(s);
    s.serenade = trackId;
    const after = serenadeFor(s);
    if (before && serenadeAudience(s, before) > 0) addNews(s, 'staff', before.end);
    if (after && serenadeAudience(s, after) > 0) addNews(s, 'staff', after.start);
    return true;
  }

  function producerRateEach(s, id) {
    const p = producerById[id];
    return p.baseRate * mult(s, 'producer', p) * threadBonus(s) * serenadeMult(s, p);
  }

  // Has something (an inspector) shut the whole factory?
  function factoryClosed(s) {
    return s.events.some((e) => { const d = eventDef(e); return !!(d && d.closeFactory); });
  }

  // Is every unit of this type stopped, by a strike or a closure?
  function onStrike(s, id) {
    const care = producerById[id].care.id;
    return factoryClosed(s) || s.events.some((e) => {
      const d = eventDef(e);
      return d && d.strikeCare === care;
    });
  }

  // Socks per second this type makes right now (units on a break excluded).
  function producerRate(s, id) {
    if (onStrike(s, id)) return 0;
    return Math.max(0, s.producers[id] - downUnits(s, id)) * producerRateEach(s, id);
  }

  function productionRate(s) {
    return D.producers.reduce((acc, p) => acc + producerRate(s, p.id), 0);
  }

  // Long-run socks per second, with outages averaged in. Used for offline catch-up.
  function expectedProductionRate(s) {
    return D.producers.reduce((acc, p) => {
      if (onStrike(s, p.id)) return acc;
      return acc + s.producers[p.id] * producerRateEach(s, p.id) * availability(s, p.id);
    }, 0);
  }

  // Share of production quietly carried off by uninvited staff.
  function skimFraction(s) {
    return Math.min(0.9, s.events.reduce((acc, e) => acc + ((eventDef(e) && eventDef(e).skim) || 0), 0));
  }

  // Hand knitting: a click starts one sock, which takes knitTime seconds.
  function knitTime(s) {
    return D.baseKnitTime / (mult(s, 'click') * threadBonus(s));
  }

  function knitYield(s) {
    return 1 + sum(s, 'clickPct') * productionRate(s);
  }

  function startKnit(s) {
    if (s.knitting !== null) return false;
    s.knitting = knitTime(s);
    return true;
  }

  function knitProgress(s) {
    if (s.knitting === null) return 0;
    return 1 - Math.max(0, s.knitting) / knitTime(s);
  }

  // Returns the socks finished this step (0 if none).
  function progressKnit(s, dt) {
    if (s.knitting === null) return 0;
    s.knitting -= dt;
    if (s.knitting > 0) return 0;
    const n = knitYield(s);
    s.factoryStock += n;
    s.lifetimeSocks += n;
    s.clicks += 1;
    s.knitting = null;
    return n;
  }

  function producerUnlocked(s, id) {
    return !!s.research['m_' + id];
  }

  function producerCost(s, id, n) {
    n = n || 1;
    const p = producerById[id];
    const g = D.costGrowth;
    const owned = s.producers[id];
    const total = p.baseCost * Math.pow(g, owned) * (Math.pow(g, n) - 1) / (g - 1);
    return total * costMult(s);
  }

  function maxAffordable(s, id) {
    const p = producerById[id];
    const g = D.costGrowth;
    const first = p.baseCost * Math.pow(g, s.producers[id]) * costMult(s);
    if (s.money < first) return 0;
    const n = Math.floor(Math.log(s.money * (g - 1) / first + 1) / Math.log(g));
    return Math.max(1, n);
  }

  function buyProducer(s, id, n) {
    n = n || 1;
    if (n < 1 || !producerUnlocked(s, id)) return false;
    const cost = producerCost(s, id, n);
    if (s.money < cost) return false;
    s.money -= cost;
    s.producers[id] += n;
    return true;
  }

  // ---- factory ----------------------------------------------------------

  function currentFactory(s) {
    return D.factoryLevels[s.factoryLevel];
  }

  function nextFactory(s) {
    return D.factoryLevels[s.factoryLevel + 1] || null;
  }

  function factoryUnlocked(s, level) {
    return s.lifetimeSocks >= level.requiresKnitted;
  }

  function buyFactory(s) {
    const next = nextFactory(s);
    if (!next || !factoryUnlocked(s, next) || s.money < next.cost) return false;
    s.money -= next.cost;
    s.factoryLevel += 1;
    addNews(s, 'build', `The factory is now a ${next.name}.`);
    return true;
  }

  // ---- research ---------------------------------------------------------

  function researchDone(s, id) {
    return !!s.research[id];
  }

  // The research chosen in an exclusive branch, or null if none yet.
  function branchChoice(s, branch) {
    const r = D.research.find((x) => x.branch === branch && s.research[x.id]);
    return r ? r.id : null;
  }

  function branchOptions(branch) {
    return D.research.filter((x) => x.branch === branch);
  }

  // Which prerequisites of a research item are still unmet.
  function researchBlockers(s, r) {
    const req = r.requires || {};
    const out = { factoryLevel: null, shopLevel: null, research: [], branch: null };
    if (req.factoryLevel !== undefined && s.factoryLevel < req.factoryLevel) out.factoryLevel = req.factoryLevel;
    if (req.shopLevel !== undefined && s.shopLevel < req.shopLevel) out.shopLevel = req.shopLevel;
    (req.research || []).forEach((id) => { if (!researchDone(s, id)) out.research.push(id); });
    if (r.branch) {
      const chosen = branchChoice(s, r.branch);
      if (chosen && chosen !== r.id) out.branch = chosen;
    }
    return out;
  }

  function researchAvailable(s, r) {
    if (researchDone(s, r.id)) return false;
    const b = researchBlockers(s, r);
    return b.factoryLevel === null && b.shopLevel === null && b.research.length === 0 && b.branch === null;
  }

  function researchSpeed(s) {
    return threadBonus(s) * mult(s, 'research');
  }

  function startResearch(s, id) {
    const r = researchById[id];
    if (!r || s.activeResearch || !researchAvailable(s, r) || s.money < r.cost) return false;
    s.money -= r.cost;
    s.activeResearch = { id, remaining: r.time };
    return true;
  }

  // Returns the id of a project that finished during this step, or null.
  function progressResearch(s, dt) {
    const a = s.activeResearch;
    if (!a) return null;
    a.remaining -= dt * researchSpeed(s);
    if (a.remaining > 0) return null;
    s.research[a.id] = true;
    s.activeResearch = null;
    setMarkup(s, s.markup); // a doctrine may have moved the markup limits
    return a.id;
  }

  function researchProgress(s) {
    const a = s.activeResearch;
    if (!a) return 0;
    const r = researchById[a.id];
    return 1 - Math.max(0, a.remaining) / r.time;
  }

  // ---- sock lines -------------------------------------------------------

  function currentLine(s) {
    return D.sockLines[s.sockLine];
  }

  function sockLineUnlocked(s, index) {
    if (index === 0) return true;
    const line = D.sockLines[index];
    return !!line && researchDone(s, 's_' + line.id);
  }

  function selectSockLine(s, index) {
    if (!sockLineUnlocked(s, index)) return false;
    s.sockLine = index;
    return true;
  }

  function basePrice(s) {
    return currentLine(s).price;
  }

  function salePrice(s) {
    return basePrice(s) * s.markup * priceMult(s);
  }

  // ---- vehicles ---------------------------------------------------------

  function vehicleUnlocked(s, typeId) {
    return typeId === D.vehicleTypes[0].id || researchDone(s, 'v_' + typeId);
  }

  function vehicleCount(s, typeId) {
    return s.vehicles.filter((v) => v.type === typeId).length;
  }

  function vehicleCapacity(s, typeId) {
    return vehicleTypeById[typeId].capacity * mult(s, 'capacity');
  }

  function vehicleTripTime(s, typeId) {
    return vehicleTypeById[typeId].tripTime * mult(s, 'trip');
  }

  function mishapChance(s, typeId) {
    return vehicleTypeById[typeId].mishapChance * mult(s, 'safety');
  }

  // Average share of a load lost, and average seconds added, per trip.
  function mishapAverages(s, typeId) {
    const t = vehicleTypeById[typeId];
    const chance = mishapChance(s, typeId);
    const n = t.mishaps.length;
    const lose = t.mishaps.reduce((acc, m) => acc + m.lose, 0) / n;
    const delay = t.mishaps.reduce((acc, m) => acc + m.delay, 0) / n;
    return { lose: chance * lose, delay: chance * delay };
  }

  function vehicleCost(s, typeId) {
    return vehicleTypeById[typeId].cost * Math.pow(D.vehicleCostGrowth, vehicleCount(s, typeId));
  }

  function buyVehicle(s, typeId) {
    if (!vehicleUnlocked(s, typeId)) return false;
    const cost = vehicleCost(s, typeId);
    if (s.money < cost) return false;
    s.money -= cost;
    s.vehicles.push(newVehicle(typeId));
    return true;
  }

  // Expected socks per second one vehicle moves when the factory never runs dry.
  function vehicleThroughput(s, typeId) {
    const avg = mishapAverages(s, typeId);
    const cycle = 2 * vehicleTripTime(s, typeId) + D.loadTime + D.unloadTime + avg.delay;
    return vehicleCapacity(s, typeId) * (1 - avg.lose) / cycle;
  }

  function throughputRate(s) {
    return s.vehicles.reduce((acc, v) => acc + vehicleThroughput(s, v.type), 0);
  }

  function socksInTransit(s) {
    return s.vehicles.reduce((acc, v) => acc + v.load, 0);
  }

  function rollMishap(s, v, rng) {
    const t = vehicleTypeById[v.type];
    if (rng() >= mishapChance(s, v.type)) return;
    const m = t.mishaps[Math.min(t.mishaps.length - 1, Math.floor(rng() * t.mishaps.length))];
    // a loss-type mishap always costs at least one sock if there is one to lose
    const lost = m.lose > 0 && v.load >= 1 ? Math.max(1, Math.floor(v.load * m.lose)) : 0;
    v.load -= lost;
    s.lifetimeLost += lost;
    v.delay = m.delay;
    v.mishap = m.icon;
    addNews(s, 'delivery', fill(m.text, { lost, socks: lost === 1 ? '1 sock' : lost + ' socks' }));
  }

  // Advance every vehicle by dt seconds. Returns socks delivered to the shop.
  function stepVehicles(s, dt, rng) {
    rng = rng || Math.random;
    let delivered = 0;
    s.vehicles.forEach((v) => {
      const trip = vehicleTripTime(s, v.type);
      if (v.phase === 'loading') {
        if (v.load <= 0) {
          const take = Math.min(vehicleCapacity(s, v.type), Math.floor(s.factoryStock));
          if (take >= 1) {
            s.factoryStock -= take;
            v.load = take;
            v.timer = D.loadTime;
          }
        } else {
          v.timer -= dt;
          if (v.timer <= 0) {
            v.phase = 'toShop';
            v.progress = 0;
            v.delay = 0;
            v.mishap = null;
            rollMishap(s, v, rng);
          }
        }
      } else if (v.phase === 'toShop') {
        if (v.delay > 0) {
          v.delay -= dt;
          if (v.delay <= 0) { v.delay = 0; v.mishap = null; }
          return;
        }
        v.progress += dt / trip;
        if (v.progress >= 1) { v.phase = 'unloading'; v.progress = 1; v.timer = D.unloadTime; }
      } else if (v.phase === 'unloading') {
        v.timer -= dt;
        if (v.timer <= 0) {
          s.socks += v.load;
          s.lifetimeDelivered += v.load;
          delivered += v.load;
          v.load = 0;
          v.phase = 'toFactory';
          v.progress = 0;
        }
      } else if (v.phase === 'toFactory') {
        v.progress += dt / trip;
        if (v.progress >= 1) { v.phase = 'loading'; v.progress = 0; }
      }
    });
    return delivered;
  }

  // ---- shop and customers -----------------------------------------------

  function currentShop(s) {
    return D.shopLevels[s.shopLevel];
  }

  function nextShop(s) {
    return D.shopLevels[s.shopLevel + 1] || null;
  }

  function shopUnlocked(s, level) {
    return s.lifetimeSold >= level.requiresSold;
  }

  function buyShop(s) {
    const next = nextShop(s);
    if (!next || !shopUnlocked(s, next) || s.money < next.cost) return false;
    s.money -= next.cost;
    s.shopLevel += 1;
    addNews(s, 'build', `The shop is now a ${next.name}.`);
    return true;
  }

  // Is there someone on the shop door? Trouble with a `guarded` variant
  // then starts in that softer form.
  function hasSecurity(s) {
    return activeEffects(s, 'security').length > 0;
  }

  // The data for an event as it is actually running: the guarded variant's
  // fields laid over the base ones when it started under security.
  function eventDef(e) {
    const d = D.events[e.id];
    if (!d) return null;
    return e.guarded && d.guarded ? Object.assign({}, d, d.guarded) : d;
  }

  // Product of one numeric field across active events (1 when none set it).
  function eventMult(s, key) {
    return s.events.reduce((acc, e) => {
      const d = eventDef(e);
      return d && typeof d[key] === 'number' ? acc * d[key] : acc;
    }, 1);
  }

  // ---- time of day --------------------------------------------------------

  function dayPhase(s) {
    return ((s.playTime / D.day.length) + D.day.offset) % 1;
  }

  // 0 at night, 1 in full daylight, with short dawn and dusk ramps.
  function daylight(phase) {
    const k = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
    if (phase < 0.5) return k(phase, 0.22, 0.32);
    return 1 - k(phase, 0.72, 0.82);
  }

  // Traffic multiplier at one moment: quiet after dark unless the shop has
  // a late licence, busy at lunchtime.
  function dayTrafficAt(s, phase) {
    if (daylight(phase) < 0.5) return Math.min(1, D.day.nightTraffic * mult(s, 'night'));
    if (phase >= D.day.lunchFrom && phase < D.day.lunchTo) return D.day.lunchTraffic;
    return 1;
  }

  function dayMult(s) {
    return dayTrafficAt(s, dayPhase(s));
  }

  // Average of the time-of-day multiplier over the next dt seconds, for
  // long expected-mode steps that span nights and lunchtimes.
  function dayMultOver(s, dt) {
    if (dt < 60) return dayMult(s);
    const n = 24;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const at = s.playTime + dt * (i + 0.5) / n;
      acc += dayTrafficAt(s, ((at / D.day.length) + D.day.offset) % 1);
    }
    return acc / n;
  }

  function baseFootTraffic(s) {
    return D.baseTraffic * marketingMult(s) * mult(s, 'demand') * currentShop(s).traffic * eventMult(s, 'traffic');
  }

  function footTraffic(s) {
    return baseFootTraffic(s) * dayMult(s);
  }

  function interest(s) {
    const raw = D.baseInterest * currentShop(s).appeal * mult(s, 'appeal') * Math.pow(s.markup, -D.demandElasticity);
    return Math.min(D.maxInterest, Math.max(D.minInterest, raw)) * eventMult(s, 'interest');
  }

  function basketSize(s) {
    return Math.max(1, Math.round(currentShop(s).basket * mult(s, 'basket')));
  }

  // Expected socks sold per second if the shelves never run out.
  function demandRate(s) {
    return footTraffic(s) * interest(s) * basketSize(s);
  }

  function customerVisit(s, count) {
    count = count || 1;
    const wanted = basketSize(s) * count;
    const sold = Math.min(s.socks, wanted);
    s.socks -= sold;
    s.lifetimeSold += sold;
    s.customers += count;
    const earned = sold * salePrice(s);
    earn(s, earned);
    noteSales(s, sold);
    return { wanted, sold, earned };
  }

  function salesRate(s) {
    const demand = demandRate(s);
    if (s.socks >= 1) return demand;
    return Math.min(demand, throughputRate(s), productionRate(s));
  }

  function incomeRate(s) {
    return salesRate(s) * salePrice(s);
  }

  // ---- trouble: events --------------------------------------------------

  function eventActive(s, id) {
    return s.events.some((e) => e.id === id);
  }

  // The event's announcement text with its own words filled in.
  function eventText(e, key) {
    const d = eventDef(e);
    return d && d[key] ? fill(d[key], e.vars || {}) : null;
  }

  // Start an event (or top its timer back up if already running). `out` is
  // the tick result, so the caller can announce it. `vars` fill the event's
  // text templates and are kept on the instance.
  function startEvent(s, id, out, vars) {
    const base = D.events[id];
    if (!base) return false;
    const guarded = !!base.guarded && hasSecurity(s);
    const d = guarded ? Object.assign({}, base, base.guarded) : base;
    const running = s.events.find((e) => e.id === id);
    if (running) {
      const rd = eventDef(running);
      if (rd.duration) running.remaining = rd.duration;
      return false;
    }
    const e = { id, remaining: d.duration || null, guarded, vars: vars || {} };
    if (d.stealShelf) {
      const taken = Math.floor(s.socks * d.stealShelf);
      s.socks -= taken;
      s.lifetimeLost += taken;
    }
    if (d.fine) {
      const fine = Math.min(s.money, Math.max(d.fineMin || 0, s.money * d.fine));
      s.money -= fine;
      s.lifetimeFines += fine;
      e.vars.fine = fmtMoney(fine);
    }
    s.events.push(e);
    addNews(s, 'trouble', eventText(e, 'text'));
    if (out) out.events.push(id);
    return true;
  }

  // A self-spawning event rests after it ends.
  function restEvent(s, id) {
    const d = D.events[id];
    if (d && d.spawn && d.spawn.cooldown) s.cooldowns[id] = d.spawn.cooldown;
  }

  function endEvent(s, id, text) {
    const i = s.events.findIndex((e) => e.id === id);
    if (i < 0) return false;
    const e = s.events[i];
    s.events.splice(i, 1);
    restEvent(s, id);
    if (text) addNews(s, 'trouble', fill(text, e.vars || {}));
    return true;
  }

  function tickEvents(s, dt) {
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i];
      if (e.remaining === null) continue;
      e.remaining -= dt;
      if (e.remaining > 0) continue;
      s.events.splice(i, 1);
      restEvent(s, e.id);
      const text = eventText(e, 'endText');
      if (text) addNews(s, 'trouble', text);
    }
    Object.keys(s.cooldowns).forEach((id) => {
      s.cooldowns[id] -= dt;
      if (s.cooldowns[id] <= 0) delete s.cooldowns[id];
    });
    // the uninvited granny stays exactly as long as Sal is owed money
    if (eventActive(s, 'mafiaGranny') && !s.loans.some((l) => lenderById[l.lender] && lenderById[l.lender].escalation)) {
      endEvent(s, 'mafiaGranny', D.events.mafiaGranny.endText);
    }
  }

  // Chance that something with this average interval happens within dt.
  function chanceOver(dt, interval) {
    return 1 - Math.exp(-dt / interval);
  }

  // Do this event's spawn conditions hold right now?
  function spawnAllowed(s, d) {
    const req = (d.spawn && d.spawn.requires) || {};
    if (req.shopLevel !== undefined && s.shopLevel < req.shopLevel) return false;
    if (req.factoryLevel !== undefined && s.factoryLevel < req.factoryLevel) return false;
    if (req.protection !== undefined && !!s.protection !== req.protection) return false;
    if ((req.research || []).some((id) => !researchDone(s, id))) return false;
    return true;
  }

  // Trouble that rolls itself in. Live mode only, like outages.
  function rollTrouble(s, dt, rng, out) {
    Object.keys(D.events).forEach((id) => {
      const d = D.events[id];
      if (!d.spawn || eventActive(s, id) || s.cooldowns[id] > 0 || !spawnAllowed(s, d)) return;
      if (rng() >= chanceOver(dt, d.spawn.interval)) return;
      startEvent(s, id, out);
    });
  }

  // What it costs to buy an event off right now, or null if it cannot be.
  function resolveCost(s, id) {
    const d = D.events[id];
    if (!d || !d.resolve || !eventActive(s, id)) return null;
    const r = d.resolve;
    let cost = 0;
    if (r.moneyFraction) cost = s.money * r.moneyFraction;
    if (r.wagesSeconds) {
      cost = D.producers.reduce((acc, p) => acc + (p.care.id === 'wages' ? s.producers[p.id] * p.upkeep : 0), 0) * r.wagesSeconds;
    }
    if (r.assetFraction) cost = assetValue(s) * r.assetFraction * Math.pow(r.growth || 1, s.resolved[id] || 0);
    return Math.max(r.min || 0, cost);
  }

  function resolveEvent(s, id) {
    const cost = resolveCost(s, id);
    if (cost === null || s.money < cost) return false;
    const d = D.events[id];
    s.money -= cost;
    if (d.resolve.wagesSeconds) {
      D.producers.forEach((p) => { if (p.care.id === 'wages' && upkeepLevel(s, p.id) < 1) s.upkeep[p.id] = 1; });
      s.grumble = 0;
    }
    if (d.resolve.moneyFraction) s.outrage = 0;
    s.resolved[id] = (s.resolved[id] || 0) + 1;
    endEvent(s, id, d.resolve.text);
    return true;
  }

  // ---- bulk orders ---------------------------------------------------------

  function orderPrice(s, order) {
    return basePrice(s) * priceMult(s) * order.premium;
  }

  function makeOffer(s, rng, out) {
    const O = D.orders;
    const c = O.customers[Math.min(O.customers.length - 1, Math.floor(rng() * O.customers.length))];
    const socks = Math.max(O.minSocks, Math.round(demandRate(s) * O.sizeSeconds));
    const premium = Math.round((O.premiumMin + rng() * (O.premiumMax - O.premiumMin)) * 10) / 10;
    s.offer = { customer: c.name, icon: c.icon, socks, premium, expires: s.playTime + O.offerWindow };
    addNews(s, 'order', `${c.icon} ${cap(c.name)} want ${socks} socks at ${premium}× the base price, delivered within ${fmtSeconds(O.deadline)}. The offer stands for ${fmtSeconds(O.offerWindow)}.`);
    if (out) out.offer = true;
  }

  function cap(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function rollOffer(s, dt, rng, out) {
    if (s.offer || s.order || s.shopLevel < D.orders.shopLevel) return;
    if (rng() >= chanceOver(dt, D.orders.interval)) return;
    makeOffer(s, rng, out);
  }

  function acceptOrder(s) {
    if (!s.offer || s.order) return false;
    const o = s.offer;
    s.offer = null;
    s.order = { customer: o.customer, icon: o.icon, socks: o.socks, filled: 0, premium: o.premium, due: s.playTime + D.orders.deadline };
    addNews(s, 'order', `${o.icon} Order accepted: ${o.socks} socks for ${cap(o.customer)}, due in ${fmtSeconds(D.orders.deadline)}. They come off the shelves as they arrive.`);
    return true;
  }

  function declineOrder(s) {
    if (!s.offer) return false;
    addNews(s, 'order', `${s.offer.icon} You turned ${cap(s.offer.customer)} away.`);
    s.offer = null;
    return true;
  }

  // Socks come off the shelves into the order; paid on completion at the
  // premium, or at base price for what arrived if the deadline passes.
  function tickOrders(s, dt, out) {
    if (s.offer && s.playTime >= s.offer.expires) {
      addNews(s, 'order', `${s.offer.icon} ${cap(s.offer.customer)} got tired of waiting and went elsewhere.`);
      s.offer = null;
    }
    const o = s.order;
    if (!o) return;
    const take = Math.min(Math.floor(s.socks), o.socks - o.filled);
    if (take > 0) {
      s.socks -= take;
      o.filled += take;
      s.lifetimeSold += take;
    }
    if (o.filled >= o.socks) {
      const earned = o.filled * orderPrice(s, o);
      earn(s, earned);
      s.ordersDone += 1;
      s.order = null;
      addNews(s, 'order', `${o.icon} ${cap(o.customer)} collected their ${o.socks} socks and paid ${fmtMoney(earned)}.`);
      if (out) out.orderDone = earned;
    } else if (s.playTime >= o.due) {
      const earned = o.filled * basePrice(s) * priceMult(s);
      if (earned > 0) earn(s, earned);
      s.order = null;
      addNews(s, 'order', `${o.icon} The deadline passed with ${o.socks - o.filled} socks still owed. ${cap(o.customer)} paid ${fmtMoney(earned)} for what there was, at the ordinary price.`);
      startEvent(s, 'letdown', out, { customer: o.customer });
    }
  }

  // ---- Sal's insurance -----------------------------------------------------

  function protectionAvailable(s) {
    return s.shopLevel >= D.protection.shopLevel;
  }

  function protectionRate(s) {
    return s.protection ? assetValue(s) * D.protection.rate : 0;
  }

  function setProtection(s, on) {
    on = !!on;
    if (on && !protectionAvailable(s)) return false;
    if (s.protection === on) return false;
    s.protection = on;
    addNews(s, 'money', on ? 'You are paying Sal\'s Neighbourhood Insurance. Nothing will happen to the shop. Probably.' : 'You stopped paying Sal\'s insurance. He says he understands.');
    return true;
  }

  function tickProtection(s, dt) {
    if (!s.protectionOffered && protectionAvailable(s)) {
      s.protectionOffered = true;
      addNews(s, 'trouble', D.protection.offerText);
    }
    const cost = protectionRate(s) * dt;
    if (cost <= 0) return;
    if (s.money >= cost) { s.money -= cost; return; }
    s.protection = false;
    addNews(s, 'money', D.protection.lapseText);
  }

  // ---- dirty money ---------------------------------------------------------

  // Expected seconds between police raids right now, or Infinity.
  function raidInterval(s) {
    return s.dirty > 0 ? D.laundering.raidInterval : Infinity;
  }

  function rollRaid(s, dt, rng, out) {
    if (s.dirty <= 0 || eventActive(s, 'police')) return;
    if (rng() >= chanceOver(dt, D.laundering.raidInterval)) return;
    const fine = Math.min(s.money, s.dirty * D.laundering.fineMult);
    s.money -= fine;
    s.lifetimeFines += fine;
    s.dirty = 0;
    startEvent(s, 'police', out, { fine: fmtMoney(fine) });
  }

  // ---- trouble: outrage and grumbling -------------------------------------

  // Selling a provocative sock upsets the devout.
  function noteSales(s, sold) {
    const line = currentLine(s);
    if (!line.outrage || sold <= 0 || eventActive(s, 'picket')) return;
    s.outrage = Math.min(R.outrageThreshold, s.outrage + sold * line.outrage * mult(s, 'outrage'));
  }

  function tickOutrage(s, dt, out) {
    if (s.outrage >= R.outrageThreshold && !eventActive(s, 'picket')) {
      s.outrage = 0;
      startEvent(s, 'picket', out);
      return;
    }
    s.outrage = Math.max(0, s.outrage - R.outrageDecay * dt);
  }

  function wageWorkers(s) {
    return D.producers.reduce((acc, p) => acc + (p.care.id === 'wages' ? s.producers[p.id] : 0), 0);
  }

  // Lowest wage level among the staff you actually employ.
  function wageLevel(s) {
    let level = null;
    D.producers.forEach((p) => {
      if (p.care.id !== 'wages' || s.producers[p.id] <= 0) return;
      const l = upkeepLevel(s, p.id);
      level = level === null ? l : Math.min(level, l);
    });
    return level === null ? 1 : level;
  }

  // Grumble points per second: underpaid or unpaid grannies edge towards a
  // strike; generous wages calm them down. Some doctrines add a baseline.
  function grumbleRate(s) {
    if (wageWorkers(s) <= 0) return 0;
    let rate = sum(s, 'grumbleBase');
    const level = wageLevel(s);
    if (s.unpaid) rate += R.unpaidGrumble;
    else if (level < R.happyWage) rate += (R.happyWage - level) / R.happyWage * R.grumbleRate * mult(s, 'grumble');
    else rate -= (level - R.happyWage) / (U.maxLevel - R.happyWage) * R.grumbleDecay;
    return rate;
  }

  function tickGrumble(s, dt, out) {
    if (eventActive(s, 'strike')) return;
    if (wageWorkers(s) <= 0) { s.grumble = Math.max(0, s.grumble - R.grumbleDecay * dt); return; }
    s.grumble = Math.min(R.grumbleThreshold, Math.max(0, s.grumble + grumbleRate(s) * dt));
    if (s.grumble >= R.grumbleThreshold) {
      s.grumble = 0;
      startEvent(s, 'strike', out);
    }
  }

  // ---- loans and ruin ---------------------------------------------------

  // What everything you own cost to buy.
  function assetValue(s) {
    let v = 0;
    const g = D.costGrowth;
    D.producers.forEach((p) => {
      const n = s.producers[p.id];
      if (n > 0) v += p.baseCost * (Math.pow(g, n) - 1) / (g - 1);
    });
    for (let i = 1; i <= s.factoryLevel; i++) v += D.factoryLevels[i].cost;
    for (let i = 1; i <= s.shopLevel; i++) v += D.shopLevels[i].cost;
    const vg = D.vehicleCostGrowth;
    D.vehicleTypes.forEach((t) => {
      const n = vehicleCount(s, t.id);
      if (n > 0) v += t.cost * (Math.pow(vg, n) - 1) / (vg - 1);
    });
    return v;
  }

  function lenderAvailable(s, lenderId) {
    const L = lenderById[lenderId];
    if (!L) return false;
    const req = L.requires || {};
    if (req.shopLevel !== undefined && s.shopLevel < req.shopLevel) return false;
    if (req.factoryLevel !== undefined && s.factoryLevel < req.factoryLevel) return false;
    return true;
  }

  function loanFor(s, lenderId) {
    return s.loans.find((l) => l.lender === lenderId) || null;
  }

  function loanOffer(s, lenderId) {
    const L = lenderById[lenderId];
    return Math.max(L.minAmount, Math.round(assetValue(s) * L.assetFraction));
  }

  // What you will owe back for an offer of `amount` from this lender.
  function loanOwed(lenderId, amount) {
    const L = lenderById[lenderId];
    return amount * (1 - (L.cut || 0));
  }

  function canBorrow(s, lenderId) {
    return lenderAvailable(s, lenderId) && !loanFor(s, lenderId);
  }

  function takeLoan(s, lenderId) {
    if (!canBorrow(s, lenderId)) return 0;
    const L = lenderById[lenderId];
    const amount = loanOffer(s, lenderId);
    const owed = loanOwed(lenderId, amount);
    s.money += amount; // borrowed money is not earnings
    s.loans.push({ lender: lenderId, principal: owed, owed, due: s.playTime + L.term, stage: 0 });
    if (L.laundering) {
      s.dirty += amount;
      addNews(s, 'money', `A sports bag with ${fmtMoney(amount)} in it arrived from ${L.name}. ${fmtMoney(owed)} goes back in ${fmtSeconds(L.term)}. Until it has been through the tills it is dirty money.`);
    } else {
      addNews(s, 'money', `${L.name} lent you ${fmtMoney(amount)}. Due in ${fmtSeconds(L.term)}.`);
    }
    return amount;
  }

  function totalDebt(s) {
    return s.loans.reduce((acc, l) => acc + l.owed, 0);
  }

  function removeLoan(s, loan) {
    const i = s.loans.indexOf(loan);
    if (i >= 0) s.loans.splice(i, 1);
  }

  // Pay `amount` (default: everything) towards a loan. Returns what was paid.
  function repayLoan(s, lenderId, amount) {
    const l = loanFor(s, lenderId);
    if (!l) return 0;
    if (amount === undefined) amount = l.owed;
    const pay = Math.min(amount, l.owed, s.money);
    if (pay <= 0) return 0;
    s.money -= pay;
    l.owed -= pay;
    if (l.owed <= 0.005) {
      removeLoan(s, l);
      const L = lenderById[lenderId];
      if (L.escalation) endEvent(s, 'enforcer', D.events.enforcer.endText);
      addNews(s, 'money', L.escalation
        ? `Paid off ${L.name}. Sal says it was a pleasure doing business.`
        : `Paid off ${L.name}. The paperwork is stamped.`);
    }
    return pay;
  }

  // Take assets worth about `amount` (at the seizure discount). Returns what
  // was taken.
  function seizeAssets(s, amount) {
    const disc = R.seizeDiscount;
    const taken = { value: 0, items: [] };
    const counts = {};
    const note = (key, one, many) => { counts[key] = counts[key] || { n: 0, one, many }; counts[key].n += 1; };
    // vehicles, newest first, but they leave you one to get by with
    while (taken.value < amount && s.vehicles.length > 1) {
      const v = s.vehicles.pop();
      const t = vehicleTypeById[v.type];
      taken.value += t.cost * disc;
      s.lifetimeLost += v.load;
      note('v_' + t.id, t.name, t.name + 's');
    }
    // machines, most valuable type first
    D.producers.slice().sort((a, b) => b.baseCost - a.baseCost).forEach((p) => {
      while (taken.value < amount && s.producers[p.id] > 0) {
        s.producers[p.id] -= 1;
        taken.value += p.baseCost * Math.pow(D.costGrowth, s.producers[p.id]) * disc;
        note('p_' + p.id, p.name, p.plural);
      }
    });
    Object.keys(counts).forEach((k) => {
      const c = counts[k];
      taken.items.push(c.n === 1 ? `a ${c.one}` : `${c.n} ${c.many}`);
    });
    // then the shop, one level at a time, then the factory
    while (taken.value < amount && s.shopLevel > 0) {
      const level = D.shopLevels[s.shopLevel];
      taken.value += level.cost * disc;
      s.shopLevel -= 1;
      s.socks = 0;
      taken.items.push(`the ${level.name}`);
    }
    while (taken.value < amount && s.factoryLevel > 0) {
      const level = D.factoryLevels[s.factoryLevel];
      taken.value += level.cost * disc;
      s.factoryLevel -= 1;
      taken.items.push(`the ${level.name}`);
    }
    // outages cannot involve more units than remain
    s.outages = s.outages.filter((o) => {
      o.units = Math.min(o.units, s.producers[o.producer]);
      return o.units > 0;
    });
    return taken;
  }

  // A plain lender's due date: take the cash, then the bailiffs take the rest.
  function collectLoan(s, l, L, out) {
    const pay = Math.min(s.money, l.owed);
    s.money -= pay;
    l.owed -= pay;
    if (l.owed <= 0.005) {
      removeLoan(s, l);
      addNews(s, 'money', `${L.name} collected ${fmtMoney(pay)} in full.`);
      return;
    }
    // the first time, security can stall the bailiffs at the door for a while
    const stall = D.events.bailiffs.guarded && D.events.bailiffs.guarded.grace;
    if (stall && hasSecurity(s) && l.stage === 0) {
      l.stage = 1;
      l.due += stall;
      startEvent(s, 'bailiffs', out);
      return;
    }
    const taken = seizeAssets(s, l.owed);
    l.owed -= taken.value;
    startEvent(s, 'bailiffs', out);
    if (taken.items.length) {
      addNews(s, 'trouble', `${L.name} sent the bailiffs for ${fmtMoney(l.owed + taken.value)}. They took ${listText(taken.items)}.`);
    }
    if (l.owed <= 0.005) {
      removeLoan(s, l);
    } else {
      removeLoan(s, l);
      goBankrupt(s, `${L.name} was still owed ${fmtMoney(l.owed)} and there was nothing left to take.`);
    }
  }

  // Sal's due date: the debt grows, and something unpleasant happens.
  function escalateLoan(s, l, L, out) {
    const step = L.escalation[Math.min(l.stage, L.escalation.length - 1)];
    l.stage += 1;
    l.due += L.grace; // counted from the missed date, so a long absence runs down the ladder
    l.owed = Math.min(l.principal * L.cap, l.owed * L.penalty);
    if (step === 'takeover') { takeover(s, l, L); return; }
    addNews(s, 'money', `${L.name}: "You're late." The debt is now ${fmtMoney(l.owed)}.`);
    startEvent(s, step, out);
  }

  // The Family collects in kind: the shop, or failing that the factory.
  function takeover(s, l, L) {
    removeLoan(s, l);
    endEvent(s, 'enforcer');
    endEvent(s, 'mafiaGranny');
    if (s.shopLevel > 0) {
      const name = currentShop(s).name;
      s.shopLevel = 0;
      s.socks = 0;
      s.marketing = 0;
      addNews(s, 'trouble', `The Family has taken the ${name}. You are back to a folding table on the corner, and the debt is "forgotten".`);
    } else if (s.factoryLevel > 0) {
      const name = currentFactory(s).name;
      s.factoryLevel = 0;
      D.producers.forEach((p) => { s.producers[p.id] = 0; });
      s.outages = [];
      s.factoryStock = 0;
      addNews(s, 'trouble', `The Family has taken the ${name} and every machine in it. You have a shack, a chair and no debt.`);
    } else {
      goBankrupt(s, `${L.name} took everything there was.`);
    }
  }

  function tickLoans(s, dt, out) {
    s.loans.slice().forEach((l) => {
      const L = lenderById[l.lender];
      if (!L) return;
      l.owed = Math.min(l.principal * L.cap, l.owed * Math.exp(L.rate * dt));
      let guard = 0;
      while (s.loans.indexOf(l) >= 0 && s.playTime >= l.due && guard++ < 10) {
        if (L.escalation) escalateLoan(s, l, L, out);
        else collectLoan(s, l, L, out);
      }
    });
  }

  // Everything is gone except lifetime stats and the threads already held.
  function goBankrupt(s, reason) {
    const fresh = newState(s.lastTick);
    const keep = {
      lifetimeMoney: s.lifetimeMoney,
      lifetimeSocks: s.lifetimeSocks,
      lifetimeSold: s.lifetimeSold,
      lifetimeDelivered: s.lifetimeDelivered,
      lifetimeLost: s.lifetimeLost,
      lifetimeSkimmed: s.lifetimeSkimmed,
      lifetimeFines: s.lifetimeFines,
      ordersDone: s.ordersDone,
      customers: s.customers,
      clicks: s.clicks,
      playTime: s.playTime,
      threads: s.threads,
      claimedThreads: Math.max(s.claimedThreads, totalThreadsEarned(s)), // pending threads are forfeit
      retirements: s.retirements,
      bankruptcies: s.bankruptcies + 1,
      news: s.news,
    };
    Object.keys(s).forEach((k) => { delete s[k]; });
    Object.assign(s, fresh, keep);
    addNews(s, 'trouble', `Bankrupt. ${reason} The receivers took the lot.${s.threads > 0 ? ' Your Heirloom Threads are all you have left.' : ' You start again with a chair and a ball of yarn.'}`);
    return true;
  }

  // ---- time -------------------------------------------------------------

  function earn(s, amount) {
    s.money += amount;
    s.lifetimeMoney += amount;
    if (s.dirty > 0) s.dirty = Math.max(0, s.dirty - amount); // honest sales wash Sal's cash clean
  }

  // Advance the world by dt seconds.
  // mode 'expected' (default): vehicles and customers act at their average
  //   rates. Used for offline catch-up and tests.
  // mode 'live': vehicles are stepped individually and no selling happens;
  //   the street scene makes the sales by calling customerVisit.
  // Returns what happened, including `events` (ids of trouble that started)
  // and `ruined` (true if the run ended in bankruptcy).
  function tick(s, dt, mode, rng) {
    mode = mode || 'expected';
    rng = rng || Math.random;
    const out = { produced: 0, knitted: 0, delivered: 0, sold: 0, earned: 0, researchDone: null, events: [], ruined: false, offer: false, orderDone: 0 };
    if (!(dt > 0)) return out;
    const bankruptcies = s.bankruptcies;

    out.knitted = progressKnit(s, dt);
    payUpkeep(s, dt);
    tickProtection(s, dt);
    if (mode === 'live') {
      tickOutages(s, dt);
      rollOutages(s, dt, rng);
      out.produced = productionRate(s) * dt;
    } else {
      // Long stretches: average the outages in rather than rolling them.
      tickOutages(s, dt);
      out.produced = expectedProductionRate(s) * dt;
    }
    const skimmed = out.produced * skimFraction(s);
    s.factoryStock += out.produced - skimmed;
    s.lifetimeSocks += out.produced;
    s.lifetimeSkimmed += skimmed;
    out.researchDone = progressResearch(s, dt);
    if (out.researchDone) {
      const r = researchById[out.researchDone];
      addNews(s, 'research', r.branch ? `Doctrine adopted: ${r.name}.` : `Research complete: ${r.name}.`);
    }

    if (mode === 'live') {
      out.delivered = stepVehicles(s, dt, rng);
    } else {
      const moved = Math.min(s.factoryStock, throughputRate(s) * dt);
      s.factoryStock -= moved;
      s.socks += moved;
      s.lifetimeDelivered += moved;
      out.delivered = moved;
      const r = customerVisit(s, baseFootTraffic(s) * dayMultOver(s, dt) * interest(s) * dt);
      out.sold = r.sold;
      out.earned = r.earned;
    }
    s.playTime += dt;

    tickEvents(s, dt);      // before anything that can start a new event this step
    tickOrders(s, dt, out);
    tickLoans(s, dt, out);
    tickOutrage(s, dt, out);
    tickGrumble(s, dt, out);
    rollRaid(s, dt, rng, out);
    if (mode === 'live') {
      rollTrouble(s, dt, rng, out);
      rollOffer(s, dt, rng, out);
    }
    out.ruined = s.bankruptcies > bankruptcies;
    return out;
  }

  // ---- upgrades, marketing, pricing -------------------------------------

  function upgradeUnlocked(s, u) {
    if (s.upgrades[u.id]) return false;
    if (!u.requires) return true;
    return s.producers[u.requires.producer] >= u.requires.count;
  }

  function upgradeVisible(s, u) {
    return upgradeUnlocked(s, u) && s.lifetimeMoney >= u.cost * D.upgradeRevealFraction;
  }

  function buyUpgrade(s, id) {
    const u = upgradeById[id];
    if (!u || !upgradeUnlocked(s, u) || s.money < u.cost) return false;
    s.money -= u.cost;
    s.upgrades[id] = true;
    return true;
  }

  function nextMarketing(s) {
    return D.marketing[s.marketing] || null;
  }

  function buyMarketing(s) {
    const m = nextMarketing(s);
    if (!m || s.money < m.cost) return false;
    s.money -= m.cost;
    s.marketing += 1;
    return true;
  }

  function markupMin(s) {
    return D.minMarkup * mult(s, 'markupMin');
  }

  function markupMax(s) {
    return Math.max(markupMin(s), D.maxMarkup * mult(s, 'markupMax'));
  }

  function setMarkup(s, value) {
    const v = Number(value);
    if (!isFinite(v)) return;
    s.markup = Math.min(markupMax(s), Math.max(markupMin(s), v));
  }

  function clearance(s) {
    const sold = s.socks;
    const earned = sold * basePrice(s) * D.clearanceRate;
    s.socks = 0;
    s.lifetimeSold += sold;
    earn(s, earned);
    return { sold, earned };
  }

  // ---- prestige ---------------------------------------------------------

  function totalThreadsEarned(s) {
    return Math.floor(Math.sqrt(s.lifetimeMoney / D.prestige.divisor));
  }

  function pendingThreads(s) {
    return Math.max(0, totalThreadsEarned(s) - s.claimedThreads);
  }

  function retire(s) {
    const gained = pendingThreads(s);
    if (gained < 1) return 0;
    const fresh = newState(s.lastTick);
    const keep = {
      lifetimeMoney: s.lifetimeMoney,
      lifetimeSocks: s.lifetimeSocks,
      lifetimeSold: s.lifetimeSold,
      lifetimeDelivered: s.lifetimeDelivered,
      lifetimeLost: s.lifetimeLost,
      lifetimeSkimmed: s.lifetimeSkimmed,
      lifetimeFines: s.lifetimeFines,
      ordersDone: s.ordersDone,
      customers: s.customers,
      clicks: s.clicks,
      playTime: s.playTime,
      threads: s.threads + gained,
      claimedThreads: s.claimedThreads + gained,
      retirements: s.retirements + 1,
      bankruptcies: s.bankruptcies,
    };
    Object.keys(s).forEach((k) => { delete s[k]; });
    Object.assign(s, fresh, keep);
    addNews(s, 'build', `You retired with ${gained} new Heirloom Thread${gained === 1 ? '' : 's'}. The kids have taken over.`);
    return gained;
  }

  // ---- persistence ------------------------------------------------------

  function applyOffline(s, now) {
    const last = typeof s.lastTick === 'number' && s.lastTick > 0 ? s.lastTick : now;
    const elapsed = Math.max(0, Math.min(D.maxOfflineSeconds, (now - last) / 1000));
    const result = tick(s, elapsed, 'expected');
    s.lastTick = now;
    return Object.assign({ elapsed }, result);
  }

  function serialize(s) {
    return JSON.stringify(s);
  }

  // Saves from before research existed: grant what the player had already bought.
  function migrateV1(s) {
    D.producers.forEach((p) => {
      if (s.producers[p.id] > 0) {
        s.research['m_' + p.id] = true;
        s.factoryLevel = Math.max(s.factoryLevel, D.factoryLevels.findIndex((f) => f.unlocks.indexOf(p.id) >= 0));
      }
    });
    for (let i = 1; i <= s.sockLine; i++) {
      if (!D.sockLines[i].side) s.research['s_' + D.sockLines[i].id] = true;
    }
  }

  // Saves from before the Devil's Sock was slotted into the pattern list:
  // sockLine was an index, and everything from argyle on moved up one.
  function migrateV2(s) {
    const devil = sockLineIndex.devil;
    if (s.sockLine >= devil) s.sockLine += 1;
  }

  const finite = (v) => typeof v === 'number' && isFinite(v);

  function deserialize(json, now) {
    const s = newState(now);
    let saved;
    try { saved = JSON.parse(json); } catch (e) { return null; }
    if (!saved || typeof saved !== 'object') return null;
    Object.keys(s).forEach((k) => {
      if (k in saved) s[k] = saved[k];
    });
    D.producers.forEach((p) => { if (!(p.id in s.producers)) s.producers[p.id] = 0; });
    if (!saved.version || saved.version < 3) migrateV2(s);
    if (!saved.version || saved.version < 2) migrateV1(s);
    s.sockLine = Math.min(s.sockLine, D.sockLines.length - 1);
    s.shopLevel = Math.min(s.shopLevel, D.shopLevels.length - 1);
    s.factoryLevel = Math.min(s.factoryLevel, D.factoryLevels.length - 1);
    s.marketing = Math.min(s.marketing, D.marketing.length);
    if (!Array.isArray(s.vehicles)) s.vehicles = [];
    s.vehicles = s.vehicles.filter((v) => v && vehicleTypeById[v.type]);
    if (s.vehicles.length === 0) s.vehicles.push(newVehicle(D.vehicleTypes[0].id));
    if (s.activeResearch && !researchById[s.activeResearch.id]) s.activeResearch = null;
    if (typeof s.knitting !== 'number' || !isFinite(s.knitting)) s.knitting = null;
    if (!s.upkeep || typeof s.upkeep !== 'object') s.upkeep = {};
    if (!Array.isArray(s.outages)) s.outages = [];
    s.outages = s.outages.filter((o) => o && producerById[o.producer] && o.units > 0 && o.remaining > 0);
    if (!Array.isArray(s.news)) s.news = [];
    s.news = s.news.filter((n) => n && typeof n.text === 'string').slice(0, D.newsLimit);
    if (!Array.isArray(s.loans)) s.loans = [];
    s.loans = s.loans.filter((l) => l && lenderById[l.lender] && finite(l.owed) && l.owed > 0 && finite(l.due));
    s.loans.forEach((l) => { if (!finite(l.principal)) l.principal = l.owed; if (!finite(l.stage)) l.stage = 0; });
    if (!Array.isArray(s.events)) s.events = [];
    s.events = s.events.filter((e) => e && D.events[e.id] && (e.remaining === null || (finite(e.remaining) && e.remaining > 0)));
    s.events.forEach((e) => { e.guarded = !!e.guarded; if (!e.vars || typeof e.vars !== 'object') e.vars = {}; });
    s.serenade = null; // whatever the radio was doing, it is not doing it now
    if (!s.cooldowns || typeof s.cooldowns !== 'object') s.cooldowns = {};
    if (!s.resolved || typeof s.resolved !== 'object') s.resolved = {};
    Object.keys(s.cooldowns).forEach((id) => { if (!D.events[id] || !(s.cooldowns[id] > 0)) delete s.cooldowns[id]; });
    const offerOk = (o) => o && typeof o === 'object' && typeof o.customer === 'string' && finite(o.socks) && o.socks > 0 && finite(o.premium);
    if (!offerOk(s.offer) || !finite(s.offer.expires)) s.offer = null;
    if (!offerOk(s.order) || !finite(s.order.due)) s.order = null;
    else if (!finite(s.order.filled)) s.order.filled = 0;
    if (!finite(s.ordersDone)) s.ordersDone = 0;
    if (!finite(s.dirty) || s.dirty < 0) s.dirty = 0;
    if (!finite(s.lifetimeFines)) s.lifetimeFines = 0;
    s.protection = !!s.protection;
    s.protectionOffered = !!s.protectionOffered;
    if (!finite(s.outrage)) s.outrage = 0;
    if (!finite(s.grumble)) s.grumble = 0;
    if (!finite(s.bankruptcies)) s.bankruptcies = 0;
    if (!finite(s.lifetimeSkimmed)) s.lifetimeSkimmed = 0;
    s.vehicles.forEach((v) => { if (!(v.delay > 0)) { v.delay = 0; v.mishap = null; } });
    setMarkup(s, s.markup);
    s.version = SAVE_VERSION;
    return s;
  }

  return {
    data: D,
    newState,
    tick,
    // hand knitting
    knitTime,
    knitYield,
    startKnit,
    knitProgress,
    // production
    producerUnlocked,
    producerCost,
    maxAffordable,
    buyProducer,
    producerRateEach,
    producerRate,
    productionRate,
    expectedProductionRate,
    onStrike,
    factoryClosed,
    skimFraction,
    setSerenade,
    serenadeMult,
    serenadeFor,
    // upkeep and outages
    upkeepLevel,
    setUpkeep,
    upkeepRateFor,
    upkeepRate,
    outageFactor,
    outageInterval,
    availability,
    downUnits,
    // news
    addNews,
    // factory
    currentFactory,
    nextFactory,
    factoryUnlocked,
    buyFactory,
    // research
    researchDone,
    researchBlockers,
    researchAvailable,
    branchChoice,
    branchOptions,
    startResearch,
    researchProgress,
    researchSpeed,
    // sock lines
    currentLine,
    sockLineUnlocked,
    selectSockLine,
    basePrice,
    salePrice,
    // vehicles
    vehicleUnlocked,
    vehicleCount,
    vehicleCapacity,
    vehicleTripTime,
    vehicleCost,
    buyVehicle,
    vehicleThroughput,
    mishapChance,
    mishapAverages,
    throughputRate,
    socksInTransit,
    stepVehicles,
    // shop
    currentShop,
    nextShop,
    shopUnlocked,
    buyShop,
    footTraffic,
    dayPhase,
    daylight,
    dayMult,
    interest,
    basketSize,
    demandRate,
    customerVisit,
    salesRate,
    incomeRate,
    marketingMult,
    threadBonus,
    // trouble
    eventActive,
    eventDef,
    hasSecurity,
    startEvent,
    endEvent,
    resolveCost,
    resolveEvent,
    eventText,
    spawnAllowed,
    grumbleRate,
    wageWorkers,
    // bulk orders
    orderPrice,
    acceptOrder,
    declineOrder,
    // insurance and dirty money
    protectionAvailable,
    protectionRate,
    setProtection,
    raidInterval,
    // loans
    assetValue,
    lenderAvailable,
    loanFor,
    loanOffer,
    loanOwed,
    canBorrow,
    takeLoan,
    repayLoan,
    totalDebt,
    seizeAssets,
    goBankrupt,
    // upgrades, marketing, pricing
    upgradeUnlocked,
    upgradeVisible,
    buyUpgrade,
    nextMarketing,
    buyMarketing,
    markupMin,
    markupMax,
    setMarkup,
    clearance,
    // prestige and persistence
    totalThreadsEarned,
    pendingThreads,
    retire,
    applyOffline,
    serialize,
    deserialize,
  };
});
