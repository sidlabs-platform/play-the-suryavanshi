// Cricketers made of a few dozen ellipsoids, tubes and boxes, posed with two-bone IK. Pure geometry: no DOM, no WebGL.
// The batter is authored as a right-hander (off side = +x) and drawn mirrored, which makes him left-handed.
import { add, sub, mul, dot, cross, norm, len, clamp, lerp, smooth, rad } from "./gl.js";
import { SWING_MS, bowlerState } from "./flight.js";

const UP = [0, 1, 0], D = rad;
const fwd = yaw => [Math.sin(yaw), 0, -Math.cos(yaw)];
const rgt = yaw => [Math.cos(yaw), 0, Math.sin(yaw)];
const yawOf = v => Math.atan2(v[0], -v[2]);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const easeOut = t => 1 - (1 - clamp(t)) ** 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const lin = hex => [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);

const SKIN = lin("#b9825a"), WOOD = lin("#d9ad6c"), WHITE = lin("#f1efe6");
export const KITS = {
  batter: { shirt: lin("#2a5bd7"), trim: lin("#f4cb60"), trousers: WHITE, skin: SKIN, hair: lin("#16120f"), shoes: WHITE, pad: lin("#e8e4d4"), glove: WHITE, helmet: lin("#0f2a6b") },
  fielder: { shirt: lin("#c4283a"), trousers: lin("#101b3a"), skin: SKIN, hair: lin("#16120f"), shoes: lin("#1c1c20"), cap: lin("#a31d2e") },
  Kite: { shirt: lin("#3fb7ae"), trousers: lin("#101b3a"), skin: SKIN, hair: lin("#16120f"), shoes: WHITE, cap: lin("#1f7c76") },
  Comet: { shirt: lin("#f0714f"), trousers: lin("#101b3a"), skin: SKIN, hair: lin("#16120f"), shoes: WHITE, cap: lin("#b9482a") },
  Orbit: { shirt: lin("#b998ee"), trousers: lin("#101b3a"), skin: SKIN, hair: lin("#16120f"), shoes: WHITE, cap: lin("#6f4fb2") },
  umpire: { shirt: WHITE, trousers: lin("#1d2230"), skin: SKIN, hair: lin("#2a2623"), shoes: lin("#15151a"), cap: WHITE },
  bat: { wood: WOOD, grip: lin("#16161a"), edge: lin("#b98b4d") }
};

// Two-bone IK: the bent joint (elbow or knee) bulges towards `pole`; the end is clamped to what the limb can reach.
export function ik2(root, target, l1, l2, pole) {
  const d = sub(target, root), dl = len(d), dir = dl > 1e-6 ? mul(d, 1 / dl) : [0, -1, 0];
  const reach = clamp(dl, Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.003);
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let side = sub(pole, mul(dir, dot(pole, dir)));
  if (len(side) < 1e-4) side = cross(dir, [1, 0, 0]);
  return { joint: add(add(root, mul(dir, a)), mul(norm(side), h)), end: add(root, mul(dir, reach)) };
}

const BODY = { ua: 0.29, fa: 0.25, th: 0.43, sh: 0.42, torso: 0.52, hip: 0.095, shoulder: 0.19, ankle: 0.09 };

