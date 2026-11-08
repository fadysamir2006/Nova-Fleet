import * as THREE from 'three';
import { SUN_DIRECTION } from '../assets-config';
import type { Vec3 } from '../game/types';
import { Planet } from './Planet';
import type { QualityLevel } from './QualityManager';
import { SpeedDust } from './SpeedDust';
import { createDeepSpaceCubemap, createGalaxyTexture, createGlowTexture } from './textures';

export class SpaceEnvironment {
  public readonly planet: Planet;
  public readonly dust: SpeedDust;
  private readonly scene: THREE.Scene;
  private readonly skybox: THREE.CubeTexture;
  private readonly environmentTarget: THREE.WebGLRenderTarget;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly galaxyTexture: THREE.CanvasTexture;
  private readonly galaxyMaterial: THREE.MeshBasicMaterial;
  private readonly galaxyGeometry: THREE.PlaneGeometry;
  private readonly galaxyMesh: THREE.Mesh;
  private readonly sunTexture: THREE.CanvasTexture;
  private readonly sunMaterial: THREE.SpriteMaterial;
  private readonly sunSprite: THREE.Sprite;
  private readonly sunDirection = new THREE.Vector3(
    SUN_DIRECTION.x,
    SUN_DIRECTION.y,
    SUN_DIRECTION.z,
  ).normalize();
  private quality: QualityLevel;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, quality: QualityLevel) {
    this.scene = scene;
    this.quality = quality;

    this.skybox = createDeepSpaceCubemap(quality);
    scene.background = this.skybox;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();
    this.environmentTarget = pmrem.fromCubemap(this.skybox);
    scene.environment = this.environmentTarget.texture;
    scene.environmentIntensity = 0.42;
    pmrem.dispose();

    this.sunLight = new THREE.DirectionalLight(0xfff0d0, 3.6);
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(4000);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.castShadow = false;
    scene.add(this.sunLight, this.sunLight.target);

    this.fillLight = new THREE.HemisphereLight(0x2b4c80, 0x020307, 0.65);
    scene.add(this.fillLight);
    this.ambient = new THREE.AmbientLight(0x15213b, 0.24);
    scene.add(this.ambient);

    this.galaxyTexture = createGalaxyTexture();
    this.galaxyMaterial = new THREE.MeshBasicMaterial({
      map: this.galaxyTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.galaxyGeometry = new THREE.PlaneGeometry(18500, 9500);
    this.galaxyMesh = new THREE.Mesh(this.galaxyGeometry, this.galaxyMaterial);
    this.galaxyMesh.position.set(-8200, 3200, -18500);
    this.galaxyMesh.lookAt(0, 0, 0);
    this.galaxyMesh.rotation.z = -0.36;
    this.galaxyMesh.renderOrder = -2;
    scene.add(this.galaxyMesh);

    this.sunTexture = createGlowTexture('#fff4d2', 0.05, 256);
    this.sunMaterial = new THREE.SpriteMaterial({
      map: this.sunTexture,
      color: 0xfff2c8,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      opacity: 0.95,
    });
    this.sunSprite = new THREE.Sprite(this.sunMaterial);
    this.sunSprite.scale.set(1700, 1700, 1);
    this.sunSprite.position.copy(this.sunDirection).multiplyScalar(23000);
    this.sunSprite.renderOrder = -1;
    scene.add(this.sunSprite);

    // Prominent gas giant with rings; clearly lit by the sun.
    this.planet = new Planet(scene, 'gasgiant', { x: -4600, y: 620, z: -11200 });
    this.dust = new SpeedDust(scene, quality);
    this.setQuality(quality);
  }

  public setQuality(quality: QualityLevel): void {
    this.quality = quality;
    this.planet.setQuality(quality);
    this.dust.setQuality(quality);
    this.galaxyMaterial.opacity = quality === 'low' ? 0.55 : quality === 'medium' ? 0.66 : 0.72;
    this.sunLight.intensity = quality === 'low' ? 3.2 : 3.6;
  }

  public update(
    dt: number,
    camera: THREE.Camera,
    playerVelocity: Vec3,
    speedRatio: number,
    boost: number,
  ): void {
    this.planet.update(dt);
    this.dust.update(dt, camera, playerVelocity, speedRatio, boost);
    if (this.quality !== 'low') {
      this.galaxyMesh.lookAt(camera.position);
    }
  }

  public getSunDirection(): THREE.Vector3 {
    return this.sunDirection;
  }

  /** Per-zone visual tint (4C): nebula/debris/normal. Render-only. */
  public setZone(zoneId: string): void {
    const isNebula = zoneId.includes('nebula');
    const isDebris = zoneId.includes('debris') || zoneId.includes('asteroid') || zoneId.includes('belt');
    if (isNebula) {
      this.scene.fog = new THREE.FogExp2(0x120826, 0.000068);
      this.galaxyMaterial.color.setHex(0xc79cff);
      this.ambient.color.setHex(0x4a2f78);
      this.fillLight.color.setHex(0x8aa7ff);
    } else if (isDebris) {
      this.scene.fog = new THREE.FogExp2(0x0b1018, 0.000062);
      this.galaxyMaterial.color.setHex(0xb8c6d8);
      this.ambient.color.setHex(0x4f6275);
      this.fillLight.color.setHex(0x9fb2c8);
    } else {
      this.scene.fog = new THREE.FogExp2(0x02040a, 0.000055);
      this.galaxyMaterial.color.setHex(0xffffff);
      this.ambient.color.setHex(0x627db8);
      this.fillLight.color.setHex(0x7d9bff);
    }
  }

  public dispose(): void {
    this.planet.dispose();
    this.dust.dispose();
    this.scene.background = null;
    this.scene.environment = null;
    this.environmentTarget.dispose();
    this.skybox.dispose();
    this.galaxyGeometry.dispose();
    this.galaxyMaterial.dispose();
    this.galaxyTexture.dispose();
    this.galaxyMesh.removeFromParent();
    this.sunMaterial.dispose();
    this.sunTexture.dispose();
    this.sunSprite.removeFromParent();
    this.sunLight.removeFromParent();
    this.sunLight.target.removeFromParent();
    this.fillLight.removeFromParent();
    this.ambient.removeFromParent();
  }
}
