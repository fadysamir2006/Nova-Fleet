import * as THREE from 'three';
import type { Projectile } from '../game/types';

const UP = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();

export class ProjectilePool {
  private readonly playerGeometry: THREE.CylinderGeometry;
  private readonly enemyGeometry: THREE.CylinderGeometry;
  private readonly playerMaterial: THREE.MeshBasicMaterial;
  private readonly enemyMaterial: THREE.MeshBasicMaterial;
  private readonly meshes: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly byId = new Map<number, THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>>();
  private readonly activeIds = new Set<number>();

  constructor(scene: THREE.Object3D, max = 120) {
    this.playerGeometry = new THREE.CylinderGeometry(0.11, 0.11, 5.4, 5);
    this.enemyGeometry = new THREE.CylinderGeometry(0.24, 0.2, 7.2, 6);
    this.playerMaterial = new THREE.MeshBasicMaterial({
      color: 0x9cefff,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.enemyMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3b33,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < max; i += 1) {
      const mesh = new THREE.Mesh(this.playerGeometry, this.playerMaterial);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.meshes.push(mesh);
      scene.add(mesh);
    }
  }

  public sync(projectiles: readonly Projectile[]): void {
    this.activeIds.clear();
    for (const projectile of projectiles) {
      if (!projectile.active) continue;
      let mesh = this.byId.get(projectile.id);
      if (!mesh) {
        mesh = this.meshes.find((candidate) => !candidate.visible);
        if (!mesh) continue;
        this.byId.set(projectile.id, mesh);
        mesh.visible = true;
      }
      this.activeIds.add(projectile.id);
      const enemy = projectile.team === 'enemy';
      mesh.geometry = enemy ? this.enemyGeometry : this.playerGeometry;
      mesh.material = enemy ? this.enemyMaterial : this.playerMaterial;
      mesh.position.set(projectile.position.x, projectile.position.y, projectile.position.z);
      direction.set(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z).normalize();
      mesh.quaternion.setFromUnitVectors(UP, direction);
      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
      const length = THREE.MathUtils.clamp(speed / 620, 0.9, 1.35);
      const width = enemy ? 1.35 : 1;
      mesh.scale.set(width, length, width);
    }

    for (const [id, mesh] of this.byId) {
      if (this.activeIds.has(id)) continue;
      mesh.visible = false;
      this.byId.delete(id);
    }
  }

  public clear(): void {
    for (const mesh of this.meshes) mesh.visible = false;
    this.byId.clear();
  }

  public dispose(): void {
    this.clear();
    this.playerGeometry.dispose();
    this.enemyGeometry.dispose();
    this.playerMaterial.dispose();
    this.enemyMaterial.dispose();
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
    }
    this.meshes.length = 0;
  }
}