// Builds a skeleton. `o`: s (scale), pelvis, yawP, yawC, lean, roll, feet [left, right] (sole positions),
// hands [left, right] targets (or null to hang), look (a point the head turns to).
export function rig(o) {
  const s = o.s ?? 1, B = k => BODY[k] * s;
  const fp = fwd(o.yawP), rp = rgt(o.yawP), fc = fwd(o.yawC), rc = rgt(o.yawC), lean = o.lean ?? 0, roll = o.roll ?? 0;
  const u0 = norm(add(add(mul(UP, Math.cos(lean)), mul(fc, Math.sin(lean))), mul(rc, Math.sin(roll))));
  const legReach = B("th") + B("sh") - 0.01, ank = o.feet.map(f => add(f, [0, B("ankle"), 0]));
  const hips = p => [sub(p, mul(rp, B("hip"))), add(p, mul(rp, B("hip")))];
  const keep = p => { // the pelvis can never pull a planted foot off the ground
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < 2; k++) {
      const d = sub(hips(p)[k], ank[k]), l = len(d);
      if (l > legReach) p = sub(p, mul(d, (l - legReach) / l));
    }
    return p;
  };
  const upper = (p, extra) => {
    const u = norm(add(mul(u0, B("torso")), extra)), N = add(p, mul(u, B("torso"))), base = sub(N, mul(u, 0.03 * s));
    return { u, N, sh: [sub(base, mul(rc, B("shoulder"))), add(base, mul(rc, B("shoulder")))] };
  };
  let P = keep(o.pelvis), X = [0, 0, 0], T = upper(P, X);
  if (o.hands) { // reach assist: step the body towards hands that are too far, then lean the chest the rest of the way
    const R = 0.95 * (B("ua") + B("fa"));
    const excess = () => {
      let e = [0, 0, 0], n = 0;
      o.hands.forEach((h, k) => { if (!h) return; const d = sub(h, T.sh[k]), l = len(d); if (l > R) { e = add(e, mul(d, (l - R) / l)); n++; } });
      return n ? mul(e, 1 / n) : null;
    };
    for (let it = 0; it < 4; it++) { const e = excess(); if (!e) break; P = keep(add(P, mul(e, 0.85))); T = upper(P, X); }
    const e = excess();
    if (e) { X = mul(e, Math.min(1, 0.2 / Math.max(len(e), 1e-4))); T = upper(P, X); }
  }
  const hip = hips(P);
  const knee = [0, 1].map(k => ik2(hip[k], ank[k], B("th"), B("sh"), norm(add(fp, mul(rp, k ? 0.3 : -0.3)))).joint);
  const arms = [0, 1].map(k => ik2(T.sh[k], o.hands?.[k] ?? add(T.sh[k], [0, -0.82 * (B("ua") + B("fa")), 0]), B("ua"), B("fa"),
    norm(add(add(mul(rc, k ? 0.8 : -0.8), [0, -1, 0]), mul(fc, -0.25)))));
  const neck = add(T.N, mul(T.u, 0.05 * s)), head = add(neck, add(mul(T.u, 0.14 * s), mul(fc, 0.02 * s)));
  let hf = fc;
  if (o.look) {
    const want = norm(sub(o.look, head)), yaw = o.yawC + clamp(wrap(yawOf(want) - o.yawC), -1.25, 1.25), pitch = clamp(Math.asin(clamp(want[1], -1, 1)), -0.9, 0.9);
    hf = norm(add(mul(fwd(yaw), Math.cos(pitch)), mul(UP, Math.sin(pitch))));
  }
  const hr = norm(cross(hf, T.u)), hu = cross(hr, hf);
  return { s, P, hip, knee, ank, foot: o.feet, N: T.N, u: T.u, sh: T.sh, elbow: arms.map(a => a.joint), hand: arms.map(a => a.end),
    head, hf, hr, hu, fc, rc, fp, rp, yawP: o.yawP, yawC: o.yawC };
}

const ell = (b, c, ax, ay, az, hx, hy, hz, col, g = 0.2, e = 0) => b.blob("sphere", c, mul(ax, hx), mul(ay, hy), mul(az, hz), col, g, e);
// A box laid along the limb a->c, wide across `side` and thin along the remaining axis.
const limbBox = (b, a, c, hw, ht, side, col, g = 0.3) => {
  const y = mul(sub(c, a), 0.5), wx = norm(cross(side, y)), wz = norm(cross(y, wx));
  b.blob("box", mix3(a, c, 0.5), mul(wx, hw), y, mul(wz, ht), col, g);
};

