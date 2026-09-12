// Small drawing helpers shared by the factory and street canvases.
(function (root) {
  'use strict';

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

    sky(ctx, W, H, t) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1f3d');
      g.addColorStop(0.6, '#5b3a63');
      g.addColorStop(1, '#8a5a6a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 24; i++) {
        const x = (i * 137.5) % W;
        const y = (i * 61.3) % (H * 0.35);
        ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    },
  };

  root.Sprites = Sprites;
})(this);
