// Sock Tycoon - all balance numbers live here. No game logic, no DOM.
// Loads in the browser (window.SockData) and in Node (module.exports).
(function (root) {
  'use strict';

  // ---- factory ----------------------------------------------------------
  // Each level needs money AND a lifetime-socks-knitted milestone, and says
  // which machine types may be researched once you have it.
  const factoryLevels = [
    { id: 'shack',     name: 'Shack',              icon: '🛖', cost: 0,    requiresKnitted: 0,    unlocks: [],                     desc: 'A leaky shack, a chair, and a ball of yarn.' },
    { id: 'cottage',   name: 'Granny Cottage',     icon: '🏡', cost: 40,   requiresKnitted: 30,   unlocks: ['granny'],             desc: 'Room for a few grannies and a kettle.' },
    { id: 'workshop',  name: 'Workshop',           icon: '🏚️', cost: 800,  requiresKnitted: 2000, unlocks: ['loom', 'machine'],    desc: 'Looms, machines, and the smell of oil.' },
    { id: 'small',     name: 'Small Factory',      icon: '🏭', cost: 15000, requiresKnitted: 5e4, unlocks: ['line'],               desc: 'A proper chimney. The neighbours have noticed.' },
    { id: 'factory',   name: 'Sock Factory',       icon: '🏭', cost: 2e5,  requiresKnitted: 1e6,  unlocks: ['mill'],               desc: 'Three shifts, no sleep.' },
    { id: 'complex',   name: 'Industrial Complex', icon: '🏗️', cost: 3e6,  requiresKnitted: 3e7,  unlocks: ['megaplex'],           desc: 'A city of chimneys.' },
    { id: 'spaceport', name: 'Sock Spaceport',     icon: '🚀', cost: 5e7,  requiresKnitted: 1e9,  unlocks: ['orbital', 'quantum'], desc: 'Launch windows every hour. Wool is weightless up there.' },
  ];

  // ---- machines ---------------------------------------------------------
  // upkeep: dollars per unit per second at a 100% wage/maintenance setting.
  // care: how the upkeep slider is labelled and what an outage looks like.
  const wages = { id: 'wages', label: 'Wages', low: 'underpaid', ok: 'content', high: 'spoiled', outageIcon: '🎟️' };
  const maintenance = { id: 'maintenance', label: 'Maintenance', low: 'neglected', ok: 'serviced', high: 'pampered', outageIcon: '🔧' };
  const producers = [
    { id: 'granny',   name: 'Knitting Granny',          plural: 'Knitting Grannies',          icon: '🧓', baseCost: 15,     baseRate: 0.1,   upkeep: 0.01, care: wages,
      desc: 'Knits one sock at a time, with love and a lot of tea.',
      outageStart: '{n} {plural} have gone to play bingo. Back in {t}.', outageEnd: '{n} {plural} are back from bingo, full of gossip.' },
    { id: 'loom',     name: 'Hand Loom',                plural: 'Hand Looms',                 icon: '🪡', baseCost: 100,    baseRate: 1,     upkeep: 0.08, care: maintenance,
      desc: 'Wooden, creaky, surprisingly productive.',
      outageStart: '{n} {plural} have jammed. Untangling takes {t}.', outageEnd: '{n} {plural} are untangled and clacking again.' },
    { id: 'machine',  name: 'Circular Knitting Machine', plural: 'Circular Knitting Machines', icon: '⚙️', baseCost: 1100,   baseRate: 8,     upkeep: 0.6,  care: maintenance,
      desc: 'Round and round the yarn goes.',
      outageStart: '{n} {plural} threw a needle bed. Repairs take {t}.', outageEnd: '{n} {plural} are spinning again.' },
    { id: 'line',     name: 'Factory Line',             plural: 'Factory Lines',              icon: '🏭', baseCost: 12000,  baseRate: 47,    upkeep: 4,    care: maintenance,
      desc: 'Conveyor belts, hairnets, the works.',
      outageStart: 'A belt snapped on {n} {plural}. Down for {t}.', outageEnd: '{n} {plural} are rolling again.' },
    { id: 'mill',     name: 'Automated Mill',           plural: 'Automated Mills',            icon: '🤖', baseCost: 130000, baseRate: 260,   upkeep: 20,   care: maintenance,
      desc: 'Nobody works here. Socks still appear.',
      outageStart: '{n} {plural} rebooted into a blue screen. {t} to recover.', outageEnd: '{n} {plural} are back online.' },
    { id: 'megaplex', name: 'Sock Megaplex',            plural: 'Sock Megaplexes',            icon: '🏙️', baseCost: 1.4e6,  baseRate: 1400,  upkeep: 100,  care: maintenance,
      desc: 'Visible from space. Smells faintly of wool.',
      outageStart: 'A power cut hit {n} {plural}. Generators need {t}.', outageEnd: 'Power is back at {n} {plural}.' },
    { id: 'orbital',  name: 'Orbital Yarn Station',     plural: 'Orbital Yarn Stations',      icon: '🛰️', baseCost: 2e7,    baseRate: 7800,  upkeep: 600,  care: maintenance,
      desc: 'Zero-gravity knitting has fewer dropped stitches.',
      outageStart: '{n} {plural} drifted out of alignment. Re-docking takes {t}.', outageEnd: '{n} {plural} are back in orbit and knitting.' },
    { id: 'quantum',  name: 'Quantum Knitter',          plural: 'Quantum Knitters',           icon: '🌀', baseCost: 3.3e8,  baseRate: 44000, upkeep: 3500, care: maintenance,
      desc: 'Every sock exists in all sizes until observed.',
      outageStart: '{n} {plural} decohered. Observing them again takes {t}.', outageEnd: '{n} {plural} collapsed back into a working state.' },
  ];

  function factoryLevelFor(producerId) {
    for (let i = 0; i < factoryLevels.length; i++) {
      if (factoryLevels[i].unlocks.indexOf(producerId) >= 0) return i;
    }
    return factoryLevels.length - 1;
  }

  // Each producer gets one doubling upgrade per tier, unlocked by owning enough of it.
  const upgradeTiers = [
    { requires: 10,  costMult: 10,    prefix: 'Ergonomic' },
    { requires: 25,  costMult: 100,   prefix: 'Overclocked' },
    { requires: 50,  costMult: 1000,  prefix: 'Legendary' },
    { requires: 100, costMult: 10000, prefix: 'Transcendent' },
  ];

  const producerUpgrades = [];
  producers.forEach((p) => {
    upgradeTiers.forEach((t, i) => {
      producerUpgrades.push({
        id: `${p.id}_${i}`,
        name: `${t.prefix} ${p.plural}`,
        desc: `${p.plural} produce twice as many socks.`,
        icon: p.icon,
        cost: p.baseCost * t.costMult,
        requires: { producer: p.id, count: t.requires },
        effect: { type: 'producer', producer: p.id, value: 2 },
      });
    });
  });

  const otherUpgrades = [
    { id: 'needles',   name: 'Sharper Needles',            icon: '🪡', cost: 100,   desc: 'You hand-knit socks twice as fast.',                      effect: { type: 'click', value: 2 } },
    { id: 'dpn',       name: 'Double-Pointed Needles',     icon: '✨', cost: 2500,  desc: 'You hand-knit socks twice as fast.',                      effect: { type: 'click', value: 2 } },
    { id: 'frenzy',    name: 'Knitting Frenzy',            icon: '🔥', cost: 50000, desc: 'You hand-knit socks three times as fast.',                effect: { type: 'click', value: 3 } },
    { id: 'delegate',  name: 'Inspiring Example',          icon: '📣', cost: 1e6,   desc: 'Each sock you finish inspires the factory to add 5% of its per-second output.', effect: { type: 'clickPct', value: 0.05 } },
    { id: 'delegate2', name: 'Very Inspiring Example',     icon: '📢', cost: 1e8,   desc: 'Each sock you finish inspires the factory to add 10% of its per-second output.', effect: { type: 'clickPct', value: 0.10 } },
    { id: 'qc',        name: 'Quality Control',            icon: '🔍', cost: 20000, desc: 'Socks sell for 25% more.',                               effect: { type: 'price', value: 1.25 } },
    { id: 'latelicence', name: 'Late Licence',             icon: '🌙', cost: 6000,  desc: 'The shop trades after dark. Night-time foot traffic no longer drops.', effect: { type: 'night', value: 2.5 } },
    { id: 'discount',  name: 'Yarn Bulk Discount',         icon: '🧶', cost: 1e5,   desc: 'All machines cost 10% less.',                            effect: { type: 'cost', value: 0.9 } },
    { id: 'subscribe', name: 'Sock Subscription Box',      icon: '📦', cost: 2e5,   desc: 'Doubles foot traffic past your shop.',                   effect: { type: 'demand', value: 2 } },
    { id: 'branding',  name: 'Fancy Branding',             icon: '🏷️', cost: 5e5,   desc: 'Socks sell for 50% more.',                               effect: { type: 'price', value: 1.5 } },
    { id: 'pairs',     name: 'Sell Them In Pairs',         icon: '👣', cost: 5e6,   desc: 'Revolutionary. Socks sell for twice as much.',          effect: { type: 'price', value: 2 } },
    { id: 'lefties',   name: 'Left Socks Sold Separately', icon: '🦶', cost: 1e9,   desc: 'Socks sell for twice as much. Customers grumble.',       effect: { type: 'price', value: 2 } },
    { id: 'discount2', name: 'Yarn Wholesale Contract',    icon: '📜', cost: 1e10,  desc: 'All machines cost 10% less.',                            effect: { type: 'cost', value: 0.9 } },
  ];

  // ---- sock lines -------------------------------------------------------
  // The first is known from the start; the rest are unlocked by research.
  // `shop` is the shop level needed before the pattern can be researched.
  // Patterns chain: each needs the previous main-line pattern. A `side` line
  // branches off (`after` names its prerequisite) and is not required by the
  // next one. `outrage` is how many outrage points each sale of it earns;
  // enough of them and the devout picket the shop.
  const sockLines = [
    { id: 'plain',       name: 'Plain White Tube Sock',  icon: '🧦', price: 1,     researchCost: 0,     shop: 0, desc: 'The humble beginning.' },
    { id: 'striped',     name: 'Striped Crew Sock',      icon: '🦓', price: 3,     researchCost: 500,   shop: 0, desc: 'Now with stripes. Bold.' },
    { id: 'devil',       name: "The Devil's Sock",       icon: '😈', price: 14,    researchCost: 2500,  shop: 1, side: true, after: 'striped', outrage: 0.5,
      warning: 'Sells like sin. Somebody will mind.',
      desc: 'Red, forked at the toe, and warm as you-know-where. The vicar has started walking past the shop very slowly.' },
    { id: 'argyle',      name: 'Argyle Dress Sock',      icon: '🔷', price: 8,     researchCost: 5000,  shop: 1, desc: 'For the discerning ankle.' },
    { id: 'wool',        name: 'Merino Hiking Sock',     icon: '🏔️', price: 20,    researchCost: 60000, shop: 2, desc: 'Blister-proof, mostly.' },
    { id: 'compression', name: 'Compression Sock',       icon: '💪', price: 50,    researchCost: 7.5e5, shop: 2, desc: 'Medically recommended. Probably.' },
    { id: 'cashmere',    name: 'Cashmere Lounge Sock',   icon: '👑', price: 150,   researchCost: 1e7,   shop: 3, desc: 'Softer than a cloud made of kittens.' },
    { id: 'smart',       name: 'Heated Smart Sock',      icon: '📱', price: 500,   researchCost: 1.5e8, shop: 4, desc: 'Has an app. The app is bad. Socks are great.' },
    { id: 'antigrav',    name: 'Anti-Gravity Sock',      icon: '🚀', price: 2000,  researchCost: 2.5e9, shop: 5, desc: 'Never lose one under the sofa again.' },
    { id: 'eternal',     name: 'Eternal Sock',           icon: '♾️', price: 10000, researchCost: 5e11,  shop: 6, desc: 'Never wears out. Terrible for repeat business.' },
  ];

  // ---- shop -------------------------------------------------------------
  const shopLevels = [
    { id: 'kiosk',     name: 'Corner Kiosk',         icon: '🛖', cost: 0,     requiresSold: 0,    lots: 1, basket: 1,  appeal: 1.0, traffic: 1,   desc: 'A folding table and a dream.' },
    { id: 'shop',      name: 'Sock Shop',            icon: '🏪', cost: 250,   requiresSold: 100,  lots: 1, basket: 2,  appeal: 1.3, traffic: 1,   desc: 'Four walls, a door, and a bell that goes ding.' },
    { id: 'boutique',  name: 'Sock Boutique',        icon: '🏬', cost: 3000,  requiresSold: 2000, lots: 2, basket: 3,  appeal: 1.7, traffic: 1.5, desc: 'You bought out the florist. The town will forgive you.' },
    { id: 'emporium',  name: 'Sock Emporium',        icon: '🏛️', cost: 40000, requiresSold: 5e4,  lots: 3, basket: 5,  appeal: 2.2, traffic: 2,   desc: 'Three storeys of socks. There is a lift.' },
    { id: 'depstore',  name: 'Sock Department Store', icon: '🏢', cost: 6e5,   requiresSold: 1e6,  lots: 4, basket: 8,  appeal: 2.8, traffic: 3,   desc: 'Ankle socks on the ground floor, knee-highs upstairs.' },
    { id: 'mall',      name: 'Sock Mall',            icon: '🏙️', cost: 1e7,   requiresSold: 2e7,  lots: 5, basket: 12, appeal: 3.5, traffic: 4,   desc: 'Has a food court. It only serves socks.' },
    { id: 'megastore', name: 'Sock Megastore',       icon: '🌆', cost: 2e8,   requiresSold: 5e8,  lots: 7, basket: 20, appeal: 4.5, traffic: 6,   desc: 'The whole street is yours now.' },
  ];

  // ---- marketing --------------------------------------------------------
  const marketing = [
    { id: 'flyers',     name: 'Lamppost Flyers',            icon: '📄', cost: 100,   mult: 2, desc: 'Stapled to every lamppost in town.' },
    { id: 'newspaper',  name: 'Local Newspaper Ad',         icon: '📰', cost: 1500,  mult: 2, desc: 'Page 14, next to the crossword.' },
    { id: 'radio',      name: 'Radio Jingle',               icon: '📻', cost: 15000, mult: 3, desc: '"Sooock it to meee..."' },
    { id: 'influencer', name: 'Sock Influencer',            icon: '🤳', cost: 1.5e5, mult: 3, desc: 'Unboxing videos. Of socks.' },
    { id: 'tv',         name: 'TV Commercial',              icon: '📺', cost: 2e6,   mult: 4, desc: 'Thirty seconds of slow-motion feet.' },
    { id: 'billboard',  name: 'Billboard Campaign',         icon: '🪧', cost: 2.5e7, mult: 4, desc: 'Your socks, 40 feet tall.' },
    { id: 'celebrity',  name: 'Celebrity Endorsement',      icon: '🌟', cost: 4e8,   mult: 5, desc: 'They wore them once. Once is enough.' },
    { id: 'superbowl',  name: 'Big Game Ad',                icon: '🏈', cost: 8e9,   mult: 5, desc: 'The ad people talk about more than the game.' },
    { id: 'sockday',    name: 'Global Sock Day',            icon: '🌍', cost: 1.5e11, mult: 6, desc: 'A public holiday. You lobbied hard.' },
    { id: 'treaty',     name: 'Interplanetary Sock Treaty', icon: '🪐', cost: 5e12,  mult: 8, desc: 'Mars buys in bulk now.' },
  ];

  // ---- vehicles ---------------------------------------------------------
  // Vehicles carry socks from the factory stock to the shop stock.
  // `factory` is the factory level needed before the type can be researched.
  // mishapChance: chance per trip of one of the mishaps. lose: fraction of the
  // load lost. delay: seconds the vehicle is stuck mid-trip.
  const vehicleTypes = [
    { id: 'backpack',   name: 'Courier on Foot',   icon: '🚶', capacity: 5,    tripTime: 6,  cost: 10,   factory: 0, desc: 'A rucksack full of socks and a brisk walk.', mishapChance: 0.06,
      mishaps: [
        { icon: '❓', text: 'A courier got lost and asked a pigeon for directions.', lose: 0, delay: 8 },
        { icon: '💧', text: 'A courier dropped {socks} in a puddle.', lose: 0.4, delay: 3 },
      ] },
    { id: 'bicycle',    name: 'Delivery Bicycle',  icon: '🚲', capacity: 15,   tripTime: 5,  cost: 60,   factory: 0, desc: 'Panniers. Bell. Enthusiasm.', mishapChance: 0.07,
      mishaps: [
        { icon: '💥', text: 'A delivery bicycle hit a lamppost. {socks} scattered across the road.', lose: 0.5, delay: 6 },
        { icon: '🛞', text: 'A delivery bicycle has a puncture.', lose: 0, delay: 10 },
      ] },
    { id: 'van',        name: 'Delivery Van',      icon: '🚐', capacity: 150,  tripTime: 6,  cost: 2000, factory: 2, desc: 'Your logo on the side, slightly crooked.', mishapChance: 0.05,
      mishaps: [
        { icon: '🚦', text: 'A van is stuck in traffic behind a tractor.', lose: 0, delay: 8 },
        { icon: '📦', text: 'A van door swung open on a corner. {socks} gone.', lose: 0.2, delay: 4 },
      ] },
    { id: 'lorry',      name: 'Lorry',             icon: '🚚', capacity: 2000, tripTime: 7,  cost: 4e4,  factory: 3, desc: 'Reverses beeping into the loading bay.', mishapChance: 0.04,
      mishaps: [
        { icon: '🔄', text: 'A lorry took the wrong exit on the ring road. Twice.', lose: 0, delay: 12 },
        { icon: '📦', text: 'A crate fell off a lorry. {socks} are now free samples.', lose: 0.15, delay: 3 },
      ] },
    { id: 'roadtrain',  name: 'Road Train',        icon: '🚛', capacity: 3e4,  tripTime: 8,  cost: 1.5e6, factory: 4, desc: 'Three trailers. Four on a good day.', mishapChance: 0.04,
      mishaps: [
        { icon: '⚠️', text: 'A road train jackknifed at the roundabout. {socks} spilled.', lose: 0.25, delay: 14 },
        { icon: '☕', text: 'A road train driver stopped for a very long breakfast.', lose: 0, delay: 12 },
      ] },
    { id: 'airship',    name: 'Cargo Airship',     icon: '🛸', capacity: 1e6,  tripTime: 10, cost: 5e7,  factory: 5, desc: 'Floats over the traffic. Smug about it.', mishapChance: 0.03,
      mishaps: [
        { icon: '🌬️', text: 'An airship was blown off course towards the coast.', lose: 0, delay: 16 },
        { icon: '🪂', text: 'An airship jettisoned {socks} to gain altitude.', lose: 0.1, delay: 4 },
      ] },
    { id: 'teleporter', name: 'Teleporter Pod',    icon: '✨', capacity: 1e8,  tripTime: 3,  cost: 5e9,  factory: 6, desc: 'Socks in, socks out, somewhere else.', mishapChance: 0.02,
      mishaps: [
        { icon: '🌀', text: 'A teleporter pod delivered {socks} inside out. Unsellable.', lose: 0.1, delay: 2 },
        { icon: '🐈', text: 'A teleporter pod arrived with a cat in it. Investigation ongoing.', lose: 0, delay: 8 },
      ] },
  ];

  // ---- research ---------------------------------------------------------
  // Research costs money and takes time. One project at a time.
  // requires: { factoryLevel?, shopLevel?, research?: [ids] }
  const research = [];

  producers.forEach((p, i) => {
    research.push({
      id: 'm_' + p.id,
      name: p.name + ' Blueprints',
      icon: p.icon,
      category: 'machine',
      cost: Math.round(p.baseCost * 0.8),
      time: 8 + i * 25,
      requires: { factoryLevel: factoryLevelFor(p.id), research: i > 0 ? ['m_' + producers[i - 1].id] : [] },
      effect: { type: 'producer', id: p.id },
      desc: `Lets you buy ${p.plural}.`,
    });
  });

  sockLines.forEach((l, i) => {
    if (i === 0) return;
    let prev = null;
    if (l.after) prev = l.after;
    else for (let j = i - 1; j >= 1; j--) { if (!sockLines[j].side) { prev = sockLines[j].id; break; } }
    research.push({
      id: 's_' + l.id,
      name: l.name + ' Pattern',
      icon: l.icon,
      category: 'sock',
      cost: l.researchCost,
      time: 15 + i * 20,
      requires: { shopLevel: l.shop, research: prev ? ['s_' + prev] : [] },
      effect: { type: 'sock', id: l.id },
      desc: `${l.desc} Sells for ${l.price} base.`,
    });
  });

  vehicleTypes.forEach((v, i) => {
    if (i === 0) return;
    research.push({
      id: 'v_' + v.id,
      name: v.name,
      icon: v.icon,
      category: 'vehicle',
      cost: Math.round(v.cost * 0.75),
      time: 10 + i * 25,
      requires: { factoryLevel: v.factory, research: i > 1 ? ['v_' + vehicleTypes[i - 1].id] : [] },
      effect: { type: 'vehicle', id: v.id },
      desc: `${v.desc} Carries ${v.capacity} socks.`,
    });
  });

  [
    { id: 'l_crates',  name: 'Bigger Crates',      icon: '📦', cost: 500,  time: 20,  requires: { factoryLevel: 1 },                          effect: { type: 'capacity', value: 2 },  desc: 'Every vehicle carries twice as much.' },
    { id: 'l_routes',  name: 'Route Planning',     icon: '🗺️', cost: 2e4,  time: 45,  requires: { factoryLevel: 2, research: ['l_crates'] },  effect: { type: 'trip', value: 0.75 },   desc: 'Trips take 25% less time.' },
    { id: 'l_pallets', name: 'Pallet Loading',     icon: '🏗️', cost: 2e6,  time: 90,  requires: { factoryLevel: 3, research: ['l_routes'] },  effect: { type: 'capacity', value: 2 },  desc: 'Every vehicle carries twice as much.' },
    { id: 'l_express', name: 'Express Lanes',      icon: '🛣️', cost: 1e8,  time: 150, requires: { factoryLevel: 4, research: ['l_pallets'] }, effect: { type: 'trip', value: 0.75 },   desc: 'Trips take 25% less time.' },
    { id: 'l_warp',    name: 'Warp Crates',        icon: '🌀', cost: 1e10, time: 240, requires: { factoryLevel: 6, research: ['l_express'] }, effect: { type: 'capacity', value: 3 },  desc: 'Every vehicle carries three times as much.' },
    { id: 'l_training', name: 'Driver Training',   icon: '🎓', cost: 3000, time: 30,  requires: { factoryLevel: 1 },                          effect: { type: 'safety', value: 0.5 },    desc: 'Delivery mishaps happen half as often.' },
    { id: 'l_satnav',  name: 'Satnav',             icon: '🛰️', cost: 5e5,  time: 80,  requires: { factoryLevel: 3, research: ['l_training'] }, effect: { type: 'safety', value: 0.5 },   desc: 'Delivery mishaps happen half as often. Fewer pigeons consulted.' },
  ].forEach((r) => research.push(Object.assign({ category: 'logistics' }, r)));

  // Shop security: a `security` effect makes trouble that has a `guarded`
  // variant in `events` start in that softer form.
  research.push({ id: 'r_security', name: 'Door Security', icon: '💂', category: 'shop', cost: 2500, time: 45, requires: { shopLevel: 2 },
    effect: { type: 'security', value: 1 },
    desc: 'Two large, polite people in black coats at the shop door. Uninvited visitors get a much shorter visit, and the bailiffs are kept talking for a minute.' });

  // ---- doctrines --------------------------------------------------------
  // Exclusive research: within a branch you can only ever finish one, and it
  // holds until you retire. Effects use the same types as upgrades, and may
  // target one producer (`producer`) or every producer of one care kind
  // (`care: 'wages'` for grannies, `care: 'maintenance'` for machines).
  const branches = {
    factory: { name: 'Factory doctrine', icon: '🏭', desc: 'How the factory is run. Pick one; it holds until you retire.' },
    retail:  { name: 'Retail doctrine',  icon: '🏪', desc: 'What kind of shop this is. Pick one; it holds until you retire.' },
  };

  [
    { id: 'd_guild', name: 'The Knitting Guild', icon: '🧶', branch: 'factory', cost: 600, time: 30, requires: { factoryLevel: 2 },
      effects: [
        { type: 'producer', care: 'wages', value: 3 },
        { type: 'outage', care: 'wages', value: 0.5 },
        { type: 'grumble', value: 0.5 },
        { type: 'producer', care: 'maintenance', value: 0.75 },
      ],
      desc: 'Hands over hardware. Grannies knit three times as fast, skip bingo half as often and rarely grumble. Machines get 25% less attention.' },
    { id: 'd_automation', name: 'Automate Everything', icon: '🤖', branch: 'factory', cost: 900, time: 30, requires: { factoryLevel: 2 },
      effects: [
        { type: 'producer', care: 'maintenance', value: 2 },
        { type: 'upkeep', care: 'maintenance', value: 0.75 },
        { type: 'producer', care: 'wages', value: 0.5 },
      ],
      desc: 'Machines produce double and cost a quarter less to maintain. The grannies, feeling unloved, knit at half speed.' },
    { id: 'd_corners', name: 'Cut Every Corner', icon: '🩹', branch: 'factory', cost: 300, time: 20, requires: { factoryLevel: 2 },
      effects: [
        { type: 'upkeep', value: 0.4 },
        { type: 'producer', value: 1.25 },
        { type: 'outage', value: 2 },
        { type: 'grumble', value: 3 },
        { type: 'grumbleBase', value: 0.4 },
      ],
      desc: 'Wages and maintenance cost 60% less and everyone works 25% harder. Outages double, and the grannies mutter about a union unless you spoil them.' },
    { id: 'd_pile', name: 'Pile It High', icon: '🏷️', branch: 'retail', cost: 400, time: 30, requires: { shopLevel: 1 },
      effects: [
        { type: 'basket', value: 2 },
        { type: 'demand', value: 1.5 },
        { type: 'price', value: 0.6 },
        { type: 'markupMax', value: 0.5 },
      ],
      desc: 'Volume. Baskets double and foot traffic rises by half, but prices drop 40% and markup can never go above 100%.' },
    { id: 'd_velvet', name: 'The Velvet Rope', icon: '💎', branch: 'retail', cost: 800, time: 30, requires: { shopLevel: 1 },
      effects: [
        { type: 'price', value: 2 },
        { type: 'markupMax', value: 2 },
        { type: 'demand', value: 0.5 },
      ],
      desc: 'Exclusivity. Prices double and markup can go to 400%, but half the foot traffic never finds the door.' },
    { id: 'd_community', name: "Everybody's Sock Shop", icon: '🤝', branch: 'retail', cost: 250, time: 20, requires: { shopLevel: 1 },
      effects: [
        { type: 'demand', value: 1.3 },
        { type: 'appeal', value: 1.3 },
        { type: 'price', value: 0.85 },
        { type: 'outrage', value: 0.25 },
      ],
      desc: 'Everyone is welcome. More people pass and more come in, prices are 15% friendlier, and the town forgives you almost anything.' },
  ].forEach((r) => research.push(Object.assign({ category: 'doctrine' }, r)));

  // ---- lenders ----------------------------------------------------------
  // A loan is one lump sum, owed with continuously compounding interest
  // (`rate` per second) up to `cap` times the principal, due `term` seconds
  // after it is taken. A lender with `escalation` reacts to a missed date
  // one step at a time, every `grace` seconds, multiplying the debt by
  // `penalty`. A lender without it collects what it can and seizes assets
  // for the rest: vehicles, then machines, then the shop, then the factory.
  const lenders = [
    { id: 'bank', name: 'Sock Savings & Loan', icon: '🏦', requires: { shopLevel: 1 },
      minAmount: 150, assetFraction: 0.6, rate: 0.0003, cap: 3, term: 900,
      desc: 'Sensible rates, sensible paperwork. Lends against what you own.',
      terms: 'Collected in full when due. If you are short, the bailiffs take the difference: vehicles first, then machines, then the shop, then the factory.' },
    { id: 'mafia', name: "Cousin Sal's Friendly Finance", icon: '🕴️', requires: {},
      minAmount: 300, assetFraction: 2, rate: 0.0015, cap: 5, term: 300, grace: 90, penalty: 1.25,
      escalation: ['enforcer', 'mafiaGranny', 'bikers', 'takeover'],
      desc: 'No paperwork, no collateral, no questions. Sal is very understanding, right up until he is not.',
      terms: 'Miss the date and Sal will be in touch. He does not send letters.' },
    // Laundering: the whole bag arrives as dirty cash and only `cut` of it is
    // yours. Dirty cash washes clean as legitimate sales come in; while any
    // is left, the police may raid (see `laundering`).
    { id: 'launder', name: "Sal's Laundromat", icon: '🧺', requires: { shopLevel: 1 },
      minAmount: 500, assetFraction: 1, rate: 0, cap: 1, term: 360, grace: 90, penalty: 1.25, cut: 0.2, laundering: true,
      escalation: ['enforcer', 'mafiaGranny', 'bikers', 'takeover'],
      desc: 'Sal has a sports bag of cash that needs to look like sock money. Keep a fifth; the rest goes back to him once it has been through the tills.',
      terms: 'Owe Sal 80% of the bag by the date. Until an equal amount of honest sales has washed through, it is dirty money: a police raid takes what is left and closes the shop.' },
  ];

  // ---- trouble ----------------------------------------------------------
  // Events are things happening to the shop or factory. While active they
  // multiply `interest` (chance a passer-by comes in) or `traffic`, skim a
  // share of production (`skim`), or stop every producer of one care kind
  // (`strikeCare`). `stealShelf` is taken from the shelves once, when the
  // event starts. `duration` null means it lasts until something ends it.
  // `street` / `factory` name what the canvases draw. `resolve` is an
  // optional way to buy the event off.
  const events = {
    enforcer: { icon: '🕴️', name: 'A visit from Sal', duration: 90, interest: 0.5, street: 'enforcer',
      text: 'A large man in a small hat is leaning on your doorframe. Half the customers cross the road.',
      endText: 'The man in the small hat has gone. For now.',
      guarded: { duration: 30, interest: 0.85,
        text: 'A large man in a small hat came to lean on your doorframe. Security leaned back. He is sulking across the road and a few customers give him a wide berth.' } },
    mafiaGranny: { icon: '🕶️', name: 'The new granny', duration: null, skim: 0.3, factory: 'mafiaGranny',
      text: 'A granny in dark glasses started at the factory today. Nobody hired her. A third of the socks are going missing.',
      endText: 'The granny in dark glasses collected her coat and left without a word.' },
    bikers: { icon: '🏍️', name: 'Biker raid', duration: 25, traffic: 0, stealShelf: 0.5, street: 'bikers',
      text: 'A biker gang tore down the high street, scattered the customers and cleared half the shelves.',
      endText: 'The bikers have roared off. There is glass everywhere.',
      guarded: { duration: 12, traffic: 0.5, stealShelf: 0.1,
        text: 'A biker gang tore down the high street. Security had the shutters down in time: a tenth of the shelves went and half the customers ran.' } },
    bailiffs: { icon: '🦺', name: 'Bailiffs', duration: 40, interest: 0.5, street: 'bailiffs',
      text: 'The bailiffs are at the shop with a clipboard and a van.',
      endText: 'The bailiffs have driven off with a van full of your things.',
      // With security, a first missed date buys `grace` seconds of stalling at the door before anything is seized.
      guarded: { duration: 60, interest: 0.85, grace: 60,
        text: 'The bailiffs are at the shop with a clipboard and a van. Security is keeping them talking at the side door. You have a minute to find the money.' } },
    picket: { icon: '✝️', name: 'Picket line', duration: 120, interest: 0.15, street: 'picket',
      text: "The Congregation of the Unblemished Ankle is picketing your door over the Devil's Sock. Almost nobody gets past them.",
      endText: 'The picket has gone home for evensong.',
      resolve: { label: 'Donate to the parish', moneyFraction: 0.25, min: 50, text: 'Your generous donation is accepted. The picket packs up, muttering.' } },
    letdown: { icon: '📉', name: 'Word gets round', duration: 90, interest: 0.6,
      text: 'You let {customer} down over their order. Word gets round the town and fewer people bother coming in.',
      endText: 'People have stopped talking about the {customer} business.' },
    // `spawn`: the event rolls itself in (live mode only) every `interval`
    // seconds on average while `requires` hold, then rests for `cooldown`.
    rival: { icon: '🏪', name: 'Rival shop', duration: null, traffic: 0.5, street: 'rival',
      spawn: { interval: 480, requires: { shopLevel: 2 }, cooldown: 360 },
      text: 'SOCKS 4 LESS has opened two doors down with a permanent sale on. Half the passers-by never reach you.',
      endText: 'SOCKS 4 LESS has closed.',
      resolve: { label: 'Buy them out', assetFraction: 0.35, min: 1500, growth: 1.5, text: 'You bought out SOCKS 4 LESS. Their sign is in a skip and the passers-by are yours again.' } },
    inspector: { icon: '📋', name: 'Health inspector', duration: 60, closeFactory: true, fine: 0.15, fineMin: 50, factory: 'inspector',
      spawn: { interval: 360, requires: { research: ['d_corners'] }, cooldown: 180 },
      text: 'A health inspector found the corners you cut. The factory is closed for a minute of paperwork and you are fined {fine}.',
      endText: 'The inspector has left with a report as thick as a sock drawer. The factory is open again.' },
    vandals: { icon: '🧱', name: 'Vandals', duration: 40, interest: 0.6, stealShelf: 0.2, street: 'vandals',
      spawn: { interval: 240, requires: { shopLevel: 3, protection: false }, cooldown: 120 },
      text: 'A brick came through the window overnight and a fifth of the stock walked off. Sal sends his sympathies, and a reminder that insurance is available at the Bank.',
      endText: 'The glazier has been. The window is whole again.',
      guarded: { duration: 20, interest: 0.85, stealShelf: 0.05,
        text: 'A brick came through the window. Security caught the lad before he reached the shelves. Sal sends his sympathies anyway.' } },
    police: { icon: '🚔', name: 'Police raid', duration: 60, interest: 0, street: 'police',
      text: 'The police raided the shop and found {fine} in cash that smells of Sal. They took it, and the shop is closed while they count it.',
      endText: 'The police have gone. The shop is open again. The paperwork will take years.' },
    strike: { icon: '✊', name: 'Granny strike', duration: 120, strikeCare: 'wages', factory: 'strike',
      text: 'The grannies have downed needles. There is a picket line in the yard and a great deal of tea.',
      endText: 'The strike is over. Nobody is happy about it.',
      resolve: { label: 'Settle: pay back wages', wagesSeconds: 300, min: 20, text: 'Back wages paid and wages set to at least 100%. The needles are clicking again.' } },
  };

  const DATA = {
    branches,
    lenders,
    events,
    // Sock Radio: each track suits one kind of producer, but only when the
    // radio drifted onto it by itself. Tune it yourself and nobody notices.
    radio: {
      serenades: [
        { track: 'waltz',    care: 'wages',       mult: 1.25, start: 'A waltz has come on the radio. The grannies are humming along and the needles are flying.', end: 'The waltz has finished. The grannies sigh and settle back to their usual pace.' },
        { track: 'chiptune', producer: 'machine', mult: 1.2,  start: 'Chiptune on the radio. The Circular Knitting Machines are spinning in time with the bleeps.', end: 'The chiptune has ended. The Circular Knitting Machines slow to their usual whirr.' },
        { track: 'hiphop',   producer: 'loom',    mult: 1.2,  start: 'Boom bap on the radio. The Hand Looms are clacking on the beat.', end: 'The beat has stopped. The Hand Looms clack at their own pace again.' },
        { track: 'electro',  producer: 'line',    mult: 1.2,  start: 'Four-on-the-floor on the radio. The Factory Lines are running like a dancefloor.', end: 'The electro has faded out. The Factory Lines settle back to normal speed.' },
      ],
    },
    // Time of day. One day is `length` seconds of play; phase 0 is midnight
    // and a new game starts at `offset`. Foot traffic follows it.
    day: {
      length: 480,
      offset: 0.35,
      nightTraffic: 0.4,     // traffic multiplier after dark (a `night` effect raises it, capped at 1)
      lunchTraffic: 1.3,     // and around lunchtime
      lunchFrom: 0.47,
      lunchTo: 0.56,
    },
    // Bulk orders: a customer offers to buy `sizeSeconds` worth of demand in
    // one go at a premium on the base price, if you deliver by the deadline.
    orders: {
      shopLevel: 1,
      interval: 240,         // seconds between offers on average (live mode only)
      offerWindow: 45,       // seconds to accept before they go elsewhere
      deadline: 150,         // seconds to fill the order once accepted
      sizeSeconds: 45,
      minSocks: 20,
      premiumMin: 1.5,
      premiumMax: 2.5,
      customers: [
        { name: 'the football club', icon: '⚽' }, { name: 'the hospital', icon: '🏥' }, { name: 'a wedding party', icon: '💒' },
        { name: 'the primary school', icon: '🏫' }, { name: 'a touring circus', icon: '🎪' }, { name: 'the fire brigade', icon: '🚒' },
        { name: 'the rowing club', icon: '🚣' }, { name: 'a film crew', icon: '🎬' },
      ],
    },
    // Sal's Neighbourhood Insurance: once the shop is big enough he offers
    // it; paying costs `rate` of your assets per second and keeps the
    // vandals away.
    protection: {
      shopLevel: 3,
      rate: 0.00004,
      offerText: 'Sal dropped by for a look round. "Lovely place. Be a shame if anything happened to it." His Neighbourhood Insurance is available at the Bank.',
      lapseText: 'You could not cover Sal\'s insurance. The cover has lapsed, and so has his goodwill.',
    },
    // Dirty cash from the Laundromat. `raidInterval`: expected seconds
    // between police raids while any is held. `fineMult`: they confiscate
    // this multiple of what is still dirty, up to what you have.
    laundering: {
      raidInterval: 300,
      fineMult: 1.5,
    },
    ruin: {
      outrageThreshold: 400,  // outrage points before the devout picket the shop
      outrageDecay: 0.5,      // points lost per second
      grumbleThreshold: 120,  // grumble points before the grannies strike
      happyWage: 0.7,         // wage level below which grannies start to grumble
      grumbleRate: 1,         // points per second at 0% wages (scaled by how far below happyWage)
      grumbleDecay: 1,        // points per second removed at 200% wages (scaled by how far above happyWage)
      unpaidGrumble: 3,       // points per second while wages are unpaid
      seizeDiscount: 0.5,     // seized assets count for this fraction of their price
    },
    factoryLevels,
    producers,
    upgrades: producerUpgrades.concat(otherUpgrades),
    sockLines,
    shopLevels,
    streetLots: 7,
    marketing,
    vehicleTypes,
    research,
    baseKnitTime: 2,         // seconds to hand-knit one sock with no upgrades
    costGrowth: 1.15,        // each additional producer of a type costs this much more
    vehicleCostGrowth: 1.2,  // each additional vehicle of a type costs this much more
    upkeep: {
      minLevel: 0,           // slider range for wages / maintenance, as a multiple of base upkeep
      maxLevel: 2,
      eventInterval: 180,    // seconds between outages per machine type at 100%
      batchFraction: 0.15,   // share of a type's units that go down in one outage
      duration: 40,          // seconds an outage lasts (varies ±25%)
      factorAtZero: 6,       // outages are this many times more frequent at 0%
      factorAtMax: 0.3,      // and this many times at 200%
    },
    newsLimit: 60,           // news items kept in the save
    loadTime: 0.6,           // seconds a vehicle spends loading at the factory
    unloadTime: 0.6,         // seconds a vehicle spends unloading at the shop
    baseTraffic: 0.8,        // pedestrians per second passing the shop with no marketing
    baseInterest: 0.4,       // chance a pedestrian comes in at 100% markup in a kiosk
    minInterest: 0.02,
    maxInterest: 0.9,
    demandElasticity: 2,     // interest scales with markup^-elasticity
    minMarkup: 0.5,
    maxMarkup: 2,
    clearanceRate: 0.25,     // fraction of the base price paid for a clearance dump
    upgradeRevealFraction: 0.2, // an upgrade appears once lifetime earnings reach this fraction of its cost
    prestige: {
      divisor: 1e7,          // heirloom threads = sqrt(lifetime money / divisor)
      bonusPerThread: 0.1,   // +10% production, price and research speed per thread
    },
    maxOfflineSeconds: 8 * 3600,
  };

  if (typeof module === 'object' && module.exports) module.exports = DATA;
  else root.SockData = DATA;
})(this);
