// live/hud.js — SPIRE SMASH HUD on the Canvas2D overlay (view px, VW×VH). GENERIC blocks kept from the template:
// callouts, tutorial hand + banner, persistent CTA bar, endcard (headline by endWhy, stat, big CTA, replay, whole screen = CTA).
// Game blocks: level progress bar, score, heat meter around the ball, "LET GO!" / "RELEASE ON BLACK!" teaching, fire tint.
// HUD.hit = tappable rects (index.html: 'cta' → store, 'replay'); HUD.check() = QA (boxes off-screen / overlapping).
(function () {
  const H = KIT.H, HUD = (window.HUD = { hit: [] });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), ease = (x) => 1 - (1 - x) * (1 - x), SS = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
  const DARK = [0.13, 0.06, 0.24], DARK2 = [0.07, 0.03, 0.15], OUT = '#3a1466', GOLD = '#ffe066';

  HUD.draw = (ST, t, proj) => {
    const TITLE = ((window.BUILD || {}).title || 'SPIRE SMASH').toUpperCase();      // BUILD arrives after the modules in dev
    const W = H.W, Hh = H.Hh, GT = ST.t, K = SIM.K, c = H.ctx, oy = (Hh - 1920) / 2, playing = ST.end < 0;
    H.begin(); const hit = [], tyTop = 150 + Math.max(0, oy * 0.35), pillOn = playing && (ST.demo ? GT < 2.6 : ST.firstIn < 0);
    const ball = SCENE.ballScreen && SCENE.ballScreen(), bx = ball ? ball[0] : W / 2, by = ball ? ball[1] : Hh * 0.45, br = ball ? ball[2] : 70;

    // ---- fire tint: warm vignette while the ball burns ----
    if (ST.fireOn && playing) { const f = 0.5 + 0.5 * Math.sin(t * 14); H.glow(W / 2, Hh * 0.52, Hh * 0.62, [1, 0.38, 0.1], 0.10 + 0.04 * f);
      c.save(); const g = c.createRadialGradient(W / 2, Hh / 2, Hh * 0.25, W / 2, Hh / 2, Hh * 0.75); g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, 'rgba(255,70,10,' + (0.28 + 0.06 * f) + ')'); c.fillStyle = g; c.fillRect(0, 0, W, Hh); c.restore(); }

    for (const e of ST.ev) if (e.k === 'fire') { const a = GT - e.t; if (a >= 0 && a < 0.25) { c.fillStyle = 'rgba(255,200,120,' + (0.45 * (1 - a / 0.25)) + ')'; c.fillRect(0, 0, W, Hh); } }   // ignition flash

    // ---- level progress: two badges and a bar filled by the share of rings smashed ----
    if (playing) {
    const lx = W * 0.24, rx = W * 0.76, ty = tyTop, frac = clamp(ST.cr / SIM.N, 0, 1);
    H.pill(lx, ty - 17, rx - lx, 34, 17, [0.78, 0.8, 0.9], [0.62, 0.64, 0.78], 0.95, 'bar');
    if (frac > 0.005) { const g = c.createLinearGradient(lx, 0, rx, 0); g.addColorStop(0, '#ffd23a'); g.addColorStop(0.5, '#ff5f7b'); g.addColorStop(1, '#8f6bff'); c.fillStyle = g; H.rr(lx, ty - 17, Math.max(34, (rx - lx) * frac), 34, 17); c.fill(); }
    for (const [x, col, n] of [[lx, '#ff8a3d', '1'], [rx, '#8f6bff', '2']]) { c.beginPath(); c.arc(x, ty, 56, 0, 7); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(x, ty, 48, 0, 7); c.fillStyle = col; c.fill();
      H.label(n, x, ty + 2, { size: 58, col: '#fff', out: OUT, al: 0.5 }); H.box('lvl' + n, x - 56, ty - 56, 112, 112); }
    // ---- score (the sim's money counter) with a pop on every ring ----
    const sp = GT - ST.smashT, sc = 1 + (sp >= 0 && sp < 0.12 ? 0.22 * (1 - sp / 0.12) : 0);
    H.label(String(Math.round(ST.money)), W / 2, ty + 105, { size: Math.round(92 * sc), col: ST.fireOn ? '#ffd23a' : '#ffffff', out: OUT, al: 0.5, id: 'score' });
    }

    // ---- heat meter: an arc around the ball that fills with the smash streak, becomes a burning ring in fire mode ----
    if (playing && ST.alive && (ST.heat > 0.12 || ST.fireOn)) { const R = br * 1.9, w = 26 + (ST.fireOn ? 5 * Math.sin(t * 20) : 0);
      c.save(); c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.arc(bx, by, R, 0, 7); c.stroke();
      const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * clamp(ST.heat, 0, 1), g = c.createLinearGradient(bx - R, by, bx + R, by);
      if (ST.fireOn) { g.addColorStop(0, '#ffd23a'); g.addColorStop(1, '#ff4d1a'); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, ST.heat > 0.6 ? '#ff9a3a' : '#ffd77a'); }
      c.strokeStyle = g; c.beginPath(); c.arc(bx, by, R, a0, a1); c.stroke(); c.restore();
      if (ST.fireOn) H.glow(bx, by, R * 1.7, [1, 0.45, 0.1], 0.35); }

    // ---- callouts: one slot (y = 0.205 H), the newest event wins, so texts never stack; "+1" pops are separate ----
    const pops = [], near = (k, t0) => ST.ev.some((x) => x.k === k && Math.abs(x.t - t0) < 0.3); let top = null;
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue; let c0 = null;
      if (e.k === 'fire') c0 = { life: 1.5, txt: 'ON FIRE!', size: 180, col: '#ffd23a', out: '#7a1a00' };
      else if (e.k === 'heat50' && !ST.fireOn) c0 = { life: 0.9, txt: 'KEEP GOING!', size: 72, col: '#fff', out: OUT };
      else if (e.k === 'streak' && !near('fire', e.t) && !near('finish', e.t)) c0 = { life: 0.9, txt: 'x' + e.n + '!', size: ST.fireOn ? 84 : 100, col: ST.fireOn ? '#ffe9a0' : '#fff', out: ST.fireOn ? '#7a1a00' : OUT };
      else if (e.k === 'finish') c0 = { life: 1.5, txt: 'LEVEL COMPLETE!', size: 96, col: '#fff27a', out: OUT };
      else if (e.k === 'die') c0 = { life: 1.0, txt: ST.lives > 0 ? 'OUCH!' : 'CRASHED!', size: 110, col: '#ff5a6a', out: '#3a0010' };
      else if (e.k === 'warn') c0 = { life: 1.1, txt: 'LET GO!', size: 140, col: '#ff4d5e', out: '#fff', pulse: 1 };
      if (c0 && a <= c0.life && (!top || e.t >= top.t)) top = Object.assign(c0, { t: e.t, a });
      if (e.k === 'smash' && a < 0.45 && ST.rings - (e.ring + 1) < 2) pops.push([e, a]); }
    const slotY = Math.max(Hh * 0.23, tyTop + 310);                                 // always below the score, whatever the phone's aspect
    if (top && !pillOn) { const q = top.a / top.life, sz = top.size * (top.a < 0.12 ? 0.6 + 0.4 * top.a / 0.12 : 1) * (top.pulse ? 1 + 0.08 * Math.sin(top.a * 24) : 1);
      H.label(top.txt, W / 2, slotY - 40 * ease(q), { size: Math.round(sz), col: top.col, out: top.out, al: 0.5, a: 1 - SS(0.7, 1, q), id: 'callout' }); }
    for (const [e, a] of pops) H.label((e.fire ? '+2' : '+1'), bx + 130 + 30 * ((e.ring % 3) - 1), by - 60 - 160 * ease(a / 0.45), { size: 64, col: e.fire ? '#ffd23a' : '#fff', out: OUT, al: 0.5, a: 1 - SS(0.5, 1, a / 0.45) });
    if (playing && ST.alive && ST.needRelease && ST.deaths > 0 && !top) H.label('RELEASE ON BLACK!', W / 2, slotY, { size: 78, col: '#fff', out: '#a0123a', al: 0.5, id: 'release' });

    // ---- tutorial: the hand shows the hold (demo: the scripted finger; play: before the first press or after 2.5 s idle) ----
    const idle = playing && (ST.demo ? GT < 2.6 : (ST.firstIn < 0 || GT - ST.lastIn > 2.5));
    if (playing && (ST.demo || idle)) {
      const down = ST.demo ? (ST.inp && ST.inp.press) : ST.ghost ? 1 : (((t * 0.9) % 1) > 0.25 && ((t * 0.9) % 1) < 0.85), hx = W / 2, hy = Hh * 0.78 - (down ? 0 : 10), hh = 210 * (down ? 0.9 : 1);
      if (down) { H.glow(hx, hy, 90, [1, 1, 1], 0.4); H.ring(hx, hy, 58 + 14 * Math.sin(t * 9), [1, 1, 1], 0.5, 8); }
      if (H.img.hand) H.sprite('hand', hx - hh * 0.54 * 0.33, hy - hh * 0.03, hh * 0.54, hh); else H.ring(hx, hy, 40, [1, 1, 1], 0.9, 14);
      if ((idle && ST.firstIn < 0) || (ST.demo && GT < 2.6)) { const b = 1 + 0.04 * Math.sin(t * 6), sz = Math.round(64 * b), tw = H.labelW('HOLD TO SMASH!', sz);
        H.pill(W / 2 - tw / 2 - 40, Hh * 0.19 - 54, tw + 80, 108, 54, DARK, DARK2, 0.72, 'tut'); H.label('HOLD TO SMASH!', W / 2, Hh * 0.19, { size: sz, col: '#fff', out: OUT, al: 0.5 }); }
    }
    // ---- persistent CTA bar (store button visible the whole time) ----
    if (playing) { const bw = 360, bh = 104, bxx = W - bw - 36, byy = Hh - bh - 44, pul = 1 + 0.03 * Math.sin(t * 5);
      H.pill(24, byy - 18, W - 48, bh + 36, 30, DARK, DARK2, 0.78);
      H.label(TITLE, 70, byy + bh / 2, { size: 50, col: GOLD, out: '#2a0a4a', id: 'brand' });
      H.pill(bxx - (pul - 1) * bw / 2, byy - (pul - 1) * bh / 2, bw * pul, bh * pul, bh / 2, [1.0, 0.82, 0.3], [0.98, 0.5, 0.12], 1, 'cta');
      H.label('PLAY FREE', bxx + bw / 2, byy + bh / 2, { size: 50, col: '#fff', out: '#7a3a00', al: 0.5 });
      hit.push({ id: 'cta', x: bxx, y: byy, w: bw, h: bh }); }
    // ---- endcard (the world is dimmed and the ball bounces on a podium in 3D by scene.js; text and buttons here) ----
    if (ST.end >= 0) { const a = GT - ST.end, k = SS(0, 0.45, a), pop = (d) => { const q = clamp((a - d) / 0.35, 0, 1); return q < 1 ? 1.12 * ease(q) - 0.12 * q * q : 1; };
      const win = ST.endWhy === 'win', head = win ? 'LEVEL COMPLETE!' : ST.endWhy === 'lose' ? (ST.rings / SIM.N >= 0.5 ? 'SO CLOSE!' : 'TRY AGAIN!') : 'KEEP SMASHING!';
      const s1 = pop(0.2); if (s1 > 0.01) { H.label(head, W / 2, 200 + oy, { size: Math.round(72 * s1), col: '#fff27a', out: OUT, al: 0.5, id: 'head' });
        H.label(TITLE, W / 2, 330 + oy, { size: Math.round(120 * s1), col: '#fff', out: '#7a1f9a', al: 0.5, id: 'logo' });
        H.label(win ? 'More levels inside!' : 'Can you reach the bottom?', W / 2, 445 + oy, { size: 50, col: '#fff', out: OUT, al: 0.5, a: k, id: 'tag' }); }
      const s2 = pop(0.45); if (s2 > 0.01 && ST.rings >= 5) { const txt = ST.rings + ' RINGS SMASHED', tw = H.labelW(txt, 56);
        H.pill(W / 2 - tw / 2 - 36, 1090 + oy - 50, tw + 72, 100, 50, DARK, DARK2, 0.6 * Math.min(1, s2)); H.label(txt, W / 2, 1090 + oy, { size: Math.round(56 * s2), col: '#ffe9a0', out: OUT, al: 0.5, id: 'stat' }); }
      const s3 = pop(0.7), pul = 1 + 0.045 * Math.sin(t * 6), bw = 640 * s3 * pul, bh = 170 * s3 * pul, bxx = W / 2 - bw / 2, byy = 1360 + oy - bh / 2;
      if (s3 > 0.01) { H.glow(W / 2, 1360 + oy, 420, [1, 0.6, 0.3], 0.3);
        H.pill(bxx, byy + 12, bw, bh, bh / 2, [0.55, 0.30, 0.02], [0.45, 0.22, 0.0]); H.pill(bxx, byy, bw, bh, bh / 2, [1.0, 0.86, 0.30], [0.98, 0.52, 0.12], 1, 'endcta');
        H.label('PLAY FREE', W / 2, byy + bh / 2, { size: Math.round(86 * s3), col: '#fff', out: '#7a3a00', al: 0.5 });
        hit.push({ id: 'cta', x: bxx, y: byy, w: bw, h: bh }); }
      if (a > 0.6) { H.pill(W / 2 - 200, 1590 + oy - 46, 400, 92, 46, DARK, DARK2, 0.55 * SS(0.6, 1.0, a)); H.label('↻ REPLAY', W / 2, 1590 + oy, { size: 48, col: '#fff', out: OUT, al: 0.5, a: SS(0.6, 1.0, a), id: 'replay' });
        hit.unshift({ id: 'replay', x: W / 2 - 170, y: 1550 + oy, w: 340, h: 80 }); }
      if (a > 0.6) hit.push({ id: 'cta', x: 0, y: 0, w: W, h: Hh }); }
    HUD.hit = hit;
  };
  // QA: pills and labels that leave the screen or overlap (the CTA bar holds brand + button)
  HUD.check = () => H.check(['brand', 'cta', 'lvl1', 'lvl2']);
})();
