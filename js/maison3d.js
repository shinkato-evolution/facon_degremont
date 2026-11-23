// maison3d.js — maison en coupe interactive (Façon Degremont)
// Module ES, three r170. Géométrie 100 % procédurale, aucun fichier externe.
// API : initMaison(container, { onSelect, onReady, reducedMotion }) -> { focus, reset, destroy }
//       webglDisponible() -> bool

import * as THREE from '../vendor/three.module.min.js';

/* ------------------------------------------------------------------ */
/* Palette (logo) et constantes                                        */
/* ------------------------------------------------------------------ */
const COL = {
  blue: '#70c8fa',
  grey: '#aaaaaa',
  light: '#efefef',
  ink: '#555555',
  white: '#fafafa',
  floor: '#f3f1ec',
  screed: '#a9a9a9',
  pipe: '#8d9398',
  tileA: '#f2f2f2',
  tileB: '#e1e1e1',
  wallTileA: '#fbfbfb',
  wallTileB: '#d3edfc',
  mirror: '#e4f4fe',
  glass: '#bfe6fd',
  air: '#9fd8fb',
};
const ZONES = ['placo', 'carrelage', 'electricite', 'plomberie', 'climatisation'];

// Conversion des coordonnées du logo (pixels de l'image source) vers la scène.
const SX = 8 / 697;          // 697 px de large -> 8 m
const SY = 0.007122;         // hauteur aplatie pour la maison
const LOGO_Y_RATIO = SX / SY; // proportion d'origine du logo (intro)
const LX = (px) => (px - 433) * SX - 4;
const LY = (py) => (985 - py) * SY;
const yC = (x) => 648 + 0.3547 * (x - 433); // pente descendante
const yB = (x) => 692 - 0.2558 * (x - 567); // pente montante

const BACK_Z0 = -2.62;  // dos du mur du fond
const PANEL_D = 0.12;   // épaisseur des panneaux -> face intérieure à -2.50

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Petites fonctions                                                   */
/* ------------------------------------------------------------------ */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eOut = (t) => 1 - Math.pow(1 - t, 3);
const eBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;

function isMobile() {
  try {
    return window.matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  } catch (e) { return false; }
}

// Décale un polygone simple vers l'intérieur (d > 0) ou l'extérieur (d < 0).
function offsetPolygon(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const s = area > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const nx = -dy * s, ny = dx * s;
    lines.push({ px: a[0] + nx * d, py: a[1] + ny * d, dx, dy });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    const cr = L1.dx * L2.dy - L1.dy * L2.dx;
    if (Math.abs(cr) < 1e-6) { out.push([L2.px, L2.py]); continue; }
    const t = ((L2.px - L1.px) * L2.dy - (L2.py - L1.py) * L2.dx) / cr;
    out.push([L1.px + L1.dx * t, L1.py + L1.dy * t]);
  }
  return out;
}

function shapeFrom(pts) {
  return new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
}

// Liste de pièces à fusionner : { g, m, color, edges, mesh }
function addBox(list, x, y, z, color, opts = {}) {
  const g = new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]);
  const m = new THREE.Matrix4().makeTranslation((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
  list.push({ g, m, color, edges: opts.edges !== false, mesh: opts.mesh !== false });
}
function addGeo(list, g, m, color, opts = {}) {
  list.push({ g, m: m || new THREE.Matrix4(), color, edges: opts.edges !== false, mesh: opts.mesh !== false });
}

// Fusionne en un seul maillage à couleurs de sommets + un seul jeu d'arêtes.
function buildMerged(list) {
  const pos = [], nor = [], col = [], ep = [];
  const c = new THREE.Color();
  for (const p of list) {
    if (p.edges) {
      const e = new THREE.EdgesGeometry(p.g, 24);
      e.applyMatrix4(p.m);
      const a = e.attributes.position.array;
      for (let i = 0; i < a.length; i++) ep.push(a[i]);
      e.dispose();
    }
    if (p.mesh) {
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      g.applyMatrix4(p.m);
      c.set(p.color);
      const a = g.attributes.position.array, nn = g.attributes.normal.array;
      for (let i = 0; i < a.length; i++) { pos.push(a[i]); nor.push(nn[i]); }
      for (let i = 0; i < a.length / 3; i++) col.push(c.r, c.g, c.b);
      g.dispose();
    }
    p.g.dispose();
  }
  let geo = null, egeo = null;
  if (pos.length) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
  }
  if (ep.length) {
    egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
  }
  return { geo, egeo };
}

function polyCurve(points) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) {
    path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1])));
  }
  return path;
}

function tube(points, radius, segPerUnit = 14) {
  const curve = polyCurve(points);
  const len = curve.getLength();
  const g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(len * segPerUnit)), radius, 6, false);
  return { g, curve, len };
}

