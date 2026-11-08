import * as THREE from 'three';
import type { LoadedModel } from './ShipLoader';

/**
 * Hangar diorama: the selected hull, a faint procedural station bay, dust motes
 * and a key/rim/fill light rig. Everything here is generated at runtime and
 * disposed with the renderer; no external art is loaded.
 */
export class HangarPreview {
  public readonly root = new THREE.Group();
  private model: THREE.Group | null = null;
  private modelId = '';
  private readonly engineSprites: THREE.Sprite[] = [];
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly ringInnerMaterial: THREE.MeshBasicMaterial;
  private readonly ringInner: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly station = new THREE.Group();
  private readonly dust: THREE.Points;
  private readonly dustMaterial: THREE.PointsMaterial;
  private readonly dustBase: Float32Array;
  private readonly dustPhase: Float32Array;
  private readonly keyLight: THREE.SpotLight;
  private readonly keyTarget = new THREE.Object3D();
  private readonly rimLight: THREE.PointLight;
  private readonly fillLight: THREE.PointLight;
  private readonly glowTexture: THREE.Texture;
  private time = 0;

  constructor(scene: THREE.Scene, glowTexture: THREE.Texture) {
    this.glowTexture = glowTexture;
    this.root.visible = false;
    this.root.position.set(0, 0.2, 0);
    scene.add(this.root);

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x59dfff,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(5.15, 5.26, 80), this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = -3.2;
    this.root.add(this.ring);

    this.ringInnerMaterial = new THREE.MeshBasicMaterial({
      color: 0x8be8ff,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ringInner = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.54, 64), this.ringInnerMaterial);
    this.ringInner.rotation.x = -Math.PI / 2;
    this.ringInner.position.y = -3.2;
    this.root.add(this.ringInner);

    this.buildStation();
    this.root.add(this.station);

    const dust = this.buildDust();
    this.dust = dust.points;
    this.dustMaterial = dust.material;
    this.dustBase = dust.base;
    this.dustPhase = dust.phase;
    this.root.add(this.dust);

    // Key light: cold overhead spot that gives the hull a dramatic top edge.
    this.keyLight = new THREE.SpotLight(0xe8f7ff, 90, 46, Math.PI / 5.5, 0.65, 1.4);
    this.keyLight.position.set(9, 14, -7);
    this.keyTarget.position.set(0, 0, 0);
    this.root.add(this.keyLight, this.keyTarget);
    this.keyLight.target = this.keyTarget;

    // Rim: coloured bounce from the launch bay.
    this.rimLight = new THREE.PointLight(0x6cdfff, 34, 36, 2);
    this.rimLight.position.set(3, 5, -6);
    this.root.add(this.rimLight);

    // Warm fill from the deck to separate the silhouette from the wall.
    this.fillLight = new THREE.PointLight(0xffb36b, 12, 30, 2);
    this.fillLight.position.set(-7, -4, 5);
    this.root.add(this.fillLight);
  }

