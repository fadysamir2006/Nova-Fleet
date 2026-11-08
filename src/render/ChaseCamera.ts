import * as THREE from 'three';
import { PLAYER_TUNING } from '../game/config';
import type { ShipEntity } from '../game/types';

const offset = new THREE.Vector3();
const target = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const lookMatrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();

export class ChaseCamera {
  public readonly camera: THREE.PerspectiveCamera;
  private shake = 0;
  private time = 0;
  private readonly baseFov: number;

  constructor(aspect: number) {
    this.baseFov = window.matchMedia('(pointer: coarse)').matches ? 68 : 62;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.08, 65000);
    this.camera.position.set(0, 6, 18);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  public addShake(amount: number): void {
    this.shake = Math.min(1.4, this.shake + amount * PLAYER_TUNING.cameraShake);
  }

  public snapTo(ship: ShipEntity): void {
    this.camera.quaternion.set(
      ship.quaternion.x,
      ship.quaternion.y,
      ship.quaternion.z,
      ship.quaternion.w,
    );
    forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const radius = Math.max(ship.radius, 4);
    desiredPosition
      .set(ship.position.x, ship.position.y, ship.position.z)
      .addScaledVector(forward, -radius * 2.6 - 7.5)
      .addScaledVector(up, radius * 0.45 + 1.8);
    this.camera.position.copy(desiredPosition);
    this.lookAtShip(ship, 0);
  }

  public update(dt: number, ship: ShipEntity, speedRatio: number, boosting: boolean): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);

    const radius = Math.max(ship.radius, 4);
    const distance = radius * 2.6 + 8.2;
    const height = radius * 0.48 + 2.3;
    offset.set(0, height, distance);
    offset.applyQuaternion(
      quaternion.set(ship.quaternion.x, ship.quaternion.y, ship.quaternion.z, ship.quaternion.w),
    );
    desiredPosition.set(ship.position.x, ship.position.y, ship.position.z).add(offset);

    const positionLambda = this.shake > 0.2 ? 9 : 5.4;
    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      desiredPosition.x,
      positionLambda,
      dt,
    );
    this.camera.position.y = THREE.MathUtils.damp(
      this.camera.position.y,
      desiredPosition.y,
      positionLambda,
      dt,
    );
    this.camera.position.z = THREE.MathUtils.damp(
      this.camera.position.z,
      desiredPosition.z,
      positionLambda,
      dt,
    );

    if (this.shake > 0.001) {
      const strength = this.shake * this.shake;
      this.camera.position.x += Math.sin(this.time * 88) * strength * 0.32;
      this.camera.position.y += Math.cos(this.time * 79) * strength * 0.26;
      this.camera.position.z += Math.sin(this.time * 61.3) * strength * 0.18;
    }

    this.lookAtShip(ship, dt);
    this.camera.rotateZ(ship.bank * 0.28);

    const targetFov =
      this.baseFov +
      Math.min(speedRatio, 2.3) * 2.1 +
      (boosting ? PLAYER_TUNING.boostFov : 0) +
      Math.min(this.shake * 2.4, 2.2);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 3.5, dt);
    this.camera.updateProjectionMatrix();
  }

  private lookAtShip(ship: ShipEntity, dt: number): void {
    forward
      .set(0, 0, -1)
      .applyQuaternion(
        quaternion.set(ship.quaternion.x, ship.quaternion.y, ship.quaternion.z, ship.quaternion.w),
      );
    up.set(0, 1, 0).applyQuaternion(quaternion);
    target
      .set(ship.position.x, ship.position.y, ship.position.z)
      .addScaledVector(forward, 14)
      .addScaledVector(up, 0.7);
    this.camera.up.set(0, 1, 0);
    lookMatrix.lookAt(this.camera.position, target, this.camera.up);
    quaternion.setFromRotationMatrix(lookMatrix);
    if (dt <= 0) {
      this.camera.quaternion.copy(quaternion);
    } else {
      this.camera.quaternion.slerp(quaternion, 1 - Math.exp(-7 * dt));
    }
  }
}