export function drawPerson(b, J, kit, o = {}) {
  const s = J.s, { P, fp, rp, fc, rc, u, head, hf, hr, hu } = J;
  for (let k = 0; k < 2; k++) {
    b.tube(J.hip[k], J.knee[k], 0.088 * s, 0.066 * s, kit.trousers, 0.2);
    b.tube(J.knee[k], J.ank[k], 0.064 * s, 0.046 * s, kit.trousers, 0.2);
    b.ball(J.knee[k], 0.066 * s, kit.trousers, 0.2);
    const ff = fwd(o.footYaw?.[k] ?? J.yawP), fr = rgt(o.footYaw?.[k] ?? J.yawP), g = J.foot[k];
    b.blob("box", [g[0] + ff[0] * 0.045 * s, g[1] + 0.04 * s, g[2] + ff[2] * 0.045 * s], mul(fr, 0.043 * s), [0, 0.038 * s, 0], mul(ff, 0.12 * s), kit.shoes, 0.35);
    if (o.pads) {
      limbBox(b, add(J.knee[k], [0, 0.05 * s, 0]), add(J.ank[k], [0, 0.01, 0]), 0.075 * s, 0.056 * s, fp, kit.pad, 0.25);
      ell(b, add(J.knee[k], mul(fp, 0.03 * s)), rp, UP, fp, 0.07 * s, 0.07 * s, 0.07 * s, kit.pad, 0.25);
    }
  }
  ell(b, add(P, mul(u, 0.07 * s)), rp, u, fp, 0.178 * s, 0.12 * s, 0.115 * s, kit.trousers, 0.2);
  ell(b, add(P, mul(u, 0.2 * s)), rc, u, fc, 0.178 * s, 0.15 * s, 0.112 * s, kit.shirt, 0.2);
  ell(b, add(P, mul(u, 0.37 * s)), rc, u, fc, 0.205 * s, 0.17 * s, 0.125 * s, kit.shirt, 0.2);
  if (kit.trim && o.nameBand) { // a dotted name panel across the upper back
    for (let i = 0; i < 11; i++) {
      const c = add(add(P, mul(u, 0.42 * s)), add(mul(rc, (i - 5) * 0.026 * s), mul(fc, -0.118 * s)));
      b.blob("box", c, mul(rc, 0.009 * s), mul(u, (0.014 + 0.008 * ((i * 7) % 3)) * s), mul(fc, 0.006 * s), kit.trim, 0.2, 0.5);
    }
    b.blob("box", add(add(P, mul(u, 0.31 * s)), mul(fc, -0.13 * s)), mul(rc, 0.05 * s), mul(u, 0.05 * s), mul(fc, 0.006 * s), kit.trim, 0.2, 0.4);
  }
  b.tube(J.N, add(J.N, mul(u, 0.09 * s)), 0.05 * s, 0.045 * s, kit.skin, 0.15);
  for (let k = 0; k < 2; k++) b.tube(add(J.N, mul(u, 0.035 * s)), J.sh[k], 0.062 * s, 0.054 * s, kit.shirt, 0.2); // trapezius slope hides the neck
  for (let k = 0; k < 2; k++) {
    b.ball(J.sh[k], 0.064 * s, kit.shirt, 0.2);
    b.tube(J.sh[k], J.elbow[k], 0.054 * s, 0.045 * s, kit.shirt, 0.2);
    b.tube(J.elbow[k], J.hand[k], 0.044 * s, 0.034 * s, o.pads ? kit.shirt : kit.skin, 0.2);
    b.ball(J.hand[k], (o.pads ? 0.056 : 0.042) * s, o.pads ? kit.glove : kit.skin, 0.2);
  }
  ell(b, head, hr, hu, hf, 0.092 * s, 0.112 * s, 0.1 * s, kit.skin, 0.2);
  if (o.helmet) {
    ell(b, add(head, mul(hu, 0.022 * s)), hr, hu, hf, 0.126 * s, 0.118 * s, 0.136 * s, kit.helmet, 0.55);
    b.blob("box", add(add(head, mul(hf, 0.112 * s)), mul(hu, 0.055 * s)), mul(hr, 0.1 * s), mul(hu, 0.01 * s), mul(hf, 0.07 * s), kit.helmet, 0.5);
    for (const dx of [-0.055, 0, 0.055]) b.tube(add(add(head, mul(hf, 0.128 * s)), add(mul(hr, dx * s), mul(hu, 0.04 * s))), add(add(head, mul(hf, 0.125 * s)), add(mul(hr, dx * s), mul(hu, -0.085 * s))), 0.006 * s, 0.006 * s, [0.55, 0.57, 0.6], 0.8);
    b.tube(add(add(head, mul(hf, 0.126 * s)), add(mul(hr, -0.065 * s), mul(hu, -0.02 * s))), add(add(head, mul(hf, 0.126 * s)), add(mul(hr, 0.065 * s), mul(hu, -0.02 * s))), 0.006 * s, 0.006 * s, [0.55, 0.57, 0.6], 0.8);
  } else {
    ell(b, add(add(head, mul(hu, 0.028 * s)), mul(hf, -0.012 * s)), hr, hu, hf, 0.1 * s, 0.09 * s, 0.104 * s, kit.hair, 0.3);
    if (kit.cap) {
      ell(b, add(head, mul(hu, 0.048 * s)), hr, hu, hf, 0.106 * s, 0.07 * s, 0.112 * s, kit.cap, 0.3);
      b.blob("box", add(add(head, mul(hf, 0.1 * s)), mul(hu, 0.052 * s)), mul(hr, 0.08 * s), mul(hu, 0.008 * s), mul(hf, 0.06 * s), kit.cap, 0.3);
    }
  }
}