  private buildStation(): void {
    const wallGeometry = new THREE.CylinderGeometry(26, 26, 36, 48, 1, true);
    const wallMaterial = new THREE.MeshBasicMaterial({
      color: 0x050c14,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
      toneMapped: false,
    });
    this.station.add(new THREE.Mesh(wallGeometry, wallMaterial));

    const ribGeometry = new THREE.BoxGeometry(0.16, 32, 0.16);
    const ribMaterial = new THREE.MeshBasicMaterial({
      color: 0x1d5f7a,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeometry, ribMaterial);
      rib.position.set(Math.cos(angle) * 25.4, 0, Math.sin(angle) * 25.4);
      rib.rotation.y = -angle;
      this.station.add(rib);
    }

    const ceilingGeometry = new THREE.TorusGeometry(25, 0.12, 6, 64);
    const ceilingMaterial = new THREE.MeshBasicMaterial({
      color: 0x2a7f9e,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 15;
    const floorRail = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    floorRail.rotation.x = Math.PI / 2;
    floorRail.position.y = -15;
    this.station.add(ceiling, floorRail);

    const bayGeometry = new THREE.TorusGeometry(15.5, 0.16, 8, 72);
    const bayMaterial = new THREE.MeshBasicMaterial({
      color: 0x59dfff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const bayRing = new THREE.Mesh(bayGeometry, bayMaterial);
    bayRing.position.set(0, 1, -22);
    this.station.add(bayRing);

    const armGeometry = new THREE.BoxGeometry(34, 0.14, 0.14);
    const armMaterial = new THREE.MeshBasicMaterial({
      color: 0x1d5f7a,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (const y of [-7.5, 8.5]) {
      const arm = new THREE.Mesh(armGeometry, armMaterial);
      arm.position.set(0, y, -19);
      this.station.add(arm);
    }

    const deckGeometry = new THREE.CircleGeometry(24, 48);
    const deckMaterial = new THREE.MeshBasicMaterial({
      color: 0x03080d,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = -3.35;
    this.station.add(deck);
  }

  private buildDust(): {
    points: THREE.Points;
    material: THREE.PointsMaterial;
    base: Float32Array;
    phase: Float32Array;
  } {
    const count = 150;
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 4 + Math.random() * 19;
      const y = -9 + Math.random() * 20;
      const offset = index * 3;
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = y;
      positions[offset + 2] = Math.sin(angle) * radius;
      base.set(positions.subarray(offset, offset + 3), offset);
      phase[index] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: this.glowTexture,
      color: 0x9fe8ff,
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { points: new THREE.Points(geometry, material), material, base, phase };
  }

  public setModel(
    modelId: string,
    model: LoadedModel,
    accent: string,
    engineColor: string,
    scale: number,
  ): void {
    if (this.modelId === modelId && this.model) return;
    this.clearModel();
    this.modelId = modelId;
    const modelGroup = model.scene.clone(true);
    modelGroup.scale.setScalar(scale);
    modelGroup.position.set(0, 0, 0);
    this.model = modelGroup;
    this.root.add(modelGroup);

    const nodes: THREE.Object3D[] = [];
    modelGroup.traverse((object) => {
      if (object.name.startsWith('engine_glow')) nodes.push(object);
    });
    if (nodes.length === 0) {
      for (const side of [-1, 1]) {
        const anchor = new THREE.Object3D();
        anchor.position.set(side * 1.65, 0, 4.1);
        modelGroup.add(anchor);
        nodes.push(anchor);
      }
    }
    for (const node of nodes) {
      const spriteMaterial = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: engineColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.7,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.setScalar(2.8);
      node.add(sprite);
      this.engineSprites.push(sprite);
    }
    this.ringMaterial.color.set(accent);
    this.ringInnerMaterial.color.set(accent);
    this.rimLight.color.set(accent);
  }

  public update(dt: number): void {
    this.time += dt;
    if (this.model) {
      this.model.rotation.y += dt * 0.12;
      this.model.position.y = Math.sin(this.time * 0.55) * 0.12;
    }
    this.ring.rotation.z += dt * 0.06;
    this.ringInner.rotation.z -= dt * 0.12;

    const pulse = 0.88 + Math.sin(this.time * 1.8) * 0.12;
    this.ringMaterial.opacity = 0.2 + pulse * 0.08;
    this.ringInnerMaterial.opacity = 0.1 + pulse * 0.04;
    this.keyLight.intensity = 82 + pulse * 12;
    this.rimLight.intensity = 30 + pulse * 6;
    this.fillLight.intensity = 10 + pulse * 3;

    for (const [index, sprite] of this.engineSprites.entries()) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = 0.55 + Math.sin(this.time * 14 + index) * 0.15;
    }

    this.dust.rotation.y += dt * 0.018;
    const positions = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    for (let index = 0; index < this.dustPhase.length; index += 1) {
      const offset = index * 3;
      array[offset + 1] =
        this.dustBase[offset + 1] + Math.sin(this.time * 0.35 + this.dustPhase[index]) * 0.7;
    }
    positions.needsUpdate = true;
    this.dustMaterial.opacity = 0.42 + pulse * 0.14;
  }

  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  private clearModel(): void {
    for (const sprite of this.engineSprites) {
      (sprite.material as THREE.SpriteMaterial).dispose();
      sprite.removeFromParent();
    }
    this.engineSprites.length = 0;
    this.model?.removeFromParent();
    this.model = null;
    this.modelId = '';
  }

  public dispose(): void {
    this.clearModel();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.ringInner.geometry.dispose();
    this.ringInnerMaterial.dispose();
    this.dust.geometry.dispose();
    this.dustMaterial.dispose();
    const materials = new Set<THREE.Material>();
    this.station.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          for (const entry of material) materials.add(entry);
        } else {
          materials.add(material);
        }
      }
    });
    for (const material of materials) material.dispose();
    this.keyLight.removeFromParent();
    this.keyTarget.removeFromParent();
    this.rimLight.removeFromParent();
    this.fillLight.removeFromParent();
    this.station.removeFromParent();
    this.root.removeFromParent();
  }
}
