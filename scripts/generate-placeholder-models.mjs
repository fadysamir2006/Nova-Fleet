/**
 * Builds the original low-poly placeholder ship GLBs used by Nova Fleet.
 * Run with: npm run generate:models
 *
 * These are intentionally simple "prototype hulls". Replace them with real
 * glTF/GLB assets and update the single `modelPath` line in
 * src/assets-config/ships.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      })
      .catch((error) => {
        this.onerror?.(error);
      });
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend?.();
      })
      .catch((error) => {
        this.onerror?.(error);
      });
  }
}

globalThis.FileReader = NodeFileReader;

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public/models');

const material = (color, metalness, roughness, emissive = 0x000000, emissiveIntensity = 0) =>
  new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
  });

const HULL_DARK = material(0x202833, 0.72, 0.34);
const HULL_MID = material(0x3a4655, 0.68, 0.41);
const HULL_LIGHT = material(0x778596, 0.6, 0.32);
const GLASS = material(0x07141f, 0.25, 0.08, 0x1f617e, 0.5);
const SKY_ACCENT = material(0x0d5670, 0.52, 0.28, 0x4bd6ff, 2.4);
const IRON_ACCENT = material(0x5c381c, 0.78, 0.3, 0xff9a43, 2.1);
const DEEP_ACCENT = material(0x17452a, 0.56, 0.37, 0x6bff9d, 2.2);
const RAIDER_ACCENT = material(0x4c1518, 0.7, 0.36, 0xff3b3b, 2.4);
const ENGINE_BLUE = material(0x0c5e78, 0.4, 0.24, 0x76ecff, 5);
const ENGINE_ORANGE = material(0x6a3515, 0.4, 0.25, 0xffb15a, 5);
const ENGINE_GREEN = material(0x0e5734, 0.4, 0.25, 0x9affb5, 4.6);
const ENGINE_RED = material(0x601319, 0.4, 0.25, 0xff4b45, 5);

const mesh = (geometry, mat, position, rotation = [0, 0, 0], name = '') => {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.name = name;
  object.castShadow = false;
  object.receiveShadow = false;
  return object;
};

const box = (w, h, d, mat, position, rotation = [0, 0, 0], name = '') =>
  mesh(new THREE.BoxGeometry(w, h, d), mat, position, rotation, name);

const cylinder = (radiusTop, radiusBottom, height, segments, mat, position, rotation = [0, 0, 0], name = '') =>
  mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    mat,
    position,
    rotation,
    name,
  );

const cone = (radius, height, segments, mat, position, rotation = [0, 0, 0], name = '') =>
  mesh(new THREE.ConeGeometry(radius, height, segments), mat, position, rotation, name);

const sphere = (radius, mat, position, scale = [1, 1, 1], name = '') => {
  const object = mesh(new THREE.SphereGeometry(radius, 20, 12), mat, position, [0, 0, 0], name);
  object.scale.set(...scale);
  return object;
};

const wing = (points, thickness, mat, position = [0, 0, 0], mirrored = false, name = '') => {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness / 2, 0);
  const object = mesh(geometry, mat, position, [0, 0, 0], name);
  if (mirrored) object.scale.x = -1;
  return object;
};

const addPanel = (group, w, h, d, mat, position, rotation = [0, 0, 0], name = '') => {
  group.add(box(w, h, d, mat, position, rotation, name));
};

const skylance = () => {
  const group = new THREE.Group();
  group.name = 'Skylance_Placeholder';

  group.add(
    cylinder(0.28, 0.86, 7.4, 6, HULL_MID, [0, 0, -0.9], [-Math.PI / 2, 0, 0], 'fuselage'),
  );
  group.add(cone(0.37, 1.8, 6, HULL_DARK, [0, 0, -5.35], [-Math.PI / 2, 0, 0], 'nose'));
  const canopy = sphere(0.76, GLASS, [0, 0.48, -2.05], [0.78, 0.55, 1.6], 'canopy');
  group.add(canopy);

  const rightWing = wing(
    [
      [0.45, 1.45],
      [4.65, -0.6],
      [3.92, -2.25],
      [0.38, -1.7],
    ],
    0.2,
    HULL_MID,
    [0, -0.05, 0],
    false,
    'wing_right',
  );
  group.add(rightWing);
  const leftWing = rightWing.clone();
  leftWing.name = 'wing_left';
  leftWing.scale.x = -1;
  group.add(leftWing);

  addPanel(group, 2.1, 0.12, 1.15, SKY_ACCENT, [2.2, 0.07, -0.25], [0, 0.08, 0], 'wing_stripe_r');
  addPanel(group, 2.1, 0.12, 1.15, SKY_ACCENT, [-2.2, 0.07, -0.25], [0, -0.08, 0], 'wing_stripe_l');

  for (const side of [-1, 1]) {
    const x = side * 1.55;
    group.add(
      cylinder(0.34, 0.46, 2.7, 8, HULL_DARK, [x, -0.05, 2.55], [Math.PI / 2, 0, 0], `nacelle_${side}`),
    );
    group.add(
      cylinder(
        0.29,
        0.29,
        0.4,
        8,
        ENGINE_BLUE,
        [x, -0.05, 3.95],
        [Math.PI / 2, 0, 0],
        `engine_glow_${side > 0 ? 'r' : 'l'}`,
      ),
    );
    addPanel(group, 0.22, 1.2, 1.2, HULL_DARK, [x, 0.52, 2.3], [0, 0, side * 0.18]);
  }

  addPanel(group, 3.3, 0.12, 1.35, HULL_DARK, [0, 0.43, 2.2], [0, 0, 0], 'tail');
  addPanel(group, 0.12, 1.25, 1.5, HULL_DARK, [0, 0.95, 2.7], [0, 0, 0], 'dorsal_fin');
  addPanel(group, 0.8, 0.2, 2.6, HULL_LIGHT, [0, -0.4, -2.0], [0, 0, 0], 'belly');
  addPanel(group, 0.14, 0.14, 3.6, SKY_ACCENT, [0, 0.71, -1.6], [0, 0, 0], 'spine_light');
  return group;
};

const ironwake = () => {
  const group = new THREE.Group();
  group.name = 'Ironwake_Placeholder';

  group.add(box(3.6, 1.7, 8.6, HULL_MID, [0, 0, 0.1], [0, 0, 0], 'core_hull'));
  group.add(box(2.4, 1.1, 2.7, HULL_DARK, [0, 0.15, -5.1], [0, 0, 0], 'nose_block'));
  group.add(box(3.0, 0.6, 1.3, HULL_LIGHT, [0, -0.72, -2.8], [0, 0, 0], 'chin_armor'));
  const bridge = sphere(0.9, GLASS, [0, 0.95, -2.75], [1.1, 0.6, 1.5], 'bridge');
  group.add(bridge);

  for (const side of [-1, 1]) {
    const x = side * 4.1;
    group.add(box(4.2, 0.55, 4.5, HULL_MID, [x, -0.2, 0.6], [0, 0, 0], `armor_wing_${side}`));
    group.add(box(4.3, 0.26, 1.0, IRON_ACCENT, [x, 0.05, 1.9], [0, 0, 0], `wing_light_${side}`));
    group.add(cylinder(0.55, 0.72, 3.5, 8, HULL_DARK, [x * 0.7, 0.18, 3.4], [Math.PI / 2, 0, 0]));
    group.add(
      cylinder(
        0.44,
        0.44,
        0.45,
        8,
        ENGINE_ORANGE,
        [x * 0.7, 0.18, 5.2],
        [Math.PI / 2, 0, 0],
        `engine_glow_${side > 0 ? 'r' : 'l'}`,
      ),
    );
    addPanel(group, 0.6, 0.7, 2.6, HULL_DARK, [side * 2.2, -0.6, 2.6], [0, 0, 0]);
  }

  group.add(box(1.6, 1.2, 3.2, HULL_DARK, [0, 1.0, 1.6], [0, 0, 0], 'dorsal_block'));
  group.add(box(0.16, 2.2, 0.16, HULL_LIGHT, [0.8, 1.8, 0.9], [0, 0, 0], 'antenna'));
  group.add(box(0.6, 0.6, 0.6, IRON_ACCENT, [0, 1.75, 1.2], [0, 0, 0], 'beacon'));
  return group;
};

const deepmaw = () => {
  const group = new THREE.Group();
  group.name = 'Deepmaw_Placeholder';

  group.add(cylinder(1.4, 1.7, 8.8, 8, HULL_MID, [0, 0, 0.4], [Math.PI / 2, 0, 0], 'industrial_core'));
  group.add(box(3.8, 1.4, 3.6, HULL_DARK, [0, -0.3, -4.4], [0, 0, 0], 'extraction_head'));

  const claw = new THREE.Group();
  claw.name = 'mining_claw';
  for (const side of [-1, 1]) {
    claw.add(box(0.7, 0.7, 3.8, HULL_LIGHT, [side * 1.3, 0, -7.1], [0, side * 0.3, 0], `claw_${side}`));
    claw.add(box(0.35, 0.35, 1.4, DEEP_ACCENT, [side * 1.6, 0, -8.7], [0, side * 0.45, 0], `claw_tip_${side}`));
  }
  group.add(claw);
  group.add(cylinder(0.65, 0.65, 0.25, 16, DEEP_ACCENT, [0, 0, -6.35], [Math.PI / 2, 0, 0], 'mining_lens'));

  for (const side of [-1, 1]) {
    const x = side * 3.1;
    group.add(box(2.5, 2.3, 6.2, HULL_DARK, [x, -0.15, 1.3], [0, 0, 0], `cargo_pod_${side}`));
    group.add(cylinder(0.5, 0.62, 2.8, 8, HULL_MID, [x, 0.2, 4.9], [Math.PI / 2, 0, 0]));
    group.add(
      cylinder(
        0.4,
        0.4,
        0.4,
        8,
        ENGINE_GREEN,
        [x, 0.2, 6.45],
        [Math.PI / 2, 0, 0],
        `engine_glow_${side > 0 ? 'r' : 'l'}`,
      ),
    );
    group.add(box(0.24, 0.24, 5.0, DEEP_ACCENT, [side * 1.55, 0.7, 1.3], [0, 0, 0], `cargo_light_${side}`));
  }

  group.add(box(1.5, 1.1, 2.3, HULL_MID, [0, 1.55, 1.2], [0, 0, 0], 'cockpit_block'));
  group.add(sphere(0.65, GLASS, [0, 1.75, -0.2], [1.0, 0.55, 1.25], 'cockpit_glass'));
  for (const side of [-1, 1]) {
    group.add(box(0.12, 1.7, 0.12, HULL_LIGHT, [side * 1.2, 2.0, 2.7], [0, 0, 0], `antenna_${side}`));
  }
  return group;
};

const raider = () => {
  const group = new THREE.Group();
  group.name = 'Raider_Placeholder';

  group.add(box(1.5, 0.8, 5.4, HULL_DARK, [0, 0, 0], [0, 0, 0], 'raider_core'));
  group.add(cone(0.65, 2.1, 4, HULL_MID, [0, 0, -3.45], [-Math.PI / 2, 0, 0], 'raider_nose'));
  group.add(sphere(0.55, GLASS, [0, 0.4, -1.65], [0.82, 0.45, 1.25], 'raider_canopy'));

  const rightBlade = wing(
    [
      [0.35, 1.0],
      [3.85, 1.6],
      [2.75, 3.0],
      [0.28, 2.2],
    ],
    0.16,
    HULL_MID,
    [0, 0, 0.5],
    false,
    'raider_blade_r',
  );
  group.add(rightBlade);
  const leftBlade = rightBlade.clone();
  leftBlade.name = 'raider_blade_l';
  leftBlade.scale.x = -1;
  group.add(leftBlade);
  addPanel(group, 1.9, 0.08, 0.6, RAIDER_ACCENT, [1.9, 0.08, 0.45], [0, 0.08, 0], 'blade_glow_r');
  addPanel(group, 1.9, 0.08, 0.6, RAIDER_ACCENT, [-1.9, 0.08, 0.45], [0, -0.08, 0], 'blade_glow_l');

  for (const side of [-1, 1]) {
    const x = side * 0.95;
    group.add(cylinder(0.3, 0.36, 1.8, 6, HULL_DARK, [x, 0.05, 2.7], [Math.PI / 2, 0, 0]));
    group.add(
      cylinder(
        0.26,
        0.26,
        0.3,
        6,
        ENGINE_RED,
        [x, 0.05, 3.7],
        [Math.PI / 2, 0, 0],
        `engine_glow_${side > 0 ? 'r' : 'l'}`,
      ),
    );
  }
  addPanel(group, 0.12, 1.0, 1.6, HULL_DARK, [0, 0.7, 1.8], [0, 0, 0], 'raider_fin');
  addPanel(group, 0.12, 0.12, 2.0, RAIDER_ACCENT, [0, 0.82, 1.7], [0, 0, 0], 'raider_fin_glow');
  return group;
};

const models = [
  ['skylance', skylance],
  ['ironwake', ironwake],
  ['deepmaw', deepmaw],
  ['raider', raider],
];

const exporter = new GLTFExporter();

await fs.mkdir(outDir, { recursive: true });

for (const [name, create] of models) {
  const scene = create();
  const result = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      resolve,
      reject,
      {
        binary: true,
        onlyVisible: true,
        copyright: 'Nova Fleet placeholder hull — original work, CC0 1.0',
      },
    );
  });
  const target = path.join(outDir, `${name}.glb`);
  await fs.writeFile(target, Buffer.from(result));
  console.log(`wrote ${path.relative(process.cwd(), target)}`);
}
