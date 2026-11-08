import * as THREE from 'three';
import { SUN_DIRECTION } from '../assets-config';
import type { QualityLevel } from './QualityManager';
import type { PlanetType } from '../game/types';

const planetVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vLocalDirection;
  varying vec3 vWorldPosition;

  void main() {
    vLocalDirection = normalize(position);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const planetFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uDetail;
  uniform int uType;
  varying vec3 vWorldNormal;
  varying vec3 vLocalDirection;
  varying vec3 vWorldPosition;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uDetail) break;
      value += noise(p) * amplitude;
      p = p * 2.03 + vec3(8.1, 3.7, 11.3);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vLocalDirection);
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    float n1 = fbm(dir * 2.15 + vec3(0.35, 0.0, 0.2));
    float n2 = fbm(dir * 7.4 - vec3(1.4));
    float cracks = fbm(dir * 12.0);

    vec3 color = vec3(0.12, 0.16, 0.24);
    if (uType == 1) {
      float lava = smoothstep(0.4, 0.72, n1 + cracks * 0.25);
      vec3 rock = vec3(0.26, 0.12, 0.08);
      vec3 lavaCol = vec3(1.0, 0.36, 0.12);
      color = mix(rock, lavaCol, lava);
      color += vec3(1.0, 0.24, 0.08) * smoothstep(0.6, 0.9, cracks) * 0.6;
    } else if (uType == 2) {
      float bands = sin(dir.y * 14.0 + n1 * 6.0) * 0.5 + 0.5;
      vec3 bandA = vec3(0.68, 0.52, 0.34);
      vec3 bandB = vec3(0.93, 0.78, 0.54);
      vec3 bandC = vec3(0.78, 0.62, 0.42);
      color = mix(bandA, bandB, bands);
      color = mix(color, bandC, smoothstep(0.35, 0.75, n2));
      // Great storm spot (Kratos-like)
      vec2 stormCenter = vec2(0.38, -0.12);
      vec2 p = vec2(dir.x + dir.z * 0.35, dir.y);
      float storm = smoothstep(0.42, 0.08, length(p - stormCenter));
      float swirl = fbm(vec3(dir.xz * 6.0 + uTime * 0.01, dir.y * 3.0));
      color = mix(color, vec3(0.96, 0.62, 0.38), storm * (0.45 + swirl * 0.35));
      color = mix(color, vec3(0.98, 0.86, 0.72), storm * smoothstep(0.55, 0.8, swirl) * 0.35);
    } else if (uType == 3) {
      float ice = smoothstep(0.38, 0.68, n1);
      vec3 iceCol = mix(vec3(0.7, 0.86, 0.98), vec3(0.88, 0.96, 1.0), n2);
      color = mix(vec3(0.52, 0.64, 0.78), iceCol, ice);
      color += vec3(0.9, 0.98, 1.0) * smoothstep(0.6, 0.8, cracks) * 0.25;
    } else if (uType == 4) {
      // Metallic/crystal world (Thrix-like): faceted sheen + emissive crystal veins.
      float metal = smoothstep(0.28, 0.72, n2);
      float facets = step(0.55, fract(cracks * 6.0 + n1 * 2.0));
      vec3 baseA = vec3(0.34, 0.38, 0.46);
      vec3 baseB = vec3(0.62, 0.66, 0.74);
      vec3 crystal = vec3(0.45, 0.92, 1.0);
      color = mix(baseA, baseB, metal);
      color = mix(color, baseB * 1.08, facets * 0.35);
      float veins = smoothstep(0.62, 0.86, fbm(dir * 10.0 + vec3(2.0)));
      color += crystal * veins * 0.38;
    } else {
      float continents = smoothstep(0.47, 0.58, n1 + n2 * 0.13);
      float polar = smoothstep(0.7, 0.92, abs(dir.y));
      vec3 ocean = mix(vec3(0.004, 0.025, 0.065), vec3(0.012, 0.15, 0.20), fbm(dir * 9.0));
      vec3 ground = mix(vec3(0.16, 0.09, 0.055), vec3(0.53, 0.33, 0.16), n2);
      ground = mix(ground, vec3(0.45, 0.43, 0.38), smoothstep(0.32, 0.7, fbm(dir * 4.7 + 11.0)) * 0.4);
      color = mix(ocean, ground, continents);
      color = mix(color, vec3(0.72, 0.87, 0.98), polar * 0.82);
      float cityNoise = smoothstep(0.6, 0.74, fbm(dir * 25.0 + vec3(4.0)));
      float sunDot2 = dot(normal, uSunDirection);
      float night = smoothstep(0.22, -0.28, sunDot2);
      color += vec3(1.0, 0.46, 0.14) * cityNoise * night * 0.42 * continents;
    }

    float sunDot = dot(normal, uSunDirection);
    float diffuse = max(sunDot, 0.0);
    // Ensure clearly lit spheres (avoid black blobs) while keeping terminator contrast.
    color *= 0.08 + diffuse * 1.35;

    float specular = pow(max(dot(reflect(-uSunDirection, normal), viewDir), 0.0), 52.0);
    if (uType == 1) color += vec3(1.0, 0.4, 0.16) * specular * 0.6;
    else if (uType == 3) color += vec3(0.8, 0.92, 1.0) * specular * 0.7;
    else if (uType == 4) color += vec3(0.7, 0.95, 1.0) * specular * 0.85;
    else color += vec3(0.6, 0.78, 0.92) * specular * 0.4;

    float clouds = smoothstep(0.58, 0.72, fbm(dir * 5.2 + vec3(uTime * 0.003, 0.0, 0.0)));
    if (uType == 0) color = mix(color, vec3(0.72, 0.87, 1.0), clouds * 0.28 * diffuse);

    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6) * smoothstep(-0.22, 0.62, sunDot);
    if (uType == 1) color += vec3(1.0, 0.28, 0.1) * rim * 0.9;
    else if (uType == 3) color += vec3(0.8, 0.95, 1.0) * rim * 0.9;
    else if (uType == 2) color += vec3(0.98, 0.82, 0.56) * rim * 0.8;
    else color += vec3(0.12, 0.4, 0.95) * rim * 0.8;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uSunDirection;
  uniform vec3 uColor;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(normal, viewDir)), 3.2);
    float sun = smoothstep(-0.4, 0.78, dot(normal, uSunDirection));
    float alpha = rim * sun * 0.78;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export class Planet {
  public readonly group = new THREE.Group();
  private readonly surface: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly rings: THREE.Mesh | null = null;
  private readonly moon: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null = null;
  private readonly moonPivot = new THREE.Group();
  private readonly sunDirection = new THREE.Vector3(
    SUN_DIRECTION.x,
    SUN_DIRECTION.y,
    SUN_DIRECTION.z,
  ).normalize();
  private time = 0;
  private readonly radius: number;
  private readonly planetType: PlanetType;

  constructor(scene: THREE.Scene, type: PlanetType = 'terran', position?: { x: number; y: number; z: number }) {
    this.planetType = type;
    this.radius = type === 'gasgiant' ? 3200 : 2380;
    this.group.position.set(position?.x ?? -4100, position?.y ?? 850, position?.z ?? -10500);
    this.group.rotation.z = type === 'gasgiant' ? 0.12 : -0.18;

    let typeIndex = 0;
    if (type === 'volcanic') typeIndex = 1;
    else if (type === 'gasgiant') typeIndex = 2;
    else if (type === 'ice') typeIndex = 3;
    else if (type === 'barren') typeIndex = 4;

    const surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: planetFragment,
      uniforms: {
        uSunDirection: { value: this.sunDirection },
        uTime: { value: 0 },
        uDetail: { value: 5 },
        uType: { value: typeIndex },
      },
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 96, 64), surfaceMaterial);
    this.surface.rotation.y = 1.8;
    this.surface.frustumCulled = true;
    this.group.add(this.surface);

    let atmColor = new THREE.Color('#5eb8ff');
    if (type === 'volcanic') atmColor = new THREE.Color('#ff5a1e');
    else if (type === 'gasgiant') atmColor = new THREE.Color('#d9b57e');
    else if (type === 'ice') atmColor = new THREE.Color('#9dffff');
    else if (type === 'barren') atmColor = new THREE.Color('#b9b5a8');

    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        uSunDirection: { value: this.sunDirection },
        uColor: { value: atmColor },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * (type === 'gasgiant' ? 1.08 : 1.035), 72, 48),
      atmosphereMaterial,
    );
    this.atmosphere.renderOrder = 2;
    this.group.add(this.atmosphere);

    // Rings on gas giant (as required).
    if (type === 'gasgiant') {
      const ringGeo = new THREE.RingGeometry(this.radius * 1.55, this.radius * 2.15, 96, 1);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#e7c89a'),
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.rings = new THREE.Mesh(ringGeo, ringMat);
      this.rings.rotation.x = Math.PI / 2.2;
      this.rings.rotation.y = 0.3;
      this.group.add(this.rings);
    }

    // Moon on ice world (another planet) — cheap geometry, quality-scaled in setQuality.
    if (type === 'ice') {
      this.group.add(this.moonPivot);
      const moonGeo = new THREE.SphereGeometry(this.radius * 0.18, 24, 16);
      const moonMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#cfd8e6'),
        roughness: 0.95,
        metalness: 0.02,
        emissive: new THREE.Color('#223344'),
        emissiveIntensity: 0.15,
      });
      this.moon = new THREE.Mesh(moonGeo, moonMat);
      this.moon.position.set(this.radius * 2.6, this.radius * 0.35, 0);
      this.moon.frustumCulled = true;
      this.moonPivot.add(this.moon);
      this.moonPivot.rotation.x = 0.18;
    }

    scene.add(this.group);
  }

  public setQuality(level: QualityLevel): void {
    this.surface.material.uniforms.uDetail.value = level === 'low' ? 3 : level === 'medium' ? 4 : 5;
    const segments = level === 'low' ? 40 : level === 'medium' ? 64 : 96;
    if (this.surface.geometry.parameters.widthSegments !== segments) {
      this.surface.geometry.dispose();
      this.surface.geometry = new THREE.SphereGeometry(this.radius, segments, Math.max(20, Math.floor(segments * 0.66)));
      this.atmosphere.geometry.dispose();
      this.atmosphere.geometry = new THREE.SphereGeometry(
        this.radius * (this.planetType === 'gasgiant' ? 1.08 : 1.035),
        Math.max(32, Math.floor(segments * 0.75)),
        Math.max(20, Math.floor(segments * 0.5)),
      );
    }
    if (this.moon) {
      this.moon.visible = level !== 'low';
      const mseg = level === 'medium' ? 16 : 24;
      if (this.moon.visible && this.moon.geometry.parameters.widthSegments !== mseg) {
        this.moon.geometry.dispose();
        this.moon.geometry = new THREE.SphereGeometry(this.radius * 0.18, mseg, Math.max(10, Math.floor(mseg * 0.66)));
      }
    }
    if (this.rings) {
      (this.rings.material as THREE.MeshBasicMaterial).opacity = level === 'low' ? 0.22 : 0.3;
    }
  }

  public update(dt: number): void {
    this.time += dt;
    this.surface.rotation.y += dt * 0.0035;
    this.surface.material.uniforms.uTime.value = this.time;
    if (this.rings) this.rings.rotation.z += dt * 0.0008;
    if (this.moon) this.moonPivot.rotation.y += dt * 0.012;
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    this.atmosphere.geometry.dispose();
    this.atmosphere.material.dispose();
    if (this.rings) {
      this.rings.geometry.dispose();
      (this.rings.material as THREE.Material).dispose();
    }
    if (this.moon) {
      this.moon.geometry.dispose();
      this.moon.material.dispose();
    }
    this.group.removeFromParent();
  }
}