// The bat: grip G is the end of the handle, `a` points along the bat to the toe, `w` is the width axis of the blade.
export function drawBat(b, G, a, w) {
  const n = norm(cross(w, a)), k = KITS.bat, at = d => add(G, mul(a, d));
  b.tube(G, at(0.27), 0.0165, 0.0165, k.grip, 0.1);
  b.tube(at(0.27), at(0.36), 0.0165, 0.027, k.wood, 0.35);
  b.blob("box", at(0.66), mul(w, 0.054), mul(a, 0.3), mul(n, 0.027), k.wood, 0.5);
  b.blob("box", add(at(0.64), mul(n, -0.03)), mul(w, 0.03), mul(a, 0.26), mul(n, 0.012), k.edge, 0.4);
  b.blob("box", add(at(0.5), mul(n, 0.029)), mul(w, 0.036), mul(a, 0.05), mul(n, 0.003), [0.95, 0.75, 0.25], 0.3, 0.35);
}

// ---------------------------------------------------------------------------------------------- the batter
const axisOf = (alpha, psi, tx) => norm(add(add(mul(fwd(psi), Math.cos(alpha)), mul(UP, Math.sin(alpha))), mul(rgt(psi), tx)));

// Key poses, authored as a right-hander. alpha is the bat's angle in its swing plane (270 deg = toe straight down,
// 180 deg = toe pointing back towards the keeper, 90 deg = toe to the sky); psi is the swing plane's heading.
const STANCE = { fl: [-0.5, 0, -0.8], fr: [-0.2, 0, -0.74], pelvis: [-0.35, 0.8, -0.8], yawP: D(40), yawC: D(52), lean: D(20), ht: [-0.17, 0.88, -1.0], alpha: D(268), tx: 0.07, psi: 0 };
const PICKUP = { ...STANCE, pelvis: [-0.35, 0.82, -0.8], lean: D(16), yawC: D(55), ht: [-0.27, 1.16, -0.92], alpha: D(122), tx: 0 };
const READY = { ...PICKUP, fl: [-0.46, 0, -1.0], pelvis: [-0.33, 0.78, -0.9], lean: D(22), ht: [-0.27, 1.12, -0.98] };

