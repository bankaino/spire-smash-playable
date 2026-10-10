// live/audio.js — procedural sound (WebAudio, zero asset bytes) driven by the sim event bus S.ev.
// index.html calls AUDIO.tick(state) once per frame in play mode; the context starts on the first user gesture
// (autoplay policy) and AUDIO.mute(bool) is wired to ad-network viewability / audio-volume callbacks.
// Smash pitch climbs a semitone per ring in a row (a combo you can hear); fire = rising sweep + a low roar while it burns.
(function () {
  let ac = null, out = null, roar = null, last = -1, muted = false, lastBounce = 0, fresh = false;
  const start = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    fresh = true; ac = new C(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.55; out.connect(ac.destination);
    // fire roar: looped noise through a low-pass whose gain follows S.fireOn
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise(); s.loop = true; f.type = 'lowpass'; f.frequency.value = 520; g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(out); s.start(); roar = { g, f };
  };
  addEventListener('pointerdown', start, { capture: true }); addEventListener('keydown', start, { capture: true });
  let nbuf = null;
  const noise = () => { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = nbuf.getChannelData(0);
    let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } return nbuf; };
  const env = (node, t0, a, peak, dur) => { const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(g); g.connect(out); return g; };
  const tone = (freq, t0, dur, type = 'sine', peak = 0.2, slide = 0) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur); env(o, t0, 0.005, peak, dur); o.start(t0); o.stop(t0 + dur + 0.05); };
  const burst = (t0, dur, f0, f1, peak, q = 1.2, type = 'bandpass') => { const s = ac.createBufferSource(); s.buffer = noise(); const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); s.connect(f); env(f, t0, 0.004, peak, dur); s.start(t0); s.stop(t0 + dur + 0.05); };
  const SFX = {
    smash: (t0, e) => { const n = e.streak || 1, f = 330 * Math.pow(2, ([0, 2, 4, 7, 9][n % 5] + 12 * Math.floor((n % 15) / 5)) / 12);   // pentatonic ladder, 2 octaves, loops: fire is a melody, not one note
      if (e.black) { tone(70, t0, 0.3, 'sine', 0.5, 0.5); burst(t0, 0.25, 1400, 120, 0.4, 0.8, 'lowpass'); }
      else { tone(f, t0, 0.1, 'triangle', 0.16, 0.7); burst(t0, 0.08, 3200, 900, 0.14, 1.5); tone(f * 2, t0 + 0.01, 0.06, 'square', 0.03); } },
    bounce: (t0) => { tone(150, t0, 0.14, 'sine', 0.13, 0.55); },
    heat50: (t0) => { tone(660, t0, 0.08, 'square', 0.05); tone(990, t0 + 0.07, 0.1, 'square', 0.05); },
    warn: (t0) => { tone(880, t0, 0.07, 'square', 0.08); tone(880, t0 + 0.13, 0.07, 'square', 0.08); },
    fire: (t0) => { burst(t0, 0.7, 300, 3800, 0.4, 0.7, 'bandpass'); tone(110, t0, 0.5, 'sawtooth', 0.14, 3); [523, 659, 784].forEach((f, i) => tone(f, t0 + 0.1 + i * 0.07, 0.2, 'square', 0.05)); },
    die: (t0) => { burst(t0, 0.35, 5200, 700, 0.4, 2.2); tone(300, t0, 0.4, 'sawtooth', 0.14, 0.35); tone(90, t0, 0.3, 'sine', 0.4, 0.5); },
    respawn: (t0) => tone(520, t0, 0.18, 'sine', 0.12, 1.8),
    streak: (t0) => [784, 988].forEach((f, i) => tone(f, t0 + i * 0.06, 0.12, 'square', 0.05)),
    finish: (t0) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t0 + i * 0.09, 0.28, 'triangle', 0.13)); burst(t0, 0.9, 6000, 1200, 0.1, 0.6); },
    end: (t0, e) => { if (e.why !== 'win') [392, 330, 262].forEach((f, i) => tone(f, t0 + i * 0.11, 0.28, 'triangle', 0.1)); },
  };
  window.AUDIO = {
    mute: (m) => { muted = m; if (out) out.gain.value = m ? 0 : 0.55; },
    tick: (S) => {
      if (!ac || !S) return; const now = ac.currentTime;
      if (fresh) { last = S.t; fresh = false; }                            // the first gesture must not replay events queued before it
      if (S.t < last) last = -1;                                           // restart / replay
      for (const e of S.ev) { if (e.t <= last) continue;
        if (e.k === 'bounce') { if (now - lastBounce < 0.15) continue; lastBounce = now; }
        if (e.k === 'streak' && S.ev.some((x) => x.k === 'fire' && Math.abs(x.t - e.t) < 0.3)) continue;   // same frame as the fire sweep: skip
        if (SFX[e.k]) SFX[e.k](now, e); }
      last = S.t;
      roar.g.gain.setTargetAtTime(S.fireOn && S.end < 0 ? 0.22 : 0, now, 0.08); roar.f.frequency.setTargetAtTime(380 + 500 * Math.min(1, S.bv / 560), now, 0.1);
    },
  };
})();
