// Sock Tycoon street scene. Draws the street on a canvas, walks pedestrians
// past the shop, and turns interested ones into real sales via actions.customerVisit.
(function (root) {
  'use strict';

  const NEIGHBOURS = [
    { name: 'BAKERY',  body: '#c98a5b', awning: '#f4d9a6', sign: '#5a3218' },
    { name: 'BARBER',  body: '#7f8fa6', awning: '#e6ecf5', sign: '#243044' },
    { name: 'BOOKS',   body: '#8c6d4f', awning: '#d8c3a5', sign: '#3b2a18' },
    { name: 'SOCKS',   body: '#e9d6b8', awning: '#f2a65a', sign: '#5a2a1a' }, // placeholder, drawn specially
    { name: 'FLORIST', body: '#7aa07a', awning: '#d5efd0', sign: '#24422a' },
    { name: 'CAFÉ',    body: '#a86b6b', awning: '#f2d6d6', sign: '#4a1f1f' },
    { name: 'PETS',    body: '#9a8bb8', awning: '#e6ddf5', sign: '#3a2c55' },
  ];

  const SKIN = ['#f5d0b0', '#e8b894', '#c68f6a', '#a06b48', '#6f4a30'];
  const CLOTHES = ['#e26d5a', '#5aa9e2', '#7cd992', '#f2c95a', '#c9a1ff', '#ff9ecb', '#8ed1d1', '#f0f0f0', '#3c3c50'];
  const HAIR = ['#2b1d12', '#5a3a1e', '#c98d45', '#e8d8a0', '#8a8a8a', '#b03a3a'];

  const VISUAL_RATE_CAP = 2.2;  // pedestrians per second we are willing to draw
  const MAX_PEDS = 60;

  function createStreet(canvas, getState, actions) {
    const Sim = root.SockSim;
    const D = Sim.data;
    const F = root.Fmt;
    const S = root.Sprites;
    const ctx = canvas.getContext('2d');

    let W = 0;
    let H = 0;
    let t = 0;
    const peds = [];
    const floats = [];
    let inside = 0;           // customers currently inside the shop
    let celebrate = 0;        // seconds left of confetti after a shop upgrade
    let lastLevel = -1;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    // ---- geometry ---------------------------------------------------------

    function layout() {
      const lotW = W / D.streetLots;
      const groundY = H * 0.72;
      const pavementH = H * 0.16;
      return { lotW, groundY, pavementH, roadY: groundY + pavementH };
    }

    // Which lots the shop occupies, growing outward from the middle.
    function shopSpan(level) {
      const lots = D.shopLevels[level].lots;
      const centre = Math.floor(D.streetLots / 2);
      const left = Math.max(0, centre - Math.floor((lots - 1) / 2));
      const right = Math.min(D.streetLots - 1, left + lots - 1);
      return { left, right, lots: right - left + 1 };
    }

    function doorX() {
      const { lotW } = layout();
      const span = shopSpan(getState().shopLevel);
      return (span.left + span.lots / 2) * lotW;
    }

    // ---- pedestrians ------------------------------------------------------

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function spawn(batch) {
      if (peds.length >= MAX_PEDS) return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      peds.push({
        x: dir > 0 ? -20 : W + 20,
        dir,
        speed: 32 + Math.random() * 28,
        lane: Math.random(),
        skin: pick(SKIN),
        shirt: pick(CLOTHES),
        pants: pick(CLOTHES),
        hair: pick(HAIR),
        phase: Math.random() * Math.PI * 2,
        state: 'walk',
        decided: false,
        bag: false,
        sad: 0,
        timer: 0,
        batch,
      });
    }

    function addFloat(x, y, text, color) {
      floats.push({ x, y, text, color, life: 1.2 });
    }

    function update(dt) {
      t += dt;
      const s = getState();
      const traffic = Sim.footTraffic(s);
      const visRate = Math.min(traffic, VISUAL_RATE_CAP);
      // Each drawn pedestrian stands in for `batch` customers, rounded to whole people.
      const rawBatch = traffic / visRate;
      const batch = Math.floor(rawBatch) + (Math.random() < rawBatch % 1 ? 1 : 0);
      if (Math.random() < visRate * dt) spawn(Math.max(1, batch));

      if (s.shopLevel !== lastLevel) {
        if (lastLevel >= 0 && s.shopLevel > lastLevel) celebrate = 2.5;
        lastLevel = s.shopLevel;
      }
      if (celebrate > 0) celebrate -= dt;

      const door = doorX();
      const chance = Sim.interest(s);
      inside = 0;
      const raid = Sim.eventActive(s, 'bikers');
      if (raid && Math.random() < 6 * dt) addFloat(door + (Math.random() - 0.5) * 40, layout().groundY - 20, '🧦', '#fff');

      for (let i = peds.length - 1; i >= 0; i--) {
        const p = peds[i];
        if (p.state === 'walk') {
          if (raid && !p.flee) {
            // everyone runs away from the shop
            p.flee = true;
            p.decided = true;
            p.dir = p.x < door ? -1 : 1;
            p.speed = 120 + Math.random() * 40;
            p.sad = 0;
          }
          p.x += p.dir * p.speed * dt;
          if (!p.decided && Math.abs(p.x - door) < 8) {
            p.decided = true;
            if (Math.random() < chance) {
              p.state = 'inside';
              p.timer = 0.8 + Math.random() * 0.9;
              p.x = door;
            }
          }
          if (p.sad > 0) p.sad -= dt;
          if (p.x < -40 || p.x > W + 40) peds.splice(i, 1);
        } else if (p.state === 'inside') {
          inside += 1;
          p.timer -= dt;
          if (p.timer <= 0) {
            const r = actions.customerVisit(p.batch);
            p.state = 'walk';
            if (r.sold > 0) {
              p.bag = true;
              addFloat(door, layout().groundY - 30, '+' + F.money(r.earned), '#7cd992');
            } else {
              p.sad = 2.5;
              addFloat(door, layout().groundY - 30, '🧦?', '#a89bb8');
            }
          }
        }
      }

      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.life -= dt;
        f.y -= 28 * dt;
        if (f.life <= 0) floats.splice(i, 1);
      }
    }

    // ---- drawing ----------------------------------------------------------

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // Pick the largest font size (down to minPx) at which one of the candidate
    // labels fits in maxWidth; returns the label that fit.
    function fitText(labels, maxWidth, maxPx, minPx) {
      for (let px = maxPx; px >= minPx; px -= 1) {
        ctx.font = `bold ${px}px system-ui, sans-serif`;
        for (let i = 0; i < labels.length; i++) {
          if (ctx.measureText(labels[i]).width <= maxWidth) return labels[i];
        }
      }
      ctx.font = `bold ${minPx}px system-ui, sans-serif`;
      return labels[labels.length - 1];
    }

    // Windows glow after dark and show as glass by day.
    const WINDOW_LIT = '#f5d98a';
    const WINDOW_DARK = '#3a2c3c';
    const WINDOW_GLASS = '#9ccbe6';
    let daylight = 1;

    function drawGround() {
      const { groundY, pavementH, roadY } = layout();
      ctx.fillStyle = '#8d8896';
      ctx.fillRect(0, groundY, W, pavementH);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x, roadY);
        ctx.stroke();
      }
      ctx.fillStyle = '#5a5566';
      ctx.fillRect(0, roadY - 3, W, 3);
      ctx.fillStyle = '#2d2a36';
      ctx.fillRect(0, roadY, W, H - roadY);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, groundY - 2, W, 2);
      ctx.strokeStyle = '#d8c66a';
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 14]);
      ctx.beginPath();
      ctx.moveTo(0, roadY + (H - roadY) / 2);
      ctx.lineTo(W, roadY + (H - roadY) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The lot a rival would open in: two doors to the right, or the left if
    // the shop has grown over that side.
    function rivalLot(span) {
      if (span.right + 2 < D.streetLots) return span.right + 2;
      if (span.left - 2 >= 0) return span.left - 2;
      return span.right + 1 < D.streetLots ? span.right + 1 : span.left - 1;
    }

    function drawRival(lot) {
      const { lotW, groundY } = layout();
      const x = lot * lotW;
      const h = H * 0.42 + ((lot * 37) % 3) * 8;
      const top = groundY - h;
      const awnY = groundY - h * 0.45;
      // a garish banner over the old sign, and a SALE flash in the window
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x + 2, awnY - 20, lotW - 4, 16);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, awnY - 20, lotW - 4, 16);
      ctx.fillStyle = '#a0261a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = fitText(['SOCKS 4 LESS', '4 LESS'], lotW - 10, 10, 6);
      ctx.fillText(label, x + lotW / 2, awnY - 12);
      ctx.fillStyle = '#ff7bac';
      ctx.fillRect(x + 3, awnY, lotW - 6, 8);
      if (Math.sin(t * 4) > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.fillText('SALE!', x + lotW * 0.35, awnY + 12 + h * 0.2);
      }
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('🧦', x + lotW * 0.35, awnY + 12 + h * 0.32);
    }

    function drawNeighbour(lot) {
      const { lotW, groundY } = layout();
      const n = NEIGHBOURS[lot];
      const x = lot * lotW;
      const h = H * 0.42 + ((lot * 37) % 3) * 8;
      const top = groundY - h;
      ctx.fillStyle = n.body;
      ctx.fillRect(x, top, lotW, h);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, lotW, h);
      // roofline
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, top, lotW, 5);
      // upstairs windows (lit)
      const win = Math.max(8, lotW * 0.16);
      const cols = Math.max(1, Math.floor(lotW / (win * 2)));
      const startX = x + (lotW - cols * win * 2 + win) / 2;
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = daylight > 0.5 ? WINDOW_GLASS : (c + lot) % 3 === 0 ? WINDOW_DARK : WINDOW_LIT;
        ctx.fillRect(startX + c * win * 2, top + 16, win, win * 1.3);
      }
      // awning
      const awnY = groundY - h * 0.45;
      ctx.fillStyle = n.awning;
      ctx.fillRect(x + 3, awnY, lotW - 6, 8);
      // shop window and door
      ctx.fillStyle = '#5b4a6b';
      ctx.fillRect(x + lotW * 0.1, awnY + 12, lotW * 0.5, h * 0.45 - 12);
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(x + lotW * 0.68, awnY + 12, lotW * 0.22, h * 0.45 - 12);
      // sign
      ctx.fillStyle = n.sign;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = fitText([n.name, n.name.slice(0, 4)], lotW - 8, 13, 7);
      ctx.fillText(label, x + lotW / 2, awnY - 8);
    }

    function drawShop(s) {
      const { lotW, groundY } = layout();
      const span = shopSpan(s.shopLevel);
      const x = span.left * lotW;
      const w = span.lots * lotW;
      const level = s.shopLevel;
      const h = H * (0.46 + level * 0.04);
      const top = groundY - h;
      const shop = Sim.currentShop(s);

      // building
      ctx.fillStyle = '#ecd9bb';
      ctx.fillRect(x, top, w, h);
      ctx.fillStyle = '#c9583f';
      ctx.fillRect(x, top, w, 6);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, w, h);
      // upper windows
      if (level >= 1) {
        const win = Math.max(9, lotW * 0.16);
        const cols = Math.max(1, Math.floor(w / (win * 2)));
        const startX = x + (w - cols * win * 2 + win) / 2;
        const rows = level >= 3 ? 2 : 1;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.fillStyle = daylight > 0.5 ? WINDOW_GLASS : WINDOW_LIT;
            ctx.fillRect(startX + c * win * 2, top + 16 + r * (win * 1.8), win, win * 1.3);
          }
        }
      }
      // striped awning
      const awnY = groundY - h * 0.45;
      const stripe = 10;
      for (let sx = x + 3; sx < x + w - 3; sx += stripe) {
        ctx.fillStyle = Math.floor((sx - x) / stripe) % 2 === 0 ? '#e26d5a' : '#f7f2e8';
        ctx.fillRect(sx, awnY, Math.min(stripe, x + w - 3 - sx), 10);
      }
      // sign
      const signH = Math.min(30, 14 + level * 3);
      ctx.fillStyle = '#5a2a1a';
      roundRect(x + 6, awnY - signH - 6, w - 12, signH, 4);
      ctx.fill();
      ctx.fillStyle = '#f2a65a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const signLabel = fitText([shop.name.toUpperCase(), 'SOCKS'], w - 20, signH - 6, 7);
      ctx.fillText(signLabel, x + w / 2, awnY - signH / 2 - 6);

      // display window(s) with socks in them
      const door = doorX();
      const doorW = Math.min(30, lotW * 0.4);
      const frontTop = awnY + 14;
      const frontH = groundY - frontTop;
      const winLeftW = door - doorW / 2 - x - 10;
      const winRightW = x + w - (door + doorW / 2) - 10;
      ctx.fillStyle = '#7fb0c8';
      if (winLeftW > 8) ctx.fillRect(x + 6, frontTop, winLeftW, frontH - 8);
      if (winRightW > 8) ctx.fillRect(door + doorW / 2 + 4, frontTop, winRightW, frontH - 8);
      // socks on display, more when stock is higher
      const stockIcons = s.socks >= 1 ? Math.min(2 + level * 2, 1 + Math.floor(Math.log10(s.socks + 1) * 2)) : 0;
      ctx.font = `${Math.max(10, Math.min(16, lotW * 0.2))}px system-ui, sans-serif`;
      for (let i = 0; i < stockIcons; i++) {
        const side = i % 2 === 0 ? 'L' : 'R';
        const k = Math.floor(i / 2);
        const wx = side === 'L' ? x + 6 + 10 + (k * 18) % Math.max(18, winLeftW - 12) : door + doorW / 2 + 14 + (k * 18) % Math.max(18, winRightW - 12);
        if ((side === 'L' && winLeftW <= 8) || (side === 'R' && winRightW <= 8)) continue;
        ctx.fillText('🧦', wx, frontTop + frontH / 2);
      }
      // a brick through the window
      if (Sim.eventActive(s, 'vandals') && winLeftW > 8) {
        const cx = x + 6 + winLeftW * 0.5;
        const cy = frontTop + frontH * 0.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + 0.3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * (14 + (i % 3) * 6), cy + Math.sin(a) * (10 + (i % 2) * 6));
          ctx.stroke();
        }
        ctx.fillStyle = '#a0261a';
        ctx.fillRect(cx - 4, cy - 2, 8, 5);
      }
      // door
      ctx.fillStyle = inside > 0 ? '#ffe9a8' : '#4a3a2a';
      ctx.fillRect(door - doorW / 2, frontTop, doorW, frontH);
      ctx.fillStyle = '#2a1a12';
      ctx.fillRect(door - 1, frontTop, 2, frontH);
      // open sign
      ctx.fillStyle = s.socks >= 1 ? '#7cd992' : '#e0685f';
      const doorLabel = s.socks >= 1 ? fitText(['OPEN', ''], doorW - 2, 8, 6) : fitText(['SOLD OUT', 'OUT', ''], doorW - 2, 8, 6);
      if (doorLabel) ctx.fillText(doorLabel, door, frontTop + 8);

      if (celebrate > 0) {
        for (let i = 0; i < 40; i++) {
          const px = x + ((i * 53) % w);
          const py = top - 10 - ((t * 60 + i * 17) % 70);
          ctx.fillStyle = CLOTHES[i % CLOTHES.length];
          ctx.globalAlpha = Math.min(1, celebrate);
          ctx.fillRect(px, py, 4, 6);
        }
        ctx.globalAlpha = 1;
      }
    }

    function drawPed(p) {
      const { groundY, pavementH } = layout();
      const y = groundY + 8 + p.lane * (pavementH - 16);
      const swing = Math.sin(t * 9 + p.phase) * 5;
      const scale = 0.85 + p.lane * 0.3;
      ctx.save();
      ctx.translate(p.x, y);
      ctx.scale(scale, scale);
      // legs
      ctx.strokeStyle = p.pants;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, -12); ctx.lineTo(-2 + swing * 0.5, 0);
      ctx.moveTo(2, -12); ctx.lineTo(2 - swing * 0.5, 0);
      ctx.stroke();
      // body
      ctx.fillStyle = p.shirt;
      roundRect(-5, -26, 10, 15, 3);
      ctx.fill();
      // head
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(0, -31, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.arc(0, -32.5, 5, Math.PI, Math.PI * 2);
      ctx.fill();
      // bag
      if (p.bag) {
        ctx.fillStyle = '#f2a65a';
        ctx.fillRect(p.dir * 6 - 3, -16, 6, 8);
        ctx.strokeStyle = '#5a2a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.dir * 6 - 3, -16, 6, 8);
      }
      if (p.sad > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        roundRect(-9, -50, 18, 12, 4);
        ctx.fill();
        ctx.fillStyle = '#5a2a1a';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧦?', 0, -44);
      }
      ctx.restore();
    }

    // ---- trouble on the street ------------------------------------------

    const PLACARDS = ['REPENT', 'NO!', '✝ ✝ ✝', 'SINFUL SOCKS', 'THINK OF THE ANKLES'];
    const PICKET_SHIRTS = ['#3c3c50', '#5a3a63', '#f0f0f0', '#3c3c50', '#8a5a6a'];

    function drawTrouble(s) {
      const { groundY, pavementH, roadY } = layout();
      const door = doorX();
      const y = groundY + 8 + 0.55 * (pavementH - 16);
      if (Sim.eventActive(s, 'picket')) {
        for (let i = 0; i < 5; i++) {
          const x = door + (i - 2) * 22 + Math.sin(t * 1.5 + i) * 6;
          S.person(ctx, x, y, { skin: SKIN[i % SKIN.length], shirt: PICKET_SHIRTS[i], pants: '#2a2a33', hair: HAIR[(i * 2) % HAIR.length] }, t + i);
          S.placard(ctx, x, y, PLACARDS[i], t, i);
        }
      }
      // the doorman, once you have one: black coat, earpiece, arms folded
      const guarded = Sim.hasSecurity(s);
      if (guarded) {
        const x = door - 26;
        S.person(ctx, x, y - 2, { skin: SKIN[3], shirt: '#1a1a1a', pants: '#1a1a1a', hair: '#111', glasses: true }, t, 1.2);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(x + 5, y - 38, 2, 2);
      }
      if (Sim.eventActive(s, 'enforcer')) {
        // kept at arm's length across the road when there is someone on the door
        const x = guarded ? door + 96 : door + 30;
        S.person(ctx, x, y - 2, { skin: '#e8b894', shirt: '#1a1a1a', pants: '#1a1a1a', hat: true, glasses: true }, t, 1.15);
        if (Math.sin(t * 0.7) > 0.6) S.bubble(ctx, x, y - 6, guarded ? 'Hmph.' : 'Nice shop.');
      }
      if (Sim.eventActive(s, 'police')) {
        const x = door + 34;
        S.person(ctx, x, y - 2, { skin: '#c68f6a', shirt: '#1a2a55', pants: '#1a2a55', hat: true }, t, 1.1);
        S.person(ctx, x + 18, y - 2, { skin: '#f5d0b0', shirt: '#1a2a55', pants: '#1a2a55', hat: true }, t + 2, 1.1);
        const laneY = roadY + (H - roadY) * 0.55;
        const vx = door + 80;
        S.vehicle(ctx, { id: 'police', icon: '🚔' }, vx, laneY + 12, -1, 0, '');
        // blue lights
        ctx.fillStyle = Math.sin(t * 12) > 0 ? '#5ad2f4' : '#ff7bac';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(vx, laneY - 22, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillRect(door - 22, y - 60, 44, 11);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.strokeRect(door - 22, y - 60, 44, 11);
        ctx.fillStyle = '#1a2a55';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('POLICE - CLOSED', door, y - 54.5);
      }
      if (s.order) {
        // the customer waits by the door with a clipboard, counting what is still owed
        const x = door + (Sim.hasSecurity(s) ? 40 : 26);
        S.person(ctx, x, y - 2, { skin: SKIN[1], shirt: '#f2c95a', pants: '#3c3c50', hair: HAIR[2] }, t, 1.05);
        S.bubble(ctx, x, y - 2, `${s.order.icon} ${F.fmtInt(s.order.socks - s.order.filled)} to go`);
      }
      if (Sim.eventActive(s, 'bailiffs')) {
        const x = door + 30;
        S.person(ctx, x, y - 2, { skin: '#c68f6a', shirt: '#7f8fa6', pants: '#3c3c50', vest: true }, t, 1.1);
        if (guarded && Math.sin(t * 0.9) > 0.5) S.bubble(ctx, x, y - 6, 'Just a minute, sir.');
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📋', x + 9, y - 24);
        const laneY = roadY + (H - roadY) * 0.55;
        const vx = door + 72;
        S.vehicle(ctx, { id: 'van', icon: '🚐' }, vx, laneY + 12, -1, 0, '');
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.fillStyle = '#111';
        ctx.fillRect(vx - 24, laneY - 26, 48, 11);
        ctx.fillStyle = '#ffb000';
        ctx.fillText('BAILIFFS', vx, laneY - 20.5);
      }
    }

    function drawBikers(s) {
      if (!Sim.eventActive(s, 'bikers')) return;
      const { roadY } = layout();
      const laneY = roadY + (H - roadY) * 0.55;
      for (let i = 0; i < 4; i++) {
        const x = ((t * 380 + i * 160) % (W + 320)) - 160;
        const y = laneY + 12 + (i % 2) * 8;
        for (let k = 1; k <= 4; k++) {
          ctx.globalAlpha = 0.25 - k * 0.05;
          ctx.fillStyle = '#d8d0e0';
          ctx.beginPath();
          ctx.arc(x - k * 12, y - 8 + Math.sin(t * 10 + k) * 2, 4 + k, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        S.vehicle(ctx, { id: 'bike', icon: '🏍️' }, x, y, 1, 0, '');
      }
    }

    const SHOW_ARRIVE = 0.65; // progress at which an arriving vehicle enters this canvas
    const SHOW_LEAVE = 0.35;  // fraction of the return trip drawn before leaving

    function drawVehicles(s) {
      const { roadY } = layout();
      const door = doorX();
      const laneY = roadY + (H - roadY) * 0.55;
      let parked = 0;
      s.vehicles.forEach((v) => {
        const type = D.vehicleTypes.find((x) => x.id === v.type);
        let x = null;
        let dir = 1;
        if (v.phase === 'toShop' && v.progress >= SHOW_ARRIVE) {
          x = -40 + ((v.progress - SHOW_ARRIVE) / (1 - SHOW_ARRIVE)) * (door + 40);
        } else if (v.phase === 'unloading') {
          x = door + parked * 30;
          parked++;
        } else if (v.phase === 'toFactory' && v.progress <= SHOW_LEAVE) {
          x = door - (v.progress / SHOW_LEAVE) * (door + 40);
          dir = -1;
        }
        if (x === null) return;
        const y = type.id === 'airship' ? roadY - 120 + Math.sin(t * 2) * 4 : laneY + 12;
        S.vehicle(ctx, type, x, y, dir, v.load, F.fmtInt(v.load));
        if (v.mishap) S.mishap(ctx, x, y, v.mishap, t);
        if (v.phase === 'unloading') {
          // socks hopping from the vehicle to the door
          ctx.font = '12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const k = (t * 3) % 1;
          ctx.fillText('🧦', x + (door - x) * k, laneY - 10 - Math.sin(k * Math.PI) * 30);
        }
      });
    }

    function drawFloats() {
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      floats.forEach((f) => {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      });
      ctx.globalAlpha = 1;
    }

    function draw() {
      const s = getState();
      const span = shopSpan(s.shopLevel);
      const phase = Sim.dayPhase(s);
      daylight = Sim.daylight(phase);
      S.sky(ctx, W, H, t, phase, daylight);
      for (let lot = 0; lot < D.streetLots; lot++) {
        if (lot < span.left || lot > span.right) drawNeighbour(lot);
      }
      if (Sim.eventActive(s, 'rival')) drawRival(rivalLot(span));
      drawShop(s);
      drawGround();
      drawVehicles(s);
      peds
        .filter((p) => p.state === 'walk')
        .sort((a, b) => a.lane - b.lane)
        .forEach(drawPed);
      drawTrouble(s);
      drawBikers(s);
      drawFloats();
    }

    function frame(dt) {
      if (W !== canvas.clientWidth) resize();
      update(dt);
      draw();
    }

    // Forget everyone on the street (after a reset or retirement).
    function reset() {
      peds.length = 0;
      floats.length = 0;
      inside = 0;
      celebrate = 0;
      lastLevel = -1;
    }

    return { frame, reset, get inside() { return inside; } };
  }

  root.createStreet = createStreet;
})(this);