function blend(A, B, k, kb = k) {
  const foot = (a, c) => { const p = mix3(a, c, k), d = Math.hypot(c[0] - a[0], c[2] - a[2]); p[1] += Math.min(0.14, d * 0.3) * Math.sin(Math.PI * clamp(k)); return p; };
  return {
    fl: foot(A.fl, B.fl), fr: foot(A.fr, B.fr), pelvis: mix3(A.pelvis, B.pelvis, k), ht: mix3(A.ht, B.ht, kb),
    yawP: lerp(A.yawP, B.yawP, k), yawC: lerp(A.yawC, B.yawC, k), lean: lerp(A.lean, B.lean, k),
    alpha: lerp(A.alpha, B.alpha, kb), tx: lerp(A.tx, B.tx, kb), psi: lerp(A.psi, B.psi, kb)
  };
}

function strike(S, psi, kind) { // contact and finish for a sweet spot S (right-hander frame)
  const six = kind === "six", a = axisOf(D(262), psi, 0);
  const sz = clamp(-1.24 + (S[2] + 1.15) * 0.45, -1.72, -0.88), sx = -0.4 + 0.28 * Math.sin(psi);
  const C = { fl: [sx, 0, sz], fr: [-0.24, 0, -0.74], pelvis: [sx + 0.1, six ? 0.8 : 0.72, sz + 0.34], yawP: D(32) + psi * 0.2, yawC: D(38) + psi * 0.4,
    lean: six ? D(20) : D(30), ht: sub(S, mul(a, 0.56)), alpha: D(262), tx: 0, psi };
  const big = six ? 1 : kind === "four" ? 0.85 : kind === "single" ? 0.6 : 0.8;
  const F = { fl: C.fl, fr: [C.fr[0] + 0.05, 0.035, C.fr[2] - 0.15], pelvis: [C.pelvis[0] + 0.02, 0.84, C.pelvis[2] - 0.06], yawP: D(14) + psi * 0.3, yawC: psi * 0.7, lean: D(8),
    ht: [C.pelvis[0] - 0.14 + 0.12 * Math.sin(psi), 1.44 + 0.2 * big, C.pelvis[2] - 0.2], alpha: D(425 + 50 * big), tx: 0, psi };
  return { C, F, FT: six ? 640 : 520 };
}

const HOLD = 520, RECOVER = 800;
// Before the swing the batter picks the bat up as the ball is released, then takes a small step as it pitches.
function preStrike(pl, t) {
  const lift = smooth((t - (pl.tRelease - 120)) / (pl.tBounce - 80 - (pl.tRelease - 120))), step = smooth((t - pl.tBounce) / (pl.F * 0.6));
  const p = blend(blend(STANCE, PICKUP, lift), READY, step);
  if (t < pl.tRelease - 120) p.ht = [p.ht[0], p.ht[1] + 0.035 * Math.max(0, Math.sin(t * 0.008)) ** 8, p.ht[2]];
  return p;
}

// `press` = { tp, dir, shot, S } (S: where the ball is when the bat arrives, world coordinates) or null for no swing.
export function batterPose(pl, t, press) {
  if (!pl) return { ...STANCE, ht: [STANCE.ht[0], STANCE.ht[1] + 0.035 * Math.max(0, Math.sin(t * 0.008)) ** 8, STANCE.ht[2]] };
  if (!press) return t > pl.tEnd + 250 ? blend(preStrike(pl, pl.tEnd + 250), STANCE, smooth((t - pl.tEnd - 250) / 700)) : preStrike(pl, t);
  if (t < press.tp) return preStrike(pl, t);
  const u = t - press.tp, kind = press.shot?.kind ?? "miss";
  if (!press.rig) { // the swing is planned once per press
    const psi = -(press.shot?.psi ?? 0), S = [-press.S[0], clamp(press.S[1], 0.4, 1.4), clamp(press.S[2], -2.2, 0.1)];
    press.rig = { A: preStrike(pl, press.tp), ...strike(S, psi, kind) };
  }
  const { A, C, F, FT } = press.rig;
  if (u < SWING_MS) { const x = u / SWING_MS; return blend(A, C, smooth(x), x ** 1.7); }
  if (u < SWING_MS + FT) return blend(C, F, easeOut((u - SWING_MS) / FT), easeOut((u - SWING_MS) / FT));
  const r = u - SWING_MS - FT - HOLD;
  return r > 0 ? blend(F, STANCE, smooth(r / RECOVER)) : F;
}

