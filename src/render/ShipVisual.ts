import * as THREE from 'three';
import { ENEMY_TUNING } from '../game/config';
import type { ShipEntity } from '../game/types';
import type { LoadedModel } from './ShipLoader';

const shieldVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const shieldFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(normal, viewDir)), 2.6);
    float alpha = rim * uStrength;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export interface ShipVisualOptions {
  id: number;
  model: LoadedModel;
  accent: string;
  engineColor: string;
  isPlayer: boolean;
  radius: number;
  scale: number;
  glowTexture: THREE.Texture;
  hullClass?: 'logistics' | 'combat' | 'prospector';
}

export class ShipVisual {
  public readonly group = new THREE.Group();
  public readonly shipId: number;
  public readonly engineSprites: THREE.Sprite[] = [];
  private readonly engineColor: THREE.Color;
  private readonly shell: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
  private readonly engineLight: THREE.PointLight | null = null;
  private readonly engineSpritesBaseScale: number;
  private readonly flames: THREE.Mesh[] = [];
  private time = 0;
  private readonly worldPosition = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor(scene: THREE.Object3D, options: ShipVisualOptions) {
    this.shipId = options.id;
    this.engineColor = new THREE.Color(options.engineColor);
    this.engineSpritesBaseScale = options.isPlayer ? 3.1 : 2.45;
    this.group.name = `ship-${options.id}`;

    const model = options.model.scene.clone(true);
    model.scale.setScalar(options.scale);
    this.group.add(model);

    const hullClass = options.hullClass ?? 'prospector';
    const hardpoints = new THREE.Group();
    hardpoints.name = 'hardpoints';
    if (hullClass === 'combat') {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const hp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.24, 0.8, 8),
            new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a') }),
          );
          hp.rotation.x = Math.PI / 2;
          hp.position.set(side * (1.6 + i * 0.5), 0.25, -1.2 + i * 0.6);
          hardpoints.add(hp);
        }
      }
      const launcher = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.28, 0.4),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a1e') }),
      );
      launcher.position.set(0, -0.4, -2.2);
      hardpoints.add(launcher);
    } else if (hullClass === 'logistics') {
      for (const side of [-1, 1]) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.16, 1.0, 6),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#7dffb1') }),
        );
        beam.rotation.x = Math.PI / 2;
        beam.position.set(side * 1.2, 0.2, -0.6);
        hardpoints.add(beam);
      }
      const droneBay = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.8, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#9dffcc'), transparent: true, opacity: 0.4 }),
      );
      droneBay.rotation.x = Math.PI / 2;
      droneBay.position.set(0, -0.5, -0.2);
      hardpoints.add(droneBay);
    } else if (hullClass === 'prospector') {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.22, 0.6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#8ef0a8') }),
      );
      strip.position.set(0, -0.6, -1.0);
      hardpoints.add(strip);
      for (const side of [-1, 1]) {
        const probe = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8ffda') }),
        );
        probe.position.set(side * 1.8, 0.4, -0.2);
        hardpoints.add(probe);
      }
    }
    model.add(hardpoints);

    const engineNodes: THREE.Object3D[] = [];
    model.traverse((object) => {
      if (object.name.startsWith('engine_glow')) engineNodes.push(object);
    });

    if (engineNodes.length === 0) {
      for (const side of [-1, 1]) {
        const anchor = new THREE.Object3D();
        anchor.position.set(side * 1.65, 0, 4.1);
        anchor.name = `engine_anchor_${side}`;
        this.group.add(anchor);
        engineNodes.push(anchor);
      }
    }

    for (const [index, node] of engineNodes.entries()) {
      const material = new THREE.SpriteMaterial({
        map: options.glowTexture,
        color: this.engineColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        opacity: 0.7,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = `engine_sprite_${index}`;
      sprite.scale.setScalar(this.engineSpritesBaseScale);
      node.add(sprite);
      this.engineSprites.push(sprite);
    }

    // Procedural hulls may include thrust flame meshes.
    model.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name.startsWith('engine_flame')) this.flames.push(object);
    });

    if (options.isPlayer) {
      let shellColor = options.accent;
      if (hullClass === 'logistics') shellColor = '#7dffb1';
      else if (hullClass === 'combat') shellColor = '#ff7a2a';
      else if (hullClass === 'prospector') shellColor = '#8ef0a8';
      const shellMaterial = new THREE.ShaderMaterial({
        vertexShader: shieldVertex,
        fragmentShader: shieldFragment,
        uniforms: {
          uColor: { value: new THREE.Color(shellColor) },
          uStrength: { value: 0.16 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.shell = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(options.radius * 1.85, 8), 26, 16),
        shellMaterial,
      );
      this.shell.visible = false;
      this.shell.renderOrder = 4;
      this.group.add(this.shell);

      const lightCol = hullClass === 'combat' ? '#ff7a2a' : hullClass === 'logistics' ? '#7dffb1' : '#8ef0a8';
      this.engineLight = new THREE.PointLight(new THREE.Color(lightCol), 7, 38, 2);
      this.engineLight.position.set(0, 0, 5);
      this.group.add(this.engineLight);
    }

    scene.add(this.group);
  }

  public update(ship: ShipEntity, dt: number): void {
    this.time += dt;
    this.group.visible = ship.alive;
    if (!ship.alive) return;

    this.group.position.set(ship.position.x, ship.position.y, ship.position.z);
    this.group.quaternion.set(
      ship.quaternion.x,
      ship.quaternion.y,
      ship.quaternion.z,
      ship.quaternion.w,
    );
    this.group.rotateZ(ship.bank);

    if (ship.warpTimer > 0) {
      const progress = 1 - Math.min(1, ship.warpTimer / ENEMY_TUNING.warpDuration);
      const eased = progress * progress * (3 - 2 * progress);
      this.group.scale.setScalar(0.16 + eased * 0.84);
      this.group.rotateZ((1 - eased) * Math.PI * 1.6);
    } else {
      this.group.scale.setScalar(1);
    }

    const speed = Math.hypot(ship.velocity.x, ship.velocity.y, ship.velocity.z);
    const power = THREE.MathUtils.clamp(speed / Math.max(ship.baseSpeed, 1), 0, 2.2);
    const boost = ship.boosting ? 1 : 0;
    for (const [index, sprite] of this.engineSprites.entries()) {
      const pulse = 0.86 + Math.sin(this.time * 24 + index * 1.7) * 0.08;
      const scale = this.engineSpritesBaseScale * (0.72 + power * 0.32 + boost * 0.7) * pulse;
      sprite.scale.setScalar(scale);
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = 0.48 + power * 0.18 + boost * 0.28;
    }
    if (this.flames.length) {
      const f = 0.55 + power * 0.35 + boost * 0.65 + Math.sin(this.time * 38) * 0.08;
      for (const [i, flame] of this.flames.entries()) {
        const s = f * (flame.name.includes('core') ? 0.75 : 1) * (0.94 + Math.sin(this.time * 44 + i) * 0.06);
        flame.scale.set(0.9 + power * 0.2, Math.max(0.15, s), 0.9 + power * 0.2);
        const mat = flame.material as THREE.MeshBasicMaterial;
        if (mat && 'opacity' in mat) mat.opacity = THREE.MathUtils.clamp((mat.opacity || 0.7) * 0.92 + (0.2 + power * 0.35 + boost * 0.35) * 0.08, 0.15, 0.95);
        flame.visible = ship.alive && (power > 0.02 || boost > 0);
      }
    }

    if (this.engineLight) {
      this.engineLight.intensity = 2.5 + power * 4 + boost * 8;
    }

    if (this.shell) {
      const shieldRatio = ship.maxShield > 0 ? ship.shield / ship.maxShield : 0;
      const flash = THREE.MathUtils.clamp(ship.hitFlash * 5, 0, 1);
      const strength = 0.035 + shieldRatio * 0.055 + flash * 0.65;
      this.shell.material.uniforms.uStrength.value = strength;
      this.shell.visible = strength > 0.05;
      this.shell.rotation.y += dt * 0.16;
      this.shell.rotation.x += dt * 0.08;
    }
  }

  public getEngineWorldPositions(target: THREE.Vector3[]): THREE.Vector3[] {
    target.length = 0;
    for (const sprite of this.engineSprites) {
      sprite.getWorldPosition(this.worldPosition);
      target.push(this.worldPosition.clone());
    }
    return target;
  }

  public getForward(target = this.forward): THREE.Vector3 {
    target.set(0, 0, -1).applyQuaternion(this.group.quaternion);
    return target;
  }

  public getEngineColor(): THREE.Color {
    return this.engineColor;
  }

  public dispose(): void {
    for (const sprite of this.engineSprites) {
      (sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.engineSprites.length = 0;
    if (this.shell) {
      this.shell.geometry.dispose();
      this.shell.material.dispose();
    }
    this.group.removeFromParent();
  }
}
