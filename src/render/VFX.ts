import * as THREE from 'three';
import { RESOURCES } from '../assets-config';
import type { ResourceKind } from '../game/types';
import type { QualitySettings } from './QualityManager';
import { ParticlePool } from './ParticlePool';

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float stripe = sin(vUv.y * 58.0 - uTime * 28.0) * 0.5 + 0.5;
    float flicker = 0.75 + sin(uTime * 31.0) * 0.12;
    vec3 color = mix(uColor, vec3(1.0), 0.38 + stripe * 0.22);
    gl_FragColor = vec4(color, (0.28 + stripe * 0.45) * uIntensity * flicker);
  }
`;

interface Shockwave {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface AimLine {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: THREE.BufferAttribute;
  life: number;
  maxLife: number;
}

export interface MiningBeamState {
  origin: THREE.Vector3;
  target: THREE.Vector3;
  targetRadius: number;
  color: number;
  active: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

export class VFX {
  public readonly particles: ParticlePool;
  private readonly shockwaves: Shockwave[] = [];
  private readonly aimLines: AimLine[] = [];
  private readonly shockwaveGeometry: THREE.RingGeometry;
  private readonly beamGroup = new THREE.Group();
  private readonly beamCore: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly beamOuter: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly beamImpact: THREE.Sprite;
  private readonly beamImpactMaterial: THREE.SpriteMaterial;
  private readonly beamLight: THREE.PointLight;
  private readonly explosionLight: THREE.PointLight;
  private readonly engineAccumulators = new Map<string, number>();
  private readonly beamOrigin = new THREE.Vector3();
  private readonly beamTarget = new THREE.Vector3();
  private readonly beamDirection = new THREE.Vector3();
  private readonly beamMid = new THREE.Vector3();
  private readonly beamEndpoint = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  private quality: QualitySettings;
  private time = 0;
  private sparkAccumulator = 0;

  constructor(scene: THREE.Object3D, glowTexture: THREE.Texture, quality: QualitySettings) {
    this.quality = quality;
    this.particles = new ParticlePool(scene, 900);
    this.particles.budget = quality.particleBudget;

    this.shockwaveGeometry = new THREE.RingGeometry(0.72, 1, 42);
    for (let i = 0; i < 10; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffaa66,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.shockwaveGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.shockwaves.push({
        mesh,
        life: 0,
        maxLife: 0.8,
        startScale: 1,
        endScale: 20,
      });
    }

    for (let i = 0; i < 8; i += 1) {
      const geometry = new THREE.BufferGeometry();
      const positions = new THREE.BufferAttribute(new Float32Array(6), 3);
      geometry.setAttribute('position', positions);
      const material = new THREE.LineBasicMaterial({
        color: 0xff6a72,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.visible = false;
      line.renderOrder = 6;
      scene.add(line);
      this.aimLines.push({ line, positions, life: 0, maxLife: 0 });
    }

    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: {
        uColor: { value: new THREE.Color(0x7ce8ff) },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const outerMaterial = coreMaterial.clone();
    outerMaterial.uniforms = {
      uColor: { value: new THREE.Color(0x7ce8ff) },
      uTime: { value: 0 },
      uIntensity: { value: 0.42 },
    };
    this.beamCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 1, 8, 1, true),
      coreMaterial,
    );
    this.beamOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1, 8, 1, true),
      outerMaterial,
    );
    this.beamCore.renderOrder = 4;
    this.beamOuter.renderOrder = 3;
    this.beamGroup.add(this.beamCore, this.beamOuter);
    this.beamGroup.visible = false;
    scene.add(this.beamGroup);

    this.beamImpactMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x7ce8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.8,
    });
    this.beamImpact = new THREE.Sprite(this.beamImpactMaterial);
    this.beamImpact.scale.setScalar(6);
    this.beamImpact.visible = false;
    scene.add(this.beamImpact);

    this.beamLight = new THREE.PointLight(0x7ce8ff, 0, 38, 2);
    this.beamLight.visible = false;
    scene.add(this.beamLight);

    this.explosionLight = new THREE.PointLight(0xffb36b, 0, 180, 2);
    this.explosionLight.visible = false;
    scene.add(this.explosionLight);
  }

  public setQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.particles.budget = quality.particleBudget;
    this.particles.setPixelRatio(Math.min(devicePixelRatio, quality.maxPixelRatio));
  }

  public explosion(position: THREE.Vector3, scale = 1, resource?: ResourceKind): void {
    const palette = resource
      ? [0xffffff, RESOURCES[resource].glow, RESOURCES[resource].color]
      : [0xffffff, 0xffe5b0, 0xff9b42, 0xff5a2a, 0x7ac9ff];
    const count = Math.round(
      (this.quality.level === 'low' ? 28 : this.quality.level === 'medium' ? 52 : 76) *
        Math.min(1.7, scale),
    );
    this.particles.burst(
      { x: position.x, y: position.y, z: position.z },
      count,
      8,
      70 * Math.min(1.4, scale),
      0.5,
      1.8,
      0.35,
      2.6,
      palette,
      0.9,
    );
    this.triggerShockwave(position, palette[1] as THREE.ColorRepresentation, scale);
    if (scale > 0.8) {
      this.triggerShockwave(position, 0x7ccaff, scale * 0.72);
    }
    if (this.quality.level !== 'low') {
      this.explosionLight.position.copy(position);
      this.explosionLight.color.set(palette[1] as THREE.ColorRepresentation);
      this.explosionLight.intensity = 130 * Math.min(scale, 2);
      this.explosionLight.visible = true;
    }
  }

  public impact(
    position: THREE.Vector3,
    color: THREE.ColorRepresentation = 0xffc27a,
    shield = false,
    count = 8,
  ): void {
    this.particles.burst(
      { x: position.x, y: position.y, z: position.z },
      count,
      4,
      24,
      0.18,
      0.55,
      0.18,
      0.8,
      [0xffffff, color, shield ? 0x69dfff : 0xff7a33],
      2.2,
    );
  }

  public muzzleFlash(position: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.particles.burst(
      { x: position.x, y: position.y, z: position.z },
      3,
      8,
      26,
      0.08,
      0.22,
      0.2,
      0.7,
      [0xffffff, color],
      3.4,
    );
  }

  public asteroidBreak(position: THREE.Vector3, resource: ResourceKind): void {
    const info = RESOURCES[resource];
    this.particles.burst(
      { x: position.x, y: position.y, z: position.z },
      this.quality.level === 'low' ? 26 : 44,
      4,
      32,
      0.4,
      1.2,
      0.25,
      1.4,
      [info.glow, info.color, 0x8e7f6d],
      1.3,
    );
  }

  public enemySpawn(position: THREE.Vector3): void {
    this.particles.burst(
      { x: position.x, y: position.y, z: position.z },
      this.quality.level === 'low' ? 16 : 30,
      2,
      20,
      0.32,
      1.15,
      0.28,
      1.15,
      [0xffffff, 0x7cf4ff, 0x2d8fa3],
      1.8,
    );
    this.triggerShockwave(position, 0x7cf4ff, 1.4);
    this.triggerShockwave(position, 0xc9f8ff, 0.6);
  }

  /** Red line held on screen for the enemy's firing wind-up. */
  public enemyAim(from: THREE.Vector3, to: THREE.Vector3, duration: number): void {
    const slot = this.aimLines.find((entry) => entry.life <= 0);
    if (!slot) return;
    slot.positions.setXYZ(0, from.x, from.y, from.z);
    slot.positions.setXYZ(1, to.x, to.y, to.z);
    slot.positions.needsUpdate = true;
    slot.life = duration;
    slot.maxLife = duration;
    slot.line.visible = true;
    slot.line.material.opacity = 0.55;
  }

  public engineTrail(
    key: string,
    position: THREE.Vector3,
    forward: THREE.Vector3,
    color: THREE.Color,
    boost: boolean,
    dt: number,
  ): void {
    const rate = boost ? 52 : 23;
    const accumulator = (this.engineAccumulators.get(key) ?? 0) + dt * rate;
    let emissions = Math.floor(accumulator);
    this.engineAccumulators.set(key, accumulator - emissions);
    if (emissions > 12) emissions = 12;
    for (let i = 0; i < emissions; i += 1) {
      const speed = (boost ? 38 : 20) + Math.random() * 18;
      this.particles.spawn(
        {
          x: position.x + (Math.random() - 0.5) * 0.25,
          y: position.y + (Math.random() - 0.5) * 0.25,
          z: position.z + (Math.random() - 0.5) * 0.25,
        },
        {
          x: -forward.x * speed + (Math.random() - 0.5) * 4,
          y: -forward.y * speed + (Math.random() - 0.5) * 4,
          z: -forward.z * speed + (Math.random() - 0.5) * 4,
        },
        0.28 + Math.random() * 0.28,
        0.24 + Math.random() * 0.42,
        color,
        1.1,
      );
    }
  }

  public setMiningBeam(state: MiningBeamState): void {
    this.beamOrigin.copy(state.origin);
    this.beamTarget.copy(state.target);
    if (!state.active) {
      this.beamGroup.visible = false;
      this.beamImpact.visible = false;
      this.beamLight.visible = false;
      return;
    }

    this.beamDirection.subVectors(this.beamTarget, this.beamOrigin);
    const distance = this.beamDirection.length();
    if (distance < 0.01) {
      this.beamGroup.visible = false;
      this.beamImpact.visible = false;
      this.beamLight.visible = false;
      return;
    }
    this.beamDirection.normalize();
    const length = Math.max(0.1, distance - state.targetRadius * 0.82);
    this.beamEndpoint.copy(this.beamOrigin).addScaledVector(this.beamDirection, length);
    this.beamMid.copy(this.beamOrigin).add(this.beamEndpoint).multiplyScalar(0.5);

    this.beamGroup.position.copy(this.beamMid);
    this.tempQuat.setFromUnitVectors(UP, this.beamDirection);
    this.beamGroup.quaternion.copy(this.tempQuat);
    this.beamGroup.scale.set(1, length, 1);
    this.beamGroup.visible = true;

    this.beamImpact.position.copy(this.beamEndpoint);
    this.beamImpact.visible = true;
    this.beamImpact.scale.setScalar(7 + Math.sin(this.time * 19) * 1.2);
    this.beamImpactMaterial.color.setHex(state.color);

    this.beamCore.material.uniforms.uColor.value.setHex(state.color);
    this.beamOuter.material.uniforms.uColor.value.setHex(state.color);
    this.beamImpactMaterial.color.setHex(state.color);
    this.beamLight.position.copy(this.beamEndpoint);
    this.beamLight.color.setHex(state.color);
    this.beamLight.intensity = 7;
    this.beamLight.visible = this.quality.level !== 'low';
  }

  public update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.particles.update(dt);

    this.beamCore.material.uniforms.uTime.value = this.time;
    this.beamOuter.material.uniforms.uTime.value = this.time;

    if (this.beamGroup.visible) {
      this.sparkAccumulator += dt;
      if (this.sparkAccumulator > 0.03) {
        this.sparkAccumulator = 0;
        this.impact(this.beamEndpoint, this.beamLight.color, false, 2);
      }
      this.beamImpact.scale.setScalar(7 + Math.sin(this.time * 19) * 1.2);
    }

    for (const shockwave of this.shockwaves) {
      if (shockwave.life <= 0) continue;
      shockwave.life -= dt;
      if (shockwave.life <= 0) {
        shockwave.mesh.visible = false;
        continue;
      }
      const t = 1 - shockwave.life / shockwave.maxLife;
      const scale = THREE.MathUtils.lerp(shockwave.startScale, shockwave.endScale, t);
      shockwave.mesh.scale.setScalar(scale);
      shockwave.mesh.material.opacity = (1 - t) * (1 - t) * 0.55;
      shockwave.mesh.quaternion.copy(camera.quaternion);
    }

    for (const aim of this.aimLines) {
      if (aim.life <= 0) continue;
      aim.life -= dt;
      if (aim.life <= 0) {
        aim.line.visible = false;
        continue;
      }
      const t = aim.life / aim.maxLife;
      aim.line.material.opacity = 0.5 * Math.min(1, t * 1.6) * (0.72 + Math.sin(this.time * 38) * 0.2);
    }

    if (this.explosionLight.visible) {
      this.explosionLight.intensity *= Math.exp(-dt * 8.5);
      if (this.explosionLight.intensity < 0.2) this.explosionLight.visible = false;
    }
  }

  private triggerShockwave(
    position: THREE.Vector3,
    color: THREE.ColorRepresentation,
    scale: number,
  ): void {
    const shockwave = this.shockwaves.find((entry) => entry.life <= 0);
    if (!shockwave) return;
    shockwave.life = 0.58 + Math.min(scale, 2) * 0.22;
    shockwave.maxLife = shockwave.life;
    shockwave.startScale = 1.5;
    shockwave.endScale = 16 + scale * 13;
    shockwave.mesh.position.copy(position);
    shockwave.mesh.material.color.set(color);
    shockwave.mesh.material.opacity = 0.55;
    shockwave.mesh.visible = true;
  }

  public clear(): void {
    this.particles.clear();
    this.engineAccumulators.clear();
    this.beamGroup.visible = false;
    this.beamImpact.visible = false;
    this.beamLight.visible = false;
    this.explosionLight.visible = false;
    for (const shockwave of this.shockwaves) {
      shockwave.life = 0;
      shockwave.mesh.visible = false;
    }
    for (const aim of this.aimLines) {
      aim.life = 0;
      aim.line.visible = false;
    }
  }

  public dispose(): void {
    this.clear();
    this.particles.dispose();
    this.shockwaveGeometry.dispose();
    for (const shockwave of this.shockwaves) {
      shockwave.mesh.material.dispose();
      shockwave.mesh.removeFromParent();
    }
    for (const aim of this.aimLines) {
      aim.line.geometry.dispose();
      aim.line.material.dispose();
      aim.line.removeFromParent();
    }
    this.beamCore.geometry.dispose();
    this.beamCore.material.dispose();
    this.beamOuter.geometry.dispose();
    this.beamOuter.material.dispose();
    this.beamGroup.removeFromParent();
    this.beamImpactMaterial.dispose();
    this.beamImpact.removeFromParent();
    this.beamLight.removeFromParent();
    this.explosionLight.removeFromParent();
  }
}
