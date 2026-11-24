// A tiny dependency-free 3D toolkit: vectors, matrices, meshes and shader helpers.
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
export const rad = deg => deg * Math.PI / 180;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, 0]; };
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const dist = (a, b) => len(sub(a, b));
// Rotates v around a unit axis (Rodrigues).
export const rotate = (v, axis, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
};

// Column-major 4x4 matrices, as WebGL expects.
export const m4 = {
  identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  lookAt(eye, target, up = [0, 1, 0]) {
    const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  },
  fromBasis: (o, x, y, z) => new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1])
};

const build = (pos, idx) => ({ pos: new Float32Array(pos), idx: new Uint32Array(idx) });

// Unit sphere (also used for ellipsoids through a scaled basis).
export function sphereMesh(lat = 16, lon = 24) {
  const v = [], i = [];
  for (let a = 0; a <= lat; a++) {
    const th = a / lat * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let b = 0; b <= lon; b++) {
      const ph = b / lon * Math.PI * 2, x = st * Math.cos(ph), z = st * Math.sin(ph);
      v.push(x, ct, z, x, ct, z);
    }
  }
  for (let a = 0; a < lat; a++) for (let b = 0; b < lon; b++) {
    const p = a * (lon + 1) + b, q = p + lon + 1;
    i.push(p, p + 1, q, p + 1, q + 1, q);
  }
  return build(v, i);
}

// Capped cylinder along +y, y in 0..1, radius 1. A taper uniform narrows the far end.
export function cylinderMesh(seg = 18) {
  const v = [], i = [];
  for (let b = 0; b <= seg; b++) {
    const ph = b / seg * Math.PI * 2, x = Math.cos(ph), z = Math.sin(ph);
    v.push(x, 0, z, x, 0, z, x, 1, z, x, 0, z);
  }
  for (let b = 0; b < seg; b++) { const p = b * 2; i.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
  for (const y of [0, 1]) {
    const c = v.length / 6;
    v.push(0, y, 0, 0, y * 2 - 1, 0);
    for (let b = 0; b <= seg; b++) { const ph = b / seg * Math.PI * 2; v.push(Math.cos(ph), y, Math.sin(ph), 0, y * 2 - 1, 0); }
    for (let b = 0; b < seg; b++) i.push(c, c + 1 + b, c + 2 + b);
  }
  return build(v, i);
}

// Superquadric box with softly rounded edges, extents -1..1 (pads, bat blade, helmets).
export function roundBoxMesh(e = 0.3, lat = 14, lon = 24) {
  const sp = (x, p) => Math.sign(x) * Math.abs(x) ** p, v = [], i = [];
  for (let a = 0; a <= lat; a++) {
    const u = -Math.PI / 2 + a / lat * Math.PI, cu = Math.cos(u), su = Math.sin(u);
    for (let b = 0; b <= lon; b++) {
      const w = -Math.PI + b / lon * Math.PI * 2, cw = Math.cos(w), sw = Math.sin(w);
      v.push(sp(cu, e) * sp(cw, e), sp(su, e), sp(cu, e) * sp(sw, e), sp(cu, 2 - e) * sp(cw, 2 - e), sp(su, 2 - e), sp(cu, 2 - e) * sp(sw, 2 - e));
    }
  }
  for (let a = 0; a < lat; a++) for (let b = 0; b < lon; b++) {
    const p = a * (lon + 1) + b, q = p + lon + 1;
    i.push(p, q, p + 1, p + 1, q, q + 1);
  }
  return build(v, i);
}

// Surface of revolution around the pitch centre; angle 0 points down the pitch (-z).
export function revolveMesh(profile, centreZ, seg = 192) {
  const v = [], i = [], n = profile.length;
  for (let k = 0; k < n; k++) {
    const [r, h] = profile[k], [r0, h0] = profile[Math.max(0, k - 1)], [r1, h1] = profile[Math.min(n - 1, k + 1)];
    const tr = r1 - r0, th = h1 - h0, tl = Math.hypot(tr, th) || 1, nr = -th / tl, nh = tr / tl;
    for (let b = 0; b <= seg; b++) {
      const a = b / seg * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      v.push(r * s, h, centreZ - r * c, nr * s, nh, -nr * c);
    }
  }
  for (let k = 0; k < n - 1; k++) for (let b = 0; b < seg; b++) {
    const p = k * (seg + 1) + b, q = p + seg + 1;
    i.push(p, q, p + 1, p + 1, q, q + 1);
  }
  return build(v, i);
}

// Thin tube around a circle on the ground (the boundary rope).
export function torusMesh(R, r, centreZ, segR = 256, segr = 6) {
  const v = [], i = [];
  for (let a = 0; a <= segR; a++) {
    const t = a / segR * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
    for (let b = 0; b <= segr; b++) {
      const p = b / segr * Math.PI * 2, cp = Math.cos(p), sp = Math.sin(p);
      v.push((R + r * cp) * s, r + r * sp, centreZ - (R + r * cp) * c, cp * s, sp, -cp * c);
    }
  }
  for (let a = 0; a < segR; a++) for (let b = 0; b < segr; b++) {
    const p = a * (segr + 1) + b, q = p + segr + 1;
    i.push(p, q, p + 1, p + 1, q, q + 1);
  }
  return build(v, i);
}

export const quadMesh = (half = 1) => build([-half, 0, 0, half, 0, 0, 0, half, 0, 0, -half, 0], [0, 1, 2, 0, 2, 3]);
export const groundMesh = size => build([-size, 0, -size, 0, 1, 0, size, 0, -size, 0, 1, 0, size, 0, size, 0, 1, 0, -size, 0, size, 0, 1, 0], [0, 2, 1, 0, 3, 2]);

export function upload(gl, mesh, stride = 6) {
  const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * 4, 0);
  if (stride > 3) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * 4, 12); }
  gl.bindVertexArray(null);
  return { vao, count: mesh.idx.length };
}

