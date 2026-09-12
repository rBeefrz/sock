// Small drawing helpers shared by the factory and street canvases.
(function (root) {
  'use strict';

  // Sky gradient (top, middle, horizon) keyed by phase; linear between keys.
  const SKY = [
    [0.00, ['#2a1f3d', '#5b3a63', '#8a5a6a']], // night
    [0.18, ['#2a1f3d', '#5b3a63', '#8a5a6a']],
    [0.25, ['#5a4a8a', '#e08a6a', '#f5c78a']], // dawn
    [0.33, ['#6fb8ea', '#bfe3f7', '#f6e6c8']], // day
    [0.68, ['#6fb8ea', '#bfe3f7', '#f6e6c8']],
    [0.77, ['#4a3a6a', '#e0705a', '#f2b060']], // dusk
    [0.85, ['#2a1f3d', '#5b3a63', '#8a5a6a']], // night
    [1.00, ['#2a1f3d', '#5b3a63', '#8a5a6a']],
  ];

  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function mix(a, b, k) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
  }

  function skyColours(phase) {
    for (let i = 1; i < SKY.length; i++) {
      if (phase <= SKY[i][0]) {
        const k = (phase - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
        return SKY[i - 1][1].map((c, j) => mix(c, SKY[i][1][j], k));
      }
    }
    return SKY[SKY.length - 1][1].slice();
  }

  const Sprites = {
    // Draw a vehicle as an emoji facing `dir` (+1 right, -1 left) with an
    // optional load label above it.
    vehicle(ctx, type, x, y, dir, load, label) {
      const size = type.id === 'backpack' ? 22 : type.id === 'bicycle' ? 24 : 30;
      ctx.save();
      ctx.translate(x, y);
      // Most emoji vehicles face left by default; flip when heading right.
      if (dir > 0) ctx.scale(-1, 1);
      ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(type.icon, 0, 0);
      ctx.restore();
      if (load > 0) {
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const text = label + ' 🧦';
        const w = ctx.measureText(text).width + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - w / 2, y - size - 16, w, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, x, y - size - 3);
      }
    },

    // A bouncing mishap icon above a stuck vehicle.
    mishap(ctx, x, y, icon, t) {
      const bounce = Math.abs(Math.sin(t * 5)) * 6;
      ctx.font = '18px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(icon, x, y - 40 - bounce);
    },

    // A standing person drawn at (x, y) = feet. `look` may set skin, shirt,
    // pants, hair, and flags: hat (a small fedora), glasses (dark), vest
    // (hi-vis), granny (grey bun and a cardigan). Idles with a slight bob.
    person(ctx, x, y, look, t, scale) {
      const bob = Math.sin(t * 2.2 + x * 0.05) * 0.8;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(scale || 1, scale || 1);
      ctx.strokeStyle = look.pants || '#3c3c50';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, -12); ctx.lineTo(-2.5, 0);
      ctx.moveTo(2, -12); ctx.lineTo(2.5, 0);
      ctx.stroke();
      ctx.fillStyle = look.shirt || '#e26d5a';
      Sprites.roundRect(ctx, -5, -26, 10, 15, 3);
      ctx.fill();
      if (look.vest) {
        ctx.fillStyle = '#ffb000';
        ctx.fillRect(-5, -24, 10, 11);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(-5, -19, 10, 2);
      }
      ctx.fillStyle = look.skin || '#e8b894';
      ctx.beginPath();
      ctx.arc(0, -31, 5, 0, Math.PI * 2);
      ctx.fill();
      if (look.granny) {
        ctx.fillStyle = '#d8d8d8';
        ctx.beginPath();
        ctx.arc(0, -34, 4.5, Math.PI, Math.PI * 2);
        ctx.arc(0, -37, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = look.hair || '#2b1d12';
        ctx.beginPath();
        ctx.arc(0, -32.5, 5, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      if (look.hat) {
        ctx.fillStyle = '#111';
        ctx.fillRect(-7, -36, 14, 2);
        ctx.fillRect(-4, -41, 8, 6);
      }
      if (look.glasses) {
        ctx.fillStyle = '#111';
        ctx.fillRect(-5, -32, 4, 2.5);
        ctx.fillRect(1, -32, 4, 2.5);
      }
      ctx.restore();
    },

    // A placard on a stick held up at (x, y) = feet of the holder.
    placard(ctx, x, y, text, t, i) {
      const wave = Math.sin(t * 3 + (i || 0)) * 3;
      ctx.save();
      ctx.translate(x + 7, y - 30 + wave);
      ctx.strokeStyle = '#8a6a4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 16);
      ctx.stroke();
      ctx.font = 'bold 7px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(-w / 2, -14, w, 14);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-w / 2, -14, w, 14);
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, -7);
      ctx.restore();
    },

    // A speech bubble above a head at (x, y) = feet.
    bubble(ctx, x, y, text) {
      ctx.font = 'bold 8px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      Sprites.roundRect(ctx, x - w / 2, y - 56, w, 13, 4);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y - 49.5);
    },

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    // Pick the largest font size (down to minPx) at which one of the candidate
    // labels fits in maxWidth; sets ctx.font and returns the label that fit.
    fitText(ctx, labels, maxWidth, maxPx, minPx) {
      for (let px = maxPx; px >= minPx; px -= 1) {
        ctx.font = `bold ${px}px system-ui, sans-serif`;
        for (let i = 0; i < labels.length; i++) {
          if (ctx.measureText(labels[i]).width <= maxWidth) return labels[i];
        }
      }
      ctx.font = `bold ${minPx}px system-ui, sans-serif`;
      return labels[labels.length - 1];
    },

    // ---- day and night ----------------------------------------------------
    // `phase` and `day` come from the sim (SockSim.dayPhase / daylight):
    // phase 0 is midnight, 0.5 noon; day is 0 at night and 1 in daylight.
    sky(ctx, W, H, t, phase, day) {
      if (phase === undefined) phase = 0;
      if (day === undefined) day = 0;
      const c = skyColours(phase);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c[0]);
      g.addColorStop(0.6, c[1]);
      g.addColorStop(1, c[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // stars fade out as the day comes
      if (day < 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 24; i++) {
          const x = (i * 137.5) % W;
          const y = (i * 61.3) % (H * 0.35);
          ctx.globalAlpha = (1 - day) * (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i)));
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      // the sun arcs over between dawn and dusk, the moon through the night
      const arc = (from, to, colour, r) => {
        const k = (phase - from) / (to - from);
        if (k < 0 || k > 1) return;
        const x = 30 + k * (W - 60);
        const y = 30 + (1 - Math.sin(k * Math.PI)) * H * 0.35;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      };
      arc(0.2, 0.8, '#ffd23f', 16);
      arc(phase >= 0.75 ? 0.75 : -0.25, phase >= 0.75 ? 1.25 : 0.25, '#f5e9c8', 12);
    },
  };

  root.Sprites = Sprites;
})(this);
