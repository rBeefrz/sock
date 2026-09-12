// Sock Tycoon UI. Builds DOM once, then updates text and classes each refresh.
(function (root) {
  'use strict';

  function createUI(getState, actions) {
    const Sim = root.SockSim;
    const D = Sim.data;
    const F = root.Fmt;
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    let buyQty = 1; // 1, 10, or 'max'

    const ids = [
      'money', 'top-income', 'top-threads', 'socks', 'stock-line',
      'knit', 'knit-fill', 'knit-label', 'knit-sub',
      'rate-prod', 'rate-deliver', 'rate-sales', 'rate-price', 'rate-customers', 'kpi-factory', 'kpi-fleet', 'kpi-shop',
      'stock-warning', 'quick', 'menu-toggle', 'menu-badge', 'drawer', 'drawer-backdrop', 'drawer-close', 'drawer-nav',
      'factory-icon', 'factory-name', 'factory-desc', 'factory-meta', 'btn-factory', 'next-factory-icon', 'next-factory-name',
      'next-factory-desc', 'next-factory-req', 'next-factory-cost', 'factory-progress', 'factory-progress-bar',
      'factory-caption', 'factory-caption-2', 'street-shop', 'street-traffic',
      'stat-socks', 'stat-delivered', 'stat-sold', 'stat-money', 'stat-clicks', 'stat-time', 'stat-retire',
      'badge-research', 'badge-upgrades', 'badge-factory', 'badge-shop',
      'list-producers', 'empty-producers', 'research-active', 'research-active-name', 'research-active-time',
      'research-progress-bar', 'list-research', 'empty-research', 'fleet-summary', 'list-fleet',
      'list-upgrades', 'empty-upgrades', 'list-marketing', 'empty-marketing',
      'shop-icon', 'shop-name', 'shop-desc', 'shop-meta', 'btn-shop', 'next-shop-icon', 'next-shop-name', 'next-shop-desc',
      'next-shop-req', 'next-shop-cost', 'shop-progress', 'shop-progress-bar', 'list-lines',
      'markup', 'markup-label', 'markup-price', 'markup-traffic', 'markup-interest', 'markup-basket', 'markup-demand',
      'btn-clearance', 'clearance-hint', 'prestige-held', 'prestige-pending', 'prestige-hint', 'btn-retire',
      'save-status', 'toasts', 'floaters', 'news-list', 'news-empty', 'news-sub',
      'radio', 'radio-min', 'radio-body', 'radio-title', 'radio-tag', 'radio-layers', 'radio-prev', 'radio-play', 'radio-next', 'radio-vol',
      'list-scenarios', 'events', 'list-lenders', 'empty-lenders', 'badge-bank', 'stat-bankrupt',
      'dirty-hint', 'protection-head', 'list-protection', 'stat-orders', 'stat-fines',
    ];
    const els = {};
    ids.forEach((id) => {
      const key = id.replace(/-([a-z0-9])/g, (m, c) => c.toUpperCase());
      els[key] = $('#' + id);
    });

    // ---- helpers --------------------------------------------------------

    function el(tag, className, text) {
      const e = document.createElement(tag);
      if (className) e.className = className;
      if (text !== undefined) e.textContent = text;
      return e;
    }

    function itemButton(icon, title, desc) {
      const b = el('button', 'item');
      b.type = 'button';
      const iconEl = el('div', 'item-icon', icon);
      const body = el('div', 'item-body');
      const titleEl = el('div', 'item-title', title);
      const descEl = el('div', 'item-desc', desc);
      const metaEl = el('div', 'item-meta');
      body.append(titleEl, descEl, metaEl);
      const buy = el('div', 'item-buy');
      const costEl = el('div', 'item-cost');
      const qtyEl = el('div', 'item-qty');
      buy.append(costEl, qtyEl);
      b.append(iconEl, body, buy);
      return { button: b, icon: iconEl, title: titleEl, desc: descEl, meta: metaEl, cost: costEl, qty: qtyEl };
    }

    function setAffordable(button, can) {
      button.classList.toggle('affordable', can);
      button.disabled = !can;
    }

    function setLocked(button, locked) {
      button.classList.toggle('locked', locked);
    }

    function setBadge(badge, count) {
      badge.hidden = !count;
      badge.textContent = typeof count === 'number' ? count : '!';
    }

    function factoryName(level) { return D.factoryLevels[level].name; }
    function shopName(level) { return D.shopLevels[level].name; }

    // ---- drawer ---------------------------------------------------------

    function showSection(name) {
      $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.section === name));
      $$('.drawer-section').forEach((s) => s.classList.toggle('active', s.dataset.section === name));
    }

    function openDrawer(section) {
      if (section) showSection(section);
      els.drawer.hidden = false;
      els.drawerBackdrop.hidden = false;
    }

    function closeDrawer() {
      els.drawer.hidden = true;
      els.drawerBackdrop.hidden = true;
    }

    els.menuToggle.addEventListener('click', () => openDrawer());
    els.drawerClose.addEventListener('click', closeDrawer);
    els.drawerBackdrop.addEventListener('click', closeDrawer);
    els.drawerNav.addEventListener('click', (e) => {
      const b = e.target.closest('.nav-item');
      if (b) showSection(b.dataset.section);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.drawer.hidden) closeDrawer();
    });

    // Quick-action pills under the KPIs, one per section with something ready.
    const quick = {};
    [
      { key: 'research', section: 'research', text: (n) => `🔬 ${n} research ready` },
      { key: 'upgrades', section: 'upgrades', text: (n) => `⬆️ ${n} upgrade${n === 1 ? '' : 's'} affordable` },
      { key: 'factory', section: 'factory', text: () => '🏭 Factory upgrade ready' },
      { key: 'shop', section: 'shop', text: () => '🏪 Shop upgrade ready' },
      { key: 'machines', section: 'machines', text: () => '🧓 Machines affordable' },
      { key: 'bank', section: 'bank', text: () => '🏦 Loan due, cash short' },
    ].forEach((q) => {
      const b = el('button', 'brut');
      b.type = 'button';
      b.hidden = true;
      b.addEventListener('click', () => openDrawer(q.section));
      els.quick.append(b);
      quick[q.key] = { button: b, text: q.text };
    });

    function setQuick(key, count) {
      const q = quick[key];
      q.button.hidden = !count;
      if (count) q.button.textContent = q.text(count);
    }

    // ---- build static rows ----------------------------------------------

    const producerRows = new Map();
    D.producers.forEach((p) => {
      const row = itemButton(p.icon, p.name, p.desc);
      row.count = el('span', 'count');
      row.title.append(row.count);
      row.button.addEventListener('click', () => actions.buyProducer(p.id, buyQty));
      // wrapper: buy button plus the wage / maintenance slider beneath it
      row.wrap = el('div', 'machine');
      row.wrap.hidden = true;
      row.upkeep = el('div', 'upkeep');
      row.upkeepLabel = el('div', 'upkeep-label');
      row.upkeepSlider = document.createElement('input');
      row.upkeepSlider.type = 'range';
      row.upkeepSlider.min = D.upkeep.minLevel * 100;
      row.upkeepSlider.max = D.upkeep.maxLevel * 100;
      row.upkeepSlider.step = 10;
      row.upkeepSlider.value = 100;
      row.upkeepSlider.setAttribute('aria-label', `${p.care.label} for ${p.plural}`);
      row.upkeepSlider.addEventListener('input', () => actions.setUpkeep(p.id, Number(row.upkeepSlider.value) / 100));
      row.upkeepMood = el('div', 'upkeep-mood');
      row.upkeep.append(row.upkeepLabel, row.upkeepSlider, row.upkeepMood);
      row.wrap.append(row.button, row.upkeep);
      producerRows.set(p.id, row);
      els.listProducers.append(row.wrap);
    });

    const researchRows = new Map();
    D.research.slice().sort((a, b) => a.cost - b.cost).forEach((r) => {
      const row = itemButton(r.icon, r.name, r.desc);
      row.cost.textContent = F.money(r.cost);
      row.qty.textContent = F.fmtTime(r.time);
      row.button.addEventListener('click', () => actions.startResearch(r.id));
      row.button.hidden = true;
      if (r.branch) row.button.classList.add('doctrine');
      researchRows.set(r.id, row);
      els.listResearch.append(row.button);
    });

    const fleetRows = new Map();
    D.vehicleTypes.forEach((v) => {
      const row = itemButton(v.icon, v.name, v.desc);
      row.count = el('span', 'count');
      row.title.append(row.count);
      row.button.addEventListener('click', () => actions.buyVehicle(v.id));
      row.button.hidden = true;
      fleetRows.set(v.id, row);
      els.listFleet.append(row.button);
    });

    const upgradeRows = new Map();
    D.upgrades.forEach((u) => {
      const row = itemButton(u.icon, u.name, u.desc);
      row.cost.textContent = F.money(u.cost);
      if (u.requires) {
        const p = D.producers.find((x) => x.id === u.requires.producer);
        row.meta.textContent = `Requires ${u.requires.count} ${p.plural}`;
      }
      row.button.addEventListener('click', () => actions.buyUpgrade(u.id));
      row.button.hidden = true;
      upgradeRows.set(u.id, row);
      els.listUpgrades.append(row.button);
    });

    const marketingRows = [];
    D.marketing.forEach((m, i) => {
      const row = itemButton(m.icon, m.name, m.desc);
      row.cost.textContent = F.money(m.cost);
      row.meta.textContent = `Foot traffic ×${m.mult}`;
      row.button.addEventListener('click', () => actions.buyMarketing());
      row.button.hidden = true;
      marketingRows[i] = row;
      els.listMarketing.append(row.button);
    });

    const lenderRows = new Map();
    D.lenders.forEach((L) => {
      const ratePerMin = (Math.exp(L.rate * 60) - 1) * 100;
      const borrow = itemButton(L.icon, L.name, L.desc);
      borrow.meta.textContent = (L.laundering ? '' : `${ratePerMin.toFixed(1)}%/min interest, capped at ×${L.cap}. `) + L.terms;
      borrow.button.addEventListener('click', () => actions.takeLoan(L.id));
      borrow.button.hidden = true;
      const loan = itemButton(L.icon, `Owed to ${L.name}`, '');
      loan.button.addEventListener('click', () => actions.repayLoan(L.id));
      loan.button.hidden = true;
      lenderRows.set(L.id, { borrow, loan, ratePerMin });
      els.listLenders.append(loan.button, borrow.button);
    });

    // Sal's Neighbourhood Insurance: one row that toggles.
    const protectionRow = itemButton('🕴️', "Sal's Neighbourhood Insurance", 'A small consideration, paid continuously, and nothing untoward happens to the shop. Bricks, mostly.');
    protectionRow.button.addEventListener('click', () => actions.setProtection(!getState().protection));
    els.listProtection.append(protectionRow.button);

    const lineRows = [];
    D.sockLines.forEach((l, i) => {
      const row = itemButton(l.icon, l.name, l.desc);
      row.cost.textContent = F.money(l.price);
      row.qty.textContent = 'base';
      row.button.addEventListener('click', () => actions.selectSockLine(i));
      lineRows[i] = row;
      els.listLines.append(row.button);
    });

    // ---- static wiring --------------------------------------------------

    $('#qty-buttons').addEventListener('click', (e) => {
      const b = e.target.closest('.qty');
      if (!b) return;
      buyQty = b.dataset.qty === 'max' ? 'max' : Number(b.dataset.qty);
      $$('.qty').forEach((q) => q.classList.toggle('active', q === b));
      refresh();
    });

    els.knit.addEventListener('click', () => actions.knit());

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      actions.knit();
    });

    els.btnFactory.addEventListener('click', () => actions.buyFactory());
    els.btnShop.addEventListener('click', () => actions.buyShop());
    els.markup.addEventListener('input', () => actions.setMarkup(Number(els.markup.value) / 100));
    els.btnClearance.addEventListener('click', () => actions.clearance());
    els.btnRetire.addEventListener('click', () => actions.retire());
    $('#btn-save').addEventListener('click', () => actions.save());
    $('#btn-reset').addEventListener('click', () => actions.hardReset());

    // ---- Sock Radio -----------------------------------------------------

    const audio = actions.audio;
    let radioKey = '';
    function refreshRadio() {
      const st = audio.status();
      const key = [st.on, st.playing, st.index, st.min, st.layers.map((l) => l.active ? 1 : 0).join('')].join('|');
      if (key === radioKey) return;
      radioKey = key;
      els.radioTitle.textContent = st.name;
      els.radioTag.textContent = `${st.index + 1}/${st.count} · ${st.tag}`;
      els.radioPlay.textContent = st.on ? '⏸' : '▶';
      els.radio.classList.toggle('off', !st.on);
      els.radio.classList.toggle('min', st.min);
      els.radioMin.textContent = st.min ? '▴' : '▾';
      els.radioLayers.replaceChildren(...st.layers.map((l) => {
        const d = el('span', 'radio-layer' + (l.active ? ' on' : ''), l.label);
        d.title = l.active ? l.label + ' is playing' : l.label + ' joins in as you grow';
        return d;
      }));
    }
    els.radioPlay.addEventListener('click', () => { audio.toggle(); refreshRadio(); });
    els.radioPrev.addEventListener('click', () => { audio.prev(); refreshRadio(); });
    els.radioNext.addEventListener('click', () => { audio.next(); refreshRadio(); });
    els.radioMin.addEventListener('click', () => { audio.setMinimised(!audio.status().min); refreshRadio(); });
    els.radioVol.value = Math.round(audio.volume() * 100);
    els.radioVol.addEventListener('input', () => audio.setVolume(Number(els.radioVol.value) / 100));
    if (!audio.supported) els.radio.hidden = true;
    refreshRadio();

    // ---- test saves -----------------------------------------------------

    (root.SockScenarios ? root.SockScenarios.list : []).forEach((sc) => {
      const row = itemButton(sc.icon, sc.name, sc.desc);
      row.meta.textContent = 'id: ' + sc.id;
      row.cost.textContent = 'Load';
      row.button.classList.add('affordable');
      row.button.addEventListener('click', () => actions.loadScenario(sc.id));
      els.listScenarios.append(row.button);
    });

    els.clearanceHint.textContent = `Dump all shop stock at ${F.pct(D.clearanceRate)} of base price.`;
    els.markup.min = D.minMarkup * 100;
    els.markup.max = D.maxMarkup * 100;

    // ---- refresh: drawer sections ---------------------------------------

    function moodText(p, level, unpaid) {
      if (unpaid) return 'UNPAID';
      if (level < 0.7) return p.care.low;
      if (level > 1.3) return p.care.high;
      return p.care.ok;
    }

    function refreshProducers(s) {
      let shown = 0;
      let affordable = 0;
      D.producers.forEach((p) => {
        const row = producerRows.get(p.id);
        const unlocked = Sim.producerUnlocked(s, p.id);
        row.wrap.hidden = !unlocked;
        if (!unlocked) return;
        shown++;
        const owned = s.producers[p.id];
        const down = Sim.downUnits(s, p.id);
        row.count.textContent = owned > 0 ? '×' + owned : '';
        row.meta.textContent = `${F.fmt(Sim.producerRateEach(s, p.id))}/s each`
          + (owned > 0 ? ` · ${F.fmt(Sim.producerRate(s, p.id))}/s total` : '')
          + (down > 0 ? ` · ${down} ${p.care.outageIcon} out` : '');
        // upkeep slider
        row.upkeep.hidden = owned === 0;
        if (owned > 0) {
          const level = Sim.upkeepLevel(s, p.id);
          const pct = Math.round(level * 100);
          if (Number(row.upkeepSlider.value) !== pct) row.upkeepSlider.value = pct;
          row.upkeepLabel.textContent = `${p.care.label} ${pct}% · ${F.money(Sim.upkeepRateFor(s, p.id))}/s · ${p.care.outageIcon} every ~${F.fmtTime(Sim.outageInterval(s, p.id))}`;
          row.upkeepMood.textContent = moodText(p, level, s.unpaid);
          row.upkeep.classList.toggle('unpaid', s.unpaid);
        }
        let n = buyQty === 'max' ? Sim.maxAffordable(s, p.id) : buyQty;
        if (n < 1) n = 1;
        const cost = Sim.producerCost(s, p.id, n);
        row.cost.textContent = F.money(cost);
        row.qty.textContent = n > 1 || buyQty === 'max' ? `×${n}` : '';
        const can = s.money >= cost;
        if (can) affordable++;
        setAffordable(row.button, can);
      });
      els.emptyProducers.hidden = shown > 0;
      return affordable;
    }

    function blockerText(b) {
      const parts = [];
      if (b.factoryLevel !== null) parts.push(`Needs ${factoryName(b.factoryLevel)}`);
      if (b.shopLevel !== null) parts.push(`Needs ${shopName(b.shopLevel)}`);
      return parts.join(' · ');
    }

    function refreshResearch(s) {
      const active = s.activeResearch;
      els.researchActive.hidden = !active;
      if (active) {
        const r = D.research.find((x) => x.id === active.id);
        els.researchActiveName.textContent = r.name;
        els.researchActiveTime.textContent = F.fmtTime(Math.max(0, active.remaining) / Sim.researchSpeed(s)) + ' left';
        els.researchProgressBar.style.width = (Sim.researchProgress(s) * 100) + '%';
      }
      let shown = 0;
      let startable = 0;
      D.research.forEach((r) => {
        const row = researchRows.get(r.id);
        if (Sim.researchDone(s, r.id) || (active && active.id === r.id)) { row.button.hidden = true; return; }
        const b = Sim.researchBlockers(s, r);
        if (b.research.length > 0 || b.branch) { row.button.hidden = true; return; }
        row.button.hidden = false;
        shown++;
        const levelBlocked = b.factoryLevel !== null || b.shopLevel !== null;
        setLocked(row.button, levelBlocked);
        row.meta.textContent = levelBlocked ? blockerText(b)
          : r.branch ? `${D.branches[r.branch].name}: pick one of ${Sim.branchOptions(r.branch).length}. Holds until you retire.`
          : (active ? 'Waiting for current research' : '');
        const can = !levelBlocked && !active && s.money >= r.cost;
        if (can) startable++;
        setAffordable(row.button, can);
      });
      els.emptyResearch.hidden = shown > 0 || !!active;
      return startable;
    }

    function refreshFleet(s) {
      const through = Sim.throughputRate(s);
      const prod = Sim.productionRate(s);
      els.fleetSummary.textContent = `Fleet can move ${F.fmt(through)} socks/s. Factory makes ${F.fmt(prod)}/s. ${F.fmtInt(Sim.socksInTransit(s))} socks on the road.`;
      D.vehicleTypes.forEach((v) => {
        const row = fleetRows.get(v.id);
        const unlocked = Sim.vehicleUnlocked(s, v.id);
        row.button.hidden = !unlocked;
        if (!unlocked) return;
        const owned = Sim.vehicleCount(s, v.id);
        row.count.textContent = owned > 0 ? '×' + owned : '';
        row.meta.textContent = `Carries ${F.fmtInt(Sim.vehicleCapacity(s, v.id))} · ${F.fmt(Sim.vehicleTripTime(s, v.id))}s each way · ${F.fmt(Sim.vehicleThroughput(s, v.id))}/s each · mishap ${F.pct(Sim.mishapChance(s, v.id))} of trips`;
        const cost = Sim.vehicleCost(s, v.id);
        row.cost.textContent = F.money(cost);
        setAffordable(row.button, s.money >= cost);
      });
    }

    function refreshUpgrades(s) {
      let shown = 0;
      let affordable = 0;
      D.upgrades.forEach((u) => {
        const row = upgradeRows.get(u.id);
        const visible = Sim.upgradeVisible(s, u);
        row.button.hidden = !visible;
        if (!visible) return;
        shown++;
        const can = s.money >= u.cost;
        if (can) affordable++;
        setAffordable(row.button, can);
      });
      els.emptyUpgrades.hidden = shown > 0;
      return affordable;
    }

    function refreshMarketing(s) {
      marketingRows.forEach((row, i) => {
        const isNext = i === s.marketing;
        row.button.hidden = !isNext;
        if (isNext) setAffordable(row.button, s.money >= D.marketing[i].cost);
      });
      els.emptyMarketing.hidden = s.marketing < D.marketing.length;
    }

    function refreshFactory(s) {
      const f = Sim.currentFactory(s);
      els.factoryIcon.textContent = f.icon;
      els.factoryName.textContent = f.name;
      els.factoryDesc.textContent = f.desc;
      const allowed = f.unlocks.map((id) => D.producers.find((p) => p.id === id).plural);
      els.factoryMeta.textContent = allowed.length ? `Can research: ${allowed.join(', ')}` : 'Only your own two hands.';
      els.factoryCaption.textContent = `${f.icon} ${f.name}`;
      els.factoryCaption2.textContent = `${F.fmtInt(s.factoryStock)} waiting · ${F.fmtInt(Sim.socksInTransit(s))} in transit · ${s.vehicles.length} vehicle${s.vehicles.length === 1 ? '' : 's'}`;

      const next = Sim.nextFactory(s);
      els.btnFactory.hidden = !next;
      els.factoryProgress.hidden = !next;
      if (!next) return false;
      els.nextFactoryIcon.textContent = next.icon;
      els.nextFactoryName.textContent = next.name;
      const unlocksNames = next.unlocks.map((id) => D.producers.find((p) => p.id === id).plural);
      els.nextFactoryDesc.textContent = `${next.desc}${unlocksNames.length ? ' Unlocks research for ' + unlocksNames.join(' and ') + '.' : ''}`;
      els.nextFactoryCost.textContent = F.money(next.cost);
      const unlocked = Sim.factoryUnlocked(s, next);
      els.nextFactoryReq.textContent = unlocked
        ? 'Milestone reached.'
        : `Knit ${F.fmtInt(next.requiresKnitted)} socks (${F.fmtInt(s.lifetimeSocks)} so far)`;
      els.factoryProgressBar.style.width = Math.min(100, (s.lifetimeSocks / next.requiresKnitted) * 100) + '%';
      const can = unlocked && s.money >= next.cost;
      setAffordable(els.btnFactory, can);
      return can;
    }

    function refreshShop(s) {
      const shop = Sim.currentShop(s);
      els.shopIcon.textContent = shop.icon;
      els.shopName.textContent = shop.name;
      els.shopDesc.textContent = shop.desc;
      els.shopMeta.textContent = `${shop.basket} ${shop.basket === 1 ? 'sock' : 'socks'} per customer · appeal ×${shop.appeal} · traffic ×${shop.traffic}`;
      els.streetShop.textContent = `${shop.icon} ${shop.name}`;
      const phase = Sim.dayPhase(s);
      const tod = Sim.daylight(phase) < 0.5 ? '🌙 night' : Sim.dayMult(s) > 1 ? '🍽️ lunchtime' : '☀️ day';
      els.streetTraffic.textContent = `${tod} · ${F.fmt(Sim.footTraffic(s) * 60)} people/min pass by · ${F.pct(Sim.interest(s))} come in`;
      els.kpiShop.textContent = shop.name;

      const next = Sim.nextShop(s);
      els.btnShop.hidden = !next;
      els.shopProgress.hidden = !next;
      if (!next) return false;
      els.nextShopIcon.textContent = next.icon;
      els.nextShopName.textContent = next.name;
      els.nextShopDesc.textContent = `${next.desc} ${next.basket} socks per customer.`;
      els.nextShopCost.textContent = F.money(next.cost);
      const unlocked = Sim.shopUnlocked(s, next);
      els.nextShopReq.textContent = unlocked
        ? 'Milestone reached.'
        : `Sell ${F.fmtInt(next.requiresSold)} socks (${F.fmtInt(s.lifetimeSold)} so far)`;
      els.shopProgressBar.style.width = Math.min(100, (s.lifetimeSold / next.requiresSold) * 100) + '%';
      const can = unlocked && s.money >= next.cost;
      setAffordable(els.btnShop, can);
      return can;
    }

    function refreshLines(s) {
      lineRows.forEach((row, i) => {
        const l = D.sockLines[i];
        const unlocked = Sim.sockLineUnlocked(s, i);
        const selected = s.sockLine === i;
        const pattern = D.research.find((r) => r.id === 's_' + l.id);
        const teaser = !unlocked && !!pattern && Sim.researchBlockers(s, pattern).research.length === 0;
        row.button.hidden = !(unlocked || teaser);
        if (row.button.hidden) return;
        row.button.classList.toggle('selected', selected);
        row.button.classList.toggle('warned', !!l.warning);
        row.button.classList.remove('affordable');
        setLocked(row.button, !unlocked);
        row.button.disabled = !unlocked || selected;
        row.meta.textContent = (selected ? 'On sale now' : unlocked ? 'Click to switch' : 'Research the pattern first')
          + (l.warning ? ' · ⚠️ ' + l.warning : '');
      });
    }

    function refreshPricing(s) {
      const minPct = Math.round(Sim.markupMin(s) * 100);
      const maxPct = Math.round(Sim.markupMax(s) * 100);
      if (Number(els.markup.min) !== minPct) els.markup.min = minPct;
      if (Number(els.markup.max) !== maxPct) els.markup.max = maxPct;
      const markupPct = Math.round(s.markup * 100);
      if (Number(els.markup.value) !== markupPct) els.markup.value = markupPct;
      els.markupLabel.textContent = markupPct + '%';
      els.markupPrice.textContent = F.money(Sim.salePrice(s));
      els.markupTraffic.textContent = F.fmt(Sim.footTraffic(s) * 60) + '/min';
      els.markupInterest.textContent = F.pct(Sim.interest(s));
      const basket = Sim.basketSize(s);
      els.markupBasket.textContent = `${basket} ${basket === 1 ? 'sock' : 'socks'}`;
      els.markupDemand.textContent = F.fmt(Sim.demandRate(s)) + '/s';
      els.btnClearance.disabled = s.socks < 1;

      const pending = Sim.pendingThreads(s);
      els.prestigeHeld.textContent = s.threads;
      els.prestigePending.textContent = '+' + pending;
      els.btnRetire.disabled = pending < 1;
      const nextTotal = Sim.totalThreadsEarned(s) + 1;
      els.prestigeHint.textContent = `Next thread at ${F.money(nextTotal * nextTotal * D.prestige.divisor)} lifetime earnings.`;
    }

    // Lenders: an offer row while you owe nothing, a repayment row while you do.
    // Returns how many loans are due within a minute that you cannot cover.
    function refreshBank(s) {
      let shown = 0;
      let pressing = 0;
      D.lenders.forEach((L) => {
        const rows = lenderRows.get(L.id);
        const available = Sim.lenderAvailable(s, L.id);
        const loan = Sim.loanFor(s, L.id);
        rows.borrow.button.hidden = !available || !!loan;
        rows.loan.button.hidden = !loan;
        if (!available && !loan) return;
        shown++;
        if (!loan) {
          const offer = Sim.loanOffer(s, L.id);
          rows.borrow.cost.textContent = (L.laundering ? 'Take ' : 'Borrow ') + F.money(offer);
          rows.borrow.qty.textContent = L.laundering ? `owe ${F.money(Sim.loanOwed(L.id, offer))} in ${F.fmtTime(L.term)}` : 'due in ' + F.fmtTime(L.term);
          setAffordable(rows.borrow.button, true);
          return;
        }
        const left = loan.due - s.playTime;
        const short = s.money < loan.owed;
        rows.loan.desc.textContent = L.laundering
          ? `Sal's cut of the bag. ${L.terms}`
          : `Borrowed ${F.money(loan.principal)}. Grows ${rows.ratePerMin.toFixed(1)}%/min, up to ${F.money(loan.principal * L.cap)}. ${L.terms}`;
        rows.loan.meta.textContent = left > 0
          ? `Due in ${F.fmtTime(left)}` + (loan.stage > 0 ? ` · already missed ${loan.stage} date${loan.stage === 1 ? '' : 's'}` : '')
          : 'OVERDUE';
        const pay = Math.min(loan.owed, s.money);
        rows.loan.cost.textContent = 'Owe ' + F.money(loan.owed);
        rows.loan.qty.textContent = pay >= loan.owed - 0.005 ? 'Repay all' : pay >= 0.01 ? `Repay ${F.money(pay)}` : 'No cash';
        setAffordable(rows.loan.button, pay >= 0.01);
        rows.loan.button.classList.toggle('overdue', short && left < 60);
        if (short && left < 60) pressing++;
      });
      els.emptyLenders.hidden = shown > 0;
      els.dirtyHint.hidden = s.dirty <= 0;
      if (s.dirty > 0) els.dirtyHint.textContent = `🧺 ${F.money(s.dirty)} of dirty cash still to wash through the tills. Expect a police raid about every ${F.fmtTime(Sim.raidInterval(s))} until it is clean.`;
      // insurance
      const canInsure = Sim.protectionAvailable(s) || s.protection;
      els.protectionHead.hidden = !canInsure;
      protectionRow.button.hidden = !canInsure;
      if (canInsure) {
        const rate = s.protection ? Sim.protectionRate(s) : Sim.assetValue(s) * D.protection.rate;
        protectionRow.cost.textContent = F.money(rate) + '/s';
        protectionRow.qty.textContent = s.protection ? 'Paying · click to stop' : 'Click to pay';
        protectionRow.button.classList.toggle('selected', s.protection);
        protectionRow.meta.textContent = s.protection ? 'Covered. Sal sends his regards.' : 'Not covered. Sal sends his sympathies in advance.';
        setAffordable(protectionRow.button, true);
      }
      return pressing;
    }

    // Trouble in progress, as chips under the KPIs, each with a countdown and
    // a buy-off button where the event allows one.
    let eventsKey = '';
    function refreshEvents(s) {
      const key = s.events.map((e) => {
        const cost = Sim.resolveCost(s, e.id);
        return e.id + ':' + (e.remaining === null ? '-' : Math.ceil(e.remaining)) + ':' + (cost === null ? '-' : Math.round(cost) + (s.money >= cost ? 'y' : 'n'));
      }).join('|')
        + '|' + (s.offer ? `offer:${s.offer.socks}:${Math.ceil(s.offer.expires - s.playTime)}` : '')
        + '|' + (s.order ? `order:${s.order.filled}/${s.order.socks}:${Math.ceil(s.order.due - s.playTime)}` : '');
      if (key === eventsKey) return;
      eventsKey = key;
      els.events.textContent = '';
      if (s.offer) {
        const o = s.offer;
        const chip = el('div', 'event offer brut');
        chip.append(el('span', 'event-icon', o.icon));
        const text = el('span', 'event-text');
        text.append(el('strong', null, `${o.customer} want ${F.fmtInt(o.socks)} socks`));
        text.append(el('span', 'event-time', ` · ${o.premium}× price (${F.money(Sim.orderPrice(s, o))} each) · ${F.fmtTime(D.orders.deadline)} to deliver · offer ends in ${F.fmtTime(Math.max(0, Math.ceil(o.expires - s.playTime)))}`));
        chip.append(text);
        const yes = el('button', 'brut', 'Accept');
        yes.type = 'button';
        yes.addEventListener('click', () => actions.acceptOrder());
        const no = el('button', 'brut decline', 'Decline');
        no.type = 'button';
        no.addEventListener('click', () => actions.declineOrder());
        chip.append(yes, no);
        els.events.append(chip);
      }
      if (s.order) {
        const o = s.order;
        const chip = el('div', 'event order brut');
        chip.append(el('span', 'event-icon', o.icon));
        const text = el('span', 'event-text');
        text.append(el('strong', null, `Order for ${o.customer}: ${F.fmtInt(o.filled)} / ${F.fmtInt(o.socks)} socks`));
        text.append(el('span', 'event-time', ` · pays ${F.money(o.socks * Sim.orderPrice(s, o))} · due in ${F.fmtTime(Math.max(0, Math.ceil(o.due - s.playTime)))}`));
        chip.append(text);
        els.events.append(chip);
      }
      s.events.forEach((e) => {
        const d = D.events[e.id];
        const chip = el('div', 'event brut');
        chip.append(el('span', 'event-icon', d.icon));
        const text = el('span', 'event-text');
        text.append(el('strong', null, d.name));
        text.append(el('span', 'event-time', e.remaining === null ? (d.resolve ? ' · until you deal with it' : ' · until you settle up') : ` · ${F.fmtTime(Math.ceil(e.remaining))} left`));
        chip.append(text);
        const cost = Sim.resolveCost(s, e.id);
        if (cost !== null) {
          const b = el('button', 'brut', `${d.resolve.label} (${F.money(cost)})`);
          b.type = 'button';
          b.disabled = s.money < cost;
          b.addEventListener('click', () => actions.resolveEvent(e.id));
          chip.append(b);
        }
        els.events.append(chip);
      });
    }

    const NEWS_ICON = { staff: '🧓', machine: '🔧', delivery: '🚚', research: '🔬', build: '🏗️', money: '💸', trouble: '🚨', order: '📦' };
    let newsKey = '';
    function refreshNews(s) {
      els.newsSub.textContent = `Wages & maintenance ${F.money(Sim.upkeepRate(s))}/s`
        + (s.lifetimeLost > 0 ? ` · ${F.fmtInt(s.lifetimeLost)} socks lost` : '')
        + (s.lifetimeSkimmed > 0 ? ` · ${F.fmtInt(s.lifetimeSkimmed)} skimmed` : '');
      const items = s.news.slice(0, 8);
      els.newsEmpty.hidden = items.length > 0;
      const key = items.map((n) => n.t + n.text).join('|') + '|' + Math.floor(s.playTime / 10);
      if (key === newsKey) return;
      newsKey = key;
      els.newsList.textContent = '';
      items.forEach((n) => {
        const li = el('li', n.kind);
        li.append(el('span', 'news-icon', NEWS_ICON[n.kind] || '📰'), el('span', 'news-text', n.text), el('span', 'news-age', ageText(s.playTime - n.t)));
        els.newsList.append(li);
      });
    }

    function ageText(sec) {
      if (sec < 10) return 'just now';
      if (sec < 60) return Math.floor(sec) + 's ago';
      return F.fmtTime(sec) + ' ago';
    }

    function refreshWarning(s, prod) {
      const through = Sim.throughputRate(s);
      const demand = Sim.demandRate(s);
      let text = '';
      const pressing = s.loans
        .map((l) => ({ l, L: D.lenders.find((x) => x.id === l.lender), left: l.due - s.playTime }))
        .filter((x) => x.L && x.left < 60 && s.money < x.l.owed)
        .sort((a, b) => a.left - b.left)[0];
      if (pressing) {
        text = `${pressing.L.name} wants ${F.money(pressing.l.owed)} ${pressing.left > 0 ? 'in ' + F.fmtTime(Math.max(1, pressing.left)) : 'now'}. You have ${F.money(s.money)}. Repay what you can in the Bank.`;
      } else if (s.unpaid) {
        text = `You cannot cover wages and maintenance (${F.money(Sim.upkeepRate(s))}/s). Outages are at their worst. Earn cash or lower the sliders in Machines.`;
      } else if (s.factoryStock > Math.max(40, prod * 20) && through < prod * 0.95) {
        text = `${F.fmtInt(s.factoryStock)} socks are waiting at the factory. The fleet moves ${F.fmt(through)}/s but you make ${F.fmt(prod)}/s. Buy vehicles or research logistics.`;
      } else if (s.socks > Math.max(40, demand * 30) && demand < Math.min(prod, through) * 0.95) {
        text = `Shelves are overflowing: customers buy about ${F.fmt(demand)}/s. Lower the markup, buy marketing, or upgrade the shop.`;
      }
      els.stockWarning.hidden = !text;
      els.stockWarning.textContent = text;
    }

    function refreshKnit(s) {
      const knitting = s.knitting !== null;
      els.knit.classList.toggle('knitting', knitting);
      els.knitFill.style.width = (knitting ? Sim.knitProgress(s) * 100 : 0) + '%';
      els.knitLabel.textContent = knitting ? 'KNITTING…' : 'KNIT A SOCK';
      const yieldN = Sim.knitYield(s);
      els.knitSub.textContent = knitting
        ? `${Math.max(0, s.knitting).toFixed(1)}s to go`
        : `${Sim.knitTime(s).toFixed(1)}s per sock` + (yieldN > 1 ? ` · +${F.fmtSocks(yieldN)} socks` : '');
    }

    function refresh(measured) {
      const s = getState();
      const prod = Sim.productionRate(s);
      const sales = measured ? measured.sold : Sim.salesRate(s);
      const income = measured ? measured.earned : Sim.incomeRate(s);
      const delivering = measured ? measured.delivered : Math.min(Sim.throughputRate(s), prod);

      els.money.textContent = F.money(s.money);
      els.topThreads.hidden = s.threads === 0;
      els.topThreads.textContent = '🧵 ' + s.threads;
      els.socks.textContent = F.fmtInt(s.socks);
      els.stockLine.textContent = `${F.fmtInt(s.factoryStock)} at factory · ${F.fmtInt(Sim.socksInTransit(s))} in transit`;
      els.rateProd.textContent = F.fmt(prod) + '/s';
      const totalDown = D.producers.reduce((sum, p) => sum + Sim.downUnits(s, p.id), 0);
      els.kpiFactory.textContent = totalDown > 0 ? `${totalDown} unit${totalDown === 1 ? '' : 's'} out of action` : Sim.currentFactory(s).name;
      els.topIncome.textContent = F.money(income) + '/s'
        + (Sim.upkeepRate(s) > 0 ? ` · upkeep ${F.money(Sim.upkeepRate(s))}/s` : '')
        + (s.protection ? ` · insurance ${F.money(Sim.protectionRate(s))}/s` : '')
        + (s.loans.length ? ` · debt ${F.money(Sim.totalDebt(s))}` : '')
        + (s.dirty > 0 ? ` · ${F.money(s.dirty)} dirty` : '');
      els.rateDeliver.textContent = F.fmt(delivering) + '/s';
      els.kpiFleet.textContent = `${s.vehicles.length} vehicle${s.vehicles.length === 1 ? '' : 's'} · ${F.fmt(Sim.throughputRate(s))}/s max`;
      els.rateSales.textContent = F.fmt(sales) + '/s';
      els.ratePrice.textContent = F.money(Sim.salePrice(s)) + ' each';
      els.rateCustomers.textContent = F.fmtInt(s.customers);

      els.statSocks.textContent = F.fmtInt(s.lifetimeSocks);
      els.statDelivered.textContent = F.fmtInt(s.lifetimeDelivered);
      els.statSold.textContent = F.fmtInt(s.lifetimeSold);
      els.statMoney.textContent = F.money(s.lifetimeMoney);
      els.statClicks.textContent = F.fmtInt(s.clicks);
      els.statTime.textContent = F.fmtTime(s.playTime);
      els.statRetire.textContent = s.retirements;
      els.statBankrupt.textContent = s.bankruptcies;
      els.statOrders.textContent = F.fmtInt(s.ordersDone);
      els.statFines.textContent = F.money(s.lifetimeFines);

      refreshKnit(s);
      refreshWarning(s, prod);
      refreshNews(s);
      const machines = refreshProducers(s);
      const research = refreshResearch(s);
      refreshFleet(s);
      const upgrades = refreshUpgrades(s);
      refreshMarketing(s);
      const factoryReady = refreshFactory(s);
      const shopReady = refreshShop(s);
      refreshLines(s);
      refreshPricing(s);
      const loansDue = refreshBank(s);
      refreshEvents(s);
      refreshRadio();

      setBadge(els.badgeResearch, research);
      setBadge(els.badgeUpgrades, upgrades);
      setBadge(els.badgeFactory, factoryReady ? '!' : 0);
      setBadge(els.badgeShop, shopReady ? '!' : 0);
      setBadge(els.badgeBank, s.loans.length);
      setBadge(els.menuBadge, research + upgrades + (factoryReady ? 1 : 0) + (shopReady ? 1 : 0) + loansDue);
      setQuick('research', research);
      setQuick('upgrades', upgrades);
      setQuick('factory', factoryReady ? 1 : 0);
      setQuick('shop', shopReady ? 1 : 0);
      setQuick('machines', machines);
      setQuick('bank', loansDue);
    }

    // ---- feedback -------------------------------------------------------

    function toast(message, ms) {
      const t = el('div', 'toast', message);
      els.toasts.append(t);
      setTimeout(() => t.remove(), ms || 5000);
    }

    function floater(x, y, text) {
      const f = el('div', 'floater', text);
      f.style.left = x + 'px';
      f.style.top = y + 'px';
      els.floaters.append(f);
      setTimeout(() => f.remove(), 800);
    }

    // A hand-knit sock just finished: float its yield up from the knit button.
    function knitDone(n) {
      const rect = els.knit.getBoundingClientRect();
      floater(rect.left + rect.width / 2 + (Math.random() * 40 - 20), rect.top + 10, '+' + F.fmtSocks(n) + ' 🧦');
    }

    function setSaveStatus(text) {
      els.saveStatus.textContent = text;
    }

    return { refresh, toast, floater, knitDone, openDrawer, closeDrawer, setSaveStatus };
  }

  root.createUI = createUI;
})(this);