export function compile(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(program)}`);
  const locations = new Map();
  const where = name => { if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name)); return locations.get(name); };
  // Numbers become floats, 2-4 element arrays become vectors; everything is a float uniform.
  const set = values => {
    for (const [name, v] of Object.entries(values)) {
      const loc = where(name);
      if (loc === null) continue;
      if (typeof v === "number") gl.uniform1f(loc, v);
      else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
      else gl.uniform3fv(loc, v);
    }
  };
  return { program, set, use: () => gl.useProgram(program) };
}

// Instanced primitives. Every part is a transformed unit mesh plus colour, so a whole
// cricketer is just a few dozen instances and costs a few kilobytes per frame.
const STRIDE = 24;
export function createBatch(gl, kinds) {
  const parts = {};
  for (const [name, mesh] of Object.entries(kinds)) {
    const base = upload(gl, mesh), buf = gl.createBuffer();
    gl.bindVertexArray(base.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let k = 0; k < 6; k++) {
      gl.enableVertexAttribArray(2 + k);
      gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
      gl.vertexAttribDivisor(2 + k, 1);
    }
    gl.bindVertexArray(null);
    parts[name] = { vao: base.vao, count: base.count, buf, data: new Float32Array(STRIDE * 64), n: 0 };
  }
  const api = {
    reset() { for (const p of Object.values(parts)) p.n = 0; return api; },
    // Matrix columns, then rgb + gloss, then taper, emissive.
    add(kind, m, color, gloss = 0.3, taper = 1, emis = 0) {
      const p = parts[kind], at = p.n * STRIDE;
      if (at + STRIDE > p.data.length) { const bigger = new Float32Array(p.data.length * 2); bigger.set(p.data); p.data = bigger; }
      p.data.set(m, at); p.data.set(color, at + 16);
      p.data[at + 19] = gloss; p.data[at + 20] = taper; p.data[at + 21] = emis;
      p.n++; return api;
    },
    blob(kind, c, x, y, z, color, gloss, emis) { return api.add(kind, m4.fromBasis(c, x, y, z), color, gloss, 1, emis); },
    ball(c, r, color, gloss, emis) { return api.blob("sphere", c, [r, 0, 0], [0, r, 0], [0, 0, r], color, gloss, emis); },
    // A tapered limb from a to b; radius ra at a and rb at b.
    tube(a, b, ra, rb, color, gloss = 0.2, emis = 0) {
      const d = sub(b, a), l = len(d);
      if (l < 1e-6) return api;
      const ref = Math.abs(d[1]) < 0.9 * l ? [0, 1, 0] : [1, 0, 0];
      const x = mul(norm(cross(ref, d)), ra), z = mul(norm(cross(d, x)), ra);
      return api.add("cyl", m4.fromBasis(a, x, d, z), color, gloss, rb / ra, emis);
    },
    flush() {
      for (const p of Object.values(parts)) {
        if (!p.n) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, p.buf);
        gl.bufferData(gl.ARRAY_BUFFER, p.data.subarray(0, p.n * STRIDE), gl.DYNAMIC_DRAW);
      }
      return api;
    },
    draw() {
      for (const p of Object.values(parts)) {
        if (!p.n) continue;
        gl.bindVertexArray(p.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0, p.n);
      }
      gl.bindVertexArray(null);
    },
    get count() { return Object.values(parts).reduce((n, p) => n + p.n, 0); }
  };
  return api;
}

// Camera-facing glow sprites: centre xyz + size, then rgba.
export function createSprites(gl, max = 512) {
  const vao = gl.createVertexArray(), quad = gl.createBuffer(), inst = gl.createBuffer(), data = new Float32Array(max * 8);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  let n = 0;
  const api = {
    reset() { n = 0; return api; },
    add(c, size, r, g, b, a = 1) { if (n < max) { data.set([c[0], c[1], c[2], size, r, g, b, a], n * 8); n++; } return api; },
    draw() {
      if (!n) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * 8));
      gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); gl.bindVertexArray(null);
    },
    get count() { return n; }
  };
  return api;
}
