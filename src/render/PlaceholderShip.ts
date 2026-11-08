import * as THREE from 'three';

const pbr = (color: string, opts: { metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.72,
    roughness: opts.roughness ?? 0.38,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });

function addRunningLights(group: THREE.Group, hull: THREE.Material, accent: THREE.ColorRepresentation): void {
  const lightMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.1 });
  const red = new THREE.MeshStandardMaterial({ color: '#ff4a5a', emissive: '#ff4a5a', emissiveIntensity: 1.6 });
  const green = new THREE.MeshStandardMaterial({ color: '#62ff9a', emissive: '#62ff9a', emissiveIntensity: 1.6 });
  const pts: Array<[THREE.Material, [number, number, number], number]> = [
    [lightMat, [0, 1.35, -0.2], 0.055],
    [lightMat, [0, -0.95, -0.1], 0.045],
    [red, [-2.2, 0.2, 0.8], 0.05],
    [green, [2.2, 0.2, 0.8], 0.05],
    [hull, [0, 0.7, -4.1], 0.04],
  ];
  for (const [mat, pos, r] of pts) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.name = 'running_light';
    group.add(m);
  }
}

function addThrustFlame(group: THREE.Group, pos: [number, number, number], color: string, scale = 1): void {
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.42 * scale, 1.7 * scale, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(pos[0], pos[1], pos[2] + 0.85 * scale);
  flame.name = 'engine_flame';
  group.add(flame);
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.18 * scale, 0.95 * scale, 8),
    new THREE.MeshBasicMaterial({ color: '#fff4d8', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  core.rotation.x = -Math.PI / 2;
  core.position.set(pos[0], pos[1], pos[2] + 0.5 * scale);
  core.name = 'engine_flame_core';
  group.add(core);
}

/** Procedural panel-line normal map (no external assets). */
function makePanelNormal(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgb(110,145,255)';
  g.lineWidth = 1;
  for (let i = 0; i < size; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.stroke(); }
  for (let i = 0; i < size; i += 12) { g.beginPath(); g.moveTo(0, i); g.lineTo(size, i); g.stroke(); }
  g.strokeStyle = 'rgb(150,120,255)';
  for (let n = 0; n < 8; n++) {
    const x = Math.floor((n * 37) % size / 16) * 16, y = Math.floor((n * 53) % size / 12) * 12;
    g.strokeRect(x + 2, y + 2, 12, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}
let _panelNormal: THREE.CanvasTexture | null = null;
const panelNormal = (): THREE.CanvasTexture => (_panelNormal ??= makePanelNormal());

const makeGlass = (accent: string) => new THREE.MeshPhysicalMaterial({
  color: '#07151d', emissive: accent, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.06,
  transmission: 0.15, transparent: true, opacity: 0.75, clearcoat: 0.6,
});

const makeGlow = (accent: string, intensity = 3.5) => new THREE.MeshStandardMaterial({
  color: accent, emissive: accent, emissiveIntensity: intensity, metalness: 0.15, roughness: 0.2, toneMapped: false,
});

function addEngine(group: THREE.Group, x: number, y: number, z: number, accent: string, radius = 0.42, depth = 2.6) {
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, depth, 10), pbr('#1a222d', { metalness: 0.8, roughness: 0.28 }));
  nacelle.rotation.x = Math.PI / 2;
  nacelle.position.set(x, y, z);
  group.add(nacelle);
  const nozzle = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.06, 8, 16), pbr('#2a3544', { metalness: 0.85, roughness: 0.25 }));
  nozzle.position.set(x, y, z + depth / 2);
  group.add(nozzle);
  const engine = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.62, 16), makeGlow(accent, 4.5));
  engine.position.set(x, y, z + depth / 2 + 0.02);
  engine.name = `engine_glow_${x > 0 ? 'r' : x < 0 ? 'l' : 'c'}_${group.children.length}`;
  group.add(engine);
  const light = new THREE.PointLight(new THREE.Color(accent), 0.8, 6, 2);
  light.position.set(x, y, z + depth / 2 + 0.3);
  group.add(light);
}

function roundedFuselage(radiusTop: number, radiusBot: number, length: number, segments = 16): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = radiusTop * (1 - t) + radiusBot * t;
    // slight bulge for rounded fuselage
    const bulge = 1 + Math.sin(t * Math.PI) * 0.12;
    pts.push(new THREE.Vector2(r * bulge, (t - 0.5) * length));
  }
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateX(Math.PI / 2);
  const mat = pbr('#3a4858', { metalness: 0.68, roughness: 0.36 });
  mat.normalMap = panelNormal();
  mat.normalScale = new THREE.Vector2(0.35, 0.35);
  return new THREE.Mesh(geo, mat);
}

