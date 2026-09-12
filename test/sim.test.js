const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../js/sim.js');
const Fmt = require('../js/format.js');
const D = Sim.data;

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg || `${a} != ${b}`);

function rich(amount) {
  const s = Sim.newState(0);
  s.money = amount;
  return s;
}

// A state that has researched everything (except the exclusive doctrines)
// and owns a big factory and shop.
function endgame(money) {
  const s = rich(money === undefined ? 1e15 : money);
  D.research.forEach((r) => { if (!r.branch) s.research[r.id] = true; });
  s.factoryLevel = D.factoryLevels.length - 1;
  s.shopLevel = D.shopLevels.length - 1;
  return s;
}

test('new state starts with nothing but a courier', () => {
  const s = Sim.newState(0);
  assert.equal(s.money, 0);
  assert.equal(s.socks, 0);
  assert.equal(s.factoryStock, 0);
  assert.equal(Sim.productionRate(s), 0);
  assert.equal(Sim.knitTime(s), D.baseKnitTime);
  assert.equal(Sim.knitYield(s), 1);
  assert.equal(Sim.salePrice(s), 1);
  assert.equal(s.vehicles.length, 1);
  assert.equal(s.vehicles[0].type, 'backpack');
});

test('hand knitting takes time and ignores extra clicks', () => {
  const s = Sim.newState(0);
  s.vehicles = []; // nobody to carry the sock away
  assert.equal(Sim.startKnit(s), true);
  assert.equal(Sim.startKnit(s), false, 'already knitting');
  let r = Sim.tick(s, D.baseKnitTime / 2);
  assert.equal(r.knitted, 0);
  close(Sim.knitProgress(s), 0.5);
  assert.equal(s.factoryStock, 0);
  r = Sim.tick(s, D.baseKnitTime / 2 + 0.01);
  assert.equal(r.knitted, 1);
  assert.equal(s.factoryStock, 1);
  assert.equal(s.socks, 0);
  assert.equal(s.clicks, 1);
  assert.equal(s.lifetimeSocks, 1);
  assert.equal(s.knitting, null);
  assert.equal(Sim.startKnit(s), true, 'can knit again');
});

test('machines need research before they can be bought', () => {
  const s = rich(1e9);
  assert.equal(Sim.buyProducer(s, 'granny'), false);
  s.research.m_granny = true;
  assert.equal(Sim.buyProducer(s, 'granny'), true);
  assert.equal(s.producers.granny, 1);
});

test('producer cost grows geometrically and bulk cost matches repeated buys', () => {
  const s = endgame(1e9);
  const one = Sim.producerCost(s, 'granny', 1);
  assert.equal(one, 15);
  const five = Sim.producerCost(s, 'granny', 5);
  let total = 0;
  for (let i = 0; i < 5; i++) {
    total += Sim.producerCost(s, 'granny', 1);
    Sim.buyProducer(s, 'granny', 1);
  }
  close(five, total);
  assert.equal(s.producers.granny, 5);
});

test('maxAffordable matches what you can actually buy', () => {
  const s = endgame(500);
  const n = Sim.maxAffordable(s, 'granny');
  assert.ok(n > 0);
  assert.ok(Sim.producerCost(s, 'granny', n) <= 500);
  assert.ok(Sim.producerCost(s, 'granny', n + 1) > 500);
  assert.equal(Sim.maxAffordable(Sim.newState(0), 'granny'), 0);
});

test('factory upgrades need money and a knitted milestone', () => {
  const s = rich(1e6);
  const next = Sim.nextFactory(s);
  assert.equal(next.id, 'cottage');
  assert.equal(Sim.buyFactory(s), false, 'nothing knitted yet');
  s.lifetimeSocks = next.requiresKnitted;
  assert.equal(Sim.buyFactory(s), true);
  assert.equal(s.factoryLevel, 1);
  assert.equal(s.money, 1e6 - next.cost);
});

test('research is gated by factory, shop and earlier research', () => {
  const s = rich(1e9);
  const granny = D.research.find((r) => r.id === 'm_granny');
  let b = Sim.researchBlockers(s, granny);
  assert.equal(b.factoryLevel, 1);
  assert.equal(Sim.startResearch(s, 'm_granny'), false);
  s.factoryLevel = 1;
  assert.equal(Sim.researchAvailable(s, granny), true);
  const loom = D.research.find((r) => r.id === 'm_loom');
  b = Sim.researchBlockers(s, loom);
  assert.equal(b.factoryLevel, 2);
  assert.deepEqual(b.research, ['m_granny']);
  const argyle = D.research.find((r) => r.id === 's_argyle');
  b = Sim.researchBlockers(s, argyle);
  assert.equal(b.shopLevel, 1);
  assert.deepEqual(b.research, ['s_striped']);
});

test('research costs money, takes time, and runs one at a time', () => {
  const s = rich(1e9);
  s.factoryLevel = 1;
  const granny = D.research.find((r) => r.id === 'm_granny');
  assert.equal(Sim.startResearch(s, 'm_granny'), true);
  assert.equal(s.money, 1e9 - granny.cost);
  assert.equal(Sim.startResearch(s, 's_striped'), false, 'busy');
  let r = Sim.tick(s, granny.time / 2);
  assert.equal(r.researchDone, null);
  close(Sim.researchProgress(s), 0.5);
  r = Sim.tick(s, granny.time / 2 + 0.01);
  assert.equal(r.researchDone, 'm_granny');
  assert.equal(Sim.researchDone(s, 'm_granny'), true);
  assert.equal(s.activeResearch, null);
  assert.equal(Sim.startResearch(s, 'm_granny'), false, 'already done');
});

test('threads speed up research', () => {
  const s = rich(1e9);
  s.threads = 10; // ×2
  s.factoryLevel = 1;
  Sim.startResearch(s, 'm_granny');
  const granny = D.research.find((r) => r.id === 'm_granny');
  const r = Sim.tick(s, granny.time / 2 + 0.01);
  assert.equal(r.researchDone, 'm_granny');
});

test('sock lines unlock through research and can be selected freely', () => {
  const s = Sim.newState(0);
  assert.equal(Sim.sockLineUnlocked(s, 0), true);
  assert.equal(Sim.sockLineUnlocked(s, 1), false);
  assert.equal(Sim.selectSockLine(s, 1), false);
  s.research.s_striped = true;
  assert.equal(Sim.selectSockLine(s, 1), true);
  assert.equal(Sim.basePrice(s), 3);
  assert.equal(Sim.selectSockLine(s, 0), true);
  assert.equal(Sim.basePrice(s), 1);
});

test('a courier carries socks from the factory to the shop', () => {
  const s = Sim.newState(0);
  s.factoryStock = 12;
  const v = s.vehicles[0];
  Sim.stepVehicles(s, 0.1);
  assert.equal(v.load, 5, 'took a full backpack');
  assert.equal(s.factoryStock, 7);
  assert.equal(v.phase, 'loading');
  Sim.stepVehicles(s, D.loadTime + 0.01);
  assert.equal(v.phase, 'toShop');
  Sim.stepVehicles(s, Sim.vehicleTripTime(s, 'backpack') + 0.01);
  assert.equal(v.phase, 'unloading');
  assert.equal(s.socks, 0);
  Sim.stepVehicles(s, D.unloadTime + 0.01);
  assert.equal(s.socks, 5);
  assert.equal(v.load, 0);
  assert.equal(v.phase, 'toFactory');
  assert.equal(s.lifetimeDelivered, 5);
  Sim.stepVehicles(s, Sim.vehicleTripTime(s, 'backpack') + 0.01);
  assert.equal(v.phase, 'loading');
});