// `look` is the point he watches (world coordinates). Draw into the batch that is rendered mirrored.
export function drawBatter(b, pose, look) {
  const a = axisOf(pose.alpha, pose.psi, pose.tx), w = rgt(pose.psi);
  const G = sub(pose.ht, mul(a, 0.06)), HB = add(pose.ht, mul(a, 0.14));
  const J = rig({ s: 1, pelvis: pose.pelvis, yawP: pose.yawP, yawC: pose.yawC, lean: pose.lean, feet: [pose.fl, pose.fr],
    hands: [pose.ht, HB], look: look ? [-look[0], look[1], look[2]] : null });
  drawPerson(b, J, KITS.batter, { pads: true, helmet: true, nameBand: true, footYaw: [D(-8), D(-8)] });
  drawBat(b, G, a, w);
  return J;
}

// ---------------------------------------------------------------------------------------------- runners and fielders
const stride = (phase, k, s, base, side, j) => { // one leg of a run cycle
  const ph = phase + (j ? Math.PI : 0), f = fwd(base.yaw), r = rgt(base.yaw);
  const p = add(add([base.x, 0, base.z], mul(f, 0.5 * k * s * Math.sin(ph))), mul(r, (j ? 1 : -1) * 0.1 * s));
  return [p[0], 0.3 * k * s * Math.max(0, Math.cos(ph)) ** 1.5, p[2]];
};

// Standing figure with an optional run cycle. `o`: x, z, yaw, run (m/s), phase, crouch (0..1), look (head tilt up, rad)
function figure(b, kit, o) {
  const s = o.s ?? 1, k = clamp((o.run ?? 0) / 6, 0, 1.2), yaw = o.yaw, base = { x: o.x, z: o.z, yaw };
  const crouch = o.crouch ?? 0, bob = 0.03 * k * s * Math.cos(2 * (o.phase ?? 0));
  const pelvisY = (0.93 - 0.09 * k - 0.15 * crouch) * s + bob + (o.lift ?? 0);
  const feet = k > 0.02 ? [stride(o.phase, k, s, base, -1, 0), stride(o.phase, k, s, base, 1, 1)]
    : [add([o.x, 0, o.z], add(mul(rgt(yaw), -0.17 * s), mul(fwd(yaw), 0.1 * s * (1 + crouch)))), add([o.x, 0, o.z], add(mul(rgt(yaw), 0.17 * s), mul(fwd(yaw), -0.1 * s)))];
  const lean = (k * 0.22 + crouch * 0.75 + (o.lean ?? 0)), pelvis = [o.x, pelvisY, o.z];
  const first = rig({ s, pelvis, yawP: yaw, yawC: yaw + (o.twist ?? 0), lean, feet });
  let hands = o.hands?.(first) ?? null;
  if (!hands && k > 0.02) {
    const ph = o.phase ?? 0;
    hands = first.sh.map((sh, j) => { const sw = Math.sin(ph + (j ? 0 : Math.PI)); return add(add(sh, mul(first.fc, 0.26 * k * s * sw)), [0, (-0.34 + 0.12 * Math.max(0, sw)) * s, 0]); });
  } else if (!hands && crouch > 0) {
    hands = first.sh.map(sh => add(add(sh, mul(first.fc, 0.18 * s)), [0, -0.45 * s, 0]));
  }
  const look = o.lookUp ? add(first.head, add(mul(first.fc, 5), [0, 5 * Math.tan(o.lookUp), 0])) : null;
  const J = rig({ s, pelvis, yawP: yaw, yawC: yaw + (o.twist ?? 0), lean, feet, hands, look, roll: o.roll });
  drawPerson(b, J, kit, { footYaw: [yaw, yaw], ...o.draw });
  return J;
}

