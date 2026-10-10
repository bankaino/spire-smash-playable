// live/sim.js — SPIRE SMASH playable ad: deterministic vertical sim, fixed 120 Hz.
// Loop: hold = the ball dives and smashes whole rings, release = it bounces; a black segment under a diving ball kills it;
// a chain of smashes fills the heat meter → fire mode: the ball smashes black too. Every reaction lives here; the scene only draws.
// World: sim px (U = 0.01 m/px). x/z is the ring plane (angle), y = DEPTH going down (ring i top at ringTop(i)). The scene maps y → vertical.
(function (root) {
  const DT = 1 / 120, L = 24.0, TAU = Math.PI * 2, SEGA = TAU / 12;
  const ASPECT = typeof window !== 'undefined' && window.innerWidth ? window.innerHeight / window.innerWidth : 16 / 9;
  const VIEW = { W: 1080, H: Math.round(1080 * Math.max(16 / 9, Math.min(19.5 / 9, ASPECT))) };
  const HINT = 'hold to smash · release on black · build fire';
  const K = {
    N: 64, GAP: 60, TH: 40, R_OUT: 200, R_IN: 72, R_POLE: 66, BALL_R: 34, BALL_A: 0,   // tower: rings, spacing, thickness, radii (px)
    ROT: 1.5, TWIST: -0.14,                                  // tower spin rad/s; per-ring angular offset (a spiral)
    G: 3200, BOUNCE: 640, VMAX: 900, SMASH_V: 480, FIRE_V: 560, DIVE_ACC: 14000, SMASH_MIN_V: 200,
    FIRE_N: 8, FIRE_T: 2.6, HEAT_DECAY: 0.1, HEAT_BOUNCE: 0.35,  // smashes in a row for fire; fire seconds; heat lost per s while released; heat kept after a bounce
    LIVES: 2, DEAD_T: 0.9, SLOWMO: 0.35, SLOW_T: 0.8, WARN_RINGS: 2,
    START_RING: 0, CAM_LEAD: 200, CAM_K: 55, CAM_D: 14.8,
    END_AFTER_WIN: 1.6, END_MAX: 28, END_NO_INPUT: 8, END_IDLE: 10,
    T_CLEAR: 8, A_EVERY: 2, A_JUMP: 5, A_W1: 2, A_W2: 2,                 // learn zone: wedge moves every A_EVERY rings by A_JUMP segments; widths
    DEMO_START: 1.2, GHOST_T: 2.0, LOOK: 2, MARGIN: 0.2,                   // demo bot: start only when LOOK rings are safe; keep holding while the next one is
  };
  const N = K.N, Y0 = 140, ringTop = (i) => Y0 + i * K.GAP;
  const WORLD = { x0: -400, y0: 0, x1: 400, y1: ringTop(N) + 500 };

  // ---------------- the level, as data: ring i = { off: angle offset, mask: bit j = segment j is black } ----------------
  const wedge = (s, w) => { let m = 0; for (let k = 0; k < w; k++) m |= 1 << ((s + k) % 12); return m; };
  const RINGS = [];
  function build() {
    RINGS.length = 0;
    for (let i = 0; i < N; i++) {
      let m = 0;
      if (i >= K.T_CLEAR && i < 38) m = wedge((Math.floor((i - K.T_CLEAR) / K.A_EVERY) * K.A_JUMP) % 12, i < 18 ? K.A_W1 : K.A_W2);   // learn: one wedge, widening
      else if (i >= 48 && i < 60) m = 0xfff & ~wedge((Math.floor((i - 48) / 3) * 5) % 12, 2);                  // wow zone: a wall of black, 2-wide hole
      else if (i >= 60) m = wedge((i * 5) % 12, 3);                                                          // 38-47 stays clear: the run-up to fire
      RINGS.push({ off: i * K.TWIST, mask: m });
    }
  }
  build();
  const segUnder = (rot, r) => { const a = (((K.BALL_A - rot - RINGS[r].off) % TAU) + TAU) % TAU; return Math.floor(a / SEGA) % 12; };
  // black under the ball at spin `rot`, widened by `du` segments each side (the bot keeps a margin, the sim uses du = 0)
  const blackAt = (r, rot, du) => { const u = ((((K.BALL_A - rot - RINGS[r].off) % TAU) + TAU) % TAU) / SEGA, m = RINGS[r].mask;
    return [u - du, u, u + du].some((x) => (m >> (((Math.floor(x) % 12) + 12) % 12)) & 1); };

  const beat = (S, k) => { if (S.beats[k] === undefined) S.beats[k] = +S.t.toFixed(2); };
  const emit = (S, k, o) => { S.ev.push(Object.assign({ k, t: S.t }, o)); beat(S, k); };

  function create() {
    const cr = K.START_RING || 0, by = ringTop(cr) - K.BALL_R - 110;
    return { t: 0, steps: 0, wt0: 0, ev: [], freeze: 0, cam: [0, by + K.CAM_LEAD], camV: [0, 0], zoom: 1,
      by, bv: 0, byMax: by, alive: true, lives: K.LIVES, deadT: -9, loseAt: -1, cr,
      brk: Array(N).fill(-1), brkRot: Array(N).fill(0), brkF: Array(N).fill(0),      // time a ring broke, spin then, 0 plain / 1 fire / 2 black
      rot: 0, heat: 0, hot: false, fireOn: false, fireUntil: -9, streak: 0, rings: 0, money: 0, earned: 0, hold: false,
      slowUntil: -9, warned: false, warnT: -9, bounceT: -9, smashT: -9, needRelease: false,
      firstIn: -1, lastIn: 0, end: -1, endWhy: '', winT: -9, beats: {}, deaths: 0, blackBroken: 0, blackPauses: 0, fires: 0 };
  }
  const spawn = (worldT) => Object.assign(create(), { wt0: worldT });
  const respawn = (S, worldT) => spawn(worldT);
  const outOfPlay = () => false;

  function step(S, inp) {
    const t = S.t + DT; S.t = t; S.steps++;
    if (S.ev.length > 220) S.ev.splice(0, S.ev.length - 220);
    if (S.freeze > 0) { S.freeze -= DT; return S; }
    const dt = DT * (t < S.slowUntil ? K.SLOWMO : 1);
    const real = !!(inp.press || inp.jump || inp.down || inp.act) && !inp.ghost, ghost = !!inp.ghost && S.firstIn < 0 && t < K.GHOST_T;   // ghost = the demo bot's finger before the first real touch
    let hold = real || ghost;
    if (S.end >= 0) hold = false;
    if (real && hold) { S.lastIn = t; if (S.firstIn < 0) S.firstIn = t; }
    if (!hold) S.needRelease = false;
    S.hold = hold; S.ghost = ghost && hold;
    S.rot += K.ROT * dt;

    if (S.fireOn && t >= S.fireUntil) { S.fireOn = false; S.heat = 0; emit(S, 'fireEnd', {}); }
    let fire = S.fireOn;
    if (fire) S.heat = Math.max(0, (S.fireUntil - t) / K.FIRE_T);
    else if (!hold) S.heat = Math.max(0, S.heat - K.HEAT_DECAY * dt);
    if (S.heat >= 0.5 && !S.hot) { S.hot = true; emit(S, 'heat50', {}); } else if (S.heat < 0.35) S.hot = false;

    if (!S.alive) {
      if (S.loseAt < 0 && t - S.deadT >= K.DEAD_T) {                          // second chance: back above the ring that killed it
        S.by = ringTop(S.cr) - K.BALL_R - 110; S.bv = 0; S.alive = true; S.needRelease = hold; emit(S, 'respawn', { ring: S.cr });
      }
    } else {
      const want = hold && !S.needRelease;
      if (want) S.bv = Math.min(fire ? K.FIRE_V : K.SMASH_V, S.bv + K.DIVE_ACC * dt); else S.bv = Math.min(K.VMAX, S.bv + K.G * dt);

      // one-time warning: diving at black → slow-mo + "LET GO!"
      if (!S.warned && want && !S.ghost && !fire && S.bv > 150) {
        const gap = ringTop(S.cr) - (S.by + K.BALL_R);
        for (let k = 0; k < K.WARN_RINGS && S.cr + k < N; k++) if (gap + k * K.GAP < K.WARN_RINGS * K.GAP && blackAt(S.cr + k, S.rot, 0)) {
          S.warned = true; S.warnT = t; S.slowUntil = t + K.SLOW_T; emit(S, 'warn', { ring: S.cr + k }); break; }
      }

      let y1 = S.by + S.bv * dt, settled = false;
      for (;;) {
        const top = ringTop(S.cr);
        if (y1 + K.BALL_R < top) break;
        const fin = S.cr >= N, black = !fin && blackAt(S.cr, S.rot, 0), smashing = want && S.bv >= K.SMASH_MIN_V && !fin;
        if (smashing && (!black || fire)) {
          S.brk[S.cr] = t; S.brkRot[S.cr] = S.rot; S.brkF[S.cr] = black ? 2 : fire ? 1 : 0;
          S.rings++; S.streak++; S.smashT = t; const pts = fire ? 2 : 1; S.money += pts; S.earned += pts;
          if (black) S.blackBroken++;
          emit(S, 'smash', { ring: S.cr, black, fire, streak: S.streak });
          if (S.streak % 10 === 0) emit(S, 'streak', { n: S.streak });
          if (!fire) { S.heat = Math.min(1, S.heat + 1 / K.FIRE_N);
            if (S.heat >= 1) { S.fireOn = fire = true; S.fireUntil = t + K.FIRE_T; S.freeze = Math.max(S.freeze, 0.08); S.fires++; emit(S, 'fire', {}); } }
          if (black) S.freeze = Math.max(S.freeze, 0.03);
          S.cr++; continue;
        }
        if (smashing && black) {                                                // not on fire: a black segment kills
          S.alive = false; S.deadT = t; S.lives--; S.deaths++; S.heat = 0; S.fireOn = false; S.streak = 0; S.freeze = 0.12;
          S.by = top - K.BALL_R; S.bv = 0; settled = true; emit(S, 'die', { ring: S.cr, lives: S.lives });
          if (S.lives <= 0) S.loseAt = t + K.DEAD_T;
          break;
        }
        S.by = top - K.BALL_R; S.bv = -K.BOUNCE; S.bounceT = t; S.streak = 0; settled = true; if (!fire) S.heat *= K.HEAT_BOUNCE;   // plain bounce (released, or too slow)
        if (fin && S.winT < 0) { S.winT = t; emit(S, 'finish', {}); }
        if (black) S.blackPauses++;
        emit(S, 'bounce', { ring: S.cr, black, rot: S.rot });
        break;
      }
      if (!settled) S.by = y1;
      S.byMax = Math.max(S.byMax, S.by);
    }

    // ---- endcard: win, out of lives, or the time box ----
    const why = S.winT > 0 && t - S.winT > K.END_AFTER_WIN ? 'win' : S.loseAt > 0 && t >= S.loseAt ? 'lose'
      : S.firstIn >= 0 && t - S.firstIn > K.END_MAX ? 'time' : S.firstIn < 0 && t > K.END_NO_INPUT ? 'time'
      : S.firstIn >= 0 && t - S.lastIn > K.END_IDLE ? 'time' : '';
    if (S.end < 0 && why) { S.end = t; S.endWhy = why; emit(S, 'end', { why }); }

    // ---- camera: only ever goes down (a bounce does not lift it); a touch wider in fire ----
    const tgy = Math.min(S.byMax + K.CAM_LEAD, ringTop(N) + 60);
    S.camV[1] += (K.CAM_K * (tgy - S.cam[1]) - K.CAM_D * S.camV[1]) * DT; S.cam[1] += S.camV[1] * DT;
    S.zoom += ((S.fireOn ? 0.92 : 1) - S.zoom) * Math.min(1, 2.5 * DT);
    return S;
  }

  // ---- attract demo: a bot that plays like a good player: hold while the next rings are safe, let go before black ----
  const safeAhead = (S, look) => {
    const dive = S.fireOn ? K.FIRE_V : K.SMASH_V; let y = S.by + K.BALL_R;
    for (let k = 0; k < look && S.cr + k < N; k++) {
      const r = S.cr + k, tau = Math.max(0, ringTop(r) - y) / dive + 0.02;
      if (S.fireOn && tau < S.fireUntil - S.t) continue;                       // fire still burning when the ball gets there
      if (blackAt(r, S.rot + K.ROT * tau, K.MARGIN)) return false;
    }
    return true;
  };
  const scriptInput = (t, S) => {
    const inp = { left: 0, right: 0, up: 0, down: 0, jump: 0, act: 0, press: 0, px: VIEW.W / 2, py: Math.round(VIEW.H * 0.8) };
    if (t >= K.DEMO_START && S.end < 0 && S.alive && !S.needRelease && safeAhead(S, S.hold ? 1 : K.LOOK)) inp.press = 1;
    return inp;
  };
  const ghostInput = (S) => { if (S.firstIn >= 0 || S.t >= K.GHOST_T || S.end >= 0) return null; const g = scriptInput(S.t, S); if (!g.press) return null; g.ghost = 1; return g; };
  let cache = null;
  function at(t) {
    const loop = Math.floor(t / L), q = t - loop * L, n = Math.round(q / DT);
    if (!cache || cache.loop !== loop || cache.S.steps > n) { const S0 = Object.assign(create(), { wt0: loop * L }); cache = { loop, S: S0 }; }
    const S = cache.S; while (S.steps < n) step(S, scriptInput(S.t, S));
    return Object.assign({}, S, { loop, q, demo: true, inp: scriptInput(S.t, S) });
  }
  // the demo must hit every beat of the ad inside its loop
  const demoCheck = (S) => { const b = S.beats, f = [];
    if (b.smash === undefined || b.smash > 2.5) f.push('first smash at ' + b.smash);
    if (!(S.blackPauses >= 1)) f.push('no deliberate pause before black');
    if (b.fire === undefined || b.fire < 1.5 || b.fire > 15) f.push('fire at ' + b.fire + ' (want 1.5-15 s)');
    if (S.fires < 2) f.push('only ' + S.fires + ' fire(s): the wall needs a second one');
    if (S.blackBroken < 4) f.push('only ' + S.blackBroken + ' black smashed in fire');
    if (b.finish === undefined || b.finish > 20) f.push('finish at ' + b.finish);
    if (S.deaths) f.push('demo died ' + S.deaths + 'x');
    if (S.end < 0 || S.end > L - 3) f.push('endcard late: ' + S.end.toFixed(1));
    return f; };

  root.SIM = { DT, L, K, VIEW, WORLD, HINT, N, Y0, RINGS, ringTop, segUnder, blackAt, create, spawn, respawn, outOfPlay, step, at,
    scriptInput, ghostInput, demoCheck, build };
  if (typeof module !== 'undefined') module.exports = root.SIM;
})(typeof window !== 'undefined' ? window : globalThis);