test('a vehicle waits at an empty factory', () => {
  const s = Sim.newState(0);
  Sim.stepVehicles(s, 100);
  assert.equal(s.vehicles[0].phase, 'loading');
  assert.equal(s.vehicles[0].load, 0);
});

test('vehicles need research, cost more each time, and logistics research helps', () => {
  const s = rich(1e6);
  assert.equal(Sim.buyVehicle(s, 'bicycle'), false);
  const c0 = Sim.vehicleCost(s, 'backpack');
  assert.equal(Sim.buyVehicle(s, 'backpack'), true);
  assert.equal(s.vehicles.length, 2);
  close(Sim.vehicleCost(s, 'backpack'), c0 * D.vehicleCostGrowth);
  s.research.v_bicycle = true;
  assert.equal(Sim.buyVehicle(s, 'bicycle'), true);
  const before = Sim.throughputRate(s);
  s.research.l_crates = true; // ×2 capacity
  close(Sim.throughputRate(s), before * 2);
  const trip = Sim.vehicleTripTime(s, 'bicycle');
  s.research.l_routes = true;
  close(Sim.vehicleTripTime(s, 'bicycle'), trip * 0.75);
});

test('expected mode moves socks at the fleet throughput and sells them', () => {
  const s = endgame(1e6);
  s.producers.granny = 100; // 10 socks/s, more than one courier can carry
  const expectedProd = Sim.expectedProductionRate(s);
  assert.ok(expectedProd < 10 && expectedProd > 9, 'outages averaged in');
  const r = Sim.tick(s, 10);
  close(r.produced, expectedProd * 10);
  close(r.delivered, Sim.throughputRate(s) * 10);
  assert.ok(s.factoryStock > 0, 'backlog at the factory');
  assert.ok(r.sold > 0);
  assert.ok(s.money > 0);
});

const never = () => 0.999999; // an rng that never triggers a chance roll
const always = () => 0;        // an rng that always triggers it

test('upkeep is paid continuously and scales with the slider', () => {
  const s = endgame(1000);
  s.producers.granny = 10;
  close(Sim.upkeepRate(s), 10 * D.producers[0].upkeep);
  Sim.setUpkeep(s, 'granny', 2);
  close(Sim.upkeepRate(s), 20 * D.producers[0].upkeep);
  Sim.setUpkeep(s, 'granny', 99);
  assert.equal(Sim.upkeepLevel(s, 'granny'), D.upkeep.maxLevel);
  Sim.setUpkeep(s, 'granny', 1);
  Sim.tick(s, 10, 'live', never);
  close(s.money, 1000 - 10 * D.producers[0].upkeep * 10);
  assert.equal(s.unpaid, false);
});

test('unpaid upkeep is announced once and maximises outages', () => {
  const s = endgame(0);
  s.protectionOffered = true; // Sal has already been round; keep the news to the wages
  s.producers.granny = 10;
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.unpaid, true);
  assert.equal(s.news.length, 1);
  assert.match(s.news[0].text, /cannot cover/);
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.news.length, 1, 'not repeated');
  close(Sim.outageInterval(s, 'granny'), D.upkeep.eventInterval / D.upkeep.factorAtZero);
  s.money = 1e6;
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.unpaid, false);
  assert.match(s.news[0].text, /paid again/);
});

test('outage factor: cheap means frequent, generous means rare', () => {
  assert.equal(Sim.outageFactor(1), 1);
  assert.equal(Sim.outageFactor(0), D.upkeep.factorAtZero);
  close(Sim.outageFactor(2), D.upkeep.factorAtMax);
  const s = endgame(1e6);
  s.producers.granny = 10;
  const a1 = Sim.availability(s, 'granny');
  Sim.setUpkeep(s, 'granny', 0);
  assert.ok(Sim.availability(s, 'granny') < a1);
  Sim.setUpkeep(s, 'granny', 2);
  assert.ok(Sim.availability(s, 'granny') > a1);
});

test('an outage takes units off the line, is reported, and ends', () => {
  const s = endgame(1e6);
  s.shopLevel = 0; // an rng that fires everything would otherwise bring bulk orders too
  s.producers.granny = 20;
  const full = Sim.productionRate(s);
  Sim.tick(s, 1, 'live', always);
  assert.equal(s.outages.length, 1);
  assert.equal(s.outages[0].units, 3, '15% of 20');
  assert.equal(Sim.downUnits(s, 'granny'), 3);
  close(Sim.productionRate(s), full * 17 / 20);
  assert.match(s.news[0].text, /bingo/);
  const dur = s.outages[0].remaining;
  Sim.tick(s, dur + 0.01, 'live', never);
  assert.equal(s.outages.length, 0);
  close(Sim.productionRate(s), full);
  assert.match(s.news[0].text, /back from bingo/);
});

test('delivery mishaps delay the vehicle, lose socks, and make the news', () => {
  const s = rich(1e6);
  s.research.v_bicycle = true;
  s.vehicles = [{ type: 'bicycle', phase: 'loading', progress: 0, load: 0, timer: 0 }];
  s.factoryStock = 100;
  Sim.stepVehicles(s, 0.1, never);          // loads 15
  Sim.stepVehicles(s, D.loadTime, always);  // departs; mishap 0 = lamppost, lose 50%
  const v = s.vehicles[0];
  assert.equal(v.phase, 'toShop');
  assert.equal(v.load, 8, '15 minus floor(7.5)');
  assert.equal(s.lifetimeLost, 7);
  assert.equal(v.delay, D.vehicleTypes[1].mishaps[0].delay);
  assert.match(s.news[0].text, /lamppost/);
  Sim.stepVehicles(s, 1, never);
  assert.equal(v.progress, 0, 'stuck while delayed');
  Sim.stepVehicles(s, v.delay + 0.01, never);
  assert.equal(v.delay, 0);
  Sim.stepVehicles(s, 1, never);
  assert.ok(v.progress > 0, 'moving again');
});

test('safety research halves mishap chance and raises expected throughput', () => {
  const s = rich(1e6);
  s.research.v_bicycle = true;
  const c0 = Sim.mishapChance(s, 'bicycle');
  const t0 = Sim.vehicleThroughput(s, 'bicycle');
  s.research.l_training = true;
  close(Sim.mishapChance(s, 'bicycle'), c0 / 2);
  assert.ok(Sim.vehicleThroughput(s, 'bicycle') > t0);
});

test('news is newest first and capped', () => {
  const s = Sim.newState(0);
  for (let i = 0; i < D.newsLimit + 10; i++) Sim.addNews(s, 'staff', 'item ' + i);
  assert.equal(s.news.length, D.newsLimit);
  assert.equal(s.news[0].text, 'item ' + (D.newsLimit + 9));
  const back = Sim.deserialize(Sim.serialize(s), 0);
  assert.equal(back.news.length, D.newsLimit);
});