export function drawFielder(b, f, t, index, ball) {
  const near = ball && Math.hypot(ball[0] - f.x, ball[2] - f.z) < 1.6 && ball[1] < 0.4;
  const phase = t * 0.0132 + index * 1.7, idle = Math.sin(t * 0.003 + index * 2.1);
  figure(b, KITS.fielder, f.run > 0 ? { x: f.x, z: f.z, yaw: f.face, run: f.run, phase, lookUp: f.look > 0 ? f.look : 0 }
    : near ? { x: f.x, z: f.z, yaw: f.face, crouch: 1, lean: 0.1 }
      : { x: f.x, z: f.z, yaw: f.face, crouch: 0.35 + 0.04 * idle, lookUp: f.look, lean: 0.04 * idle, ...(f.look > 0.2 ? { crouch: 0 } : {}) });
}

// ---------------------------------------------------------------------------------------------- bowler, umpire, non-striker
export function bowlerPlace(pl, t) { // where the bowler's pelvis is and the cycle phase, shared with the ball release
  const st = bowlerState(pl, t), tau = t - pl.tRelease, f = fwd(st.yaw);
  const pos = [st.x - f[0] * 0.3 * smooth((tau + 500) / 400), st.z - f[2] * 0.3 * smooth((tau + 500) / 400)];
  const dist = (x, z) => Math.hypot(x - pl.prof.from[0], z - pl.prof.from[1]);
  const lock = bowlerState(pl, pl.tRelease - 100), c = Math.PI / 2 - Math.PI * dist(lock.x, lock.z) / 1.7;
  return { st, tau, x: pos[0], z: pos[1], phase: Math.PI * dist(st.x, st.z) / 1.7 + c };
}

const SCALE = { Kite: 1.1, Comet: 1.13, Orbit: 1.02 };
export function drawBowler(b, pl, t) {
  const { st, tau, x, z, phase } = bowlerPlace(pl, t), s = SCALE[pl.bowler.name] ?? 1.08, kit = KITS[pl.bowler.name] ?? KITS.Kite;
  const yaw = st.yaw, speed = st.speed, action = tau > -380 && tau < 700;
  const twist = tau < 0 ? D(70) * (1 - smooth((tau + 340) / 340)) : -D(30) * smooth(tau / 300);
  const lean = tau < 0 ? D(8) + D(12) * smooth((tau + 340) / 340) : D(20) + D(18) * smooth(tau / 260);
  const jump = tau > -330 && tau < -40 ? 0.1 * s * Math.sin(Math.PI * (tau + 330) / 290) : 0;
  const hands = J0 => {
    const armDir = g => add(mul(J0.fc, -Math.sin(g)), mul(UP, -Math.cos(g))), reach = 0.56 * s;
    const swing = Math.sin(phase), out = [null, null];
    // run: arms pump; the ball is carried in the right hand
    out[0] = add(add(J0.sh[0], mul(J0.fc, 0.2 * s * Math.sin(phase + Math.PI))), [0, -0.3 * s, 0]);
    out[1] = add(add(J0.sh[1], mul(J0.fc, 0.16 * s * swing)), [0, -0.28 * s, 0]);
    if (action) {
      const g = tau < 0 ? lerp(D(45), D(190), smooth((tau + 330) / 330)) : lerp(D(190), D(330), easeOut(tau / 300));
      const wind = tau < -330 ? 0 : tau > 560 ? 1 - smooth((tau - 560) / 140) : 1;
      let target = add(J0.sh[1], mul(armDir(g), reach));
      if (tau > -120 && tau < 0) target = mix3(target, pl.prof.hand, smooth((tau + 120) / 120));
      out[1] = mix3(out[1], target, wind);
      const front = smooth((tau + 400) / 260) * (1 - smooth((tau + 110) / 230));
      out[0] = mix3(out[0], add(J0.sh[0], add(mul(J0.fc, 0.3 * s), [0, 0.46 * s, 0])), front);
    }
    return out;
  };
  const J = figure(b, kit, { s, x, z, yaw, run: speed, phase, lift: jump, lean, twist: action ? twist : 0, hands, crouch: speed < 0.2 && tau > 900 ? 0.25 : 0 });
  if (t < pl.tRelease) b.ball(add(J.hand[1], [0, 0.03, 0]), 0.045, [1, 1, 1], 0.5, 0.2);
  return J;
}

