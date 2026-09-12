const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../js/sim.js');
const Scenarios = require('../js/scenarios.js');
const D = Sim.data;

const finite = (v) => typeof v === 'number' && isFinite(v);

test('every scenario builds, round-trips through a save, and is consistent', () => {
  Scenarios.list.forEach((sc) => {
    const s = Scenarios.build(sc.id, 1000);
    assert.ok(s, sc.id + ' builds');
    assert.equal(s.version, Sim.newState(0).version);
    assert.equal(s.lastTick, 1000);
    assert.ok(s.news[0].text.indexOf(sc.name) >= 0, sc.id + ' announces itself');

    ['money', 'socks', 'factoryStock', 'lifetimeMoney', 'lifetimeSocks', 'lifetimeSold'].forEach((k) => {
      assert.ok(finite(s[k]) && s[k] >= 0, `${sc.id}.${k} is a non-negative number`);
    });

    // The levels reached must be legitimately reachable.
    assert.ok(s.lifetimeSocks >= D.factoryLevels[s.factoryLevel].requiresKnitted, sc.id + ' knitted enough');
    assert.ok(s.lifetimeSold >= D.shopLevels[s.shopLevel].requiresSold, sc.id + ' sold enough');

    // Everything owned must have been researchable at these levels.
    Object.keys(s.research).forEach((id) => {
      const r = D.research.find((x) => x.id === id);
      assert.ok(r, `${sc.id}: unknown research ${id}`);
      const b = Sim.researchBlockers(s, r);
      assert.deepEqual(b, { factoryLevel: null, shopLevel: null, research: [], branch: null }, `${sc.id}: ${id} has unmet prerequisites`);
    });
    D.producers.forEach((p) => {
      if (s.producers[p.id] > 0) assert.ok(Sim.producerUnlocked(s, p.id), `${sc.id}: owns ${p.id} without research`);
    });
    s.vehicles.forEach((v) => assert.ok(Sim.vehicleUnlocked(s, v.type), `${sc.id}: owns ${v.type} without research`));
    assert.ok(Sim.sockLineUnlocked(s, s.sockLine), sc.id + ' sells an unlocked line');
    Object.keys(s.upgrades).forEach((id) => assert.ok(D.upgrades.find((u) => u.id === id), `${sc.id}: unknown upgrade ${id}`));
    assert.ok(s.marketing <= D.marketing.length);

    // A save round-trip is lossless.
    const again = Sim.deserialize(Sim.serialize(s), 1000);
    assert.deepEqual(again, s, sc.id + ' survives a save round-trip');
  });
});

test('every scenario runs for a while in both modes without producing nonsense', () => {
  Scenarios.list.forEach((sc) => {
    const live = Scenarios.build(sc.id, 0);
    for (let i = 0; i < 600; i++) Sim.tick(live, 0.1, 'live', () => 0.5);
    const expected = Scenarios.build(sc.id, 0);
    Sim.tick(expected, 3600, 'expected');
    [live, expected].forEach((s) => {
      ['money', 'socks', 'factoryStock', 'lifetimeMoney', 'lifetimeSocks', 'lifetimeSold'].forEach((k) => {
        assert.ok(finite(s[k]) && s[k] >= -1e-9, `${sc.id}.${k} after ticking`);
      });
      assert.ok(finite(Sim.incomeRate(s)), sc.id + ' income rate');
      assert.ok(finite(Sim.upkeepRate(s)), sc.id + ' upkeep rate');
    });
  });
});

test('scenarios differ in the ways they claim to', () => {
  const broke = Scenarios.build('broke', 0);
  Sim.tick(broke, 1, 'live', () => 0.999999);
  assert.equal(broke.unpaid, true, 'the overstretched factory cannot pay its way');

  const bottleneck = Scenarios.build('bottleneck', 0);
  assert.ok(Sim.productionRate(bottleneck) > 10 * Sim.throughputRate(bottleneck), 'production far outstrips delivery');

  const glut = Scenarios.build('glut', 0);
  assert.ok(Sim.demandRate(glut) * 600 < glut.socks, 'shelves hold more than ten minutes of demand');

  const retire = Scenarios.build('retire', 0);
  assert.equal(Sim.pendingThreads(retire), 5);

  const second = Scenarios.build('second', 0);
  assert.equal(second.threads, 5);
  assert.equal(second.retirements, 1);
  assert.equal(second.factoryLevel, 0);
  assert.equal(second.money, 0);

  const end = Scenarios.build('endgame', 0);
  assert.equal(Object.keys(end.research).length, D.research.filter((r) => !r.branch).length + 2, 'everything plus one doctrine per branch');
  assert.equal(end.factoryLevel, D.factoryLevels.length - 1);

  const guild = Scenarios.build('guild', 0);
  assert.equal(Sim.branchChoice(guild, 'factory'), 'd_guild');
  assert.equal(Sim.producerRateEach(guild, 'granny'), 3 * 2 * 2 * D.producers[0].baseRate, 'guild tripled, two upgrades doubled');

  const velvet = Scenarios.build('velvet', 0);
  assert.equal(velvet.markup, 3.5, 'the Velvet Rope allows a 350% markup');

  const shark = Scenarios.build('loanshark', 0);
  assert.equal(shark.loans.length, 1);
  Sim.tick(shark, 21, 'live', () => 0.999999);
  assert.ok(Sim.eventActive(shark, 'enforcer'), 'Sal sends someone round');

  const fore = Scenarios.build('foreclosure', 0);
  const vehiclesBefore = fore.vehicles.length;
  Sim.tick(fore, 31, 'live', () => 0.999999);
  assert.equal(fore.loans.length, 0, 'the bank collected');
  assert.ok(fore.vehicles.length < vehiclesBefore, 'the bailiffs took vehicles');
  assert.ok(Sim.eventActive(fore, 'bailiffs'));

  const devil = Scenarios.build('devil', 0);
  assert.equal(Sim.currentLine(devil).id, 'devil');
  Sim.tick(devil, 60, 'expected');
  assert.ok(Sim.eventActive(devil, 'picket'), 'the devout turn up');

  const sweat = Scenarios.build('sweatshop', 0);
  Sim.tick(sweat, 120, 'expected');
  assert.ok(Sim.eventActive(sweat, 'strike'), 'the grannies walk out');

  assert.equal(Scenarios.build('nope', 0), null);
});
