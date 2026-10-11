// live/scene.js — SPIRE SMASH 3D world: draws SIM state with three.js; the HUD on top is hud.js.
// Contract used by index.html / tools: SCENE.init(glCanvas, hudCanvas, VW, VH) → Promise, SCENE.render(t), SCENE.state,
// SCENE.hit (tappable HUD rects, from hud.js), SCENE.stats(), SCENE.probe(), SCENE.QA(), SCENE.proj(...).
// World mapping: ring plane = X/Z (angle θ → x = r·sinθ, z = r·cosθ, so θ = BALL_A faces the camera), sim depth y (px, downwards)
// → world Y = −y·U (metres, up). Everything is a pure function of (state, t): render.mjs / probe render any moment.
(function () {
  const T = THREE, S = (window.SCENE = { state: null, hit: [] }), U = 0.01;
  const K = SIM.K, N = SIM.N, RINGS = SIM.RINGS, SEGA = Math.PI / 6, TAU = Math.PI * 2;
  const R_IN = K.R_IN * U, R_OUT = K.R_OUT * U, R_POLE = K.R_POLE * U, RM = (R_IN + R_OUT) / 2, TH = K.TH * U, BR = K.BALL_R * U, BA = K.BALL_A;
  const Yw = (simY) => -simY * U;                                                  // sim depth → world Y
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), SS = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
  const ease = (x) => 1 - (1 - x) * (1 - x), lerp = (a, b, k) => a + (b - a) * k;
  const h1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const COL = { black: 0x16121f, rim: 0xff2e7e, ball: 0x2ec9ff, pole: 0xf4f1ec, hot: 0xff6a1a, island: 0x86e08a, rock: 0x8a78b8, tree: 0x37b88a,
    skyTop: [0x40c8ec, 0x7a6cf0, 0xffa066], skyBot: [0x6f8cff, 0xb05cd0, 0xe0508a], ringStops: [0xffe14d, 0xff8a3d, 0xff4f7b, 0x8f6bff] };
  const UP = new T.Vector3(0, 1, 0), m4 = new T.Matrix4(), q1 = new T.Quaternion(), e1 = new T.Euler(), v1 = new T.Vector3(), s1 = new T.Vector3(1, 1, 1), c1 = new T.Color(), c2 = new T.Color();
  const WIN = 22;                                                                  // rings drawn below the first intact one
  let R, scene, cam, sun, hemi, bgScene, bgCam, bgMat, VW = 1080, VH = 1920, end = {}, ball, ballMat, blob, pole, fin, segMesh, blkMesh, rimMesh, rimMat,
    deb, lava, chips, waves, glow, flash, cone, rim, lines, isl, cld, envTex, K_;

  // ---------------- procedural kit ----------------
  // one beveled ring segment, centroid at the origin, +z outward, y ∈ [−h/2, h/2]; constant-width gap between neighbours
  function sectorGeo(ri, ro, h, b, ao) {
    const sh = new T.Shape(), steps = 6, ang = (r) => SEGA / 2 - (b + 0.014) / r, px = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
    for (let i = 0; i <= steps; i++) { const a = ang(ro - b), [x, y] = px(ro - b, -a + 2 * a * i / steps); i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    for (let i = steps; i >= 0; i--) { const a = ang(ri + b), [x, y] = px(ri + b, -a + 2 * a * i / steps); sh.lineTo(x, y); }
    const d = Math.max(0.001, h - 2 * b), g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, -d / 2, -(ri + ro) / 2);
    if (ao) { const P = g.attributes.position, col = new Float32Array(P.count * 3), rc = (ri + ro) / 2;     // cheap AO: 0.74 at the pole edge → 1 at the rim
      for (let i = 0; i < P.count; i++) { const r = Math.hypot(P.getX(i), P.getZ(i) + rc), v = 0.74 + 0.26 * SS(ri, ro - 0.1, r); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
      g.setAttribute('color', new T.BufferAttribute(col, 3)); }
    return g;
  }
  const hsl = { h: 0, s: 0, l: 0 }, sat = (c, k) => { c.getHSL(hsl); return c.setHSL(hsl.h, Math.min(1, hsl.s * k), hsl.l); };
  const ringCol = (i, o = c1) => { const f = i / (N - 1) * (K_.stops - 1), k = Math.min(K_.stops - 2, Math.floor(f)); return sat(o.set(COL.ringStops[k]).lerp(c2.set(COL.ringStops[k + 1]), f - k), 1.12); };
  const place = (mesh, idx, r, y, th, sc = 1, sy = 1) => { q1.setFromAxisAngle(UP, th); m4.compose(v1.set(r * Math.sin(th), y, r * Math.cos(th)), q1, s1.set(sc, sy, sc)); mesh.setMatrixAt(idx, m4); };
  const geoParts = (parts) => T.BufferGeometryUtils.mergeGeometries(parts.map(([g, hex, p = [0, 0, 0]]) => K_.paint(g.translate(p[0], p[1], p[2]), hex)));
  function islandGeo() {                                                           // floating rock island, ~120 tris, base y = 0
    const parts = [[new T.CylinderGeometry(1, 0.9, 0.16, 9), COL.island, [0, 0, 0]], [new T.ConeGeometry(0.9, 1.5, 9).rotateX(Math.PI), COL.rock, [0, -0.82, 0]]];
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4, r = 0.45 + 0.12 * k; parts.push([new T.ConeGeometry(0.16, 0.5, 5), COL.tree, [Math.cos(a) * r, 0.33, Math.sin(a) * r]]); }
    parts.push([new T.OctahedronGeometry(0.18), 0xff7ab8, [-0.2, 0.28, 0.1]]); return geoParts(parts);
  }
  function cloudGeo() { return geoParts([[new T.IcosahedronGeometry(0.62, 1), 0xffffff, [0, 0, 0]], [new T.IcosahedronGeometry(0.5, 1), 0xffffff, [0.62, -0.1, 0.1]],
    [new T.IcosahedronGeometry(0.46, 1), 0xffffff, [-0.6, -0.12, -0.05]], [new T.IcosahedronGeometry(0.4, 1), 0xffe9f2, [0.15, 0.25, 0.1]]]); }
  function checkerTex(rings, spokes) {                                              // polar black/white checker for the finish platform
    const n = 512, cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'), im = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI, i = (y * n + x) * 4;
      const on = (Math.floor(r * rings) + Math.floor(a / TAU * spokes)) % 2 === 0, v = on ? 28 : 244; im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v + (on ? 6 : 0); im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
  }

  // ---------------- init ----------------
  S.init = async (gl, hudCv, W, H) => {
    K_ = KIT; K_.stops = COL.ringStops.length; VW = W; VH = H; R = KIT.renderer(gl, W, H); R.info.autoReset = false; KIT.H.init(hudCv, W, H);
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.2;
    scene = new T.Scene(); scene.fog = new T.Fog(0xc2507a, 15, 60);
    cam = new T.PerspectiveCamera(50, W / H, 0.5, 90);
    hemi = new T.HemisphereLight(0xffe4cc, 0x8a5fa8, 0.6); scene.add(hemi);
    rim = new T.DirectionalLight(0xff4f9a, 1.6); scene.add(rim, rim.target);                                  // pink back-light: silhouettes pop off the sky
    { const es = new T.Scene(), sky = new T.Mesh(new T.SphereGeometry(30, 24, 16), new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true })), P = sky.geometry.attributes.position, c = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) { const k = (P.getY(i) / 30 + 1) / 2; c1.set(0xc2507a).lerp(c2.set(0xffb36b), k); c[i * 3] = c1.r; c[i * 3 + 1] = c1.g; c[i * 3 + 2] = c1.b; }
      sky.geometry.setAttribute('color', new T.BufferAttribute(c, 3)); es.add(sky);
      for (const [col, m, p, r] of [[0xffd9a0, 3.0, [-12, 10, 8], [0.4, 0.5, 0]], [0xff6aa8, 2.0, [12, 3, -10], [0, -2.4, 0]], [0xbfe3ff, 1.0, [0, 18, 0], [Math.PI / 2, 0, 0]]]) {   // soft boxes → reflections on the glossy black
        const pl = new T.Mesh(new T.PlaneGeometry(14, 9), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(m), side: T.DoubleSide })); pl.position.set(...p); pl.lookAt(0, 0, 0); es.add(pl); }
      const pm = new T.PMREMGenerator(R); envTex = pm.fromScene(es, 0.03).texture; pm.dispose(); scene.environment = envTex; }
    sun = new T.DirectionalLight(0xfff0dc, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 6, bottom: -6, near: 1, far: 40 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; scene.add(sun, sun.target);
    // sky: a full-screen gradient (colours follow the depth) + soft bokeh circles that scroll slower than the tower (parallax)
    // bokeh + stars are baked once into a tiling texture (R = bokeh, G = stars): no per-pixel loops, scrolling = uv offset
    const bake = document.createElement('canvas'); bake.width = 256; bake.height = 512;
    { const g = bake.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) { const x = h1(i * 1.7) * 256, y = h1(i * 5.3) * 512, r = 14 + 36 * h1(i * 9.1), al = 0.2 + 0.3 * h1(i * 2.3);
        for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 512], [0, -512]]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, 'rgba(255,0,0,' + al + ')'); gr.addColorStop(0.55, 'rgba(255,0,0,' + al + ')'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } }
      for (let i = 0; i < 90; i++) { const x = h1(i * 2.9 + 7) * 256, y = h1(i * 6.1 + 3) * 512; g.fillStyle = 'rgba(0,255,0,' + (0.4 + 0.6 * h1(i * 8.8)) + ')'; g.beginPath(); g.arc(x, y, 0.8 + 1.4 * h1(i * 4.4), 0, 7); g.fill(); } }
    const bakeTex = new T.CanvasTexture(bake); bakeTex.wrapS = bakeTex.wrapT = T.RepeatWrapping;
    bgScene = new T.Scene(); bgCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    bgMat = new T.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { uTop: { value: new T.Color() }, uBot: { value: new T.Color() }, uScroll: { value: 0 }, uAsp: { value: W / H }, uGlow: { value: 0 }, uDepth: { value: 0 }, uTex: { value: bakeTex } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform vec3 uTop, uBot; uniform float uScroll, uAsp, uGlow, uDepth; uniform sampler2D uTex;
        void main(){ vec3 c = mix(uBot, uTop, smoothstep(0.0, 1.0, vUv.y));
          c += vec3(1.0, 0.72, 0.5) * (0.28 + 0.25 * uGlow) * exp(-pow((vUv.y - 0.30) * 3.0, 2.0));
          vec2 b = vec2(vUv.x * uAsp * 2.0, vUv.y);
          float bk = texture2D(uTex, b * 0.9 + vec2(0.0, uScroll * 0.5)).r * 0.6 + texture2D(uTex, b * 1.5 + vec2(0.37, uScroll * 0.8)).r * 0.45;
          float st = texture2D(uTex, b * 2.2).g * smoothstep(0.45, 0.8, uDepth) * smoothstep(0.25, 0.7, vUv.y);
          c += vec3(1.0, 0.84, 0.92) * bk + vec3(1.0, 0.95, 1.0) * st;
          vec2 q = vUv - 0.5; c *= 1.0 - 0.45 * dot(q, q);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }` });
    bgScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), bgMat));
    // the tower: pole + a window of instanced ring segments (colour per instance, black segments glossy with a hot-pink rim)
    const segGeo = sectorGeo(R_IN, R_OUT, TH, 0.045, true), CAP = 12 * WIN;
    segMesh = new T.InstancedMesh(segGeo, new T.MeshStandardMaterial({ roughness: 0.38, metalness: 0.0, vertexColors: true }), CAP);
    blkMesh = new T.InstancedMesh(segGeo, new T.MeshStandardMaterial({ color: COL.black, roughness: 0.12, metalness: 0.85, vertexColors: true, envMap: envTex, envMapIntensity: 1.0 }), CAP);
    rimMat = new T.MeshBasicMaterial({ color: COL.rim, toneMapped: false }); rimMesh = new T.InstancedMesh(sectorGeo(R_OUT - 0.1, R_OUT, 0.03, 0.006), rimMat, CAP);
    for (const m of [segMesh, blkMesh]) { m.castShadow = m.receiveShadow = true; }
    for (const m of [segMesh, blkMesh, rimMesh]) { m.frustumCulled = false; scene.add(m); }
    segMesh.setColorAt(0, c1.set(0xffffff));
    pole = new T.Mesh(new T.CylinderGeometry(R_POLE, R_POLE, 80, 28, 1, true), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x707070 })); pole.receiveShadow = true; scene.add(pole);
    // finish platform: white drum with a polar checker top
    fin = new T.Group(); const drum = new T.Mesh(new T.CylinderGeometry(R_OUT * 1.3, R_OUT * 1.36, 0.55, 40), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); drum.position.y = -0.275; drum.receiveShadow = true;
    const top = new T.Mesh(new T.CircleGeometry(R_OUT * 1.3, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: checkerTex(5, 24), roughness: 0.6 })); top.position.y = 0.002; top.receiveShadow = true;
    const lip = new T.Mesh(new T.TorusGeometry(R_OUT * 1.3, 0.07, 6, 48).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0xff4f7b, roughness: 0.4 })); lip.position.y = 0.0;
    const collar = new T.Mesh(new T.CylinderGeometry(R_POLE * 1.35, R_POLE * 1.45, 0.16, 28), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })); collar.position.y = 0.08;
    const band = new T.Mesh(new T.TorusGeometry(R_POLE * 1.4, 0.04, 6, 36).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0xff4f7b, roughness: 0.4 })); band.position.y = 0.15;
    fin.add(drum, top, lip, collar, band); fin.position.y = Yw(SIM.ringTop(N)); scene.add(fin);
    // the ball
    ball = new T.Group(); ballMat = new T.MeshStandardMaterial({ color: COL.ball, roughness: 0.32, metalness: 0.05, emissive: 0x000000, envMap: envTex, envMapIntensity: 0.6 });
    const bm = new T.Mesh(new T.SphereGeometry(1, 28, 20), ballMat); bm.scale.setScalar(BR); bm.castShadow = false;   // the contact blob is the ball's only shadow (a second, sun-offset one looked like a stray stain) ball.add(bm); scene.add(ball); ball.userData.mesh = bm;
    blob = new T.Mesh(new T.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.4, depthWrite: false })); scene.add(blob);
    // per-frame instanced FX: ring pieces (plain and molten), chips, shock rings, flame, speed lines
    deb = new KIT.Pool(scene, segGeo, new T.MeshStandardMaterial({ roughness: 0.45, vertexColors: true }), 150, { shadow: false });
    lava = new KIT.Pool(scene, segGeo, new T.MeshBasicMaterial({ toneMapped: false }), 220);
    chips = new KIT.Pool(scene, new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ roughness: 0.4 }), 900);
    const add = (o) => new T.MeshBasicMaterial(Object.assign({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }, o));
    waves = new KIT.Pool(scene, new T.RingGeometry(0.88, 1, 36).rotateX(-Math.PI / 2), add({ side: T.DoubleSide }), 32);
    flash = new KIT.Pool(scene, new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2), add(), 24);
    glow = new KIT.Pool(scene, new T.SphereGeometry(1, 10, 8), add(), 48);
    lines = new KIT.Pool(scene, new T.BoxGeometry(0.06, 1, 0.06), add(), 64);
    { const g = new T.CylinderGeometry(0.2, 1, 1, 16, 1, true).translate(0, 0.5, 0), P = g.attributes.position, c = new Float32Array(P.count * 4);    // the dive trail: one translucent cone, alpha 0.6 → 0
      for (let i = 0; i < P.count; i++) { c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = 1; c[i * 4 + 3] = 0.6 * (1 - P.getY(i)); }
      g.setAttribute('color', new T.BufferAttribute(c, 4)); cone = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide })); scene.add(cone); }
    // background: floating islands and clouds in two instanced draws (far ones are bigger and recycle outside the view)
    isl = new KIT.Pool(scene, islandGeo(), KIT.vmat, 8); cld = new KIT.Pool(scene, cloudGeo(), new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xffc4da, emissiveIntensity: 0.2 }), 10);
    S.ISL = [[-5.4, -9, 1.7, 0.5], [5.8, -10, 2.0, 0.45], [-4.2, -4, 0.9, 0.7], [7.0, -16, 2.6, 0.3], [-2.0, -26, 3.2, 0.2]];
    S.CLD = [[-3.8, -7, 1.8, 0.55], [4.2, -9, 2.2, 0.48], [-6.0, -14, 3.0, 0.38], [6.4, -15, 3.2, 0.35], [-3.0, -24, 4.2, 0.25], [3.2, -28, 4.6, 0.22], [-5.0, -3, 1.1, 0.72]];
    for (const n of Object.keys((window.BUILD || {}).images || {})) KIT.H.img[n] = await KIT.image(n);
    // endcard 3D pass: the ball bouncing on a checker podium under confetti, over the dimmed world
    end.scene = new T.Scene(); end.cam = new T.PerspectiveCamera(30, W / H, 0.1, 100);
    end.scene.add(new T.HemisphereLight(0xffe9d0, 0x8a5fa8, 1.4)); const l = new T.DirectionalLight(0xffffff, 2.6); l.position.set(-3, 6, 5); end.scene.add(l);
    end.pod = new T.Group(); { const M = (c, r = 0.45) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: c === 0xffd23a ? 0.5 : 0 });
      end.pod.add(new T.Mesh(new T.CylinderGeometry(1.3, 1.38, 0.5, 44), M(0xffffff)).translateY(-0.25), new T.Mesh(new T.RingGeometry(1.0, 1.3, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: checkerTex(2, 24), roughness: 0.6 })).translateY(0.003),
        new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 0.18, 44), M(0xff4f7b)).translateY(0.09), new T.Mesh(new T.CylinderGeometry(0.74, 0.74, 0.18, 44), M(0xffd23a, 0.3)).translateY(0.27)); }
    end.scene.add(end.pod);
    { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,230,200,1)'); gr.addColorStop(0.4, 'rgba(255,150,200,0.45)'); gr.addColorStop(1, 'rgba(255,100,200,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); end.halo = new T.Mesh(new T.PlaneGeometry(7, 7), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 })); end.halo.position.set(0, 1.5, -1.5); end.scene.add(end.halo); }
    end.ballMat = ballMat.clone(); end.ball = new T.Mesh(new T.SphereGeometry(0.42, 28, 20), end.ballMat); end.scene.add(end.ball);
    end.shadow = new T.Mesh(new T.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.35 })); end.shadow.position.y = 0.37; end.scene.add(end.shadow);
    end.conf = new KIT.Pool(end.scene, new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 }), 220);
    end.dim = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ color: 0x2a1050, transparent: true, depthTest: false }));
    end.dimScene = new T.Scene(); end.dimScene.add(end.dim); end.dimCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return S;
  };

  // ---------------- per-frame ----------------
  const sky3 = (a, k) => (k < 0.5 ? c1.set(a[0]).lerp(c2.set(a[1]), k * 2) : c1.set(a[1]).lerp(c2.set(a[2]), (k - 0.5) * 2)).clone();
  const skyAt = (d) => { const k = SS(0.05, 0.95, d); return [sat(sky3(COL.skyTop, k), 1.12), sat(sky3(COL.skyBot, k), 1.12)]; };

  const wrap = (v, r) => ((v + r / 2) % r + r) % r - r / 2;

  S.render = (t) => {
    const ST = S.state || SIM.at(t), GT = ST.t, cr = ST.cr; S.cur = ST;
    const camYw = -ST.cam[1] * U, hot = ST.fireOn ? 1 : ST.heat * 0.7, fireK = ST.fireOn ? 1 : 0;
    const fk = ST.fireOn ? Math.min(SS(0, 0.3, GT - (ST.fireUntil - K.FIRE_T)), SS(0, 0.4, ST.fireUntil - GT)) : 0;     // fire blend 0..1 (in/out)
    // ---- sky + fog follow the depth ----
    const [top, bot] = skyAt(clamp(ST.cam[1] / SIM.ringTop(N), 0, 1));
    bgMat.uniforms.uTop.value.copy(top); bgMat.uniforms.uBot.value.copy(bot); bgMat.uniforms.uScroll.value = -camYw * 0.06; bgMat.uniforms.uGlow.value = fireK;
    scene.fog.color.copy(bot).lerp(top, 0.25); hemi.color.copy(top).lerp(c2.set(0xffffff), 0.55);
    // ---- the standing tower: only the first WIN intact rings, one instance per segment ----
    let ns = 0, nb = 0; const r0 = Math.min(cr, N), r1 = Math.min(N - 1, r0 + WIN - 1), spin = ST.rot;
    for (let i = r0; i <= r1; i++) { const rg = RINGS[i], yc = Yw(SIM.ringTop(i)) - TH / 2; ringCol(i, c1);
      for (let j = 0; j < 12; j++) { const th = rg.off + spin + (j + 0.5) * SEGA;
        if ((rg.mask >> j) & 1) { place(blkMesh, nb, RM, yc, th); place(rimMesh, nb, R_OUT - 0.05, yc + TH / 2 + 0.012, th); nb++; }
        else { place(segMesh, ns, RM, yc, th); segMesh.setColorAt(ns, c1); ns++; } } }
    segMesh.count = ns; blkMesh.count = rimMesh.count = nb;
    for (const m of [segMesh, blkMesh, rimMesh]) m.instanceMatrix.needsUpdate = true; segMesh.instanceColor.needsUpdate = true;
    const threat = ST.hold && ST.alive && !ST.fireOn && cr < N && SIM.blackAt(cr, spin, 0.6);
    let dieA = 9; for (const e of ST.ev) if (e.k === 'die') dieA = Math.min(dieA, GT - e.t);
    rimMat.color.setRGB(1, 0.18, 0.49).multiplyScalar((threat ? 1.15 + 0.5 * Math.sin(GT * 24) : 0.8 + 0.12 * Math.sin(GT * 3)) + (dieA >= 0 && dieA < 0.5 ? 2.2 * (1 - dieA / 0.5) : 0));
    const poleTop = camYw + 28, poleBot = Math.max(camYw - 52, Yw(SIM.ringTop(N))); pole.scale.y = Math.max(0.01, (poleTop - poleBot) / 80); pole.position.y = (poleTop + poleBot) / 2;
    fin.visible = ST.end < 0 && cr + WIN >= N - 2;
    // ---- the ball ----
    const alive = ST.alive, bw = Yw(ST.by), age = GT - Math.max(ST.bounceT, ST.smashT), sq = age < 0.14 ? Math.sin(Math.PI * age / 0.14) : 0;
    let rsp = -9; for (const e of ST.ev) if (e.k === 'respawn') rsp = Math.max(rsp, e.t);
    const pop = alive ? ease(clamp((GT - rsp) / 0.25, 0, 1)) : 0, sy = (1 - 0.34 * sq) * (1 + 0.16 * clamp(ST.bv / 900, 0, 1)), sxz = 1 / Math.sqrt(sy);
    ball.visible = alive && pop > 0.01 && ST.end < 0; ball.position.set(RM * Math.sin(BA), bw - BR + BR * sy, RM * Math.cos(BA)); const big = 1 + 0.25 * fk; ball.scale.set(sxz * pop * big, sy * pop * big, sxz * pop * big);
    ballMat.emissive.setRGB(1, 0.42, 0.1).multiplyScalar(hot * (0.5 + 0.2 * Math.sin(GT * 30) * fireK)); ballMat.color.set(COL.ball).lerp(c2.set(0xff8a3a), fireK * 0.75 + ST.heat * 0.12);
    // contact shadow on the ring (or platform) below the ball
    const topY = Yw(SIM.ringTop(Math.min(cr, N))), hgt = bw - BR - topY;
    blob.visible = alive && ST.end < 0 && hgt > -0.1 && hgt < 3; blob.position.set(RM * Math.sin(BA), topY + 0.006, RM * Math.cos(BA)); blob.scale.setScalar(BR * (1.1 - 0.12 * clamp(hgt, 0, 2)) * 0.95); blob.material.opacity = 0.42 * (1 - clamp(hgt / 3, 0, 1));
    // ---- ring pieces + chips + flash/shock rings of the rings smashed in the last 0.9 s (stateless: from brk[] / brkRot[]) ----
    deb.begin(); lava.begin(); chips.begin(); waves.begin(); flash.begin();
    for (let i = Math.max(0, cr - 16); i < cr; i++) { const a = GT - ST.brk[i]; if (ST.brk[i] < 0 || a > 0.9 || a < 0) continue;
      const rg = RINGS[i], f = ST.brkF[i], yt = Yw(SIM.ringTop(i)) - TH / 2, k = 1 - SS(0.4, 0.65, a), kc = 1 - SS(0.6, 0.9, a); ringCol(i, c1);
      if (a < 0.65) for (let j = 0; j < 12; j++) { const sd = i * 13 + j * 7, th = rg.off + ST.brkRot[i] + (j + 0.5) * SEGA + K.ROT * a * 0.35, blk = (rg.mask >> j) & 1;
        const vo = 1.5 + 2.7 * h1(sd), vu = 2.4 + 3.2 * h1(sd + 1), rad = RM + vo * a, ty = yt + vu * a - 9.8 * a * a;
        e1.set(a * (4 + 7 * h1(sd + 2)) * (h1(sd + 3) > 0.5 ? 1 : -1), th, a * (3 + 5 * h1(sd + 4)), 'YXZ'); q1.setFromEuler(e1);
        const dA = Math.abs(((th - BA) % TAU + TAU + Math.PI) % TAU - Math.PI) / Math.PI, kf = k * 0.5 * (0.5 + 0.5 * SS(0.2, 0.9, dA));   // slabs: half size, quarter near the ball
        m4.compose(v1.set(rad * Math.sin(th), ty, rad * Math.cos(th)), q1, s1.set(kf, kf, kf));
        if (f > 0) { const g = (blk ? 0.2 : 0.55) + 0.45 * (1 - a / 0.65); lava.addMatrix(m4, c2.setRGB(1, 0.35 + 0.4 * (1 - a), blk ? 0.05 : 0.12).multiplyScalar(g * 1.15)); }
        else deb.addMatrix(m4, blk ? c2.set(COL.black) : c1); }
      for (let j = 0; j < 40; j++) { const sd = i * 31 + j * 3, th = h1(sd) * TAU + rg.off + ST.brkRot[i], vo = 1.2 + 3.4 * h1(sd + 1), rad = RM * (0.7 + 0.5 * h1(sd + 2)) + vo * a, sz = (0.06 + 0.10 * h1(sd + 3)) * kc;
        e1.set(a * 9 * h1(sd + 4), a * 7, a * 6 * h1(sd + 5)); q1.setFromEuler(e1); m4.compose(v1.set(rad * Math.sin(th), yt + 0.3 + (2 + 3.4 * h1(sd + 6)) * a - 8 * a * a, rad * Math.cos(th)), q1, s1.set(sz, sz, sz));
        chips.addMatrix(m4, f > 0 ? c2.set(f === 2 ? 0xff5a1a : 0xffc233) : (j % 5 === 0 ? c2.set(COL.black) : c2.copy(c1).multiplyScalar(0.8 + 0.4 * h1(sd + 7)))); }
      if (a < 0.1) { const w = a / 0.1; m4.compose(v1.set(0, yt + TH / 2 + 0.02, 0), q1.identity(), s1.set(1.4 * ease(w) + 0.3, 1, 1.4 * ease(w) + 0.3)); flash.addMatrix(m4, c2.setRGB(1, 0.95, 0.85).multiplyScalar((f ? 1 : 0.75) * (1 - w))); }
      if (a < 0.32 && i % 3 === 0) { const w = a / 0.32, s = RM * 0.6 + (R_OUT + 0.3 - RM * 0.6) * ease(w); m4.compose(v1.set(0, yt + TH / 2 + 0.01, 0), q1.identity(), s1.set(s, 1, s)); waves.addMatrix(m4, c2.setRGB(1, 1, 1).multiplyScalar(0.3 * (1 - w))); } }
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      if (e.k === 'die' && a < 0.9) for (let j = 0; j < 48; j++) { const th = j * 2.4 + h1(j) * 2, vo = 1 + 3 * h1(j + 9), sz = (0.06 + 0.1 * h1(j + 3)) * (1 - SS(0.6, 0.9, a));
        e1.set(a * 8 + j, a * 6, 0); q1.setFromEuler(e1); m4.compose(v1.set(RM * Math.sin(BA) + Math.sin(th) * vo * a, Yw(SIM.ringTop(e.ring)) + BR + (2.5 + 2.5 * h1(j + 5)) * a - 9 * a * a, RM * Math.cos(BA) + Math.cos(th) * vo * a), q1, s1.set(sz, sz, sz));
        chips.addMatrix(m4, j % 3 ? c2.set(COL.ball) : c2.set(0xffffff)); } }
    deb.end(); lava.end(); chips.end(); waves.end(); flash.end();
    // ---- dive trail (one cone), flame in fire mode, speed lines at the screen edges ----
    glow.begin(); lines.begin();
    const diving = alive && ((ST.hold && ST.bv > 150) || ST.fireOn); cone.visible = diving;
    if (diving) { const sp = clamp(ST.bv / 480, 0.3, 1.2), w = BR * (ST.fireOn ? 1.15 : 0.95);
      cone.position.set(RM * Math.sin(BA), bw + BR * 0.2, RM * Math.cos(BA)); cone.scale.set(w, (0.7 + 1.1 * sp) * (ST.fireOn ? 1.6 : 1), w);
      cone.material.color.setRGB(0.35, 0.8, 1).lerp(c1.setRGB(1, 0.45, 0.1), ST.fireOn ? 1 : hot * 0.8); }
    if (ST.fireOn && alive) for (let k = 0; k < 10; k++) { const ph = (GT * 4 + k / 10) % 1, fl = h1(k * 7 + Math.floor(GT * 24)), s = BR * 0.9 * (1 - ph * 0.7) * (0.85 + 0.3 * fl);
      c2.setRGB(1, 0.28 + 0.4 * (1 - ph), 0.04).multiplyScalar((1 - ph) * 0.5); m4.compose(v1.set(RM * Math.sin(BA) + (fl - 0.5) * 0.1, bw + BR * 0.8 + ph * 2.1, RM * Math.cos(BA) + (h1(k) - 0.5) * 0.1), q1.identity(), s1.set(s, s * 1.7, s)); glow.addMatrix(m4, c2); }
    for (const e of ST.ev) if (e.k === 'die') { const a = GT - e.t; if (a >= 0 && a < 0.25) { const w = a / 0.25; m4.compose(v1.set(RM * Math.sin(BA), Yw(SIM.ringTop(e.ring)) + BR, RM * Math.cos(BA)), q1.identity(), s1.set(2.4 * ease(w) + 0.1, 2.4 * ease(w) + 0.1, 2.4 * ease(w) + 0.1)); glow.addMatrix(m4, c2.setRGB(1, 0.5, 0.8).multiplyScalar(0.7 * (1 - w))); } }
    if (fireK && alive) for (let k = 0; k < 60; k++) { const x = (h1(k * 4.4) > 0.5 ? 1 : -1) * (2.3 + 2.6 * h1(k * 3.3)), z = (h1(k * 5.1) - 0.2) * 5 + 1, len = 1 + 2.6 * h1(k * 7.7), y = camYw + wrap(h1(k * 9.1) * 12 - GT * (9 + 6 * h1(k)), 12) * 0.9;
      m4.compose(v1.set(x, y, z), q1.identity(), s1.set(1, len, 1)); lines.addMatrix(m4, c2.setRGB(1, 0.8, 0.55).multiplyScalar(0.5)); }
    glow.end(); lines.end();
    // ---- background islands + clouds: parallax (slower than the tower); the recycle period is longer than the view at that depth, so props never pop in view ----
    isl.begin(); cld.begin();
    const per = (z) => Math.max(26, 1.25 * (13.5 - z) + 6);
    S.ISL.forEach(([x, z, s, p], k) => { const P = per(z), y = camYw + wrap(h1(k * 4.1) * P - camYw * p, P), bob = 0.08 * Math.sin(GT * 0.8 + k); q1.setFromAxisAngle(UP, k + GT * 0.05);
      m4.compose(v1.set(x, y + bob, z), q1, s1.set(s, s, s)); isl.addMatrix(m4, c2.set(0xffffff).lerp(c1.copy(bot), 0.25)); });
    S.CLD.forEach(([x, z, s, p], k) => { const P = per(z), y = camYw + wrap(h1(k * 6.7 + 3) * P - camYw * p, P), sx = [1.5, 1.1, 1.9][k % 3], sy = [0.7, 0.95, 0.55][k % 3]; q1.setFromAxisAngle(UP, k * 0.9);
      m4.compose(v1.set(x + 0.15 * Math.sin(GT * 0.3 + k), y, z), q1, s1.set(s * sx, s * sy, s)); cld.addMatrix(m4, c2.set(0xffffff).lerp(c1.copy(top), 0.25)); });
    isl.end(); cld.end();
    // ---- camera: pitch −28°, follows the sim's camera (which only ever goes down); shake + FOV punch on smashes, wide-angle rush in fire ----
    const sa = GT - ST.smashT; let tr = 0; if (sa >= 0 && sa < 0.2) tr = 0.3 * (1 - sa / 0.2) * (ST.fireOn ? 1.7 : 1);
    for (const e of ST.ev) { const a = GT - e.t; if (e.k === 'die' && a >= 0 && a < 0.45) tr = Math.max(tr, 1 - a / 0.45); if (e.k === 'finish' && a >= 0 && a < 0.4) tr = Math.max(tr, 0.4 * (1 - a / 0.4)); }
    const fov = 50 + 3 * fk - (sa >= 0 && sa < 0.2 ? 3 * (1 - sa / 0.2) : 0);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const sh = 0.16 * tr, d = 13.5 / ST.zoom, pitch = 0.4887;
    const tx = sh * Math.sin(GT * 83), ty = camYw + sh * Math.sin(GT * 97 + 1);
    cam.position.set(tx, ty + Math.sin(pitch) * d, Math.cos(pitch) * d); cam.lookAt(tx, ty, 0);
    sun.position.set(-4, ty + 8, 5); sun.target.position.set(0, ty - 1, 0); sun.target.updateMatrixWorld(); rim.position.set(4, ty + 2, -6); rim.target.position.set(0, ty, 0); rim.target.updateMatrixWorld();
    bgMat.uniforms.uDepth.value = clamp(ST.cam[1] / SIM.ringTop(N), 0, 1);
    R.info.reset(); R.autoClear = true; R.render(bgScene, bgCam); R.autoClear = false; R.clearDepth(); R.render(scene, cam);
    // ---- endcard: dim the world, then ball + podium + confetti on top (text and buttons come from hud.js) ----
    if (ST.end >= 0) { const a = GT - ST.end, k = SS(0, 0.45, a), win = ST.endWhy === 'win';
      end.dim.material.opacity = (win ? 0.38 : 0.55) * k; R.render(end.dimScene, end.dimCam);
      if (a > 0.1) { const b = a - 0.1, bounce = Math.abs(Math.sin(b * 5.2)) * (0.62 + 0.3 * Math.exp(-b * 0.6)), sqz = 1 - 0.25 * Math.max(0, 1 - Math.abs(Math.sin(b * 5.2)) * 6);
        end.ball.position.set(0, 0.36 + 0.42 * sqz + bounce, 0); end.ball.scale.set(1 / Math.sqrt(sqz), sqz, 1 / Math.sqrt(sqz)); end.ball.rotation.y = b * 2;
        end.ballMat.color.copy(ballMat.color); end.ballMat.emissive.setRGB(0, 0, 0); end.shadow.scale.setScalar(1 - 0.35 * bounce); end.halo.visible = true; end.halo.scale.setScalar(0.9 + 0.1 * Math.sin(b * 3));
        end.pod.scale.setScalar(ease(clamp(b / 0.5, 0, 1)) * 1.0 + 0.001); end.ball.visible = end.shadow.visible = true;
        end.conf.begin(); if (win) for (let j = 0; j < 220; j++) { const sd = j * 5.3, ph = (b * (0.35 + 0.3 * h1(sd)) + h1(sd + 1) * 3) % 1, x = (h1(sd + 2) - 0.5) * 4.2 + 0.3 * Math.sin(b * 3 + j), z = (h1(sd + 3) - 0.5) * 2 + 0.5, y = 3.4 - 4.8 * ph;
          e1.set(b * 5 + j + 2 * Math.sin(b * 6 + j), b * 4, b * 3); q1.setFromEuler(e1); m4.compose(v1.set(x + 0.15 * Math.sin(b * 5 + j), y, z), q1, s1.set(0.09, 0.03, 0.14)); end.conf.addMatrix(m4, c2.setHSL(h1(sd + 4), 0.9, 0.62)); }
        end.conf.end();
        end.cam.position.set(0, 2.4, 14); end.cam.lookAt(0, 1.2, 0); end.cam.setViewOffset(VW, VH, 0, VH * 0.12, VW, VH);
        R.clearDepth(); R.render(end.scene, end.cam); } }
    R.autoClear = true;
    S.proj = (x3, y3, z3) => KIT.proj(cam, x3, y3, z3, VW, VH);
    S.ballScreen = () => { const p = KIT.proj(cam, ball.position.x, ball.position.y, ball.position.z, VW, VH), pe = KIT.proj(cam, ball.position.x, ball.position.y + BR, ball.position.z, VW, VH);
      return p && pe ? [p[0], p[1], Math.abs(pe[1] - p[1])] : null; };
    S.ringScreen = (i) => KIT.proj(cam, 0, Yw(SIM.ringTop(i)), RM, VW, VH);
    HUD.draw(ST, t, S.proj);
    S.hit = HUD.hit;
  };

  S.stats = () => ({ calls: R.info.render.calls, tris: R.info.render.triangles });
  // numbers instead of screenshots: draw calls, triangles, the hero's (ball) screen box, HUD boxes off-screen / overlapping
  S.probe = () => { const was = ball.visible; ball.visible = true; const b = KIT.screenBox(cam, ball, VW, VH), c = HUD.check(); ball.visible = was;
    return { calls: R.info.render.calls, tris: R.info.render.triangles, hero: b, heroH: b ? +((b[3] - b[1]) / VH * 100).toFixed(1) : 0,
      heroOn: !!b && b[0] >= 0 && b[2] <= VW && b[1] >= 0 && b[3] <= VH, hudOut: c.out, hudOverlap: c.ov }; };
  // QA states: every beat of the ad, staged headless by driving the sim (bot or a scripted finger) — tools/probe uses these
  S.QA = () => { const clone = (o) => JSON.parse(JSON.stringify(o)), bot = (D) => SIM.scriptInput(D.t, D);
    const run = (inp, until, extra = 0) => { const D = SIM.create(); while (D.t < 40 && !until(D)) SIM.step(D, inp(D)); const t1 = D.t + extra; while (D.t < t1) SIM.step(D, inp(D)); return clone(D); };
    const hold = (D) => ({ press: D.t > 0.3 ? 1 : 0 }), tap = (D) => ({ press: (D.t % 1) < 0.8 ? 1 : 0 });
    return [['start', run(bot, (D) => D.t >= 0.3)], ['firstSmash', run(bot, (D) => D.rings >= 1, 0.12)], ['warn', run(hold, (D) => D.warned, 0.12)],
      ['heat50', run(bot, (D) => D.beats.heat50 !== undefined, 0.15)], ['fire', run(bot, (D) => D.beats.fire !== undefined, 0.7)], ['fireBlack', run(bot, (D) => D.blackBroken >= 3, 0.05)],
      ['death', run(hold, (D) => D.deaths >= 1, 0.3)], ['finish', run(bot, (D) => D.winT > 0, 0.5)], ['endcard_win', run(bot, (D) => D.end >= 0, 1.2)], ['endcard_lose', run(tap, (D) => D.end >= 0, 1.2)]]; };
})();
