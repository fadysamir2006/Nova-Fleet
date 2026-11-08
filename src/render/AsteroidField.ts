import * as THREE from 'three';
import { RESOURCES, RESOURCE_ORDER, WORLD_CONFIG } from '../assets-config';
import type { AsteroidEntity, ResourceKind } from '../game/types';
import { Rng } from '../game/math';
import type { QualityLevel } from './QualityManager';

type ShapeKind = 'chunk' | 'crystal' | 'magma' | 'lattice' | 'canister' | 'ingot';

const SHAPE_BY_RESOURCE: Record<ResourceKind, ShapeKind> = {
  ferrite: 'chunk',
  aurium: 'chunk',
  cryonite: 'crystal',
  hexite: 'crystal',
  thryxium: 'crystal',
  magmarite: 'magma',
  nanocarbon: 'lattice',
  isotopes: 'canister',
  alloys: 'ingot',
};

const distort = (geometry: THREE.BufferGeometry, seed: number, jagged = 0.16): void => {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const rng = new Rng(seed);
  const phase = rng.range(0, Math.PI * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const noise =
      1 +
      jagged * Math.sin(x * 4.2 + phase) * Math.cos(y * 3.7 + phase * 1.3) +
      jagged * 0.55 * Math.sin(z * 7.1 - y * 5.3 + phase) +
      jagged * 0.3 * Math.cos(x * 11.4 + z * 9.7 + phase);
    pos.setXYZ(i, x * noise, y * noise * 0.94, z * noise);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
};

const makeGeometry = (shape: ShapeKind, detail: number, seed: number): THREE.BufferGeometry => {
  let g: THREE.BufferGeometry;
  switch (shape) {
    case 'crystal':
      g = detail > 0 ? new THREE.OctahedronGeometry(1, 1) : new THREE.OctahedronGeometry(1, 0);
      distort(g, seed, 0.07);
      g.scale(0.72, 1.35, 0.78);
      break;
    case 'magma':
      g = new THREE.IcosahedronGeometry(1, detail > 0 ? 2 : 0);
      distort(g, seed, 0.24);
      break;
    case 'lattice':
      g = detail > 0 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
      distort(g, seed, 0.09);
      break;
    case 'canister':
      g = new THREE.CapsuleGeometry(0.42, 0.85, 3, detail > 0 ? 8 : 5);
      break;
    case 'ingot':
      g = new THREE.BoxGeometry(1.15, 0.55, 0.8, 1, 1, 1);
      distort(g, seed, 0.035);
      break;
    case 'chunk':
    default:
      g = new THREE.IcosahedronGeometry(1, detail > 0 ? 2 : 0);
      distort(g, seed, 0.17);
      break;
  }
  g.computeBoundingSphere();
  return g;
};

const materialFor = (kind: ResourceKind): THREE.MeshStandardMaterial => {
  const info = RESOURCES[kind];
  const shape = SHAPE_BY_RESOURCE[kind];
  let metalness = 0.18;
  let roughness = 0.88;
  let emissiveScale = 0.035;
  let emissiveIntensity = 0.4;
  if (shape === 'crystal') {
    metalness = 0.12; roughness = 0.22; emissiveScale = 0.22; emissiveIntensity = 0.95;
  } else if (shape === 'magma') {
    metalness = 0.08; roughness = 0.72; emissiveScale = 0.55; emissiveIntensity = 1.15;
  } else if (shape === 'chunk') {
    metalness = kind === 'aurium' ? 0.72 : 0.34; roughness = kind === 'aurium' ? 0.28 : 0.68; emissiveScale = kind === 'aurium' ? 0.12 : 0.03;
  } else if (shape === 'lattice') {
    metalness = 0.22; roughness = 0.42; emissiveScale = 0.08;
  } else if (shape === 'canister') {
    metalness = 0.55; roughness = 0.32; emissiveScale = 0.18; emissiveIntensity = 0.8;
  } else if (shape === 'ingot') {
    metalness = 0.82; roughness = 0.24; emissiveScale = 0.06;
  }
  return new THREE.MeshStandardMaterial({
    color: info.color,
    metalness,
    roughness,
    flatShading: shape === 'chunk' || shape === 'magma',
    emissive: new THREE.Color(info.glow).multiplyScalar(emissiveScale),
    emissiveIntensity,
  });
};

interface AsteroidSlot {
  high: THREE.InstancedMesh;
  low: THREE.InstancedMesh;
  highCount: number;
  lowCount: number;
}

export class AsteroidField {
  public readonly root = new THREE.Group();
  private readonly slots = new Map<ResourceKind, AsteroidSlot>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly highlight: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly highlightMaterial: THREE.LineBasicMaterial;
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();
  private detailDistance = 720;
  private time = 0;

  constructor(scene: THREE.Object3D, quality: QualityLevel) {
    this.root.name = 'asteroid-field';
    const geoCache = new Map<string, THREE.BufferGeometry>();

    const getGeo = (shape: ShapeKind, detail: number): THREE.BufferGeometry => {
      const key = `${shape}:${detail}`;
      let g = geoCache.get(key);
      if (!g) {
        g = makeGeometry(shape, detail, (shape.length * 97 + detail * 31) >>> 0);
        geoCache.set(key, g);
        this.geometries.push(g);
      }
      return g;
    };

    for (const [kindIndex, kind] of RESOURCE_ORDER.entries()) {
      const shape = SHAPE_BY_RESOURCE[kind];
      const info = RESOURCES[kind];
      const highGeo = getGeo(shape, 1);
      const lowGeo = getGeo(shape, 0);
      const mat = materialFor(kind);
      this.materials.push(mat);

      const high = new THREE.InstancedMesh(highGeo, mat, WORLD_CONFIG.asteroidCount);
      const lowMat = mat.clone();
      this.materials.push(lowMat);
      const low = new THREE.InstancedMesh(lowGeo, lowMat, WORLD_CONFIG.asteroidCount);
      for (const mesh of [high, low]) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.name = `asteroids-${kind}-${mesh === high ? 'high' : 'low'}`;
        this.root.add(mesh);
      }

      const color = new THREE.Color();
      const rng = new Rng(0x1a57e + kindIndex * 91);
      for (let i = 0; i < WORLD_CONFIG.asteroidCount; i += 1) {
        const shade = rng.range(0.78, 1.14);
        color.set(info.cssColor).multiplyScalar(shade);
        high.setColorAt(i, color);
        low.setColorAt(i, color);
      }
      if (high.instanceColor) high.instanceColor.needsUpdate = true;
      if (low.instanceColor) low.instanceColor.needsUpdate = true;
      this.slots.set(kind, { high, low, highCount: 0, lowCount: 0 });
    }

    const highlightGeo = new THREE.IcosahedronGeometry(1, 0);
    this.geometries.push(highlightGeo);
    this.highlightMaterial = new THREE.LineBasicMaterial({
      color: 0x7ce8ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.materials.push(this.highlightMaterial);
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(highlightGeo), this.highlightMaterial);
    this.geometries.push(this.highlight.geometry);
    this.highlight.visible = false;
    this.highlight.frustumCulled = false;
    this.highlight.renderOrder = 3;
    this.root.add(this.highlight);

    scene.add(this.root);
    this.setQuality(quality);
  }

  public setQuality(level: QualityLevel): void {
    this.detailDistance = level === 'low' ? 380 : level === 'medium' ? 720 : 1050;
  }

  public update(
    asteroids: readonly AsteroidEntity[],
    cameraPosition: THREE.Vector3,
    target: AsteroidEntity | null,
    dt: number,
  ): void {
    this.time += dt;
    for (const slot of this.slots.values()) {
      slot.highCount = 0;
      slot.lowCount = 0;
    }

    for (const asteroid of asteroids) {
      if (!asteroid.alive) continue;
      const slot = this.slots.get(asteroid.resource);
      if (!slot) continue;
      this.tempPosition.set(asteroid.position.x, asteroid.position.y, asteroid.position.z);
      const highDetail =
        cameraPosition.distanceToSquared(this.tempPosition) < this.detailDistance * this.detailDistance;
      const mesh = highDetail ? slot.high : slot.low;
      const index = highDetail ? slot.highCount : slot.lowCount;

      this.tempQuaternion.set(
        asteroid.quaternion.x,
        asteroid.quaternion.y,
        asteroid.quaternion.z,
        asteroid.quaternion.w,
      );
      // Visual shrink as mined (render-only); keep a minimum so it stays visible/tappable.
      const yieldRatio =
        asteroid.maxYield > 0 ? THREE.MathUtils.clamp(asteroid.yieldRemaining / asteroid.maxYield, 0, 1) : 1;
      const minedScale = 0.38 + yieldRatio * 0.62;
      this.tempScale.setScalar(asteroid.radius * minedScale);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      mesh.setMatrixAt(index, this.tempMatrix);
      if (highDetail) slot.highCount += 1;
      else slot.lowCount += 1;
    }

    for (const slot of this.slots.values()) {
      slot.high.count = slot.highCount;
      slot.low.count = slot.lowCount;
      slot.high.instanceMatrix.needsUpdate = true;
      slot.low.instanceMatrix.needsUpdate = true;
    }

    if (target && target.alive) {
      this.highlight.visible = true;
      this.highlight.position.set(target.position.x, target.position.y, target.position.z);
      this.highlight.quaternion.set(
        target.quaternion.x,
        target.quaternion.y,
        target.quaternion.z,
        target.quaternion.w,
      );
      const yieldRatio =
        target.maxYield > 0 ? THREE.MathUtils.clamp(target.yieldRemaining / target.maxYield, 0, 1) : 1;
      this.highlight.scale.setScalar(target.radius * (0.38 + yieldRatio * 0.62) * 1.08);
      this.highlightMaterial.color.setHex(RESOURCES[target.resource].glow);
      this.highlightMaterial.opacity = 0.48 + Math.sin(this.time * 4.5) * 0.18;
    } else {
      this.highlight.visible = false;
    }
  }

  public dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
    this.slots.clear();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