test('live mode only produces, steps vehicles and never sells', () => {
  const s = Sim.newState(0);
  s.research.m_granny = true;
  s.producers.granny = 100;
  Sim.tick(s, 1, 'live', never);
  assert.ok(s.factoryStock > 0);
  assert.equal(s.money, 0);
  assert.equal(s.vehicles[0].load, 5, 'courier grabbed a load');
});

test('demand is traffic × interest × basket and reacts to markup', () => {
  const s = Sim.newState(0);
  assert.equal(Sim.footTraffic(s), D.baseTraffic);
  assert.equal(Sim.interest(s), D.baseInterest);
  assert.equal(Sim.basketSize(s), 1);
  const d1 = Sim.demandRate(s);
  Sim.setMarkup(s, 2);
  assert.equal(Sim.salePrice(s), 2);
  close(Sim.demandRate(s), d1 / 4);
  Sim.setMarkup(s, 0.5);
  assert.ok(Sim.interest(s) <= D.maxInterest);
  Sim.setMarkup(s, 99);
  assert.equal(s.markup, D.maxMarkup);
});

test('a customer visit sells up to the basket size', () => {
  const s = Sim.newState(0);
  s.shopLevel = 2; // basket 3
  s.socks = 2;
  let r = Sim.customerVisit(s);
  assert.equal(r.wanted, 3);
  assert.equal(r.sold, 2);
  assert.equal(s.socks, 0);
  r = Sim.customerVisit(s);
  assert.equal(r.sold, 0);
  s.socks = 100;
  r = Sim.customerVisit(s, 2);
  assert.equal(r.sold, 6);
});

test('shop upgrades need money and a sales milestone', () => {
  const s = rich(1e6);
  const next = Sim.nextShop(s);
  assert.equal(Sim.buyShop(s), false);
  s.lifetimeSold = next.requiresSold;
  assert.equal(Sim.buyShop(s), true);
  assert.equal(Sim.basketSize(s), 2);
});

test('producer upgrades unlock by count and double output', () => {
  const s = endgame(1e6);
  const u = D.upgrades.find((x) => x.id === 'granny_0');
  assert.equal(Sim.buyUpgrade(s, u.id), false);
  s.producers.granny = 10;
  const before = Sim.productionRate(s);
  assert.equal(Sim.buyUpgrade(s, u.id), true);
  close(Sim.productionRate(s), before * 2);
  assert.equal(Sim.buyUpgrade(s, u.id), false);
});

test('upgrades are hidden until earnings approach their cost', () => {
  const s = Sim.newState(0);
  const needles = D.upgrades.find((x) => x.id === 'needles');
  assert.equal(Sim.upgradeVisible(s, needles), false);
  s.lifetimeMoney = needles.cost * D.upgradeRevealFraction;
  assert.equal(Sim.upgradeVisible(s, needles), true);
});

test('needle upgrades and threads shorten knit time; inspiration adds yield', () => {
  const s = endgame(1e7);
  Sim.buyUpgrade(s, 'needles');
  close(Sim.knitTime(s), D.baseKnitTime / 2);
  s.threads = 10; // ×2
  close(Sim.knitTime(s), D.baseKnitTime / 4);
  s.producers.granny = 100; // 10/s × thread bonus 2 = 20/s
  Sim.buyUpgrade(s, 'delegate');
  close(Sim.knitYield(s), 1 + 0.05 * Sim.productionRate(s));
});

test('marketing raises traffic', () => {
  const s = rich(1e6);
  assert.equal(Sim.buyMarketing(s), true);
  assert.equal(Sim.marketingMult(s), 2);
  close(Sim.footTraffic(s), D.baseTraffic * 2);
});

test('clearance dumps shop stock at a fraction of base price', () => {
  const s = Sim.newState(0);
  s.socks = 100;
  s.factoryStock = 50;
  Sim.setMarkup(s, 2);
  const r = Sim.clearance(s);
  assert.equal(r.sold, 100);
  assert.equal(r.earned, 100 * D.clearanceRate);
  assert.equal(s.socks, 0);
  assert.equal(s.factoryStock, 50, 'factory stock untouched');
});

test('retiring grants threads, resets the run, keeps lifetime stats', () => {
  const s = endgame(500);
  s.lifetimeMoney = 4 * D.prestige.divisor;
  s.producers.granny = 10;
  s.vehicles.push({ type: 'van', phase: 'toShop', progress: 0.5, load: 100, timer: 0 });
  s.lifetimeSold = 777;
  assert.equal(Sim.retire(s), 2);
  assert.equal(s.threads, 2);
  assert.equal(s.money, 0);
  assert.equal(s.factoryLevel, 0);
  assert.equal(s.shopLevel, 0);
  assert.deepEqual(s.research, {});
  assert.equal(s.vehicles.length, 1);
  assert.equal(s.lifetimeSold, 777);
  assert.equal(s.retirements, 1);
  assert.equal(Sim.pendingThreads(s), 0);
  close(Sim.threadBonus(s), 1.2);
  assert.match(s.news[0].text, /retired/);
});

test('offline progress is capped', () => {
  const s = Sim.newState(1000);
  const r = Sim.applyOffline(s, 100 * 3600 * 1000);
  assert.equal(r.elapsed, D.maxOfflineSeconds);
});

test('serialize/deserialize round-trips, migrates old saves, tolerates junk', () => {
  const s = endgame(123);
  s.producers.loom = 3;
  s.vehicles.push({ type: 'van', phase: 'toShop', progress: 0.5, load: 100, timer: 0 });
  const back = Sim.deserialize(Sim.serialize(s), 0);
  assert.equal(back.money, 123);
  assert.equal(back.producers.loom, 3);
  assert.equal(back.vehicles.length, 2);
  assert.equal(back.vehicles[1].load, 100);

  const old = { version: 1, money: 5, producers: { granny: 2, machine: 1 }, sockLine: 2, socks: 40 };
  const m = Sim.deserialize(JSON.stringify(old), 0);
  assert.equal(m.research.m_granny, true);
  assert.equal(m.research.m_machine, true);
  assert.equal(m.factoryLevel, 2, 'workshop, because a machine is owned');
  assert.equal(m.research.s_striped, true);
  assert.equal(m.research.s_argyle, true);
  assert.equal(m.vehicles.length, 1);

  assert.equal(Sim.deserialize('not json', 0), null);
  assert.equal(Sim.deserialize('42', 0), null);
});

test('number formatting', () => {
  assert.equal(Fmt.fmt(0), '0.00');
  assert.equal(Fmt.fmt(15), '15.0');
  assert.equal(Fmt.fmt(999), '999');
  assert.equal(Fmt.fmt(999.7), '1.00K');
  assert.equal(Fmt.fmt(2.5e6), '2.50M');
  assert.equal(Fmt.money(3.456), '$3.46');
  assert.equal(Fmt.money(1e9), '$1.00B');
  assert.equal(Fmt.fmtTime(3725), '1h 2m');
  assert.equal(Fmt.fmtSocks(1.7), '1.7');
  assert.equal(Fmt.fmtSocks(2500), '2.50K');
});

