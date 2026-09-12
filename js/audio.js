// Sock Tycoon soundtrack: Sock Radio. Four short looping tracks synthesised
// with the Web Audio API, so there are no audio files. Each track is data:
// a chord list plus layers of notes, chords, arpeggios or drums. Layers carry
// a tier and join in as the empire grows (tier = (factory + shop level) / 2).
(function (root) {
  'use strict';

  const KEY = 'sockTycoon.audio';
  const LOOKAHEAD = 0.18;     // seconds of notes scheduled ahead of time
  const TICK_MS = 40;
  const MINUTES_PER_TRACK = 3; // the radio moves on after about this long
  const MAX_TIER = 3;

  // ---- musical building blocks ------------------------------------------

  const ch = (root, tones) => ({ root, tones });
  const C = ch(36, [60, 64, 67]);
  const G = ch(31, [55, 59, 62]);
  const Am = ch(33, [57, 60, 64]);
  const Em = ch(28, [52, 55, 59]);
  const F = ch(29, [53, 57, 60]);
  const Dm = ch(38, [50, 53, 57]);
  const Bb = ch(34, [46, 50, 53]);
  const Gm = ch(31, [43, 46, 50]);
  const A = ch(33, [45, 49, 52]);

  // Drum kit styles: how the kick, snare and hats are synthesised.
  const KITS = {
    chip: { kickFrom: 150, kickTo: 45, kickDur: 0.28, snareFreq: 1800, snareDur: 0.16, snareTone: 57, hatFreq: 7000, hatDur: 0.045, openDur: 0.12 },
    electro: { kickFrom: 190, kickTo: 38, kickDur: 0.42, snareFreq: 1400, snareDur: 0.22, snareTone: 0, clap: true, hatFreq: 8000, hatDur: 0.04, openDur: 0.2 },
    boom: { kickFrom: 120, kickTo: 42, kickDur: 0.35, snareFreq: 2200, snareDur: 0.18, snareTone: 60, hatFreq: 6000, hatDur: 0.05, openDur: 0.16 },
  };

  // Layer kinds:
  //   notes  – bars of [step, midi, length]; `relative` makes midi an offset from the chord root
  //   chord  – bars of [step, length]; plays every chord tone, shifted by `octave` semitones
  //   arp    – one note every `every` steps, `pattern` indexes [t0, t1, t2, t0+12, t1+12]
  //   drums  – bars of { kick, snare, hat, open } step lists, optional vinyl `crackle`
  const TRACKS = [
    {
      id: 'chiptune', name: 'Cottage Chiptune', tag: 'Eight bits and a ball of yarn',
      bpm: 112, stepsPerBar: 16, swing: 0,
      chords: [C, Am, F, G],
      layers: {
        bass: { label: 'Bass', tier: 0, level: 0.28, kind: 'notes', relative: true, gate: 1.6,
          voice: { type: 'triangle' },
          bars: [[[0, 0, 1], [3, 12, 1], [6, 7, 1], [8, 0, 1], [11, 12, 1], [14, 7, 1]]] },
        lead: { label: 'Lead', tier: 0, level: 0.11, lowpass: 2400, kind: 'notes', gate: 0.8,
          voice: { type: 'square' },
          bars: [
            [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 79, 2], [10, 76, 2], [12, 74, 4]],
            [[0, 72, 2], [2, 76, 2], [4, 81, 4], [8, 76, 2], [10, 72, 2], [12, 71, 4]],
            [[0, 69, 2], [2, 72, 2], [4, 77, 4], [8, 81, 4], [12, 77, 2], [14, 76, 2]],
            [[0, 74, 4], [4, 79, 2], [6, 83, 2], [8, 86, 4], [12, 83, 2], [14, 79, 2]],
            [[0, 76, 2], [2, 79, 2], [4, 84, 2], [6, 88, 2], [8, 86, 4], [12, 84, 4]],
            [[0, 83, 2], [2, 81, 2], [4, 79, 4], [8, 76, 2], [10, 79, 2], [12, 81, 4]],
            [[0, 77, 4], [4, 81, 2], [6, 84, 2], [8, 81, 4], [12, 77, 4]],
            [[0, 79, 2], [2, 77, 2], [4, 76, 2], [6, 74, 2], [8, 71, 4], [12, 74, 4]],
          ] },
        hats: { label: 'Hats', tier: 1, level: 0.16, kind: 'drums', kit: 'chip',
          bars: [{ hat: [0, 4, 8, 12], open: [2, 6, 10, 14] }] },
        kit: { label: 'Drums', tier: 2, level: 0.5, kind: 'drums', kit: 'chip',
          bars: [{ kick: [0, 8], snare: [4, 12] }, { kick: [0, 8], snare: [4, 12] }, { kick: [0, 8], snare: [4, 12] }, { kick: [0, 7, 8, 10], snare: [4, 12] }] },
        arp: { label: 'Arp', tier: 3, level: 0.05, lowpass: 3200, kind: 'arp', every: 2, octave: 12, gate: 0.9,
          voice: { type: 'square' }, pattern: [0, 1, 2, 3, 2, 1, 0, 1] },
      },
    },
    {
      id: 'electro', name: 'Loom Electro', tag: 'Four on the floor, socks on the feet',
      bpm: 126, stepsPerBar: 16, swing: 0,
      chords: [Am, F, C, G],
      layers: {
        bass: { label: 'Bass', tier: 0, level: 0.24, lowpass: 750, kind: 'notes', relative: true, gate: 0.7,
          voice: { type: 'sawtooth', attack: 0.004, decay: 0.09, sustain: 0.45 },
          bars: [[[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 12, 1]]] },
        lead: { label: 'Lead', tier: 0, level: 0.08, lowpass: 2600, kind: 'notes', gate: 0.75,
          voice: { type: 'sawtooth', type2: 'square', detune: 9, mix2: 0.5, attack: 0.01, release: 0.08 },
          bars: [
            [[0, 81, 1], [2, 81, 1], [3, 84, 1], [6, 83, 2], [8, 81, 2], [12, 76, 2], [14, 79, 2]],
            [[0, 77, 1], [2, 77, 1], [3, 81, 1], [6, 84, 2], [8, 81, 2], [12, 77, 2], [14, 79, 2]],
            [[0, 79, 1], [2, 79, 1], [3, 84, 1], [6, 83, 2], [8, 79, 2], [12, 76, 2], [14, 74, 2]],
            [[0, 74, 1], [2, 74, 1], [3, 79, 1], [6, 83, 2], [8, 79, 2], [12, 74, 2], [14, 76, 2]],
            [[0, 88, 2], [4, 84, 2], [6, 83, 1], [8, 81, 4], [12, 76, 2], [14, 79, 2]],
            [[0, 84, 2], [4, 81, 2], [6, 81, 1], [8, 77, 4], [12, 79, 2], [14, 81, 2]],
            [[0, 84, 2], [4, 79, 2], [6, 76, 1], [8, 79, 4], [12, 83, 2], [14, 84, 2]],
            [[0, 86, 2], [4, 83, 2], [6, 81, 1], [8, 79, 4], [12, 76, 2], [14, 74, 2]],
          ] },
        drums: { label: 'Drums', tier: 1, level: 0.55, kind: 'drums', kit: 'electro',
          bars: [{ kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 4, 8, 12], open: [2, 6, 10, 14] },
            { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 4, 8, 12], open: [2, 6, 10, 14] },
            { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 4, 8, 12], open: [2, 6, 10, 14] },
            { kick: [0, 4, 8, 12, 14], snare: [4, 12, 15], hat: [0, 4, 8, 12], open: [2, 6, 10, 14] }] },
        pad: { label: 'Pad', tier: 2, level: 0.07, lowpass: 1000, kind: 'chord', octave: 0, gate: 1,
          voice: { type: 'sawtooth', type2: 'sawtooth', detune: 14, mix2: 1, attack: 0.25, release: 0.3 },
          bars: [[[0, 16]]] },
        arp: { label: 'Arp', tier: 3, level: 0.045, lowpass: 3000, kind: 'arp', every: 1, octave: 12, gate: 0.6,
          voice: { type: 'square', attack: 0.003, decay: 0.06, sustain: 0.3 }, pattern: [0, 2, 1, 3, 0, 2, 1, 4] },
      },
    },
    {
      id: 'hiphop', name: 'Boom Bap Bobbin', tag: 'Dusty beats from the stock room',
      bpm: 90, stepsPerBar: 16, swing: 0.3,
      chords: [Dm, Bb, Gm, A],
      layers: {
        drums: { label: 'Drums', tier: 0, level: 0.6, kind: 'drums', kit: 'boom', crackle: 0.05,
          bars: [{ kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12], open: [14] },
            { kick: [0, 3, 10], snare: [4, 12], hat: [0, 2, 4, 8, 10, 12, 14], open: [6] }] },
        bass: { label: 'Bass', tier: 0, level: 0.36, kind: 'notes', relative: true, gate: 0.9,
          voice: { type: 'sine', type2: 'triangle', mix2: 0.35, attack: 0.01, release: 0.08 },
          bars: [[[0, 0, 3], [6, 0, 1], [8, 0, 2], [11, 7, 1], [14, 0, 1]]] },
        keys: { label: 'Keys', tier: 1, level: 0.12, lowpass: 1800, kind: 'chord', octave: 12, gate: 0.9,
          voice: { type: 'triangle', type2: 'sine', semis2: 12, mix2: 0.4, attack: 0.01, decay: 0.3, sustain: 0.3 },
          bars: [[[2, 2], [10, 2]], [[2, 2], [7, 1], [10, 2]]] },
        lead: { label: 'Flute', tier: 2, level: 0.11, kind: 'notes', gate: 0.85,
          voice: { type: 'sine', type2: 'triangle', mix2: 0.3, attack: 0.03, release: 0.1 },
          bars: [
            [[0, 74, 3], [4, 77, 2], [8, 81, 4]],
            [[2, 82, 2], [6, 81, 2], [8, 77, 4]],
            [[0, 79, 2], [4, 82, 2], [8, 86, 3], [12, 84, 2]],
            [[0, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 2]],
            [[0, 74, 2], [4, 74, 2], [6, 77, 2], [8, 81, 4]],
            [[0, 86, 2], [4, 84, 2], [8, 82, 4]],
            [[0, 79, 3], [4, 82, 1], [6, 84, 1], [8, 86, 4]],
            [[0, 85, 2], [4, 81, 2], [8, 79, 4], [12, 77, 2]],
          ] },
        bells: { label: 'Bells', tier: 3, level: 0.05, kind: 'arp', every: 4, octave: 24, gate: 1.5,
          voice: { type: 'sine', attack: 0.003, decay: 0.25, sustain: 0.2 }, pattern: [2, 1, 0, 1] },
      },
    },
    {
      id: 'waltz', name: 'Woollen Waltz', tag: 'Strings, in three-quarter time',
      bpm: 132, stepsPerBar: 12, swing: 0,
      chords: [C, G, Am, Em, F, C, F, G],
      layers: {
        cello: { label: 'Cello', tier: 0, level: 0.3, lowpass: 1200, kind: 'notes', relative: true, gate: 0.9,
          voice: { type: 'triangle', type2: 'sine', mix2: 0.5, attack: 0.02, release: 0.15 },
          bars: [[[0, 0, 4]]] },
        pizz: { label: 'Pizzicato', tier: 0, level: 0.12, lowpass: 2000, kind: 'chord', octave: 0, gate: 0.6,
          voice: { type: 'triangle', attack: 0.005, decay: 0.1, sustain: 0.2 },
          bars: [[[4, 2], [8, 2]]] },
        violin: { label: 'Violin', tier: 1, level: 0.09, lowpass: 2000, kind: 'notes', gate: 0.95,
          voice: { type: 'sawtooth', type2: 'sawtooth', detune: 6, mix2: 0.6, attack: 0.06, release: 0.12 },
          bars: [
            [[0, 79, 4], [4, 76, 4], [8, 79, 4]],
            [[0, 83, 8], [8, 79, 4]],
            [[0, 81, 4], [4, 84, 4], [8, 81, 4]],
            [[0, 79, 8], [8, 76, 4]],
            [[0, 77, 4], [4, 81, 4], [8, 84, 4]],
            [[0, 79, 4], [4, 84, 2], [6, 83, 2], [8, 81, 4]],
            [[0, 77, 4], [4, 81, 4], [8, 74, 4]],
            [[0, 76, 4], [4, 74, 4], [8, 71, 4]],
          ] },
        harp: { label: 'Harp', tier: 2, level: 0.06, kind: 'arp', every: 2, octave: 12, gate: 1.2,
          voice: { type: 'sine', attack: 0.003, decay: 0.2, sustain: 0.25 }, pattern: [0, 1, 2, 3, 2, 1] },
        strings: { label: 'Strings', tier: 3, level: 0.05, lowpass: 900, kind: 'chord', octave: 0, gate: 1,
          voice: { type: 'sawtooth', type2: 'sawtooth', detune: 10, mix2: 1, attack: 0.4, release: 0.5 },
          bars: [[[0, 12]]] },
      },
    },
  ];

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function tierFor(s) {
    return Math.min(MAX_TIER, Math.floor((s.factoryLevel + s.shopLevel) / 2));
  }

  function loadPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* ignore */ }
    return {
      on: p.on !== false,
      vol: typeof p.vol === 'number' ? p.vol : 0.5,
      track: typeof p.track === 'number' ? ((p.track % TRACKS.length) + TRACKS.length) % TRACKS.length : 0,
      min: !!p.min,
    };
  }

  function createAudio(getState) {
    const prefs = loadPrefs();
    const AC = root.AudioContext || root.webkitAudioContext;
    let ctx = null;
    let master = null;
    let noise = null;
    let timer = null;
    let track = TRACKS[prefs.track];
    let buses = null;
    let step = 0;
    let stepDur = 0;
    let nextTime = 0;
    let tier = -1;
    let loops = 0;

    function savePrefs() {
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
    }

    function setup() {
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = prefs.vol;
      master.connect(comp);
      const len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }

    function makeBus(layer) {
      const g = ctx.createGain();
      g.gain.value = 0;
      let out = g;
      if (layer.lowpass) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = layer.lowpass;
        g.connect(f);
        out = f;
      }
      out.connect(master);
      return { input: g, out, level: layer.level };
    }

    // Tear down the current track's buses and build the next track's.
    function loadTrack(index) {
      prefs.track = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
      savePrefs();
      track = TRACKS[prefs.track];
      if (!ctx) return;
      if (buses) Object.keys(buses).forEach((k) => buses[k].out.disconnect());
      buses = {};
      Object.keys(track.layers).forEach((k) => { buses[k] = makeBus(track.layers[k]); });
      stepDur = 60 / track.bpm / 4;
      step = 0;
      loops = 0;
      tier = -1;
      nextTime = ctx.currentTime + 0.12;
    }

    // ---- voices -----------------------------------------------------------

    function osc(type, midi, detune, dest, at, stopAt) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiToHz(midi);
      if (detune) o.detune.value = detune;
      o.connect(dest);
      o.start(at);
      o.stop(stopAt);
    }

    function play(b, v, midi, at, dur) {
      const attack = v.attack || 0.008;
      const release = v.release || 0.06;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + attack);
      if (v.decay) g.gain.setTargetAtTime(v.sustain || 0.4, at + attack, v.decay);
      g.gain.setTargetAtTime(0, at + dur, release / 4);
      g.connect(b.input);
      const stopAt = at + dur + release + 0.1;
      osc(v.type, midi, 0, g, at, stopAt);
      if (v.type2) {
        const g2 = ctx.createGain();
        g2.gain.value = v.mix2 || 0.5;
        g2.connect(g);
        osc(v.type2, midi + (v.semis2 || 0), v.detune || 0, g2, at, stopAt);
      }
    }

    function burst(b, at, dur, gain, filterType, freq) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.loopStart = Math.random();
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(b.input);
      src.start(at, src.loopStart);
      src.stop(at + dur + 0.02);
    }

    function kick(b, kit, at) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(kit.kickFrom, at);
      o.frequency.exponentialRampToValueAtTime(kit.kickTo, at + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + kit.kickDur);
      o.connect(g);
      g.connect(b.input);
      o.start(at);
      o.stop(at + kit.kickDur + 0.02);
    }

    function snare(b, kit, at) {
      if (kit.clap) {
        [0, 0.012, 0.024].forEach((d) => burst(b, at + d, 0.06, 0.4, 'bandpass', kit.snareFreq));
        burst(b, at + 0.03, kit.snareDur, 0.35, 'bandpass', kit.snareFreq);
      } else {
        burst(b, at, kit.snareDur, 0.5, 'bandpass', kit.snareFreq);
      }
      if (kit.snareTone) play(b, { type: 'triangle', release: 0.05 }, kit.snareTone, at, 0.03);
    }

    function drums(b, L, bar, pos, at) {
      const kit = KITS[L.kit];
      const pat = L.bars[bar % L.bars.length];
      if ((pat.kick || []).indexOf(pos) >= 0) kick(b, kit, at);
      if ((pat.snare || []).indexOf(pos) >= 0) snare(b, kit, at);
      if ((pat.hat || []).indexOf(pos) >= 0) burst(b, at, kit.hatDur, 0.5, 'highpass', kit.hatFreq);
      if ((pat.open || []).indexOf(pos) >= 0) burst(b, at, kit.openDur, 0.7, 'highpass', kit.hatFreq);
      if (L.crackle) {
        if (pos === 0) burst(b, at, stepDur * track.stepsPerBar, L.crackle, 'bandpass', 4000);
        if (Math.random() < 0.2) burst(b, at + Math.random() * stepDur, 0.01, L.crackle * 6, 'highpass', 3000);
      }
    }

    // Short static between stations.
    function staticBurst() {
      const g = ctx.createGain();
      g.connect(master);
      burst({ input: g }, ctx.currentTime, 0.14, 0.12, 'bandpass', 2500);
    }

    // ---- sequencer --------------------------------------------------------

    function scheduleStep(i, at) {
      const spb = track.stepsPerBar;
      const bar = Math.floor(i / spb);
      const pos = i % spb;
      const chord = track.chords[bar % track.chords.length];
      if (pos === 0) updateTier();
      const t = at + (pos % 2 === 1 ? (track.swing || 0) * stepDur : 0);

      Object.keys(track.layers).forEach((name) => {
        const L = track.layers[name];
        const b = buses[name];
        if (L.kind === 'notes') {
          L.bars[bar % L.bars.length].forEach((n) => {
            if (n[0] === pos) play(b, L.voice, (L.relative ? chord.root : 0) + n[1], t, n[2] * stepDur * (L.gate || 0.85));
          });
        } else if (L.kind === 'chord') {
          L.bars[bar % L.bars.length].forEach((n) => {
            if (n[0] === pos) chord.tones.forEach((m) => play(b, L.voice, m + (L.octave || 0), t, n[1] * stepDur * (L.gate || 0.9)));
          });
        } else if (L.kind === 'arp') {
          if (pos % L.every === 0) {
            const tones = chord.tones.concat([chord.tones[0] + 12, chord.tones[1] + 12]);
            const idx = (i / L.every) % L.pattern.length;
            play(b, L.voice, tones[L.pattern[idx]] + (L.octave || 0), t, L.every * stepDur * (L.gate || 0.9));
          }
        } else if (L.kind === 'drums') {
          drums(b, L, bar, pos, t);
        }
      });
    }

    function updateTier() {
      const s = getState();
      const t = s ? tierFor(s) : 0;
      if (t === tier) return;
      tier = t;
      Object.keys(track.layers).forEach((name) => {
        const b = buses[name];
        const target = track.layers[name].tier <= t ? b.level : 0;
        b.input.gain.cancelScheduledValues(ctx.currentTime);
        b.input.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
      });
    }

    function trackSteps() { return track.stepsPerBar * track.chords.length * Math.max(1, Math.round(8 / track.chords.length)); }
    function trackSeconds() { return trackSteps() * stepDur; }

    function tick() {
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        nextTime += stepDur;
        step += 1;
        if (step >= trackSteps()) {
          step = 0;
          loops += 1;
          if (loops * trackSeconds() >= MINUTES_PER_TRACK * 60) { next(); return; }
        }
      }
    }

    function start() {
      if (!AC || timer) return;
      if (!ctx) { setup(); loadTrack(prefs.track); }
      if (ctx.state === 'suspended') ctx.resume();
      tier = -1;
      nextTime = Math.max(nextTime, ctx.currentTime + 0.05);
      timer = setInterval(tick, TICK_MS);
      tick();
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (ctx && ctx.state === 'running') ctx.suspend();
    }

    // ---- public -----------------------------------------------------------

    function setEnabled(on) {
      prefs.on = !!on;
      savePrefs();
      if (prefs.on) start();
      else stop();
    }

    function setVolume(v) {
      prefs.vol = Math.min(1, Math.max(0, Number(v) || 0));
      savePrefs();
      if (master) master.gain.setTargetAtTime(prefs.vol, ctx.currentTime, 0.05);
    }

    function select(index) {
      if (ctx && prefs.on) staticBurst();
      loadTrack(index);
      if (!prefs.on) setEnabled(true);
      else start();
    }

    function next() { select(prefs.track + 1); }
    function prev() { select(prefs.track - 1); }

    function setMinimised(min) {
      prefs.min = !!min;
      savePrefs();
    }

    function status() {
      const s = getState();
      const t = s ? tierFor(s) : 0;
      return {
        supported: !!AC,
        on: prefs.on,
        playing: prefs.on && !!timer,
        vol: prefs.vol,
        min: prefs.min,
        index: prefs.track,
        count: TRACKS.length,
        name: track.name,
        tag: track.tag,
        layers: Object.keys(track.layers).map((k) => ({ label: track.layers[k].label, active: track.layers[k].tier <= t })),
      };
    }

    // Browsers only let audio start after a user gesture.
    function onGesture() {
      if (prefs.on) start();
    }
    document.addEventListener('pointerdown', onGesture, { once: true });
    document.addEventListener('keydown', onGesture, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (!ctx || !prefs.on) return;
      if (document.hidden) {
        if (ctx.state === 'running') ctx.suspend();
      } else {
        ctx.resume();
        nextTime = Math.max(nextTime, ctx.currentTime + 0.05);
      }
    });

    return {
      supported: !!AC,
      isOn: () => prefs.on,
      volume: () => prefs.vol,
      setEnabled,
      setVolume,
      toggle: () => setEnabled(!prefs.on),
      select,
      next,
      prev,
      setMinimised,
      status,
      tracks: TRACKS.map((t) => ({ id: t.id, name: t.name, tag: t.tag })),
      tierFor,
    };
  }

  root.createAudio = createAudio;
})(this);