function beveledPanel(w: number, h: number, d: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape();
  const hw = w / 2, hh = h / 2, b = Math.min(w, h) * 0.12;
  shape.moveTo(-hw + b, -hh); shape.lineTo(hw - b, -hh); shape.lineTo(hw, -hh + b);
  shape.lineTo(hw, hh - b); shape.lineTo(hw - b, hh); shape.lineTo(-hw + b, hh);
  shape.lineTo(-hw, hh - b); shape.lineTo(-hw, -hh + b); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: d * 0.25, bevelSize: b * 0.35, bevelSegments: 2 });
  geo.center();
  const mat = pbr(color, { metalness: 0.75, roughness: 0.32 });
  mat.normalMap = panelNormal();
  return new THREE.Mesh(geo, mat);
}

function canopy(group: THREE.Group, accent: string, z: number, y: number, sx = 0.85, sy = 0.55, sz = 1.8) {
  const c = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), makeGlass(accent));
  c.scale.set(sx, sy, sz);
  c.position.set(0, y, z);
  group.add(c);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 18), pbr('#6a7a8a', { metalness: 0.9, roughness: 0.2 }));
  frame.rotation.y = Math.PI / 2;
  frame.scale.set(1.1, sy / 0.55, sz / 1.8);
  frame.position.set(0, y - 0.05, z);
  group.add(frame);
}

function buildHelix(accent: string): THREE.Group {
  // Logistics/Support: wide, stable, modular with repair arms and drone bay feel
  const g = new THREE.Group();
  g.add(roundedFuselage(0.7, 1.6, 7.2));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.2, 12), pbr('#2c3846', { metalness: 0.78, roughness: 0.3 }));
  nose.rotation.x = -Math.PI / 2; nose.position.z = -4.7; g.add(nose);
  canopy(g, accent, -1.8, 0.85, 0.9, 0.55, 1.6);
  // modular side pods
  for (const side of [-1, 1]) {
    const pod = beveledPanel(1.6, 1.1, 3.2, '#3d5a4a');
    pod.position.set(side * 2.1, -0.1, 0.2);
    g.add(pod);
    const plate = beveledPanel(2.4, 0.18, 2.0, '#344a40');
    plate.position.set(side * 3.0, 0.1, 0.4);
    plate.rotation.z = side * -0.08;
    g.add(plate);
    addEngine(g, side * 1.5, -0.15, 3.2, accent, 0.4, 2.4);
  }
  // dorsal antenna/sensor spine
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 4.5), pbr('#8aa4b8', { metalness: 0.6, roughness: 0.25 }));
  spine.position.set(0, 1.1, -0.2); g.add(spine);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), pbr(accent, { emissive: accent, emissiveIntensity: 0.4, metalness: 0.5 }));
  dish.rotation.z = Math.PI / 2; dish.position.set(0, 1.45, -1.2); g.add(dish);
  // underside bay ring
  const bay = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 20), makeGlow(accent, 1.2));
  bay.rotation.x = Math.PI / 2; bay.position.set(0, -1.0, 0.2); g.add(bay);
  addRunningLights(g, pbr('#3a4858'), accent);
  addThrustFlame(g, [-1.5, -0.15, 4.3], accent, 0.85);
  addThrustFlame(g, [1.5, -0.15, 4.3], accent, 0.85);
  return g;
}