// ---- divergent strategies -------------------------------------------------

test('doctrines are exclusive within a branch and hold until retirement', () => {
  const s = rich(1e9);
  s.factoryLevel = 2;
  const guild = D.research.find((r) => r.id === 'd_guild');
  const corners = D.research.find((r) => r.id === 'd_corners');
  assert.equal(Sim.researchAvailable(s, guild), true);
  assert.equal(Sim.researchAvailable(s, corners), true);
  assert.equal(Sim.startResearch(s, 'd_guild'), true);
  Sim.tick(s, guild.time + 1, 'live', never);
  assert.equal(Sim.branchChoice(s, 'factory'), 'd_guild');
  assert.equal(Sim.researchBlockers(s, corners).branch, 'd_guild');
  assert.equal(Sim.researchAvailable(s, corners), false);
  assert.equal(Sim.startResearch(s, 'd_corners'), false);
  assert.match(s.news[0].text, /Doctrine adopted/);
  s.lifetimeMoney = 4 * D.prestige.divisor;
  Sim.retire(s);
  assert.equal(Sim.branchChoice(s, 'factory'), null, 'a fresh run can choose again');
});

test('the Knitting Guild boosts grannies and calms them, at the machines\' expense', () => {
  const s = endgame(1e9);
  s.producers.granny = 10;
  s.producers.loom = 10;
  const g0 = Sim.producerRate(s, 'granny');
  const l0 = Sim.producerRate(s, 'loom');
  const bingo0 = Sim.outageInterval(s, 'granny');
  s.research.d_guild = true;
  close(Sim.producerRate(s, 'granny'), g0 * 3);
  close(Sim.producerRate(s, 'loom'), l0 * 0.75);
  close(Sim.outageInterval(s, 'granny'), bingo0 * 2, 'bingo half as often');
});

test('Cut Every Corner makes upkeep cheap but everything shakier', () => {
  const s = endgame(1e9);
  s.producers.granny = 10;
  s.producers.machine = 2;
  const up0 = Sim.upkeepRate(s);
  const prod0 = Sim.productionRate(s);
  const out0 = Sim.outageInterval(s, 'machine');
  s.research.d_corners = true;
  close(Sim.upkeepRate(s), up0 * 0.4);
  close(Sim.productionRate(s), prod0 * 1.25);
  close(Sim.outageInterval(s, 'machine'), out0 / 2);
  assert.ok(Sim.grumbleRate(s) > 0, 'even at 100% wages the grannies mutter');
  Sim.setUpkeep(s, 'granny', 2);
  assert.ok(Sim.grumbleRate(s) < 0, 'spoiling them keeps the peace');
});

test('retail doctrines reshape the shop and the markup slider', () => {
  const s = rich(1e6);
  s.shopLevel = 2; // basket 3
  Sim.setMarkup(s, 2);
  s.research.d_pile = true;
  assert.equal(Sim.basketSize(s), 6);
  close(Sim.markupMax(s), 1);
  Sim.setMarkup(s, 2);
  assert.equal(s.markup, 1, 'markup capped at 100%');
  close(Sim.salePrice(s), 0.6);
  delete s.research.d_pile;
  s.research.d_velvet = true;
  close(Sim.markupMax(s), 4);
  Sim.setMarkup(s, 4);
  close(Sim.salePrice(s), 8);
  close(Sim.footTraffic(s), D.baseTraffic * D.shopLevels[2].traffic * 0.5);
});

test("the Devil's Sock branches off the pattern chain", () => {
  const s = rich(1e9);
  s.shopLevel = 1;
  const devil = D.research.find((r) => r.id === 's_devil');
  const argyle = D.research.find((r) => r.id === 's_argyle');
  const wool = D.research.find((r) => r.id === 's_wool');
  assert.deepEqual(Sim.researchBlockers(s, devil).research, ['s_striped']);
  assert.deepEqual(Sim.researchBlockers(s, argyle).research, ['s_striped']);
  s.research.s_striped = true;
  s.research.s_argyle = true;
  assert.deepEqual(Sim.researchBlockers(s, wool).research, [], 'wool does not need the devil');
});

// ---- ruin ------------------------------------------------------------------

test("selling the Devil's Sock brings a picket, and a donation ends it", () => {
  const s = rich(1000);
  s.shopLevel = 2;
  s.marketing = 2;
  s.research.s_striped = true;
  s.research.s_devil = true;
  Sim.selectSockLine(s, D.sockLines.findIndex((l) => l.id === 'devil'));
  s.socks = 1e6;
  const i0 = Sim.interest(s);
  let r = Sim.tick(s, 1, 'expected');
  assert.ok(s.outrage > 0, 'the devout noticed');
  assert.equal(Sim.eventActive(s, 'picket'), false);
  s.outrage = D.ruin.outrageThreshold;
  r = Sim.tick(s, 1, 'expected');
  assert.deepEqual(r.events, ['picket']);
  assert.equal(Sim.eventActive(s, 'picket'), true);
  assert.equal(s.outrage, 0);
  close(Sim.interest(s), i0 * D.events.picket.interest, 'almost nobody gets past');
  assert.match(s.news[0].text, /Congregation/);
  const cost = Sim.resolveCost(s, 'picket');
  close(cost, Math.max(D.events.picket.resolve.min, s.money * 0.25));
  const before = s.money;
  assert.equal(Sim.resolveEvent(s, 'picket'), true);
  close(s.money, before - cost);
  assert.equal(Sim.eventActive(s, 'picket'), false);
  close(Sim.interest(s), i0);
  assert.equal(Sim.resolveCost(s, 'picket'), null, 'nothing left to resolve');
  // the community doctrine makes the town far more forgiving
  s.outrage = 0;
  Sim.tick(s, 1, 'expected');
  const plain = s.outrage;
  s.outrage = 0;
  s.research.d_community = true;
  Sim.tick(s, 1, 'expected');
  assert.ok(s.outrage < plain * 0.5, 'outrage grows far slower');
});

test('a picket ends on its own after its duration', () => {
  const s = rich(100);
  Sim.startEvent(s, 'picket');
  Sim.tick(s, D.events.picket.duration + 1, 'live', never);
  assert.equal(Sim.eventActive(s, 'picket'), false);
  assert.match(s.news[0].text, /evensong/);
});

test('underpaid grannies grumble, strike, and can be settled', () => {
  const s = endgame(1e6);
  s.producers.granny = 20;
  s.producers.loom = 5;
  assert.ok(Sim.grumbleRate(s) < 0, 'content at 100%');
  Sim.setUpkeep(s, 'granny', 0);
  close(Sim.grumbleRate(s), D.ruin.grumbleRate);
  const r = Sim.tick(s, D.ruin.grumbleThreshold + 1, 'live', never);
  assert.deepEqual(r.events, ['strike']);
  assert.equal(Sim.onStrike(s, 'granny'), true);
  assert.equal(Sim.onStrike(s, 'loom'), false);
  assert.equal(Sim.producerRate(s, 'granny'), 0);
  assert.equal(Sim.expectedProductionRate(s), 5 * Sim.producerRateEach(s, 'loom') * Sim.availability(s, 'loom'));
  const cost = Sim.resolveCost(s, 'strike');
  close(cost, 20 * D.producers[0].upkeep * D.events.strike.resolve.wagesSeconds);
  assert.equal(Sim.resolveEvent(s, 'strike'), true);
  assert.equal(Sim.upkeepLevel(s, 'granny'), 1, 'wages restored');
  assert.ok(Sim.producerRate(s, 'granny') > 0);
  assert.equal(s.grumble, 0);
});

