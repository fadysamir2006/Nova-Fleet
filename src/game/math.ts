/**
 * Small, dependency-free math layer for the simulation.
 * The game layer must never import three.js so it can move to a server later.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const vec3Clone = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export const vec3Add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export const vec3Sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const vec3Scale = (v: Vec3, s: number): Vec3 => ({
  x: v.x * s,
  y: v.y * s,
  z: v.z * s,
});

export const vec3AddScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});

export const vec3Dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const vec3Cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const vec3LengthSq = (v: Vec3): number => v.x * v.x + v.y * v.y + v.z * v.z;

export const vec3Length = (v: Vec3): number => Math.sqrt(vec3LengthSq(v));

export const vec3DistanceSq = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

export const vec3Distance = (a: Vec3, b: Vec3): number => Math.sqrt(vec3DistanceSq(a, b));

export const vec3Normalize = (v: Vec3): Vec3 => {
  const length = vec3Length(v);
  if (length < 1e-6) return vec3(0, 0, -1);
  return vec3Scale(v, 1 / length);
};

export const vec3Lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Framerate-independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

export const qFromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const half = angle * 0.5;
  const sin = Math.sin(half);
  return { x: axis.x * sin, y: axis.y * sin, z: axis.z * sin, w: Math.cos(half) };
};

export const qMultiply = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

export const qNormalize = (q: Quat): Quat => {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (length < 1e-6) return qIdentity();
  const inv = 1 / length;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
};

export const qConjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  // Efficient q * v * q^-1.
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
};

export const WORLD_UP = vec3(0, 1, 0);
export const LOCAL_FORWARD = vec3(0, 0, -1);
export const LOCAL_RIGHT = vec3(1, 0, 0);

export const forwardOf = (q: Quat): Vec3 => qRotate(q, LOCAL_FORWARD);
export const rightOf = (q: Quat): Vec3 => qRotate(q, LOCAL_RIGHT);
export const upOf = (q: Quat): Vec3 => qRotate(q, WORLD_UP);

export const angleToDirection = (from: Vec3, to: Vec3): number => {
  const a = vec3Normalize(from);
  const b = vec3Normalize(to);
  return Math.acos(clamp(vec3Dot(a, b), -1, 1));
};

export const directionToQuat = (direction: Vec3, up: Vec3 = WORLD_UP): Quat => {
  // Builds an orientation that points local -Z along `direction`, so the
  // basis Z axis is the negation of the requested forward direction.
  const zAxis = vec3Normalize(vec3Scale(direction, -1));
  let right = vec3Normalize(vec3Cross(up, zAxis));
  if (vec3LengthSq(right) < 1e-5) right = vec3(1, 0, 0);
  const correctedUp = vec3Cross(zAxis, right);
  const m00 = right.x;
  const m01 = correctedUp.x;
  const m02 = zAxis.x;
  const m10 = right.y;
  const m11 = correctedUp.y;
  const m12 = zAxis.y;
  const m20 = right.z;
  const m21 = correctedUp.z;
  const m22 = zAxis.z;
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return qNormalize({
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
      w: 0.25 * s,
    });
  }

  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return qNormalize({
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
      w: (m21 - m12) / s,
    });
  }

  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return qNormalize({
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
      w: (m02 - m20) / s,
    });
  }

  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return qNormalize({
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
    w: (m10 - m01) / s,
  });
};

/** Returns true if segment AB intersects (or starts inside) a sphere. */
export const segmentSphereHit = (a: Vec3, b: Vec3, center: Vec3, radius: number): boolean => {
  const ab = vec3Sub(b, a);
  const ac = vec3Sub(center, a);
  const abLengthSq = vec3LengthSq(ab);
  if (abLengthSq < 1e-8) return vec3DistanceSq(a, center) <= radius * radius;
  const t = clamp(vec3Dot(ac, ab) / abLengthSq, 0, 1);
  const closest = vec3AddScaled(a, ab, t);
  return vec3DistanceSq(closest, center) <= radius * radius;
};

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG so world generation can be reproduced. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length)] ?? values[0];
  }

  unitVector(): Vec3 {
    const z = this.range(-1, 1);
    const angle = this.range(0, Math.PI * 2);
    const radius = Math.sqrt(1 - z * z);
    return { x: Math.cos(angle) * radius, y: z, z: Math.sin(angle) * radius };
  }
}
