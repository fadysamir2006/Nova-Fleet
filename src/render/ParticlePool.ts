import * as THREE from 'three';
import { Rng, vec3 } from '../game/math';
import type { Vec3 } from '../game/types';

interface Particle {
  active: boolean;
  position: Vec3;
  velocity: Vec3;
  life: number;
  maxLife: number;
  size: number;
  drag: number;
  color: THREE.Color;
}

const vertexShader = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPixelRatio * (330.0 / max(-mvPosition.z, 1.0)), 1.0, 96.0);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(centered);
    float soft = smoothstep(0.5, 0.02, distanceToCenter);
    float core = smoothstep(0.2, 0.0, distanceToCenter);
    float alpha = vAlpha * (soft * 0.75 + core * 0.6);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export class ParticlePool {
  public readonly object: THREE.Points;
  public budget = 620;

  private readonly maxParticles: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly particles: Particle[] = [];
  private readonly rng = new Rng(0xf1ea);
  private readonly color = new THREE.Color();
  private cursor = 0;
  public activeCount = 0;

  constructor(scene: THREE.Object3D, maxParticles = 900) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.alphas = new Float32Array(maxParticles);
    for (let i = 0; i < maxParticles; i += 1) {
      this.particles.push({
        active: false,
        position: vec3(),
        velocity: vec3(),
        life: 0,
        maxLife: 1,
        size: 1,
        drag: 1,
        color: new THREE.Color(),
      });
    }

    this.geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    const colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    const sizeAttribute = new THREE.BufferAttribute(this.sizes, 1);
    const alphaAttribute = new THREE.BufferAttribute(this.alphas, 1);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', positionAttribute);
    this.geometry.setAttribute('aColor', colorAttribute);
    this.geometry.setAttribute('aSize', sizeAttribute);
    this.geometry.setAttribute('aAlpha', alphaAttribute);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 6;
    scene.add(this.object);
  }

  public spawn(
    position: Vec3,
    velocity: Vec3,
    life: number,
    size: number,
    color: THREE.ColorRepresentation,
    drag = 1.6,
  ): void {
    if (this.activeCount >= this.budget) return;
    let index = -1;
    for (let offset = 0; offset < this.maxParticles; offset += 1) {
      const candidate = (this.cursor + offset) % this.maxParticles;
      if (!this.particles[candidate].active) {
        index = candidate;
        break;
      }
    }
    if (index < 0) index = this.cursor;
    this.cursor = (index + 1) % this.maxParticles;
    const particle = this.particles[index];
    particle.active = true;
    particle.position = { ...position };
    particle.velocity = { ...velocity };
    particle.life = life;
    particle.maxLife = life;
    particle.size = size;
    particle.drag = drag;
    particle.color.set(color);
    this.activeCount += 1;
  }

  public update(dt: number): void {
    const positionAttribute = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttribute = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const sizeAttribute = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alphaAttribute = this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    let active = 0;

    for (let i = 0; i < this.maxParticles; i += 1) {
      const particle = this.particles[i];
      const index3 = i * 3;
      if (!particle.active) {
        this.alphas[i] = 0;
        continue;
      }
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        this.alphas[i] = 0;
        continue;
      }
      const fade = particle.life / particle.maxLife;
      const damping = Math.exp(-particle.drag * dt);
      particle.velocity.x *= damping;
      particle.velocity.y *= damping;
      particle.velocity.z *= damping;
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;
      this.positions[index3] = particle.position.x;
      this.positions[index3 + 1] = particle.position.y;
      this.positions[index3 + 2] = particle.position.z;
      this.colors[index3] = particle.color.r;
      this.colors[index3 + 1] = particle.color.g;
      this.colors[index3 + 2] = particle.color.b;
      this.sizes[i] = particle.size * (0.7 + fade * 0.55);
      this.alphas[i] = fade * fade * 0.92;
      active += 1;
    }
    this.activeCount = active;
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;
  }

  public burst(
    position: Vec3,
    count: number,
    speedMin: number,
    speedMax: number,
    lifeMin: number,
    lifeMax: number,
    sizeMin: number,
    sizeMax: number,
    colors: readonly THREE.ColorRepresentation[],
    drag = 1.2,
    direction?: Vec3,
    spread = Math.PI,
  ): void {
    for (let i = 0; i < count; i += 1) {
      let directionVector = this.rng.unitVector();
      if (direction) {
        const axis = vec3(
          this.rng.range(-1, 1),
          this.rng.range(-1, 1),
          this.rng.range(-1, 1),
        );
        const perp = vec3(
          direction.y * axis.z - direction.z * axis.y,
          direction.z * axis.x - direction.x * axis.z,
          direction.x * axis.y - direction.y * axis.x,
        );
        const perpLength = Math.hypot(perp.x, perp.y, perp.z) || 1;
        const cone = this.rng.range(0, spread);
        directionVector = {
          x: direction.x * Math.cos(cone) + (perp.x / perpLength) * Math.sin(cone),
          y: direction.y * Math.cos(cone) + (perp.y / perpLength) * Math.sin(cone),
          z: direction.z * Math.cos(cone) + (perp.z / perpLength) * Math.sin(cone),
        };
      }
      const speed = this.rng.range(speedMin, speedMax);
      const velocity = {
        x: directionVector.x * speed,
        y: directionVector.y * speed,
        z: directionVector.z * speed,
      };
      this.color.set(colors[Math.floor(this.rng.next() * colors.length)] ?? colors[0]);
      this.spawn(
        position,
        velocity,
        this.rng.range(lifeMin, lifeMax),
        this.rng.range(sizeMin, sizeMax),
        this.color.getHex(),
        drag,
      );
    }
  }

  public setPixelRatio(ratio: number): void {
    this.material.uniforms.uPixelRatio.value = ratio;
  }

  public clear(): void {
    for (const particle of this.particles) particle.active = false;
    this.activeCount = 0;
    for (let i = 0; i < this.maxParticles; i += 1) this.alphas[i] = 0;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
