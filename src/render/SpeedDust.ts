import * as THREE from 'three';
import type { Vec3 } from '../game/types';
import { Rng } from '../game/math';
import type { QualityLevel } from './QualityManager';

const dustVertex = /* glsl */ `
  uniform float uOpacity;
  uniform float uBoost;
  uniform float uPixelRatio;
  attribute float aSize;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 + uBoost * 0.5) * (90.0 / max(-mvPosition.z, 1.0));
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = uOpacity;
  }
`;

const dustFragment = /* glsl */ `
  precision mediump float;
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    float falloff = smoothstep(0.5, 0.04, dist);
    float alpha = falloff * vAlpha;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(0.62, 0.78, 1.0, alpha);
  }
`;

export class SpeedDust {
  public readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly basePositions: Float32Array;
  private readonly count: number;
  private readonly rng = new Rng(0x51eed);
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly worldVelocity = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private currentCount: number;

  constructor(scene: THREE.Object3D, quality: QualityLevel) {
    this.count = 320;
    this.currentCount = quality === 'low' ? 110 : quality === 'medium' ? 210 : 320;
    this.positions = new Float32Array(this.count * 3);
    this.basePositions = new Float32Array(this.count);
    const sizes = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      this.spawnInto(i);
      sizes[i] = this.rng.range(0.45, 1.35);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uOpacity: { value: 0 },
        uBoost: { value: 0 },
        uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geometry.setDrawRange(0, this.currentCount);
    scene.add(this.points);
  }

  private spawnInto(index: number): void {
    const radius = this.rng.range(70, 165);
    const direction = this.rng.unitVector();
    this.positions[index * 3] = direction.x * radius;
    this.positions[index * 3 + 1] = direction.y * radius * 0.65;
    this.positions[index * 3 + 2] = direction.z * radius;
    this.basePositions[index] = this.rng.range(0.5, 1.4);
  }

  public setQuality(level: QualityLevel): void {
    this.currentCount = level === 'low' ? 110 : level === 'medium' ? 210 : this.count;
    this.geometry.setDrawRange(0, this.currentCount);
    this.material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, level === 'high' ? 2 : 1.5);
  }

  public update(
    dt: number,
    camera: THREE.Camera,
    velocity: Vec3,
    speedRatio: number,
    boost: number,
  ): void {
    const positionAttribute = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.worldVelocity.set(velocity.x, velocity.y, velocity.z);
    camera.getWorldPosition(this.cameraPosition);
    this.points.position.copy(this.cameraPosition);

    const movementScale = dt * (0.65 + Math.min(speedRatio, 2.4));
    for (let i = 0; i < this.currentCount; i += 1) {
      const index = i * 3;
      this.positions[index] -= this.worldVelocity.x * movementScale;
      this.positions[index + 1] -= this.worldVelocity.y * movementScale;
      this.positions[index + 2] -= this.worldVelocity.z * movementScale;
      const x = this.positions[index];
      const y = this.positions[index + 1];
      const z = this.positions[index + 2];
      if (x * x + y * y + z * z > 190 * 190) {
        this.spawnInto(i);
      }
    }
    positionAttribute.needsUpdate = true;

    const baseOpacity = THREE.MathUtils.clamp(speedRatio * 0.13, 0.03, 0.26);
    this.material.uniforms.uOpacity.value = baseOpacity + boost * 0.2;
    this.material.uniforms.uBoost.value = boost;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
