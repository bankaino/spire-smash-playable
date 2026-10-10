# Spire Smash — plan (keep current; one session per phase). Full spec: study/SPEC.md

## Mechanic and beats (target seconds)
- hook (0–3 s): hand "HOLD TO SMASH"; the ball already bounces on the top ring; first smash <= 2.5 s
- core loop: hold = ball drops and smashes whole rings; release = bounces; black segment kills (release on black)
- big moment (10–15 s): heat meter fills -> fire mode 2.6 s, black segments smash too (ring 44–55 are mostly black)
- endcard: win (finish platform, ~20 s) / lose after 2 lives "SO CLOSE!" / idle "CAN YOU REACH THE BOTTOM?"

## Template → this game
| template part | keep / replace | notes |
|---|---|---|
| sim.js (Timber Rush rules) | replace | keep the contract: create/step/at/spawn/demoCheck, S.ev, S.end/endWhy, idle rules; S.money = score |
| scene.js world (procedural harvester, pine field, pad, worker) | replace | keep: camera from S.cam/zoom, Pool use, endcard 3D pass, probe/QA; world y -> vertical axis |
| hud.js | adapt texts/colours | keep every GENERIC block; drop joystick, guide arrow, price/badges |

## Assets (source → live/models / live/assets)
| name | source | budget (tris, KB) | clips |
|---|---|---|---|
| rings, pole, ball, podium, islands, clouds | procedural (ExtrudeGeometry + KIT.merge) | <= 150k tris, 0 KB | – |
| hand | existing template image | 7 KB | – |
| worker.glb, coin.png | remove from build.json/live | – | – |

## Decisions / notes
- hero (ball) is 6–8 % of view height by design (tower is the hero visually: 62–72 % width)
- verify.sh fixed for macOS in the skill itself: CRLF -> LF, `timeout` fallback

## Gate A (critic 5.5/10) → fixes applied
- slabs 0.5x (0.25x near ball), 40 chips/ring, flash disc, trail = one cone; env map + ACES + rim light + AO; TH 22→40, bevel 0.045
- camera: shake 0.16*tr, FOV punch + 58° in fire, CAM_LEAD 260 / K 40 / D 12.6; sky: cyan → violet → peach (contrast with rings)
- finish: pole ends at platform, collar over the hub, 3-tier podium, halo, softer dim; clouds recycle outside the view

## Gate B (critic 6.3/10) → fixes applied
- difficulty cliff: casual players died 86% → default now T_CLEAR 8, A_W1/A_W2 2, FIRE_N 8 (modelled casual run: win 68 %, lose 32 %, everybody who reaches the clear zone sees fire; demo has 2 fires)
- variants now rebuild the level (`SIM.build()` after the K override in build_playable.py); demoCheck accepts fire 1.5–15 s and needs 2 fires
- ghost play: until the first real touch (≤ 2.0 s) the demo finger plays so the ad shows the verb; it never counts as input
- HUD: one callout slot, tutorial pill above the ball, heat arc 26 px, ignition flash, endcard copy by result, replay pill
- perf: sky bokeh/stars baked into a texture (no per-pixel loops), DPR cap 1.5, pointercancel/blur release the hold
- audio: pentatonic ladder, no stray replay on first gesture; camera lead 200 / K 55

## Variants (variants/*.json; all K overrides are applied at load, then SIM.build())
- big_fire FIRE_T 3.6 (casual model: win 100 %) · late_wow FIRE_N 12 (win 42 %, fire seen 42 %) · risky ROT 1.9 / LIVES 1 (win 50 %, lose 50 %); default: win 68 % / lose 32 %

## Notes / open points
- verify.sh all: VERIFY OK, 0.78 MB per network (Google zip 0.21 MB), 61 fps desktop, draws <= 26, tris <= 114k
- tested and rejected: FIRE_N 5 (win 0 %, 29 % timeouts) and FIRE_V 620 (89 % timeouts: the ball outruns the wedge timing)
- store links in tools/build.json are placeholders (com.example.spiresmash / id0000000000)
- 60 fps is a desktop number: test on a real phone; sound was written but not listened to

## Phases
- [x] 0 scaffold + plan  - [x] 1 rules  - [x] 2 world (Gate A 5.5)  - [x] 3 feel + HUD + audio (Gate B 6.3, fixes applied)  - [x] 4 variants + delivery (dist/)
