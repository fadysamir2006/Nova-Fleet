import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { createPlaceholderShip } from './PlaceholderShip';

export interface LoadedModel {
  scene: THREE.Group;
  procedural: boolean;
}

export interface AssetProgress {
  loaded: number;
  total: number;
  fraction: number;
  label: string;
}

/**
 * Loads only local GLB files from /public/models. Draco and KTX2 decoders are
 * served from /public/draco and /public/basis; nothing is fetched from a CDN.
 */
const baseUrl = import.meta.env.BASE_URL;
const assetUrl = (path: string): string =>
  path.startsWith('/') ? `${baseUrl}${path.slice(1)}` : path;

export class ShipLoader {
  private readonly gltfLoader: GLTFLoader;
  private readonly dracoLoader: DRACOLoader;
  private readonly ktx2Loader: KTX2Loader;
  private readonly models = new Map<string, LoadedModel>();
  private readonly ownGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownMaterials = new Set<THREE.Material>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(assetUrl('/draco/'));
    this.ktx2Loader = new KTX2Loader();
    this.ktx2Loader.setTranscoderPath(assetUrl('/basis/'));
    this.ktx2Loader.detectSupport(renderer);
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
  }

  public get(modelId: string): LoadedModel | undefined {
    return this.models.get(modelId);
  }

  /**
   * Loaded fleet models are registered up-front. This guard only exists so a
   * failed/partial load can never leave a ship invisible.
   */
  public ensure(modelId: string, accent: string, scale: number): LoadedModel {
    const existing = this.models.get(modelId);
    if (existing) return existing;
    return this.registerModel(modelId, createPlaceholderShip(accent, scale, modelId), true);
  }

  public async loadShips(
    definitions: readonly { id: string; modelPath: string | null; accent: string; scale: number; placeholder?: boolean }[],
    onProgress?: (progress: AssetProgress) => void,
  ): Promise<void> {
    const total = definitions.length;
    let loaded = 0;
    await Promise.all(
      definitions.map(async (definition) => {
        // Use detailed procedural hulls when flagged (or no modelPath). Keep modelPath config for GLB swap later.
        if (!definition.modelPath || definition.placeholder) {
          this.registerModel(
            definition.id,
            createPlaceholderShip(definition.accent, definition.scale, definition.id),
            true,
          );
        } else {
          try {
            const gltf = await this.gltfLoader.loadAsync(assetUrl(definition.modelPath));
            const scene = gltf.scene as THREE.Group;
            this.registerModel(definition.id, scene, false);
          } catch (error) {
            console.warn(`[Nova Fleet] Could not load ${definition.modelPath}; using procedural fallback.`, error);
            this.registerModel(
              definition.id,
              createPlaceholderShip(definition.accent, definition.scale, definition.id),
              true,
            );
          }
        }
        loaded += 1;
        onProgress?.({
          loaded,
          total,
          fraction: loaded / total,
          label: definition.id,
        });
      }),
    );
  }

  private registerModel(id: string, scene: THREE.Group, procedural: boolean): LoadedModel {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.geometry) this.ownGeometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) this.ownMaterials.add(material);
    });
    const model = { scene, procedural };
    this.models.set(id, model);
    return model;
  }

  public dispose(): void {
    for (const geometry of this.ownGeometries) geometry.dispose();
    for (const material of this.ownMaterials) material.dispose();
    this.ownGeometries.clear();
    this.ownMaterials.clear();
    this.models.clear();
    this.dracoLoader.dispose();
    this.ktx2Loader.dispose();
  }
}
