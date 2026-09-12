// Sock Tycoon factory scene. Draws the factory building for the current level,
// the grannies and machines inside, the stock pile, and vehicles at the bay.
(function (root) {
  'use strict';

  // Visual style per factory level (index matches D.factoryLevels).
  const LOOKS = [
    { w: 0.30, h: 0.30, body: '#8a6a4a', roof: '#5a3a22', chimneys: 0, windows: 0 },
    { w: 0.40, h: 0.40, body: '#ecd9bb', roof: '#a8493a', chimneys: 1, windows: 2 },
    { w: 0.50, h: 0.44, body: '#9a7b5b', roof: '#4a3a2a', chimneys: 1, windows: 3 },
    { w: 0.60, h: 0.50, body: '#a85a4a', roof: '#3a2a2a', chimneys: 2, windows: 4, saw: true },
    { w: 0.68, h: 0.56, body: '#8a4a3a', roof: '#2a2222', chimneys: 3, windows: 6, saw: true },
    { w: 0.76, h: 0.64, body: '#6a6a7a', roof: '#2a2a33', chimneys: 5, windows: 8, saw: true },
    { w: 0.80, h: 0.72, body: '#5a6a8a', roof: '#1e2233', chimneys: 2, windows: 10, rocket: true },
  ];

  const SHOW_LEAVE = 0.35;  // fraction of the trip drawn on this canvas when leaving
  const SHOW_RETURN = 0.65; // progress at which a returning vehicle re-enters this canvas

  function createFactory(canvas, getState) {
    const Sim = root.SockSim;
    const D = Sim.data;
    const F = root.Fmt;
    const S = root.Sprites;
    const ctx = canvas.getContext('2d');
    let W = 0;
    let H = 0;
    let t = 0;
    let knitPulse = 0;
    let celebrate = 0;
    let lastLevel = -1;
    const pops = []; // little socks that pop when you knit

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

    // Ground, pavement and road sit at the same heights as on the street canvas,
    // so the road reads as one continuous road between the two scenes.
    function layout(s) {
      const look = LOOKS[Math.min(s.factoryLevel, LOOKS.length - 1)];
      const groundY = H * 0.72;
      const pavementH = H * 0.16;
      const roadY = groundY + pavementH;
      const bx = 14;
      const bw = Math.max(90, look.w * (W - 130));
      const bh = look.h * H;
      const bayX = bx + bw + 46;
      return { look, groundY, pavementH, roadY, laneY: roadY + (H - roadY) * 0.55, bx, bw, bh, top: groundY - bh, bayX };
    }

    function pulse() {
      knitPulse = 0.4;
      pops.push({ x: 0, y: 0, life: 0.8, dx: (Math.random() - 0.5) * 30 });
    }

    function update(dt) {
      t += dt;
      const s = getState();
      if (s.factoryLevel !== lastLevel) {
        if (lastLevel >= 0 && s.factoryLevel > lastLevel) celebrate = 2.5;
        lastLevel = s.factoryLevel;
      }
      if (celebrate > 0) celebrate -= dt;
      if (knitPulse > 0) knitPulse -= dt;
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].life -= dt;
        if (pops[i].life <= 0) pops.splice(i, 1);
      }
    }

    // ---- drawing ----------------------------------------------------------

    function drawGround(L) {
      // factory yard (same grey and height as the street pavement)
      ctx.fillStyle = '#8d8896';
      ctx.fillRect(0, L.groundY, W, L.pavementH);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, L.groundY);
        ctx.lineTo(x, L.roadY);
        ctx.stroke();
      }
      ctx.fillStyle = '#111';
      ctx.fillRect(0, L.groundY - 2, W, 2);
      // road across the whole scene
      ctx.fillStyle = '#5a5566';
      ctx.fillRect(0, L.roadY - 3, W, 3);
      ctx.fillStyle = '#2d2a36';
      ctx.fillRect(0, L.roadY, W, H - L.roadY);
      ctx.strokeStyle = '#d8c66a';
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 14]);
      ctx.beginPath();
      ctx.moveTo(0, L.roadY + (H - L.roadY) / 2);
      ctx.lineTo(W, L.roadY + (H - L.roadY) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // loading bay marking
      ctx.strokeStyle = '#f2c95a';
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(L.bayX - 22, L.groundY + 6, 44, L.pavementH - 12);
      ctx.setLineDash([]);
    }

    function drawSmoke(x, y, rate) {
      const puffs = Math.min(8, 3 + Math.floor(Math.log10(rate + 1)));
      for (let i = 0; i < puffs; i++) {
        const age = ((t * 0.35 + i / puffs) % 1);
        ctx.globalAlpha = (1 - age) * 0.35;
        ctx.fillStyle = '#d8d0e0';
        ctx.beginPath();
        ctx.arc(x + Math.sin((age + i) * 4) * 5 + age * 12, y - age * 44, 1.5 + age * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawBuilding(s, L) {
      const { look, bx, bw, bh, top, groundY } = L;
      const prod = Sim.productionRate(s);
      // chimneys
      const chimW = 10;
      for (let i = 0; i < look.chimneys; i++) {
        const cx = bx + bw * (0.2 + 0.6 * (look.chimneys === 1 ? 0.5 : i / (look.chimneys - 1)));
        ctx.fillStyle = '#4a3a3a';
        ctx.fillRect(cx - chimW / 2, top - 22, chimW, 24);
        if (prod > 0) drawSmoke(cx, top - 24, prod);
      }
      // body
      ctx.fillStyle = look.body;
      ctx.fillRect(bx, top, bw, bh);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, top, bw, bh);
      // roof
      ctx.fillStyle = look.roof;
      if (look.saw) {
        const teeth = Math.max(2, Math.floor(bw / 40));
        const tw = bw / teeth;
        ctx.beginPath();
        ctx.moveTo(bx, top);
        for (let i = 0; i < teeth; i++) {
          ctx.lineTo(bx + i * tw, top - 14);
          ctx.lineTo(bx + (i + 1) * tw, top);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (look.rocket) {
        ctx.fillRect(bx - 4, top - 8, bw + 8, 10);
        ctx.font = '26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const lift = Math.max(0, Math.sin(t * 0.6)) * 30;
        ctx.fillText('🚀', bx + bw * 0.85, top - 8 - lift);
      } else {
        ctx.beginPath();
        ctx.moveTo(bx - 6, top);
        ctx.lineTo(bx + bw / 2, top - Math.min(34, bw * 0.25));
        ctx.lineTo(bx + bw + 6, top);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // upper windows
      const win = 10;
      for (let i = 0; i < look.windows; i++) {
        const wx = bx + 10 + (i * (bw - 20)) / Math.max(1, look.windows) + 2;
        ctx.fillStyle = prod > 0 || s.factoryLevel === 0 ? '#f5d98a' : '#3a2c3c';
        ctx.fillRect(wx, top + 10, win, win * 1.3);
      }
      // cutaway floor: dark interior where the machines live
      const inner = interior(L);
      ctx.fillStyle = 'rgba(30,20,35,0.55)';
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      // door to the bay
      ctx.fillStyle = '#2a1a12';
      ctx.fillRect(bx + bw - 22, groundY - 26, 18, 26);
      // sign
      const sign = Sim.currentFactory(s);
      ctx.fillStyle = '#5a2a1a';
      S.roundRect(ctx, bx + 6, top + 26, bw - 12, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#f2a65a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = S.fitText(ctx, [sign.name.toUpperCase(), 'SOCKS'], bw - 24, 10, 7);
      ctx.fillText(label, bx + bw / 2, top + 34);
    }

    function interior(L) {
      const y = L.top + 46;
      return { x: L.bx + 6, y, w: L.bw - 34, h: L.groundY - y - 4 };
    }

    function drawMachines(s, L) {
      const inner = interior(L);
      const prod = Sim.productionRate(s);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.w, inner.h);
      ctx.clip();

      if (s.factoryLevel === 0 && productionIsZero(s)) {
        // an empty shack: a chair and some yarn
        ctx.font = '18px system-ui, sans-serif';
        const cx = inner.x + inner.w / 2;
        const cy = inner.y + inner.h / 2;
        ctx.fillText('🪑', cx - 14, cy + 4);
        ctx.fillText('🧶', cx + 14, cy + 6);
        ctx.restore();
        return;
      }

      const tile = 20;
      const cols = Math.max(1, Math.floor(inner.w / tile));
      let row = 0;
      let col = 0;
      const placed = [];
      D.producers.forEach((p) => {
        const n = s.producers[p.id];
        if (n <= 0) return;
        if (Sim.onStrike(s, p.id)) {
          // they are outside with placards, not at their needles
          placed.push({ badge: `×${F.fmtInt(n)} ✊ ON STRIKE`, row, col });
          row++;
          return;
        }
        const shown = Math.min(n, p.id === 'granny' ? 12 : 6);
        // dim the same share of the drawn tiles as units that are actually out
        const outTiles = Math.round(shown * Sim.downUnits(s, p.id) / n);
        for (let i = 0; i < shown; i++) {
          placed.push({ icon: p.icon, row, col, i, out: i >= shown - outTiles, outIcon: p.care.outageIcon });
          col++;
          if (col >= cols) { col = 0; row++; }
        }
        placed.push({ badge: '×' + F.fmtInt(n), row, col });
        col = 0;
        row++;
      });
      if (Sim.eventActive(s, 'mafiaGranny')) {
        placed.push({ icon: '🧓', row, col: 0, i: 99, mafia: true });
        placed.push({ badge: 'uninvited', row, col: 1 });
        row++;
      }
      const rowsFit = Math.max(1, Math.floor(inner.h / tile));
      const rowOffset = Math.max(0, row - rowsFit);
      placed.forEach((it) => {
        const x = inner.x + it.col * tile + tile / 2;
        const y = inner.y + (it.row - rowOffset) * tile + tile / 2;
        if (it.badge) {
          ctx.font = 'bold 9px system-ui, sans-serif';
          ctx.fillStyle = '#f2a65a';
          ctx.textAlign = 'left';
          ctx.fillText(it.badge, x - tile / 2 + 2, y);
          ctx.textAlign = 'center';
        } else {
          const bob = prod > 0 && !it.out ? Math.sin(t * 6 + it.i * 1.3 + it.row) * 1.5 : 0;
          ctx.font = '15px system-ui, sans-serif';
          ctx.globalAlpha = it.out ? 0.3 : 1;
          ctx.fillText(it.icon, x, y + bob);
          ctx.globalAlpha = 1;
          if (it.out) {
            ctx.font = '9px system-ui, sans-serif';
            ctx.fillText(it.outIcon, x + 6, y + 6);
          }
          if (it.mafia) {
            ctx.font = '8px system-ui, sans-serif';
            ctx.fillText('🕶️', x, y - 3);
          }
        }
      });
      ctx.restore();
    }

    // You, hand-knitting in the yard, with a progress bar while a sock is on the needles.
    function drawKnitter(s, L) {
      const x = L.bx + 26;
      const y = L.groundY + 14;
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧶', x, y);
      if (s.knitting === null) return;
      const p = Sim.knitProgress(s);
      const bob = Math.sin(t * 14) * 2;
      ctx.fillText('🪡', x + 14, y - 6 + bob);
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 16, y + 12, 32, 6);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 15, y + 13, 30 * p, 4);
    }

    // Striking grannies in the yard, and the uninvited one sneaking socks away.
    const STRIKE_SIGNS = ['FAIR WAGES', 'MORE TEA', 'UNION!', 'NO PAY NO PURL'];
    const STRIKE_SHIRTS = ['#c9a1ff', '#7cd992', '#ff9ecb', '#5aa9e2'];

    function drawTrouble(s, L) {
      const y = L.groundY + 18;
      const striking = D.producers.some((p) => s.producers[p.id] > 0 && Sim.onStrike(s, p.id));
      if (striking) {
        const left = L.bx + 60;
        const right = L.bayX - 70;
        for (let i = 0; i < 4; i++) {
          const x = left + (right - left) * (i / 3) + Math.sin(t * 1.3 + i) * 4;
          S.person(ctx, x, y, { granny: true, shirt: STRIKE_SHIRTS[i], pants: '#5a3a63', skin: '#f5d0b0' }, t + i);
          S.placard(ctx, x, y, STRIKE_SIGNS[i], t, i);
        }
      }
      if (Sim.skimFraction(s) > 0 && s.factoryStock >= 1) {
        const k = (t * 0.5) % 1;
        const x = L.bayX - 50 - k * Math.max(40, L.bayX - 50 - L.bx - 40);
        S.person(ctx, x, y, { granny: true, shirt: '#1a1a1a', pants: '#1a1a1a', glasses: true }, t, 0.95);
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧦', x - 8, y - 18);
      }
    }

    function productionIsZero(s) {
      return Sim.productionRate(s) <= 0;
    }

    function drawStock(s, L) {
      const n = s.factoryStock;
      const x = L.bayX - 36;
      const y = L.groundY - 8;
      const layers = n >= 1 ? Math.min(5, 1 + Math.floor(Math.log10(n + 1) * 1.2)) : 0;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (let r = 0; r < layers; r++) {
        const count = layers - r;
        for (let i = 0; i < count; i++) {
          ctx.fillText('🧦', x + (i - (count - 1) / 2) * 12, y - r * 10);
        }
      }
      pops.forEach((p) => {
        ctx.globalAlpha = p.life;
        ctx.fillText('🧦', x + p.dx * (0.8 - p.life), y - 40 - (0.8 - p.life) * 40);
      });
      ctx.globalAlpha = 1;
    }

    function drawVehicles(s, L) {
      const off = W + 40;
      let waiting = 0;
      s.vehicles.forEach((v) => {
        const type = D.vehicleTypes.find((x) => x.id === v.type);
        let x = null;
        let dir = 1;
        if (v.phase === 'loading') {
          x = L.bayX - waiting * 26;
          waiting++;
        } else if (v.phase === 'toShop' && v.progress < SHOW_LEAVE) {
          x = L.bayX + (v.progress / SHOW_LEAVE) * (off - L.bayX);
        } else if (v.phase === 'toFactory' && v.progress > SHOW_RETURN) {
          x = off - ((v.progress - SHOW_RETURN) / (1 - SHOW_RETURN)) * (off - L.bayX);
          dir = -1;
        }
        if (x === null) return;
        const y = type.id === 'airship' ? L.roadY - 120 + Math.sin(t * 2) * 4 : L.laneY + 12;
        S.vehicle(ctx, type, x, y, dir, v.load, F.fmtInt(v.load));
        if (v.mishap) S.mishap(ctx, x, y, v.mishap, t);
      });
    }

    function drawConfetti(L) {
      if (celebrate <= 0) return;
      const colors = ['#e26d5a', '#5aa9e2', '#7cd992', '#f2c95a', '#c9a1ff'];
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = Math.min(1, celebrate);
        ctx.fillRect(L.bx + ((i * 53) % L.bw), L.top - 10 - ((t * 60 + i * 17) % 70), 4, 6);
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      const s = getState();
      const L = layout(s);
      S.sky(ctx, W, H, t);
      drawGround(L);
      drawBuilding(s, L);
      drawMachines(s, L);
      drawKnitter(s, L);
      drawStock(s, L);
      drawTrouble(s, L);
      drawVehicles(s, L);
      drawConfetti(L);
    }

    function frame(dt) {
      if (W !== canvas.clientWidth) resize();
      update(dt);
      draw();
    }

    function reset() {
      pops.length = 0;
      celebrate = 0;
      lastLevel = -1;
    }

    return { frame, pulse, reset };
  }

  root.createFactory = createFactory;
})(this);