/* ------------------------------------------------------------------ */
/* Détection WebGL                                                     */
/* ------------------------------------------------------------------ */
export function webglDisponible() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Scène                                                               */
/* ------------------------------------------------------------------ */
export function initMaison(container, options = {}) {
  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
  const onReady = typeof options.onReady === 'function' ? options.onReady : () => {};
  const reduced = !!options.reducedMotion;
  const mobile = isMobile();

  /* --- Rendu --- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true, // sans lissage, les contours anthracite sont crénelés sur téléphone
    alpha: true,
    powerPreference: 'default',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // 2 = net sur les écrans de téléphone (la maison est légère à dessiner)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'pan-y';
  canvas.style.outline = 'none';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // r155+ : intensités « physiques » (≈ ×π par rapport à l'ancien modèle)
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8ced4, 2.75);
  const sun = new THREE.DirectionalLight(0xffffff, 1.55);
  sun.position.set(3, 7, 6);
  scene.add(hemi, sun);

  const root = new THREE.Group();
  scene.add(root);

  /* --- Registre des matériaux atténuables --- */
  const fadeRegs = { shell: [] };
  ZONES.forEach((z) => (fadeRegs[z] = []));
  const WHITE = new THREE.Color(1, 1, 1);
  // Jaune doux : signale ce qui est cliquable (pulsation au repos, plus fort au survol).
  const HOVER = new THREE.Color('#ffd76a');
  const INK = new THREE.Color(COL.ink);
  const INK_FADED = new THREE.Color('#d9d9d9');
  const INK_HOVER = new THREE.Color('#d9a21b');

  function lambert(zone, base = '#ffffff', extra = {}) {
    const m = new THREE.MeshLambertMaterial({ color: base, ...extra });
    fadeRegs[zone].push({ type: 'lambert', m, base: new THREE.Color(base) });
    return m;
  }
  function lineMat(zone) {
    const m = new THREE.LineBasicMaterial({ color: COL.ink });
    fadeRegs[zone].push({ type: 'line', m });
    return m;
  }
  function basicMat(zone, color, opacity) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    fadeRegs[zone].push({ type: 'basic', m, base: opacity });
    return m;
  }
  function applyFade(reg, k, h) {
    if (reg.type === 'lambert') {
      // teinte jaune dans la couleur (une lumière jaune sur du blanc resterait blanche)
      reg.m.color.copy(reg.base).multiplyScalar(1 - k).lerp(HOVER, h * 0.6);
      const e = k * 0.92, hh = h * 0.12;
      reg.m.emissive.setRGB(e + HOVER.r * hh, e + HOVER.g * hh, e + HOVER.b * hh);
    } else if (reg.type === 'line') {
      reg.m.color.copy(INK).lerp(INK_FADED, k).lerp(INK_HOVER, h);
    } else if (reg.type === 'basic') {
      reg.m.opacity = reg.base * (1 - k * 0.75);
    } else if (reg.type === 'cable') {
      reg.m.uniforms.uFade.value = k;
      reg.m.uniforms.uHover.value = h;
    }
  }

  // Ajoute (maillage fusionné + arêtes) dans un groupe.
  function addMerged(group, list, zone) {
    const { geo, egeo } = buildMerged(list);
    if (geo) group.add(new THREE.Mesh(geo, lambert(zone, '#ffffff', { vertexColors: true })));
    if (egeo) group.add(new THREE.LineSegments(egeo, lineMat(zone)));
  }

  /* ================================================================ */
  /* 1. Mur du fond = panneaux du logo                                 */
  /* ================================================================ */
  const logoPanels = [
    { c: COL.grey, p: [[433, 985], [558, 985], [558, yC(558)], [433, 648]] },
    { c: COL.blue, p: [[558, 985], [638, 985], [638, yC(638)], [558, yC(558)]] },
    { c: COL.light, p: [[561.2, 693.5], [638, yB(638)], [638, yC(638)]] },
    { c: COL.blue, p: [[638, yB(638)], [638, 400], [935, yB(935)]] },
    { c: COL.grey, p: [[638, yB(638)], [942, yB(942)], [942, yC(942)], [638, yC(638)]] },
    { c: COL.light, p: [[638, yC(638)], [942, yC(942)], [942, 985], [638, 985]] },
    { c: COL.blue, p: [[942, yB(942)], [1130, 548], [1130, 985], [1022, 985], [1022, yC(1022)], [942, yC(942)]] },
    { c: COL.grey, p: [[942, yC(942)], [1022, yC(1022)], [1022, 985], [942, 985]] },
  ];
  const panelsGroup = new THREE.Group();
  root.add(panelsGroup);
  const panels = [];
  for (const lp of logoPanels) {
    const pts = lp.p.map(([x, y]) => [LX(x), LY(y)]);
    const ins = offsetPolygon(pts, 0.036);
    const geo = new THREE.ExtrudeGeometry(shapeFrom(ins), { depth: PANEL_D, bevelEnabled: false });
    const mat = lambert('shell', lp.c, { transparent: !reduced, opacity: reduced ? 1 : 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = BACK_Z0;
    let cx = 0, cy = 0;
    pts.forEach((p) => { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    const off = new THREE.Vector3(cx * 0.55, (cy - 1.6) * 0.9, 0);
    if (off.length() < 0.4) off.set(0, -1.0, 0);
    panels.push({ mesh, mat, off });
    panelsGroup.add(mesh);
  }
  // Fond anthracite qui forme le « trait » entre les panneaux.
  const outline = [[433, 985], [1130, 985], [1130, 548], [935, yB(935)], [638, 400], [638, yB(638)], [561.2, 693.5], [433, 648]]
    .map(([x, y]) => [LX(x), LY(y)]);
  const backingGeo = new THREE.ExtrudeGeometry(shapeFrom(offsetPolygon(outline, -0.05)), { depth: 0.105, bevelEnabled: false });
  const backingMat = lambert('shell', COL.ink, { transparent: !reduced, opacity: reduced ? 1 : 0 });
  const backing = new THREE.Mesh(backingGeo, backingMat);
  backing.position.z = -2.645;
  panelsGroup.add(backing);

  /* ================================================================ */
  /* 2. Coque : dalle, sols, murs latéraux, cloison salle de bain      */
  /* ================================================================ */
  const baseGroup = new THREE.Group();
  const wallsGroup = new THREE.Group();
  const roofGroup = new THREE.Group();
  root.add(baseGroup, wallsGroup, roofGroup);
  {
    const L = [];
    addBox(L, [-4.06, 4.06], [-0.2, 0], [-2.7, 2.56], COL.ink);
    addBox(L, [-3.88, -2.04], [0, 0.03], [-2.5, 2.5], COL.light);
    addBox(L, [-2.04, 1.56], [0, 0.03], [-2.5, 2.5], COL.floor);
    addBox(L, [1.64, 3.88], [0, 0.03], [-2.5, 2.5], COL.screed);
    // pièce de vie : tapis, canapé, table basse
    addBox(L, [-1.35, 0.55], [0.03, 0.05], [-0.7, 1.2], COL.blue);
    addBox(L, [0.78, 1.54], [0.03, 0.38], [-1.45, 0.45], COL.grey);
    addBox(L, [1.32, 1.54], [0.38, 0.82], [-1.45, 0.45], COL.grey);
    addBox(L, [0.78, 1.32], [0.38, 0.52], [-1.45, -1.28], COL.grey);
    addBox(L, [0.78, 1.32], [0.38, 0.52], [0.28, 0.45], COL.grey);
    addBox(L, [-0.75, 0.05], [0.05, 0.34], [-0.05, 0.6], COL.white);
    // entrée : porte et banc
    addBox(L, [-3.88, -3.84], [0.03, 2.0], [-2.2, -1.3], COL.grey);
    addBox(L, [-3.84, -3.8], [0.95, 1.05], [-1.45, -1.38], COL.ink, { edges: false });
    addBox(L, [-3.84, -3.42], [0.03, 0.42], [-0.9, 0.15], COL.light);
    addMerged(baseGroup, L, 'shell');
  }
  {
    const L = [];
    const side = (pts, xOuter) => {
      const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: 0.12, bevelEnabled: false });
      g.rotateY(-Math.PI / 2);
      g.translate(xOuter, 0, 0);
      return g;
    };
    // mur gauche (2,40 m au fond, coupé en pente vers l'avant)
    addGeo(L, side([[-2.62, 0], [2.5, 0], [2.5, 1.62], [-2.62, LY(648)]], -3.88), null, COL.white);
    // mur droit (3,11 m au fond, coupe franche pour voir la salle de bain)
    const g2 = side([[-2.62, 0], [2.5, 0], [2.5, 0.42], [-2.62, LY(548)]], 4.0);
    addGeo(L, g2, null, COL.white);
    // cloison pièce de vie / salle de bain
    addBox(L, [1.56, 1.64], [0.03, 2.4], [-2.5, -0.35], COL.white);
    addMerged(wallsGroup, L, 'shell');
  }
  {
    // Toits en pente : bandeaux qui suivent les pentes du logo.
    const L = [];
    const segs = [
      [[433, 648], [561.2, 693.5]],
      [[561.2, 693.5], [638, yB(638)]],
      [[638, 400], [935, yB(935)]],
      [[935, yB(935)], [1130, 548]],
    ];
    for (const [a, b] of segs) {
      const ax = LX(a[0]), ay = LY(a[1]), bx = LX(b[0]), by = LY(b[1]);
      const len = Math.hypot(bx - ax, by - ay);
      const ang = Math.atan2(by - ay, bx - ax);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const g = new THREE.BoxGeometry(len + 0.1, 0.09, 0.62);
      const m = new THREE.Matrix4()
        .makeTranslation((ax + bx) / 2 + nx * 0.095, (ay + by) / 2 + ny * 0.095, -2.66 + 0.31)
        .multiply(new THREE.Matrix4().makeRotationZ(ang));
      addGeo(L, g, m, COL.grey);
    }
    addMerged(roofGroup, L, 'shell');
  }

  /* ================================================================ */
  /* 3. Zones métiers                                                  */
  /* ================================================================ */
  const zoneGroups = {};
  ZONES.forEach((z) => { zoneGroups[z] = new THREE.Group(); root.add(zoneGroups[z]); });

  /* --- PLACO : cloison entrée / pièce de vie (ossature + plaques) --- */
  const placo = { plaques: [], joints: null };
  {
    const G = zoneGroups.placo;
    const L = [];
    const z0 = -2.5, z1 = 0.4, h = 2.15;
    addBox(L, [-2.04, -1.97], [0.03, 0.08], [z0, z1], COL.grey);
    addBox(L, [-2.04, -1.97], [h - 0.05, h], [z0, z1], COL.grey);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const z = lerp(z0 + 0.04, z1 - 0.04, i / (n - 1));
      addBox(L, [-2.04, -1.97], [0.08, h - 0.05], [z - 0.035, z + 0.035], COL.grey);
    }
    addMerged(G, L, 'placo');

    const plaqueMat = lambert('placo', '#f6f6f4');
    const plaqueLine = lineMat('placo');
    const w = (z1 - z0) / 3;
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(0.03, h - 0.04, w - 0.012);
      const mesh = new THREE.Mesh(g, plaqueMat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), plaqueLine);
      mesh.add(edges);
      const rest = new THREE.Vector3(-1.95, 0.03 + (h - 0.04) / 2, z0 + w * (i + 0.5));
      mesh.position.copy(rest);
      G.add(mesh);
      placo.plaques.push({ mesh, rest });
    }
    // joints (bandes) entre les plaques
    const jl = [];
    for (let i = 1; i < 3; i++) {
      const z = z0 + w * i;
      addBox(jl, [-1.94, -1.925], [0.06, h - 0.02], [z - 0.035, z + 0.035], '#d9dde0', { edges: false });
    }
    const { geo } = buildMerged(jl);
    const jm = new THREE.Mesh(geo, lambert('placo', '#ffffff', { vertexColors: true }));
    jm.geometry.translate(0, -0.03, 0);
    jm.position.y = 0.03;
    G.add(jm);
    placo.joints = jm;
  }

  /* --- CLIMATISATION : split mural + souffle --- */
  const clim = { air: null, parts: [] };
  {
    const G = zoneGroups.climatisation;
    const L = [];
    addBox(L, [-0.45, 0.45], [1.78, 2.08], [-2.5, -2.27], COL.white);
    addBox(L, [-0.4, 0.4], [1.8, 1.84], [-2.27, -2.255], COL.grey, { edges: false });
    addBox(L, [0.3, 0.36], [1.98, 2.0], [-2.27, -2.262], COL.blue, { edges: false });
    addMerged(G, L, 'climatisation');

    const N = 16;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = basicMat('climatisation', COL.air, 0.7);
    const inst = new THREE.InstancedMesh(g, m, N);
    inst.frustumCulled = false;
    inst.visible = false;
    for (let i = 0; i < N; i++) {
      clim.parts.push({
        x: lerp(-0.36, 0.36, (i % 8) / 7) + (Math.random() - 0.5) * 0.05,
        phase: Math.random(),
        spread: (Math.random() - 0.5) * 0.8,
        wob: Math.random() * Math.PI * 2,
      });
    }
    G.add(inst);
    clim.air = inst;
  }

  /* --- ÉLECTRICITÉ : tableau + câbles qui s'allument --- */
  const elec = { mat: null };
  {
    const G = zoneGroups.electricite;
    const L = [];
    addBox(L, [-3.88, -3.76], [1.05, 1.65], [0.65, 1.15], COL.white);
    for (let r = 0; r < 2; r++) {
      const y = r === 0 ? 1.4 : 1.18;
      for (let k = 0; k < 6; k++) {
        const z = 0.7 + k * 0.07;
        addBox(L, [-3.76, -3.73], [y, y + 0.11], [z, z + 0.055], COL.grey, { edges: false });
      }
    }
    addMerged(G, L, 'electricite');

    const X = -3.855, ZW = -2.475;
    // Les câbles passent en nappe AU-DESSUS de la porte (haut de porte 2,0 m, mur ≈ 2,15 m),
    // puis redescendent après elle (z > -1,3) vers le tableau, sans se croiser.
    const paths = [
      [[-0.48, 1.93, ZW], [-0.7, 1.93, ZW], [-0.7, 2.075, ZW], [X, 2.075, ZW], [X, 2.075, -1.05], [X, 1.8, -1.05], [X, 1.8, 0.75], [X, 1.65, 0.75]],
      [[-1.2, 0.3, ZW], [-1.2, 0.1, ZW], [X, 0.1, ZW], [X, 2.035, ZW], [X, 2.035, -1.1], [X, 0.95, -1.1], [X, 0.95, 0.9], [X, 1.05, 0.9]],
      [[2.4, 2.08, ZW], [2.4, 2.25, ZW], [-1.5, 2.25, ZW], [-1.5, 2.115, ZW], [X, 2.115, ZW], [X, 2.115, -1.0], [X, 1.9, -1.0], [X, 1.9, 1.05], [X, 1.65, 1.05]],
    ];
    const pos = [], us = [];
    const pushGeo = (g, uFn) => {
      const ng = g.index ? g.toNonIndexed() : g;
      const a = ng.attributes.position.array, uv = ng.attributes.uv.array;
      for (let i = 0; i < a.length / 3; i++) {
        pos.push(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
        us.push(uFn(uv[i * 2]));
      }
      if (ng !== g) ng.dispose();
      g.dispose();
    };
    for (const p of paths) {
      const { g } = tube(p, 0.022, 16);
      pushGeo(g, (u) => u);
    }
    // points d'arrivée (prise, luminaire) : s'allument en premier ; voyant du tableau : en dernier
    const boxAt = (x, y, z, u) => {
      const g = new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]);
      g.translate((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
      pushGeo(g, () => u);
    };
    boxAt([-1.28, -1.12], [0.22, 0.38], [-2.5, -2.45], 0);
    boxAt([2.12, 2.68], [2.03, 2.1], [-2.5, -2.43], 0);
    boxAt([-3.76, -3.735], [1.57, 1.62], [0.68, 1.12], 1);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    cg.computeBoundingSphere();
    const cm = new THREE.ShaderMaterial({
      uniforms: {
        uP: { value: 0 },
        uAmt: { value: 0 },
        uFade: { value: 0 },
        uHover: { value: 0 },
        uBase: { value: new THREE.Color('#9a9fa4') },
        uLit: { value: new THREE.Color('#38aef5') },
        uHov: { value: new THREE.Color('#ffd76a') },
      },
      vertexShader: /* glsl */`
        attribute float aU;
        varying float vU;
        void main(){ vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uP, uAmt, uFade, uHover;
        uniform vec3 uBase, uLit, uHov;
        varying float vU;
        void main(){
          float lit = (1.0 - smoothstep(uP - 0.04, uP, vU)) * uAmt;
          float head = (1.0 - smoothstep(0.0, 0.06, abs(vU - uP))) * step(0.001, uP) * step(uP, 0.999) * uAmt;
          vec3 c = mix(uBase, uLit, lit) + vec3(0.55) * head;
          c = mix(c, uHov, uHover * 0.75);
          c = mix(c, vec3(1.0), uFade * 0.85);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    fadeRegs.electricite.push({ type: 'cable', m: cm });
    G.add(new THREE.Mesh(cg, cm));
    elec.mat = cm;
  }

  /* --- PLOMBERIE : vasque, douche, tuyaux, eau --- */
  const plomb = { curves: [], beads: null, drops: [] };
  {
    const G = zoneGroups.plomberie;
    const L = [];
    // vasque suspendue
    addBox(L, [2.05, 2.75], [0.78, 0.86], [-2.5, -2.06], COL.white);
    {
      const g = new THREE.CylinderGeometry(0.17, 0.14, 0.1, 20);
      addGeo(L, g, new THREE.Matrix4().makeTranslation(2.4, 0.91, -2.27), COL.white);
      const f = new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8);
      addGeo(L, f, new THREE.Matrix4().makeTranslation(2.4, 0.94, -2.45), COL.pipe, { edges: false });
      addBox(L, [2.385, 2.415], [1.0, 1.03], [-2.45, -2.36], COL.pipe, { edges: false });
    }
    addBox(L, [2.1, 2.7], [1.18, 1.95], [-2.5, -2.47], COL.mirror);
    // receveur de douche
    addBox(L, [3.0, 3.86], [0.03, 0.09], [-2.5, -1.5], COL.white);
    {
      const g = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 18);
      addGeo(L, g, new THREE.Matrix4().makeTranslation(3.45, 1.9, -2.15), COL.pipe);
    }
    // tuyaux
    const P1 = [[1.72, 0.03, -2.44], [1.72, 0.22, -2.44], [3.45, 0.22, -2.44], [3.45, 1.95, -2.44], [3.45, 1.95, -2.17]];
    const P2 = [[2.3, 0.22, -2.44], [2.3, 0.78, -2.44]];
    const P3 = [[2.4, 0.78, -2.27], [2.4, 0.5, -2.27], [2.4, 0.5, -2.46]];
    for (const P of [P1, P2]) {
      const t = tube(P, 0.028, 14);
      addGeo(L, t.g, null, COL.pipe, { edges: false });
      plomb.curves.push({ curve: t.curve, len: t.len });
    }
    {
      const t = tube(P3, 0.034, 14);
      addGeo(L, t.g, null, '#7a7f84', { edges: false });
    }
    // contour de la paroi vitrée (arêtes seulement)
    addBox(L, [3.02, 3.62], [0.09, 1.95], [-1.52, -1.5], COL.glass, { mesh: false });
    addMerged(G, L, 'plomberie');

    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.86, 0.02), basicMat('plomberie', COL.glass, 0.3));
    glass.position.set(3.32, 1.02, -1.51);
    G.add(glass);

    // billes d'eau
    const spacing = 0.2;
    plomb.beadSlots = [];
    plomb.curves.forEach((c, ci) => {
      const n = Math.floor(c.len / spacing);
      for (let k = 0; k < n; k++) plomb.beadSlots.push({ ci, k });
    });
    plomb.spacing = spacing;
    const ND = 10;
    for (let i = 0; i < ND; i++) {
      plomb.drops.push({ dx: (Math.random() - 0.5) * 0.14, dz: (Math.random() - 0.5) * 0.14, phase: i / ND });
    }
    const total = plomb.beadSlots.length + ND;
    const bm = new THREE.MeshBasicMaterial({ color: '#36a6ee' });
    fadeRegs.plomberie.push({ type: 'basicColor', m: bm });
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 8, 6), bm, total);
    beads.frustumCulled = false;
    beads.visible = false;
    G.add(beads);
    plomb.beads = beads;
  }

  /* --- CARRELAGE : sol + murs de douche --- */
  const carr = { tiles: [], inst: null };
  {
    const G = zoneGroups.carrelage;
    const tiles = [];
    const s = 0.37, gap = 0.012;
    const x0 = 1.645, z0 = -2.5;
    const cols = 6, rows = 13;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cc = r % 2 ? cols - 1 - c : c;
        const x = x0 + s * (cc + 0.5), z = z0 + s * (r + 0.5);
        if (x + s / 2 > 3.9 || z + s / 2 > 2.52) continue;
        tiles.push({
          pos: new THREE.Vector3(x, 0.04, z),
          size: new THREE.Vector3(s - gap, 0.02, s - gap),
          up: new THREE.Vector3(0, 1, 0),
          color: (r + cc) % 2 ? COL.tileB : COL.tileA,
        });
      }
    }
    // murs de douche : fond (z) et droit (x)
    const ws = 0.3;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        tiles.push({
          pos: new THREE.Vector3(3.03 + ws * (c + 0.5), 0.09 + ws * (r + 0.5), -2.485),
          size: new THREE.Vector3(ws - gap, ws - gap, 0.02),
          up: new THREE.Vector3(0, 0, 1),
          color: (r + c) % 2 ? COL.wallTileB : COL.wallTileA,
        });
      }
    }
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        tiles.push({
          pos: new THREE.Vector3(3.865, 0.09 + ws * (r + 0.5), -2.47 + 0.32 * (c + 0.5)),
          size: new THREE.Vector3(0.02, ws - gap, 0.32 - gap),
          up: new THREE.Vector3(-1, 0, 0),
          color: (r + c) % 2 ? COL.wallTileA : COL.wallTileB,
        });
      }
    }
    const mat = lambert('carrelage', '#ffffff');
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, tiles.length);
    const col = new THREE.Color();
    tiles.forEach((t, i) => { col.set(t.color); inst.setColorAt(i, col); });
    inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    G.add(inst);
    carr.tiles = tiles;
    carr.inst = inst;
  }

  /* --- Zones cliquables (boîtes invisibles, sans coût de rendu) --- */
  const hitMat = new THREE.MeshBasicMaterial();
  const hitBoxes = [];
  // Boîtes serrées autour des objets réels de chaque métier (plusieurs par métier),
  // pour qu'une grosse boîte ne masque jamais une autre au lancer de rayon.
  const HIT = {
    electricite: [
      [[-3.95, -3.45], [0.8, 1.9], [0.35, 1.45]],   // tableau (zone généreuse)
      [[-3.95, -3.75], [0, 2.2], [-2.55, 1.3]],     // câbles du mur gauche
      [[-3.9, -0.4], [0, 2.3], [-2.55, -2.35]],     // câbles du mur du fond
    ],
    placo: [[[-2.12, -1.88], [0, 2.2], [-2.55, 0.45]]],
    climatisation: [[[-0.6, 0.6], [1.0, 2.25], [-2.55, -1.6]]],
    plomberie: [
      [[2.0, 2.8], [0.45, 2.0], [-2.55, -1.95]],    // vasque + miroir
      [[2.95, 3.95], [0.09, 2.0], [-2.55, -1.45]],  // douche
      [[1.65, 3.5], [0, 0.3], [-2.55, -2.35]],      // tuyaux bas
    ],
    carrelage: [[[1.6, 3.95], [0, 0.12], [-2.55, 2.55]]],
  };
  for (const id of ZONES) {
    for (const [x, y, z] of HIT[id]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]), hitMat);
      m.position.set((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
      m.visible = false;
      m.userData.id = id;
      root.add(m);
      hitBoxes.push(m);
    }
  }

  /* ================================================================ */
  /* 4. Caméra : vues cadrées automatiquement selon le format          */
  /* ================================================================ */
  const box3 = (x, y, z) => new THREE.Box3(new THREE.Vector3(x[0], y[0], z[0]), new THREE.Vector3(x[1], y[1], z[1]));
  const VIEWS = {
    intro: { box: box3([-4.05, 4.05], [0, 585 * SX], [-2.65, -2.5]), az: 0, el: 3, margin: 0.78 },
    overview: { box: box3([-4.06, 4.06], [-0.2, 4.3], [-2.7, 2.56]), az: 28, el: 19, margin: 0.9 },
    electricite: { box: box3([-4.05, -1.9], [0.0, 2.3], [-2.5, 1.5]), az: 48, el: 18, margin: 0.86 },
    placo: { box: box3([-2.6, -1.3], [0.0, 2.2], [-2.55, 0.5]), az: 58, el: 16, margin: 0.9 },
    climatisation: { box: box3([-1.5, 1.5], [0.2, 2.45], [-2.5, 0.6]), az: 30, el: 16, margin: 0.9 },
    plomberie: { box: box3([1.6, 3.95], [0.0, 2.2], [-2.55, -1.1]), az: 22, el: 20, margin: 0.9 },
    carrelage: { box: box3([1.6, 3.95], [0.0, 1.95], [-2.55, 2.0]), az: 32, el: 38, margin: 0.92 },
  };

  const _c = new THREE.Vector3(), _p = new THREE.Vector3();
  const _dir = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  function dirFrom(az, el, out) {
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
  // distance minimale pour que toute la boîte tienne dans le cadre
  function fit(view) {
    const az = view.az * DEG, el = view.el * DEG;
    const target = view.box.getCenter(new THREE.Vector3());
    dirFrom(az, el, _dir);
    _f.copy(_dir).negate();
    _r.crossVectors(_f, UP).normalize();
    _u.crossVectors(_r, _f).normalize();
    const tanV = Math.tan((camera.fov * DEG) / 2);
    const tanH = tanV * effAspect();
    const b = view.box;
    let d = 0;
    for (let i = 0; i < 8; i++) {
      _c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      _p.subVectors(_c, target);
      const x = _p.dot(_r), y = _p.dot(_u), z = _p.dot(_dir);
      d = Math.max(d, z + Math.abs(x) / (tanH * view.margin), z + Math.abs(y) / (tanV * view.margin));
    }
    return { target, dist: d, az, el };
  }

  const cam = { target: new THREE.Vector3(), dist: 10, az: 0, el: 0 };
  let flight = null;        // { from, to: viewKey, t, dur }
  // Largeur (px) masquée par le panneau à droite : la scène garde sa taille, seule la vue se décale (sans coupure).
  let insetTarget = 0, insetCur = 0, viewW = 0, viewH = 0;
  const effAspect = () => (viewW && viewH ? Math.max(0.35, (viewW - insetCur) / viewH) : camera.aspect);
  let currentView = 'overview';
  let azDrag = 0;           // décalage dû au glisser (radians)
  let azDragTarget = 0;
  let idleW = reduced ? 0 : 1;

  function placeCamera(c, azOff) {
    dirFrom(c.az + azOff, c.el, _dir);
    camera.position.copy(c.target).addScaledVector(_dir, c.dist);
    camera.lookAt(c.target);
  }

  /* ================================================================ */
  /* 5. Animation                                                      */
  /* ================================================================ */
  const INTRO_T = 2.5;
  let introT = reduced ? INTRO_T : 0;
  let introDone = reduced;
  let pendingFocus = null;
  let active = null;
  let hover = null;
  let zoneTime = 0;
  let clock = 0;
  let pulseW = 0;
  const fadeCur = { shell: 0 };
  ZONES.forEach((z) => (fadeCur[z] = 0));
  const hoverCur = {};
  ZONES.forEach((z) => (hoverCur[z] = 0));

  const growGroups = [
    { g: baseGroup, a: 0.95, b: 1.55 },
    { g: wallsGroup, a: 1.1, b: 1.75 },
    { g: zoneGroups.electricite, a: 1.35, b: 1.95 },
    { g: zoneGroups.placo, a: 1.45, b: 2.05 },
    { g: zoneGroups.climatisation, a: 1.55, b: 2.15 },
    { g: zoneGroups.carrelage, a: 1.6, b: 2.2 },
    { g: zoneGroups.plomberie, a: 1.7, b: 2.3 },
    { g: roofGroup, a: 1.75, b: 2.35 },
  ];

  function updateIntro(t) {
    const squish = eIO(seg(t, 0.75, 1.5));
    const extrude = eOut(seg(t, 0.8, 1.45));
    panels.forEach((p, i) => {
      const k = eOut(seg(t, 0.04 * i, 0.04 * i + 0.6));
      p.mesh.position.set(p.off.x * (1 - k), p.off.y * (1 - k), BACK_Z0);
      p.mat.opacity = k;
      p.mesh.scale.set(1, lerp(LOGO_Y_RATIO, 1, squish), lerp(0.04, 1, extrude));
    });
    backingMat.opacity = eOut(seg(t, 0.45, 0.8));
    backing.scale.set(1, lerp(LOGO_Y_RATIO, 1, squish), lerp(0.04, 1, extrude));
    for (const gg of growGroups) {
      const k = seg(t, gg.a, gg.b);
      gg.g.visible = k > 0;
      gg.g.scale.y = Math.max(0.001, eBack(k));
    }
  }
  function finishIntro() {
    introT = INTRO_T;
    updateIntro(INTRO_T + 1);
    for (const p of panels) {
      p.mat.transparent = false; p.mat.opacity = 1; p.mat.needsUpdate = true;
      p.mesh.position.set(0, 0, BACK_Z0); p.mesh.scale.set(1, 1, 1);
    }
    backingMat.transparent = false; backingMat.opacity = 1; backingMat.needsUpdate = true;
    backing.scale.set(1, 1, 1);
    for (const gg of growGroups) { gg.g.visible = true; gg.g.scale.y = 1; }
    introDone = true;
  }

  // Micro-animations par métier. lt = temps local de la boucle.
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  const QI = new THREE.Quaternion();

  function animPlaco(on, lt) {
    const T = lt % 5.2;
    placo.plaques.forEach((p, i) => {
      let k = 1, out = 0;
      if (on) {
        const a = 0.35 + i * 0.5;
        k = eOut(seg(T, a, a + 0.75));
        out = eIO(seg(T, 4.6, 5.1));
      }
      const o = 1 - k + out;
      p.mesh.position.set(p.rest.x + o * 0.9, p.rest.y + o * 0.22, p.rest.z);
      p.mesh.visible = on ? k > 0.001 && out < 0.999 : true;
    });
    const j = on ? eOut(seg(T, 2.2, 2.7)) * (1 - eIO(seg(T, 4.5, 4.8))) : 1;
    placo.joints.scale.y = Math.max(0.001, j);
    placo.joints.visible = j > 0.002;
  }

  function animCarrelage(on, lt) {
    const T = lt % 5.4;
    const n = carr.tiles.length;
    const out = on ? eIO(seg(T, 4.85, 5.3)) : 0;
    carr.tiles.forEach((t, i) => {
      let s = 1, drop = 0;
      if (on) {
        const a = 0.25 + (i * 3.3) / n;
        const p = seg(T, a, a + 0.3);
        s = p <= 0 ? 0 : eBack(p);
        drop = (1 - eOut(p)) * 0.22;
        s *= 1 - out;
      }
      _v.copy(t.pos).addScaledVector(t.up, drop);
      _s.copy(t.size);
      // on garde l'épaisseur, on « pop » la surface
      if (t.up.y) { _s.x *= s; _s.z *= s; } else if (t.up.z) { _s.x *= s; _s.y *= s; } else { _s.y *= s; _s.z *= s; }
      if (s <= 0.001) _s.setScalar(0.0001);
      _m.compose(_v, QI, _s);
      carr.inst.setMatrixAt(i, _m);
    });
    carr.inst.instanceMatrix.needsUpdate = true;
  }

  function animElec(on, lt) {
    const u = elec.mat.uniforms;
    if (!on) { u.uP.value = 0; u.uAmt.value = 0; return; }
    const T = lt % 3.8;
    u.uP.value = eIO(seg(T, 0.2, 2.1)) * 1.0;
    u.uAmt.value = 1 - eIO(seg(T, 3.2, 3.7));
    if (T < 0.2) u.uP.value = 0;
  }

  function animPlomb(on, lt) {
    plomb.beads.visible = on;
    if (!on) return;
    const sp = plomb.spacing;
    const shift = (lt * 0.5) % sp;
    let i = 0;
    for (const slot of plomb.beadSlots) {
      const c = plomb.curves[slot.ci];
      const d = slot.k * sp + shift;
      const u = Math.min(0.9999, d / c.len);
      c.curve.getPointAt(u, _v);
      const edge = Math.min(1, d / 0.15, (c.len - d) / 0.15);
      _s.setScalar(Math.max(0.0001, edge));
      _m.compose(_v, QI, _s);
      plomb.beads.setMatrixAt(i++, _m);
    }
    for (const dr of plomb.drops) {
      const p = (lt * 1.25 + dr.phase) % 1;
      _v.set(3.45 + dr.dx * (0.3 + p), 1.86 - p * p * 1.76, -2.15 + dr.dz * (0.3 + p));
      _s.setScalar(0.7 * (1 - p * 0.3));
      _m.compose(_v, QI, _s);
      plomb.beads.setMatrixAt(i++, _m);
    }
    plomb.beads.instanceMatrix.needsUpdate = true;
  }

  function animClim(on, lt) {
    clim.air.visible = on;
    if (!on) return;
    const life = 2.4;
    clim.parts.forEach((p, i) => {
      const k = ((lt / life) + p.phase) % 1;
      const dist = eOut(k) * 1.9;
      _v.set(p.x + p.spread * k, 1.74 - dist * 0.42 + Math.sin(p.wob + k * 6) * 0.03, -2.2 + dist);
      const fade = Math.sin(Math.PI * k);
      _q.setFromEuler(new THREE.Euler(0.35, p.spread * 0.6, 0));
      _s.set(0.1 * fade + 0.0001, 0.006, (0.16 + 0.14 * k) * fade + 0.0001);
      _m.compose(_v, _q, _s);
      clim.air.setMatrixAt(i, _m);
    });
    clim.air.instanceMatrix.needsUpdate = true;
  }

  // Temps figés « jolis » pour le mode mouvement réduit.
  const STILL = { placo: 3.5, carrelage: 4.4, electricite: 2.6, plomberie: 0.31, climatisation: 1.1 };
  function updateZones() {
    const lt = reduced ? null : zoneTime;
    const t = (id) => (reduced ? STILL[id] : lt);
    animPlaco(active === 'placo', t('placo'));
    animCarrelage(active === 'carrelage', t('carrelage'));
    animElec(active === 'electricite', t('electricite'));
    animPlomb(active === 'plomberie', t('plomberie'));
    animClim(active === 'climatisation', t('climatisation'));
  }

  function updateFades(dt) {
    const rate = reduced ? 1 : 1 - Math.exp(-dt * 7);
    const targets = { shell: active ? 0.12 : 0 };
    ZONES.forEach((z) => (targets[z] = active && active !== z ? 0.55 : 0));
    // Pulsation douce au repos (aucun métier ouvert) : décalée d'un métier à l'autre.
    pulseW += ((!active && introDone ? 1 : 0) - pulseW) * rate;
    for (const key of Object.keys(fadeRegs)) {
      fadeCur[key] += (targets[key] - fadeCur[key]) * rate;
      const ht = key !== 'shell' && hover === key && active !== key ? 1 : 0;
      if (key !== 'shell') hoverCur[key] += (ht - hoverCur[key]) * rate;
      const i = ZONES.indexOf(key);
      const wave = reduced ? 0.5 : 0.5 - 0.5 * Math.cos(clock * 2.1 - i * 0.9);
      const pulse = key === 'shell' ? 0 : wave * 0.6 * pulseW;
      const h = key === 'shell' ? 0 : Math.max(hoverCur[key], pulse);
      for (const r of fadeRegs[key]) {
        if (r.type === 'basicColor') { r.m.color.set('#36a6ee').lerp(WHITE, fadeCur[key] * 0.6); continue; }
        applyFade(r, fadeCur[key], h);
      }
    }
  }

  function updateCamera(dt) {
    // décalage d'azimut : glisser + rotation idle
    azDrag += (azDragTarget - azDrag) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
    const idleTarget = !active && !dragging && !reduced && introDone ? 1 : 0;
    idleW += (idleTarget - idleW) * (1 - Math.exp(-dt * 1.2));
    const idle = reduced ? 0 : Math.sin(clock * 0.32) * 10 * DEG * idleW;
    const azOff = azDrag + idle;

    insetCur += (insetTarget - insetCur) * (reduced ? 1 : 1 - Math.exp(-dt * 4.5));
    if (Math.abs(insetTarget - insetCur) < 0.25) insetCur = insetTarget;

    let c;
    if (!introDone) {
      const a = fit(VIEWS.intro), b = fit(VIEWS.overview);
      const k = eIO(seg(introT, 0.7, 2.15));
      c = mix(a, b, k);
    } else {
      const to = fit(VIEWS[currentView]);
      if (flight) {
        flight.t += dt;
        const k = eIO(clamp01(flight.t / flight.dur));
        c = mix(flight.from, to, k);
        if (flight.t >= flight.dur) flight = null;
      } else {
        c = to;
      }
    }
    cam.target.copy(c.target); cam.dist = c.dist; cam.az = c.az; cam.el = c.el;
    placeCamera(cam, azOff);
    // La scène garde sa taille : on décale la vue vers la gauche de la moitié de la zone masquée.
    if (insetCur > 0.4 && viewW) camera.setViewOffset(viewW, viewH, insetCur / 2, 0, viewW, viewH);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  }
  function mix(a, b, k) {
    return {
      target: a.target.clone().lerp(b.target, k),
      dist: lerp(a.dist, b.dist, k),
      az: lerp(a.az, b.az, k),
      el: lerp(a.el, b.el, k),
    };
  }

  /* ================================================================ */
  /* 6. Boucle de rendu (en pause hors écran / onglet caché)           */
  /* ================================================================ */
  let raf = 0, last = 0, inView = true, destroyed = false, dirty = true;
  let perfFrames = 0, perfT0 = 0;
  const running = () => !destroyed && inView && !document.hidden;

  function frame(now) {
    raf = 0;
    if (!running()) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;

    if (!introDone) {
      // Appareil trop lent (< 12 images/s sur la 1re seconde) : on saute l'intro.
      perfFrames++;
      if (!perfT0) perfT0 = now;
      if (now - perfT0 > 1000 && perfFrames < 12) introT = INTRO_T;
      introT += dt;
      updateIntro(introT);
      if (introT >= INTRO_T) {
        finishIntro();
        onReady();
        if (pendingFocus) { const p = pendingFocus; pendingFocus = null; focus(p); }
      }
    }
    if (active) zoneTime += dt;
    if (hoverDirty) { doHover(); hoverDirty = false; }

    updateZones();
    updateFades(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
    updateLabels();
    dirty = false;

    // En mouvement réduit, on ne redessine que sur demande.
    const keepGoing = !reduced || flight || Math.abs(azDragTarget - azDrag) > 1e-4;
    if (keepGoing) raf = requestAnimationFrame(frame);
  }
  function kick() {
    dirty = true;
    if (!raf && running()) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  /* --- Taille --- */
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    viewW = w; viewH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 40 : camera.aspect < 1.3 ? 35 : 30;
    camera.updateProjectionMatrix();
    kick();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const io = new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    if (inView) kick();
  }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);

  /* ================================================================ */
  /* 6 bis. Étiquettes des métiers                                     */
  /*  - ordinateur : un petit encadré au-dessus du métier survolé       */
  /*  - téléphone : tous les noms, reliés à la maison par un petit trait */
  /* ================================================================ */
  const LABELS = {
    placo: 'Placo', carrelage: 'Carrelage', electricite: 'Électricité',
    plomberie: 'Plomberie', climatisation: 'Climatisation',
  };
  const ANCHORS = {
    placo: new THREE.Vector3(-2, 1.1, -1.05),
    carrelage: new THREE.Vector3(2.8, 0.1, 0.2),
    electricite: new THREE.Vector3(-3.78, 1.75, 0.9),
    plomberie: new THREE.Vector3(3.45, 1.0, -2.0),
    climatisation: new THREE.Vector3(0, 1.93, -2.4),
  };
  const tagLayer = document.createElement('div');
  tagLayer.className = 'maison-tags';
  tagLayer.setAttribute('aria-hidden', 'true');
  const NS = 'http://www.w3.org/2000/svg';
  const tagSvg = document.createElementNS(NS, 'svg');
  tagSvg.setAttribute('class', 'maison-tags-lines');
  tagLayer.appendChild(tagSvg);
  const tags = {};
  ZONES.forEach((z) => {
    const line = document.createElementNS(NS, 'line');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '3');
    tagSvg.append(line, dot);
    const el = document.createElement('span');
    el.className = 'maison-tag';
    el.textContent = LABELS[z];
    tagLayer.appendChild(el);
    tags[z] = { el, line, dot, w: 0, h: 0 };
  });
  container.appendChild(tagLayer);
  const _tp = new THREE.Vector3();

  function updateLabels() {
    const visibles = !introDone || active ? [] : mobile ? ZONES : hover ? [hover] : [];
    const place = [];
    for (const z of ZONES) {
      const t = tags[z];
      const on = visibles.includes(z);
      t.el.classList.toggle('on', on);
      t.line.style.opacity = t.dot.style.opacity = on ? 1 : 0;
      if (!on) continue;
      if (!t.w) { t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; }
      _tp.copy(ANCHORS[z]).applyMatrix4(root.matrixWorld).project(camera);
      const sx = (_tp.x * 0.5 + 0.5) * viewW;
      const sy = (-_tp.y * 0.5 + 0.5) * viewH;
      // Côté vers lequel le trait sort : gauche, droite ou haut (pour le centre).
      const rel = (sx - viewW / 2) / viewW;
      const side = mobile && Math.abs(rel) > 0.04 ? (rel < 0 ? -1 : 1) : 0;
      place.push({ z, t, sx, sy, side });
    }
    // Téléphone : on évite que deux noms se superposent (colonne gauche / droite / haut).
    if (mobile) {
      for (const side of [-1, 0, 1]) {
        const col = place.filter((p) => p.side === side).sort((a, b) => a.sy - b.sy);
        let minY = 4;
        for (const p of col) {
          p.ty = Math.max(minY, Math.min(viewH - 30, p.sy + (p.z === 'placo' ? 22 : side === 0 ? -40 : -26)));
          minY = p.ty + 22;
        }
      }
    }
    for (const p of place) {
      const { t, sx, sy, side } = p;
      let x, y;                                   // coin haut-gauche de l'étiquette
      if (!mobile) { x = sx - t.w / 2; y = sy - 46; }
      else if (side === 0) { x = sx - t.w / 2; y = p.ty; }
      else { x = side < 0 ? sx - 24 - t.w : sx + 24; y = p.ty; }
      x = Math.max(4, Math.min(viewW - t.w - 4, x));
      y = Math.max(4, y);
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // Le trait relie le point de la maison au bord le plus proche de l'étiquette.
      const ex = Math.max(x, Math.min(sx, x + t.w));
      const ey = y + t.h / 2 > sy ? y : y + t.h;
      t.line.setAttribute('x1', sx.toFixed(1)); t.line.setAttribute('y1', sy.toFixed(1));
      t.line.setAttribute('x2', ex.toFixed(1)); t.line.setAttribute('y2', ey.toFixed(1));
      t.dot.setAttribute('cx', sx.toFixed(1)); t.dot.setAttribute('cy', sy.toFixed(1));
    }
  }

  /* ================================================================ */
  /* 7. Pointeur : survol, clic/tap, glisser horizontal                */
  /* ================================================================ */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverDirty = false;
  let lastMouse = null;
  let down = null;
  let dragging = false;

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitBoxes, false)[0];
    return hit ? hit.object.userData.id : null;
  }
  function doHover() {
    if (!lastMouse || !introDone) return;
    const id = dragging ? null : pick(lastMouse.x, lastMouse.y);
    if (id !== hover) { hover = id; kick(); }
    canvas.style.cursor = dragging ? 'grabbing' : id ? 'pointer' : '';
  }

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), az: azDragTarget, id: e.pointerId, type: e.pointerType };
    dragging = false;
  }
  function onMove(e) {
    if (e.pointerType === 'mouse') { lastMouse = { x: e.clientX, y: e.clientY }; hoverDirty = true; kick(); }
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    }
    if (dragging) {
      const w = canvas.clientWidth || 400;
      azDragTarget = Math.max(-25 * DEG, Math.min(25 * DEG, down.az - (dx / w) * 70 * DEG));
      kick();
    }
  }
  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const wasDrag = dragging;
    dragging = false;
    down = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* rien */ }
    if (!wasDrag && moved < 10 && introDone) {
      const id = pick(e.clientX, e.clientY);
      if (id) onSelect(id);
    }
    hoverDirty = true;
    kick();
  }
  function onCancel() { down = null; dragging = false; }
  function onLeave() { lastMouse = null; if (hover) { hover = null; kick(); } canvas.style.cursor = ''; }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);

  /* ================================================================ */
  /* 8. API publique                                                   */
  /* ================================================================ */
  function snapshot() {
    return { target: cam.target.clone(), dist: cam.dist, az: cam.az, el: cam.el };
  }
  function goTo(viewKey) {
    if (viewKey === currentView && !flight) { kick(); return; }
    currentView = viewKey;
    flight = reduced ? null : { from: snapshot(), t: 0, dur: 1.2 };
    kick();
  }

  function focus(id) {
    if (destroyed || !ZONES.includes(id)) return;
    if (!introDone) { pendingFocus = id; return; }
    if (active !== id) zoneTime = 0;
    active = id;
    hover = null;
    goTo(id);
  }
  function reset() {
    if (destroyed) return;
    pendingFocus = null;
    active = null;
    azDragTarget = 0;
    goTo('overview');
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    tagLayer.remove();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('pointerleave', onLeave);
    const geos = new Set(), mats = new Set();
    scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      if (o.isInstancedMesh && o.dispose) o.dispose();
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    hitMat.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  /* --- Démarrage --- */
  root.updateMatrixWorld(true);
  if (reduced) {
    finishIntro();
    setTimeout(() => { if (!destroyed) onReady(); }, 0);
  } else {
    updateIntro(0);
  }
  updateZones();
  kick();

  // px de la scène recouverts par le panneau (0 = rien) : la maison se recentre dans l'espace libre.
  function setInset(px) {
    if (destroyed) return;
    insetTarget = Math.max(0, Math.min(px || 0, viewW * 0.6));
    kick();
  }
  return { focus, reset, destroy, setInset };
}