function buildIronharrow(accent: string): THREE.Group {
  // Combat/Heavy: angular, armored, turrets/launchers, wide stance
  const g = new THREE.Group();
  // heavy central hull
  const core = beveledPanel(2.6, 1.8, 8.0, '#4a3a32');
  core.rotation.x = Math.PI / 2; core.position.z = 0; g.add(core);
  const nose = beveledPanel(1.4, 1.0, 2.8, '#3a2c26');
  nose.rotation.x = Math.PI / 2; nose.position.z = -5.2; g.add(nose);
  canopy(g, accent, -2.4, 1.05, 0.75, 0.5, 1.5);
  // layered armor plates
  for (let i = 0; i < 3; i++) {
    const plate = beveledPanel(3.2 - i * 0.3, 0.22, 1.8, i % 2 ? '#554338' : '#483830');
    plate.position.set(0, 1.0 - i * 0.05, -0.5 + i * 1.6);
    g.add(plate);
  }
  for (const side of [-1, 1]) {
    // weapon sponsons
    const sponson = beveledPanel(1.4, 1.0, 3.4, '#5a4336');
    sponson.position.set(side * 2.5, 0.1, -0.8);
    g.add(sponson);
    for (let t = 0; t < 2; t++) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), pbr('#2a221e', { metalness: 0.85, roughness: 0.25, emissive: accent, emissiveIntensity: 0.15 }));
      turret.rotation.x = Math.PI / 2; turret.position.set(side * (2.2 + t * 0.45), 0.75, -1.2 - t * 0.7);
      g.add(turret);
    }
    // heavy nacelles
    addEngine(g, side * 2.1, -0.35, 3.4, accent, 0.55, 3.2);
    // wing armor
    const wing = beveledPanel(2.2, 0.24, 2.6, '#4a3a32');
    wing.position.set(side * 3.8, -0.1, 1.2);
    wing.rotation.z = side * -0.15;
    g.add(wing);
  }
  // missile rack underside
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.8), pbr('#3a2c26', { emissive: accent, emissiveIntensity: 0.2 }));
  rack.position.set(0, -1.05, -1.8); g.add(rack);
  addRunningLights(g, pbr('#4a3a32'), accent);
  addThrustFlame(g, [-2.1, -0.35, 4.9], accent, 1.0);
  addThrustFlame(g, [2.1, -0.35, 4.9], accent, 1.0);
  return g;
}

function buildDeepmaw(accent: string): THREE.Group {
  // Prospector/Mining: asymmetry hints? actually keep balanced; industrial, open frame, mining arms, large holds
  const g = new THREE.Group();
  g.add(roundedFuselage(0.6, 1.3, 6.4));
  // industrial forward frame ("maw")
  const jawL = beveledPanel(0.9, 0.35, 3.0, '#3a4a3d');
  jawL.position.set(-1.1, -0.2, -3.2); jawL.rotation.y = 0.25; g.add(jawL);
  const jawR = beveledPanel(0.9, 0.35, 3.0, '#3a4a3d');
  jawR.position.set(1.1, -0.2, -3.2); jawR.rotation.y = -0.25; g.add(jawR);
  const miner = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 2.8, 8), pbr('#8a9a8a', { metalness: 0.8, roughness: 0.3, emissive: accent, emissiveIntensity: 0.5 }));
  miner.rotation.x = Math.PI / 2; miner.position.set(0, -0.45, -4.6); g.add(miner);
  canopy(g, accent, -1.4, 0.9, 0.8, 0.5, 1.4);
  // cargo pods
  for (const side of [-1, 1]) {
    const hold = beveledPanel(1.5, 1.4, 2.8, '#2f4035');
    hold.position.set(side * 2.0, -0.15, 1.0);
    g.add(hold);
    addEngine(g, side * 1.6, -0.1, 3.0, accent, 0.38, 2.2);
  }
  // dorsal scanner array
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), pbr('#7a8a7a', { metalness: 0.7 }));
  mast.position.set(0, 1.4, 0.5); g.add(mast);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2 - i * 0.25, 0.06, 0.06), makeGlow(accent, 0.8));
    arm.position.set(0, 1.5 + i * 0.28, 0.5);
    g.add(arm);
  }
  // ventral collector ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 16), pbr('#5a7a62', { emissive: accent, emissiveIntensity: 0.25 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.95, -0.6); g.add(ring);
  addRunningLights(g, pbr('#3a4858'), accent);
  addThrustFlame(g, [-1.6, -0.1, 4.0], accent, 0.8);
  addThrustFlame(g, [1.6, -0.1, 4.0], accent, 0.8);
  return g;
}

/**
 * Visible procedural hull when a GLB is missing/unavailable. -Z forward convention.
 * shipId selects a distinct silhouette (helix/support, ironharrow/combat, deepmaw/mining).
 * Keep modelPath config in ships.ts for swapping to a GLB later.
 */
export const createPlaceholderShip = (accent: string, scale = 1, shipId = 'deepmaw'): THREE.Group => {
  const group = new THREE.Group();
  group.name = `Procedural_Hull_${shipId}`;
  group.scale.setScalar(scale);
  let hull: THREE.Group;
  if (shipId === 'ironharrow') hull = buildIronharrow(accent);
  else if (shipId === 'helix') hull = buildHelix(accent);
  else hull = buildDeepmaw(accent);
  group.add(hull);
  return group;
};
