// Sock Tycoon entry point: owns the state, the game loop, and saving.
(function () {
  'use strict';

  const Sim = window.SockSim;
  const D = Sim.data;
  const F = window.Fmt;
  const SAVE_KEY = 'sockTycoon.save';
  const AUTOSAVE_MS = 15000;
  const REFRESH_MS = 80;
  const CATCHUP_GAP_S = 2;   // a frame gap longer than this means the tab was asleep
  const METER_WINDOW_S = 5;  // measured rates are averaged over this window

  const Scenarios = window.SockScenarios;
  const requested = new URLSearchParams(location.search).get('scenario');
  const startScenario = requested && Scenarios.find(requested);
  let state = startScenario ? Scenarios.build(requested, Date.now()) : (load() || Sim.newState(Date.now()));
  const offline = startScenario ? { elapsed: 0 } : Sim.applyOffline(state, Date.now());

  function load() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      return json ? Sim.deserialize(json, Date.now()) : null;
    } catch (e) {
      return null;
    }
  }

  function save(announce) {
    state.lastTick = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, Sim.serialize(state));
      ui.setSaveStatus('Saved ' + new Date().toLocaleTimeString() + '. Autosaves every 15 seconds.');
      if (announce) ui.toast('Game saved.', 2000);
    } catch (e) {
      ui.setSaveStatus('Could not save: ' + e.message);
    }
  }

  // Rolling meter of what actually happened on the canvases.
  const samples = [];
  function record(sold, earned, delivered) {
    samples.push({ at: performance.now(), sold: sold || 0, earned: earned || 0, delivered: delivered || 0 });
  }
  function measured() {
    const cutoff = performance.now() - METER_WINDOW_S * 1000;
    while (samples.length && samples[0].at < cutoff) samples.shift();
    const sum = { sold: 0, earned: 0, delivered: 0 };
    samples.forEach((x) => { sum.sold += x.sold; sum.earned += x.earned; sum.delivered += x.delivered; });
    return { sold: sum.sold / METER_WINDOW_S, earned: sum.earned / METER_WINDOW_S, delivered: sum.delivered / METER_WINDOW_S };
  }

  function refresh() { ui.refresh(measured()); }

  // Swap in a whole new state (test save, hard reset) and forget the old scene.
  function replaceState(next) {
    state = next;
    street.reset();
    factory.reset();
    samples.length = 0;
  }

  function researchName(id) {
    const r = D.research.find((x) => x.id === id);
    return r ? r.name : id;
  }

  const actions = {
    knit: () => { Sim.startKnit(state); refresh(); },
    customerVisit: (count) => {
      const r = Sim.customerVisit(state, count);
      record(r.sold, r.earned, 0);
      return r;
    },
    buyProducer: (id, qty) => {
      const n = qty === 'max' ? Sim.maxAffordable(state, id) : qty;
      Sim.buyProducer(state, id, n);
      refresh();
    },
    buyFactory: () => {
      if (Sim.buyFactory(state)) ui.toast(`The factory is now a ${Sim.currentFactory(state).name}!`, 4000);
      refresh();
    },
    startResearch: (id) => {
      if (Sim.startResearch(state, id)) ui.toast(`Research started: ${researchName(id)}.`, 3000);
      refresh();
    },
    buyVehicle: (id) => { Sim.buyVehicle(state, id); refresh(); },
    setUpkeep: (id, level) => { Sim.setUpkeep(state, id, level); refresh(); },
    buyShop: () => {
      if (Sim.buyShop(state)) ui.toast(`Welcome to the ${Sim.currentShop(state).name}!`, 4000);
      refresh();
    },
    buyUpgrade: (id) => { Sim.buyUpgrade(state, id); refresh(); },
    buyMarketing: () => { Sim.buyMarketing(state); refresh(); },
    selectSockLine: (i) => {
      if (Sim.selectSockLine(state, i)) ui.toast(`Now selling: ${Sim.currentLine(state).name}.`, 3000);
      refresh();
    },
    setMarkup: (v) => { Sim.setMarkup(state, v); refresh(); },
    clearance: () => {
      const r = Sim.clearance(state);
      ui.toast(`Clearance sale: ${F.fmtInt(r.sold)} socks gone for ${F.money(r.earned)}.`, 3000);
      refresh();
    },
    retire: () => {
      const pending = Sim.pendingThreads(state);
      if (pending < 1) return;
      const ok = window.confirm(`Retire now for +${pending} Heirloom Thread${pending === 1 ? '' : 's'}? This resets your money, stock, factory, machines, research, vehicles, upgrades, marketing and shop.`);
      if (!ok) return;
      const gained = Sim.retire(state);
      replaceState(state);
      save(false);
      ui.toast(`You retired with ${gained} new thread${gained === 1 ? '' : 's'}. The kids are already knitting.`, 6000);
      refresh();
    },
    save: () => save(true),
    hardReset: () => {
      const ok = window.confirm('Delete your save and start from scratch? Heirloom threads are lost too.');
      if (!ok) return;
      replaceState(Sim.newState(Date.now()));
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      ui.toast('Fresh start. Good luck.', 3000);
      refresh();
    },
    takeLoan: (id) => {
      const L = D.lenders.find((x) => x.id === id);
      const amount = Sim.takeLoan(state, id);
      if (amount) ui.toast(`${L.icon} ${L.name} lent you ${F.money(amount)}. Due in ${F.fmtTime(L.term)}.`, 5000);
      refresh();
    },
    repayLoan: (id) => {
      const L = D.lenders.find((x) => x.id === id);
      const paid = Sim.repayLoan(state, id);
      if (paid > 0) {
        const left = Sim.loanFor(state, id);
        ui.toast(left ? `Paid ${F.money(paid)} to ${L.name}. ${F.money(left.owed)} still owed.` : `Paid off ${L.name}.`, 4000);
      }
      refresh();
    },
    resolveEvent: (id) => {
      const d = D.events[id];
      if (Sim.resolveEvent(state, id)) ui.toast(`${d.icon} ${d.resolve.text}`, 5000);
      refresh();
    },
    loadScenario: (id) => {
      const sc = Scenarios.find(id);
      if (!sc) return;
      const ok = window.confirm(`Load the test save "${sc.name}"? This replaces your current game.`);
      if (!ok) return;
      replaceState(Scenarios.build(id, Date.now()));
      save(false);
      ui.closeDrawer();
      ui.toast(`Test save loaded: ${sc.name}.`, 4000);
      refresh();
    },
    audio: window.createAudio(() => state),
  };

  const ui = window.createUI(() => state, actions);
  const factory = window.createFactory(document.getElementById('factory'), () => state);
  const street = window.createStreet(document.getElementById('street'), () => state, actions);

  if (offline.elapsed >= 60 && (offline.produced > 0 || offline.earned > 0)) {
    ui.toast(`While you were away for ${F.fmtTime(offline.elapsed)}, you knitted ${F.fmtInt(offline.produced)} socks and earned ${F.money(offline.earned)}.`, 8000);
  }
  if (offline.researchDone) ui.toast(`Research complete: ${researchName(offline.researchDone)}.`, 6000);
  if (startScenario) ui.toast(`Test save loaded: ${startScenario.name}.`, 5000);
  announceTrouble(offline);

  // Trouble that started this step, and the end of the run if it came to that.
  function announceTrouble(result) {
    (result.events || []).forEach((id) => {
      const d = D.events[id];
      ui.toast(`${d.icon} ${d.name}: ${d.text}`, 8000);
    });
    if (result.ruined) {
      replaceState(state);
      save(false);
      ui.toast('💀 ' + state.news[0].text, 15000);
    }
  }

  let last = performance.now();
  let lastRefresh = 0;
  function frame(now) {
    const gap = (now - last) / 1000;
    last = now;
    let result;
    if (gap > CATCHUP_GAP_S) {
      // The tab was asleep: move and sell at the expected rates for the missing time.
      result = Sim.tick(state, Math.min(gap, D.maxOfflineSeconds), 'expected');
      record(result.sold, result.earned, result.delivered);
    } else {
      const dt = Math.min(gap, 1);
      result = Sim.tick(state, dt, 'live');
      record(0, 0, result.delivered);
      factory.frame(dt);
      street.frame(dt);
    }
    if (result.researchDone) ui.toast(`Research complete: ${researchName(result.researchDone)}.`, 5000);
    if (result.knitted > 0) { ui.knitDone(result.knitted); factory.pulse(); }
    announceTrouble(result);
    state.lastTick = Date.now();
    if (now - lastRefresh >= REFRESH_MS) {
      lastRefresh = now;
      refresh();
    }
    requestAnimationFrame(frame);
  }

  refresh();
  requestAnimationFrame(frame);

  setInterval(() => save(false), AUTOSAVE_MS);
  window.addEventListener('beforeunload', () => save(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(false); });
})();
