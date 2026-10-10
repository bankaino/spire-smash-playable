// tools/player_policies.js — headless "players" for the deterministic sim (no browser, ~10 s).
//   node tools/player_policies.js            every variant in variants/*.json
//   node tools/player_policies.js default    one variant
// 1) demo bot over 18 start offsets × spin speeds: the ad's beats must land (SIM.demoCheck) every time
// 2) casual model, 72 runs per variant: reaction delay 0.15–0.35 s, wide safety margin around black, starts 0.6–3 s late,
//    holds when the next rings look safe. Prints win / lose / timeout share, who sees fire, median time to the endcard.
// It is a model of a careless player, not real data: use it to compare variants, not to predict conversion.
const fs = require('fs'), path = require('path');
global.window = undefined;
const SIM = require(path.join(__dirname, '..', 'live', 'sim.js'));
const BASE = JSON.parse(JSON.stringify(SIM.K));
const vdir = path.join(__dirname, '..', 'variants');
const only = process.argv[2];
const variants = fs.readdirSync(vdir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !only || n === only);

const apply = (name, extra = {}) => {
  const over = JSON.parse(fs.readFileSync(path.join(vdir, name + '.json'), 'utf8')).K || {};
  Object.assign(SIM.K, BASE, over, extra); SIM.build();                       // same order as the build: K override, then rebuild the level
};
const play = (inputFn, max = 40) => { const D = SIM.create(); while (D.t < max && D.end < 0) SIM.step(D, inputFn(D)); return D; };

console.log('variant'.padEnd(14), 'demo (18 runs)'.padEnd(34), 'casual model (72 runs)');
for (const name of variants) {
  // 1) demo bot
  let ok = 0, tot = 0, fires = [], fins = [];
  for (const start of [1.0, 1.2, 1.4, 1.6, 1.8, 2.0]) for (const rot of [1.4, 1.5, 1.6]) {
    apply(name, { DEMO_START: start, ROT: JSON.parse(fs.readFileSync(path.join(vdir, name + '.json'), 'utf8')).K?.ROT || rot });
    const D = play((S) => SIM.scriptInput(S.t, S)); tot++;
    const f = D.beats.fire, fin = D.beats.finish; fires.push(f); fins.push(fin);
    if (f >= 1.5 && f <= 15 && fin <= 19.4 && !D.deaths && D.fires >= 1) ok++;
  }
  const med = (a) => a.filter((x) => x !== undefined).sort((x, y) => x - y)[a.length >> 1];
  // 2) casual model
  let win = 0, lose = 0, time = 0, fire = 0, died = 0; const ends = [];
  for (let sd = 0; sd < 72; sd++) {
    const delay = 0.15 + 0.2 * ((sd * 7) % 10) / 10, margin = 0.5 + 0.4 * ((sd * 3) % 10) / 10, startAt = 0.6 + 2.4 * ((sd * 11) % 10) / 10;
    apply(name, { MARGIN: margin }); const q = [];
    const D = play((S) => { const want = S.t >= startAt && S.alive && !S.needRelease ? SIM.scriptInput(Math.max(S.t, SIM.K.DEMO_START), S).press : 0;
      q.push([S.t, want]); while (q.length > 1 && q[1][0] <= S.t - delay) q.shift(); return { press: q[0][1] }; });
    if (D.endWhy === 'win') win++; else if (D.endWhy === 'lose') lose++; else time++;
    if (D.beats.fire !== undefined) fire++; if (D.deaths) died++; ends.push(D.end);
  }
  const pc = (n) => Math.round(n / 72 * 100) + '%';
  console.log(name.padEnd(14), `${ok}/${tot} ok, fire ${med(fires).toFixed(1)} s, finish ${med(fins).toFixed(1)} s`.padEnd(34),
    `win ${pc(win)} · lose ${pc(lose)} · timeout ${pc(time)} · fire seen ${pc(fire)} · died ≥1 ${pc(died)} · median end ${ends.sort((a, b) => a - b)[36].toFixed(1)} s`);
}