test('unpaid wages are the fastest route to a strike', () => {
  const s = endgame(0);
  s.producers.granny = 10;
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.unpaid, true);
  close(Sim.grumbleRate(s), D.ruin.unpaidGrumble);
});

test('Cousin Sal lends against assets, compounds fast, and caps', () => {
  const s = rich(0);
  assert.equal(Sim.canBorrow(s, 'mafia'), true);
  assert.equal(Sim.canBorrow(s, 'bank'), false, 'the bank wants a real shop');
  const offer = Sim.loanOffer(s, 'mafia');
  assert.equal(offer, D.lenders[1].minAmount);
  assert.equal(Sim.takeLoan(s, 'mafia'), offer);
  assert.equal(s.money, offer);
  assert.equal(s.lifetimeMoney, 0, 'borrowed money is not earnings');
  assert.equal(Sim.canBorrow(s, 'mafia'), false, 'one at a time');
  const loan = Sim.loanFor(s, 'mafia');
  Sim.tick(s, 60, 'live', never);
  close(loan.owed, offer * Math.exp(D.lenders[1].rate * 60));
  Sim.tick(s, 36000, 'live', never); // the escalation ladder runs out long before this
  assert.equal(Sim.loanFor(s, 'mafia'), null, 'the Family collected in kind');
});

test('repaying Sal early costs only what is owed and sends the enforcer home', () => {
  const s = rich(0);
  Sim.takeLoan(s, 'mafia');
  Sim.startEvent(s, 'enforcer');
  s.money = 1e6;
  const owed = Sim.loanFor(s, 'mafia').owed;
  assert.equal(Sim.repayLoan(s, 'mafia', 100), 100, 'partial repayment');
  assert.equal(Sim.repayLoan(s, 'mafia'), owed - 100);
  assert.equal(Sim.loanFor(s, 'mafia'), null);
  assert.equal(Sim.eventActive(s, 'enforcer'), false);
  assert.match(s.news[0].text, /pleasure/);
});

test('missing Sal\'s date escalates: enforcer, granny, bikers, takeover', () => {
  const s = endgame(0);
  delete s.research.r_security; // nobody on the door: the plain outcome
  s.shopLevel = 2;
  s.marketing = 3;
  s.producers.granny = 10;
  s.vehicles = []; // nothing leaves the factory, so the skim is easy to see
  const L = D.lenders[1];
  Sim.takeLoan(s, 'mafia');
  const loan = Sim.loanFor(s, 'mafia');
  const i0 = Sim.interest(s);
  let r = Sim.tick(s, L.term + 0.5, 'live', never);
  assert.deepEqual(r.events, ['enforcer']);
  assert.equal(loan.stage, 1);
  close(Sim.interest(s), i0 * 0.5);
  close(loan.owed, Math.min(loan.principal * L.cap, loan.principal * Math.exp(L.rate * (L.term + 0.5)) * L.penalty));

  r = Sim.tick(s, L.grace, 'live', never);
  assert.deepEqual(r.events, ['mafiaGranny']);
  assert.equal(Sim.skimFraction(s), 0.3);
  const stock = s.factoryStock;
  r = Sim.tick(s, 1, 'live', never);
  close(s.factoryStock - stock, r.produced * 0.7, 'a third skimmed');
  assert.ok(s.lifetimeSkimmed > 0);

  s.socks = 1000;
  r = Sim.tick(s, L.grace, 'live', never);
  assert.deepEqual(r.events, ['bikers']);
  assert.equal(s.socks, 500, 'half the shelves gone');
  assert.equal(Sim.footTraffic(s), 0, 'the street is empty');

  r = Sim.tick(s, L.grace, 'live', never);
  assert.equal(s.shopLevel, 0, 'the Family took the boutique');
  assert.equal(s.marketing, 0);
  assert.equal(Sim.loanFor(s, 'mafia'), null);
  assert.equal(Sim.eventActive(s, 'mafiaGranny'), false, 'she left with the debt');
  assert.match(s.news[0].text, /Family/);
  assert.equal(r.ruined, false);
});

test('with no shop to take, the Family takes the factory, then everything', () => {
  const s = rich(0);
  s.factoryLevel = 2;
  s.research.m_granny = true;
  s.producers.granny = 5;
  Sim.takeLoan(s, 'mafia');
  const loan = Sim.loanFor(s, 'mafia');
  loan.stage = 3;
  loan.due = 0;
  let r = Sim.tick(s, 1, 'live', never);
  assert.equal(s.factoryLevel, 0);
  assert.equal(s.producers.granny, 0);
  assert.equal(r.ruined, false);
  Sim.takeLoan(s, 'mafia');
  const again = Sim.loanFor(s, 'mafia');
  again.stage = 3;
  again.due = 0;
  r = Sim.tick(s, 1, 'live', never);
  assert.equal(r.ruined, true);
  assert.equal(s.bankruptcies, 1);
  assert.equal(s.money, 0);
  assert.match(s.news[0].text, /Bankrupt/);
});

test('the bank collects in full when it can', () => {
  const s = rich(0);
  s.shopLevel = 1;
  const offer = Sim.takeLoan(s, 'bank');
  assert.ok(offer >= D.lenders[0].minAmount);
  s.money = 1e6;
  Sim.tick(s, D.lenders[0].term + 1, 'live', never);
  assert.equal(Sim.loanFor(s, 'bank'), null);
  assert.ok(s.money < 1e6 && s.money > 1e6 - offer * 2);
  assert.match(s.news[0].text, /collected/);
  assert.equal(Sim.eventActive(s, 'bailiffs'), false);
});

test('a short bank loan brings the bailiffs, who seize vehicles, machines, then the shop', () => {
  const s = endgame(0);
  delete s.research.r_security; // nobody on the door: the plain outcome
  s.shopLevel = 2;
  s.factoryLevel = 2;
  s.producers.granny = 10;
  s.producers.loom = 3;
  s.vehicles.push({ type: 'van', phase: 'toShop', progress: 0.5, load: 100, timer: 0 });
  s.vehicles.push({ type: 'van', phase: 'loading', progress: 0, load: 0, timer: 0 });
  Sim.takeLoan(s, 'bank');
  const loan = Sim.loanFor(s, 'bank');
  loan.owed = 2600; // two vans, the looms and the grannies do not cover it
  loan.due = 0;
  s.money = 100;
  const r = Sim.tick(s, 1, 'live', never);
  assert.equal(r.ruined, false);
  assert.equal(Sim.loanFor(s, 'bank'), null);
  assert.equal(s.money, 0, 'the cash went first');
  assert.equal(s.vehicles.length, 1, 'vehicles seized, one courier left');
  assert.ok(s.lifetimeLost >= 100, 'the socks in the van went with it');
  assert.equal(s.producers.loom, 0, 'dearest machines next');
  assert.equal(s.producers.granny, 0);
  assert.equal(s.shopLevel, 1, 'then the boutique');
  assert.equal(s.factoryLevel, 2, 'which was enough');
  assert.deepEqual(r.events, ['bailiffs']);
  assert.match(s.news[0].text, /bailiffs/);
  assert.match(s.news[0].text, /2 Delivery Vans, 3 Hand Looms, 10 Knitting Grannies and the Sock Boutique/);

  // and when there is nothing left to take
  const t = rich(0);
  t.shopLevel = 1;
  t.vehicles = [];
  Sim.takeLoan(t, 'bank');
  Sim.loanFor(t, 'bank').owed = 1e9;
  Sim.loanFor(t, 'bank').due = 0;
  const r2 = Sim.tick(t, 1, 'live', never);
  assert.equal(r2.ruined, true);
  assert.equal(t.shopLevel, 0);
  assert.equal(t.bankruptcies, 1);
});

