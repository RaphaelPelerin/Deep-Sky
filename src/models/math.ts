/** Just enough linear algebra for the 3D layer: column-major mat4, quaternions [x, y, z, w] */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = Float32Array;

export const identity = (): Mat4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/** translation · rotation · scale (uniform or per axis) */
export function compose(q: Quat, t: Vec3, s: Vec3): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}

/** upper 3×3 of a mat4, inverted and transposed: transforms normals */
export function normalMatrix(m: Mat4): Float32Array {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  const k = 1 / det;
  return new Float32Array([
    A * k, B * k, C * k,
    -(b * i - c * h) * k, (a * i - c * g) * k, -(a * h - b * g) * k,
    (b * f - c * e) * k, -(a * f - c * d) * k, (a * e - b * d) * k,
  ]);
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** rotation of `angle` radians around a unit axis */
export function quatAxis(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Euler angles in radians, applied X then Y then Z */
export function quatEuler(x: number, y: number, z: number): Quat {
  return quatMultiply(quatAxis([0, 0, 1], z), quatMultiply(quatAxis([0, 1, 0], y), quatAxis([1, 0, 0], x)));
}

/** turns `q` by the angular velocity `w` (rad/s, world axes) for `dt` seconds */
export function quatIntegrate(q: Quat, w: Vec3, dt: number): Quat {
  const speed = Math.hypot(w[0], w[1], w[2]);
  if (speed < 1e-6) return q;
  const axis: Vec3 = [w[0] / speed, w[1] / speed, w[2] / speed];
  return quatNormalize(quatMultiply(quatAxis(axis, speed * dt), q));
}