export function drawUmpire(b, sig, t) {
  const wave = sig?.kind === "four" ? Math.sin(sig.age * 0.012) : 0;
  figure(b, KITS.umpire, { x: -0.95, z: -21.9, yaw: Math.PI, crouch: 0.1, lean: 0.05, hands: J0 =>
    sig?.kind === "six" ? J0.sh.map(sh => add(sh, [0, 0.58, 0]))
      : sig?.kind === "four" ? [add(J0.sh[0], [0, -0.45, 0]), add(add(J0.sh[1], mul(J0.fc, 0.3)), add(mul(J0.rc, -0.18 + 0.3 * wave), [0, -0.1, 0]))]
        : null });
}

export function drawNonStriker(b, t) {
  const J = figure(b, KITS.batter, { x: 1.6, z: -19.55, yaw: Math.PI - D(20), crouch: 0.45, lean: 0.08, draw: { pads: true, helmet: true },
    hands: J0 => [add(J0.sh[0], [0, -0.62, 0]), add(add(J0.sh[1], mul(J0.fc, 0.14)), [0, -0.6, 0])] });
  b.tube(add(J.hand[1], [0, 0.06, 0]), add(J.hand[1], add(mul(J.fc, 0.28), [0, -0.9, 0])), 0.02, 0.04, KITS.bat.wood, 0.4);
}

// ---------------------------------------------------------------------------------------------- stumps
// `age` is ms since the ball hit them (null while standing). They glow when broken, like the LED sets used in T20.
export function drawStumps(b, z, age) {
  const col = [0.93, 0.86, 0.68], hit = age != null && age >= 0, t = hit ? age / 1000 : 0, glow = hit ? 2.4 * Math.exp(-t * 0.8) : 0.06;
  for (const i of [-1, 0, 1]) {
    const x = i * 0.0889, spin = Math.min(1.45, 4.4 * t * (1 + 0.18 * i)), vz = 3.1 + 0.5 * i + 0.4 * (i === 0), hop = Math.max(0, 1.9 * t - 4.9 * t * t) * 0.5;
    const base = [x + i * 0.06 * Math.min(t, 0.7), hit ? hop : 0, z + (hit ? vz * (1 - Math.exp(-3 * t)) / 3 * 1.0 : 0)];
    const top = add(base, hit ? [0, Math.cos(spin) * 0.711, Math.sin(spin) * 0.711] : [0, 0.711, 0]);
    b.tube(base, top, 0.0185, 0.0185, hit ? mix3(col, [1, 0.42, 0.18], Math.min(1, t * 6)) : col, 0.5, glow);
  }
  for (const [x0, x1] of [[-0.0889, 0], [0, 0.0889]]) {
    const mid = (x0 + x1) / 2, dir = x1 > x0 ? 1 : -1;
    const p = hit ? [mid + dir * 0.6 * t, Math.max(0.012, 0.73 + 2.6 * t - 4.9 * t * t), z + 2.4 * t] : [mid, 0.728, z];
    const tilt = hit ? Math.min(1.4, 5 * t) : 0, h = [Math.cos(tilt) * 0.046, Math.sin(tilt) * 0.046, 0];
    b.tube(sub(p, h), add(p, h), 0.0085, 0.0085, [0.95, 0.9, 0.75], 0.5, hit ? glow * 0.6 : 0.1);
  }
}