test('bankruptcy keeps threads and lifetime stats but forfeits pending threads', () => {
  const s = endgame(500);
  s.threads = 3;
  s.claimedThreads = 3;
  s.lifetimeMoney = 25 * D.prestige.divisor; // 5 earned, 2 pending
  s.lifetimeSold = 999;
  assert.equal(Sim.pendingThreads(s), 2);
  Sim.goBankrupt(s, 'Test.');
  assert.equal(s.threads, 3);
  assert.equal(Sim.pendingThreads(s), 0);
  assert.equal(s.lifetimeSold, 999);
  assert.equal(s.factoryLevel, 0);
  assert.equal(s.loans.length, 0);
  assert.equal(s.events.length, 0);
  assert.equal(s.bankruptcies, 1);
});

test('loans, events, outrage and grumble survive a save round-trip; junk is dropped', () => {
  const s = rich(0);
  Sim.takeLoan(s, 'mafia');
  Sim.startEvent(s, 'picket');
  Sim.startEvent(s, 'mafiaGranny');
  s.outrage = 12;
  s.grumble = 34;
  const back = Sim.deserialize(Sim.serialize(s), 0);
  assert.deepEqual(back.loans, s.loans);
  assert.deepEqual(back.events, s.events);
  assert.equal(back.outrage, 12);
  assert.equal(back.grumble, 34);
  const junk = Sim.deserialize(JSON.stringify({ version: 3, loans: [{ lender: 'nope', owed: 5 }, { lender: 'bank', owed: -1 }], events: [{ id: 'zzz' }], outrage: 'x' }), 0);
  assert.deepEqual(junk.loans, []);
  assert.deepEqual(junk.events, []);
  assert.equal(junk.outrage, 0);
});

test("saves from before the Devil's Sock keep selling the same line", () => {
  const old = Sim.newState(0);
  old.version = 2;
  old.sockLine = 2; // argyle, before the devil was slotted in
  old.research = { s_striped: true, s_argyle: true };
  const m = Sim.deserialize(JSON.stringify(old), 0);
  assert.equal(Sim.currentLine(m).id, 'argyle');
});

test('each radio track suits one kind of producer, only when it drifted on, and is never saved', () => {
  const s = endgame(1e9);
  s.producers.granny = 10;
  s.producers.loom = 10;
  s.producers.machine = 5;
  const granny = Sim.producerRate(s, 'granny');
  const loom = Sim.producerRate(s, 'loom');
  const machine = Sim.producerRate(s, 'machine');
  const expected = Sim.expectedProductionRate(s);
  const waltz = D.radio.serenades.find((x) => x.track === 'waltz');
  assert.equal(Sim.setSerenade(s, 'waltz'), true);
  assert.equal(Sim.setSerenade(s, 'waltz'), false, 'already on');
  close(Sim.producerRate(s, 'granny'), granny * waltz.mult);
  close(Sim.producerRate(s, 'loom'), loom, 'looms do not care for Strauss');
  assert.match(s.news[0].text, /waltz/);
  assert.ok(Sim.expectedProductionRate(s) > expected, 'expected mode hears it too');
  const again = Sim.deserialize(Sim.serialize(s), 0);
  assert.equal(again.serenade, null, 'a loaded save starts quiet');
  // the station changes: the grannies sigh, the machines perk up
  assert.equal(Sim.setSerenade(s, 'chiptune'), true);
  assert.match(s.news[1].text, /waltz has finished/);
  assert.match(s.news[0].text, /Chiptune/);
  close(Sim.producerRate(s, 'granny'), granny);
  close(Sim.producerRate(s, 'machine'), machine * 1.2);
  close(Sim.producerRate(s, 'loom'), loom);
  assert.equal(Sim.setSerenade(s, null), true);
  close(Sim.producerRate(s, 'machine'), machine);
  // a track nobody in the building cares about flips silently
  const t = Sim.newState(0);
  Sim.setSerenade(t, 'hiphop');
  assert.equal(t.news.length, 0);
});

test('Door Security needs a boutique and softens the street trouble', () => {
  const s = rich(1e9);
  const sec = D.research.find((r) => r.id === 'r_security');
  s.shopLevel = 1;
  assert.equal(Sim.researchBlockers(s, sec).shopLevel, 2);
  s.shopLevel = 2;
  assert.equal(Sim.researchAvailable(s, sec), true);
  assert.equal(Sim.hasSecurity(s), false);
  s.research.r_security = true;
  assert.equal(Sim.hasSecurity(s), true);

  const i0 = Sim.interest(s);
  Sim.startEvent(s, 'enforcer');
  const e = s.events[0];
  assert.equal(e.guarded, true);
  assert.equal(e.remaining, D.events.enforcer.guarded.duration);
  close(Sim.interest(s), i0 * D.events.enforcer.guarded.interest, 'most customers still come in');
  assert.match(s.news[0].text, /Security leaned back/);
  Sim.tick(s, D.events.enforcer.guarded.duration + 1, 'live', never);
  assert.equal(Sim.eventActive(s, 'enforcer'), false, 'and he leaves sooner');
  assert.equal(s.news[0].text, D.events.enforcer.endText);

  s.socks = 1000;
  Sim.startEvent(s, 'bikers');
  assert.equal(s.socks, 900, 'a tenth of the shelves, not half');
  assert.equal(Sim.footTraffic(s) > 0, true, 'the street is not emptied');

  // the guarded flag survives a save; a picket has no guarded form
  Sim.startEvent(s, 'picket');
  const again = Sim.deserialize(Sim.serialize(s), 0);
  assert.equal(again.events.find((x) => x.id === 'bikers').guarded, true);
  assert.equal(again.events.find((x) => x.id === 'picket').guarded, false);
  assert.equal(Sim.eventDef(again.events.find((x) => x.id === 'picket')).interest, D.events.picket.interest);
});

test('with security the bank\'s bailiffs are stalled once, then seize as usual', () => {
  const s = rich(0);
  s.shopLevel = 2;
  s.research.r_security = true;
  s.vehicles.push({ type: 'backpack', phase: 'loading', progress: 0, load: 0, timer: 0 });
  Sim.takeLoan(s, 'bank');
  const loan = Sim.loanFor(s, 'bank');
  loan.due = 0;
  s.money = 0;
  const grace = D.events.bailiffs.guarded.grace;
  let r = Sim.tick(s, 1, 'live', never);
  assert.deepEqual(r.events, ['bailiffs']);
  assert.ok(Sim.loanFor(s, 'bank'), 'the loan is still there');
  assert.equal(loan.stage, 1);
  assert.equal(s.vehicles.length, 2, 'nothing taken yet');
  close(loan.due, grace);
  assert.match(s.news[0].text, /keeping them talking/);
  // find the money in time (interest still runs) and they leave empty-handed
  s.money = loan.owed * 2;
  r = Sim.tick(s, grace, 'live', never);
  assert.equal(Sim.loanFor(s, 'bank'), null);
  assert.match(s.news[0].text, /collected .* in full/);

  // no money the second time: they take things
  const t = rich(0);
  t.shopLevel = 2;
  t.research.r_security = true;
  t.vehicles.push({ type: 'backpack', phase: 'loading', progress: 0, load: 0, timer: 0 });
  Sim.takeLoan(t, 'bank');
  const l2 = Sim.loanFor(t, 'bank');
  l2.due = 0;
  t.money = 0;
  Sim.tick(t, 1, 'live', never);
  assert.equal(l2.stage, 1);
  Sim.tick(t, grace + 1, 'live', never);
  assert.equal(t.vehicles.length, 1, 'the spare courier went');
});

test('foot traffic follows the time of day, and a Late Licence keeps the night open', () => {
  const s = endgame(1e9);
  const day = D.day;
  const at = (phase) => { s.playTime = (phase - day.offset + 1) % 1 * day.length; return Sim.footTraffic(s); };
  const noon = at(0.4);
  close(Sim.dayPhase(s), 0.4);
  close(at(0.5), noon * day.lunchTraffic, 'busy at lunch');
  close(at(0.95), noon * day.nightTraffic, 'quiet at night');
  assert.equal(Sim.daylight(0.95), 0);
  assert.equal(Sim.daylight(0.5), 1);
  s.upgrades.latelicence = true;
  close(at(0.95), noon, 'the late licence fills the night, and never more than the day');
  // a long expected step averages the day out rather than freezing it at one moment
  delete s.upgrades.latelicence;
  s.playTime = 0;
  s.socks = 1e12;
  const short = Sim.tick(s, 1, 'expected').sold;
  const long = Sim.tick(s, day.length, 'expected').sold / day.length;
  assert.ok(long < short && long > short * day.nightTraffic, 'a whole day sells less per second than a sunny second');
});

test('a bulk order is offered, filled off the shelves, and paid at a premium', () => {
  const s = endgame(0);
  s.shopLevel = 1;
  s.protectionOffered = true;
  s.socks = 0;
  let r = Sim.tick(s, 1, 'live', never);
  assert.equal(s.offer, null, 'nothing without a roll');
  r = Sim.tick(s, 1, 'live', always);
  assert.ok(s.offer, 'an offer arrives');
  assert.equal(r.offer, true);
  assert.equal(s.offer.customer, D.orders.customers[0].name);
  assert.equal(s.offer.premium, D.orders.premiumMin);
  assert.ok(s.offer.socks >= D.orders.minSocks);
  assert.match(s.news[0].text, /want/);
  assert.equal(Sim.acceptOrder(s), true);
  assert.equal(s.offer, null);
  assert.ok(s.order);
  const o = s.order;
  close(o.due, s.playTime + D.orders.deadline);
  assert.equal(Sim.acceptOrder(s), false, 'one at a time');
  // socks arrive in two lots
  s.socks = Math.floor(o.socks / 2);
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.socks, 0, 'everything on the shelf went into the order');
  assert.equal(o.filled, Math.floor(o.socks / 2));
  s.socks = o.socks;
  const money = s.money;
  r = Sim.tick(s, 1, 'live', never);
  assert.equal(s.order, null);
  assert.equal(s.ordersDone, 1);
  close(s.money - money, o.socks * Sim.basePrice(s) * Sim.threadBonus(s) * o.premium);
  assert.ok(r.orderDone > 0);
  assert.match(s.news[0].text, /collected/);
  // an offer nobody answers goes elsewhere; one you decline is noted
  Sim.tick(s, 1, 'live', always);
  assert.equal(Sim.declineOrder(s), true);
  assert.equal(s.offer, null);
  Sim.tick(s, 1, 'live', always);
  Sim.tick(s, D.orders.offerWindow + 1, 'live', never);
  assert.equal(s.offer, null);
  assert.match(s.news[0].text, /elsewhere/);
});

test('missing a bulk order deadline pays base price for what arrived and dents your name', () => {
  const s = endgame(0);
  s.shopLevel = 1;
  s.protectionOffered = true;
  s.socks = 0;
  Sim.tick(s, 1, 'live', always);
  Sim.acceptOrder(s);
  const o = s.order;
  s.socks = 5;
  const i0 = Sim.interest(s);
  const r = Sim.tick(s, D.orders.deadline + 1, 'live', never);
  assert.equal(s.order, null);
  assert.equal(s.ordersDone, 0);
  close(s.money, 5 * Sim.basePrice(s) * Sim.threadBonus(s));
  assert.deepEqual(r.events, ['letdown']);
  assert.match(s.news[0].text, new RegExp(o.customer));
  close(Sim.interest(s), i0 * D.events.letdown.interest);
  Sim.tick(s, D.events.letdown.duration + 1, 'live', never);
  assert.match(s.news[0].text, new RegExp(o.customer.replace(/^a /, '')));
});

test('a rival shop opens by itself, halves traffic, and can be bought out at a rising price', () => {
  const s = rich(1e9);
  s.shopLevel = 2;
  const traffic = Sim.footTraffic(s);
  assert.equal(Sim.spawnAllowed(s, D.events.rival), true);
  s.shopLevel = 1;
  assert.equal(Sim.spawnAllowed(s, D.events.rival), false, 'a kiosk is beneath their notice');
  s.shopLevel = 2;
  Sim.tick(s, 1, 'expected', always);
  assert.equal(Sim.eventActive(s, 'rival'), false, 'nothing spawns in expected mode');
  const r = Sim.tick(s, 1, 'live', always);
  assert.ok(r.events.indexOf('rival') >= 0);
  close(Sim.footTraffic(s), traffic * 0.5);
  const cost = Sim.resolveCost(s, 'rival');
  close(cost, Math.max(D.events.rival.resolve.min, Sim.assetValue(s) * D.events.rival.resolve.assetFraction));
  assert.equal(Sim.resolveEvent(s, 'rival'), true);
  assert.equal(Sim.eventActive(s, 'rival'), false);
  close(Sim.footTraffic(s), traffic);
  assert.match(s.news[0].text, /skip/);
  assert.ok(s.cooldowns.rival > 0, 'they need time to find new premises');
  Sim.tick(s, 1, 'live', always);
  assert.equal(Sim.eventActive(s, 'rival'), false, 'not straight back');
  Sim.tick(s, D.events.rival.spawn.cooldown + 1, 'live', never);
  Sim.tick(s, 1, 'live', always);
  assert.equal(Sim.eventActive(s, 'rival'), true, 'and then they are');
  const R = D.events.rival.resolve;
  close(Sim.resolveCost(s, 'rival'), Math.max(R.min, Sim.assetValue(s) * R.assetFraction * R.growth), 'dearer the second time');
});

test('cutting corners invites the health inspector, who fines you and closes the factory', () => {
  const s = rich(1000);
  s.factoryLevel = 2;
  s.research.m_granny = true;
  s.research.m_loom = true;
  s.producers.granny = 5;
  s.producers.loom = 5;
  assert.equal(Sim.spawnAllowed(s, D.events.inspector), false);
  s.research.d_corners = true;
  assert.equal(Sim.spawnAllowed(s, D.events.inspector), true);
  const prod = Sim.productionRate(s);
  assert.ok(prod > 0);
  const r = Sim.tick(s, 0.1, 'live', always);
  assert.ok(r.events.indexOf('inspector') >= 0);
  assert.ok(s.money < 1000 - D.events.inspector.fineMin + 1, 'fined');
  assert.ok(s.lifetimeFines > 0);
  assert.match(s.news.find((n) => /inspector/.test(n.text)).text, /fined \$/);
  assert.equal(Sim.productionRate(s), 0, 'everything stopped');
  assert.equal(Sim.expectedProductionRate(s), 0);
  Sim.tick(s, D.events.inspector.duration + 1, 'live', never);
  assert.equal(Sim.eventActive(s, 'inspector'), false);
  assert.ok(Sim.productionRate(s) > 0);
});

test("Sal's insurance: offered at the Emporium, costs a slice of assets, and keeps the vandals away", () => {
  const s = rich(1e6);
  s.shopLevel = 2;
  assert.equal(Sim.protectionAvailable(s), false);
  assert.equal(Sim.setProtection(s, true), false);
  s.shopLevel = 3;
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.protectionOffered, true);
  assert.match(s.news[0].text, /shame if anything happened/);
  assert.equal(Sim.spawnAllowed(s, D.events.vandals), true);
  s.socks = 1000;
  Sim.tick(s, 1, 'live', always);
  assert.equal(Sim.eventActive(s, 'vandals'), true);
  assert.equal(s.socks, 800, 'a fifth of the stock walked off');
  Sim.endEvent(s, 'vandals');
  assert.equal(Sim.setProtection(s, true), true);
  assert.equal(Sim.spawnAllowed(s, D.events.vandals), false);
  const rate = Sim.protectionRate(s);
  close(rate, Sim.assetValue(s) * D.protection.rate);
  const money = s.money;
  Sim.tick(s, 10, 'live', never);
  close(s.money, money - rate * 10);
  Sim.tick(s, D.events.vandals.spawn.cooldown + 1, 'live', never);
  Sim.tick(s, 1, 'live', always);
  assert.equal(Sim.eventActive(s, 'vandals'), false, 'nothing happens to insured shops');
  // and when the money runs out, so does the cover
  s.money = 0;
  Sim.tick(s, 1, 'live', never);
  assert.equal(s.protection, false);
  assert.match(s.news[0].text, /lapsed/);
  // security softens the brick
  s.research.r_security = true;
  s.socks = 1000;
  Sim.tick(s, D.events.vandals.spawn.cooldown + 1, 'live', never);
  Sim.tick(s, 1, 'live', always);
  assert.equal(s.socks, 950);
});

test('the Laundromat: dirty cash washes through honest sales, or the police take it', () => {
  const s = rich(0);
  s.shopLevel = 1;
  const L = D.lenders.find((x) => x.id === 'launder');
  const bag = Sim.loanOffer(s, 'launder');
  assert.equal(Sim.takeLoan(s, 'launder'), bag);
  assert.equal(s.money, bag);
  assert.equal(s.dirty, bag);
  assert.equal(s.lifetimeMoney, 0, 'not earnings');
  const loan = Sim.loanFor(s, 'launder');
  close(loan.owed, bag * (1 - L.cut), 'Sal wants 80% back');
  close(Sim.loanOwed('launder', bag), loan.owed);
  assert.match(s.news[0].text, /sports bag/);
  assert.equal(Sim.raidInterval(s), D.laundering.raidInterval);
  // honest money washes it
  s.socks = 1e6;
  Sim.tick(s, 1, 'expected', never);
  assert.ok(s.dirty < bag && s.dirty > 0);
  const dirty = s.dirty;
  // a raid takes 1.5x what is still dirty and shuts the shop
  const i0 = Sim.interest(s);
  const r = Sim.tick(s, 1, 'expected', always);
  assert.deepEqual(r.events, ['police']);
  assert.equal(s.dirty, 0);
  close(s.lifetimeFines, Math.min(s.money + s.lifetimeFines, dirty * D.laundering.fineMult));
  assert.equal(Sim.interest(s), 0, 'closed while they count');
  assert.equal(Sim.raidInterval(s), Infinity);
  assert.match(s.news[0].text, /smells of Sal/);
  Sim.tick(s, D.events.police.duration + 1, 'expected', never);
  close(Sim.interest(s), i0);
  // Sal still wants his cut, and misses are handled like his loans
  assert.ok(Sim.loanFor(s, 'launder'));
  s.money = 0;
  Sim.tick(s, L.term, 'live', never);
  assert.equal(Sim.eventActive(s, 'enforcer'), true);
  assert.equal(Sim.loanFor(s, 'launder').stage, 1);
  // paying up ends it
  s.money = 1e9;
  assert.ok(Sim.repayLoan(s, 'launder') > 0);
  assert.equal(Sim.loanFor(s, 'launder'), null);
});

test('orders, insurance, dirty cash, cooldowns and event words survive a save round-trip', () => {
  const s = rich(100);
  s.shopLevel = 3;
  Sim.tick(s, 1, 'live', always); // offers, vandals
  Sim.acceptOrder(s);
  Sim.setProtection(s, true);
  s.dirty = 42;
  s.cooldowns.rival = 12;
  s.resolved.rival = 2;
  Sim.startEvent(s, 'letdown', null, { customer: 'the hospital' });
  const again = Sim.deserialize(Sim.serialize(s), 0);
  assert.deepEqual(again.order, s.order);
  assert.equal(again.protection, true);
  assert.equal(again.dirty, 42);
  assert.deepEqual(again.cooldowns, { rival: 12 });
  assert.deepEqual(again.resolved, { rival: 2 });
  const letdown = again.events.find((e) => e.id === 'letdown');
  assert.deepEqual(letdown.vars, { customer: 'the hospital' });
  assert.match(Sim.eventText(letdown, 'endText'), /the hospital/);
  // junk is dropped
  const junk = Sim.deserialize(JSON.stringify(Object.assign({}, JSON.parse(Sim.serialize(s)), { offer: 'no', order: { socks: -1 }, dirty: -5, cooldowns: { nope: 3, rival: -1 }, protection: 'yes' })), 0);
  assert.equal(junk.offer, null);
  assert.equal(junk.order, null);
  assert.equal(junk.dirty, 0);
  assert.deepEqual(junk.cooldowns, {});
  assert.equal(junk.protection, true);
});
