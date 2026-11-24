// Timing, ball flight, shots and fielding for the 3D game. Pure functions: no DOM, no WebGL.
// World: x to the right of the screen, y up, -z towards the bowler. The batter's stumps are at the origin.
import { bowlerAt, timing } from "./rules.js";
import { clamp, lerp, rad } from "./gl.js";

export const SWING_MS = 120;   // press -> bat meets ball
export const LEAD_MS = 1800;   // walk-out before the first delivery
export const GAP_MS = 600;     // breather between deliveries
export const G = 9.81;
export const BALL_R = 0.055;   // drawn about 1.5x life size so it reads on a phone

export const WORLD = Object.freeze({ crease: -1.22, bowlerZ: -20.12, centre: [0, -10.06], ring: 27.43, rope: 68, boards: 69.8, standIn: 74, standOut: 90 });
export const standHeight = r => clamp((r - WORLD.standIn) * 0.875, 0, 14);
export const CONTACT = Object.freeze({ y: 0.95, z: -1.15 });

const LINES = [0.12, -0.08, 0.16, -0.02, -0.12, 0.06];
// How each bowler runs in and where the ball lands. `focus` (ms) comes from rules.js.
const PROFILES = {
  Kite: { runMs: 1250, runLen: 9.5, preMs: 470, bounce: 5.4, rise: 1.8, turn: 0, kmh: 128, hand: [0.4, 2.15, -18.55], from: [2.6, -28.4] },
  Comet: { runMs: 1500, runLen: 14, preMs: 390, bounce: 6.6, rise: 1.5, turn: 0, kmh: 141, hand: [0.45, 2.2, -18.5], from: [3.4, -32.9] },
  Orbit: { runMs: 800, runLen: 4, preMs: 650, bounce: 4, rise: 2.6, turn: 0.24, kmh: 82, hand: [0.3, 2, -18.6], from: [1.6, -22.9] }
};

// One delivery. Times are ms from the start of the run-up; p is the "focus" position
// from rules.js (0 at the bounce, `timing.centre` at the ideal contact point, 1 just past the bat).
export function plan(index) {
  const bowler = bowlerAt(index), prof = PROFILES[bowler.name] ?? PROFILES.Kite;
  const F = bowler.flight, line = LINES[index % LINES.length];
  const [xr, yr, zr] = prof.hand, zb = CONTACT.z - prof.bounce, T = prof.preMs / 1000;
  const straight = xr + (line - xr) * (zb - zr) / (CONTACT.z - zr);
  return Object.freeze({
    index, bowler, prof, F, line, zb, T, xb: straight - prof.turn, L: prof.bounce / timing.centre,
    vy: (0.5 * G * T * T - yr) / T, tRelease: prof.runMs, tBounce: prof.runMs + prof.preMs, tEnd: prof.runMs + prof.preMs + F
  });
}

export function afterBounce(pl, p) {
  const u = p / timing.centre, a = pl.prof.rise;
  return [pl.xb + (pl.line - pl.xb) * u, Math.max(BALL_R, CONTACT.y * (a * u - (a - 1) * u * u)), pl.zb + pl.L * p];
}
// Ball position t ms after the run-up began; null while it is still in the bowler's hand.
export function ballAt(pl, t) {
  if (t < pl.tRelease) return null;
  if (t >= pl.tBounce) return afterBounce(pl, (t - pl.tBounce) / pl.F);
  const s = (t - pl.tRelease) / pl.prof.preMs, tau = s * pl.T, [xr, yr, zr] = pl.prof.hand;
  return [lerp(xr, pl.xb, s), Math.max(BALL_R, yr + pl.vy * tau - 0.5 * G * tau * tau), lerp(zr, pl.zb, s)];
}
export const focusP = (pl, t) => (t - pl.tBounce) / pl.F;
// Press time -> where the ball is when the bat arrives.
export const contactP = (pl, tPress) => clamp((tPress + SWING_MS - pl.tBounce) / pl.F, 0, 1);
export const perfectPress = pl => pl.tBounce + pl.F * timing.centre - SWING_MS;
// The pitch "carpet" the player aims at: press while the ball's ground shadow is over the gold.
export const assistP = pl => timing.centre - SWING_MS / pl.F;

// A ball that is not hit carries on at full speed: through the stumps if it is on line.
export function carry(pl, ms) {
  const p1 = 1, a = afterBounce(pl, p1), b = afterBounce(pl, p1 - 0.02), v = [(a[0] - b[0]) / 0.02 / pl.L, 0, 1];
  const n = Math.hypot(v[0], 1), s = 22 * ms / 1000, tau = ms / 1000;
  return [a[0] + v[0] / n * s, Math.max(BALL_R, a[1] - 0.5 * 4 * tau * tau), a[2] + s / n];
}
export function stumpsHit(pl) {
  const p = (0 - pl.zb) / pl.L, [x, y] = afterBounce(pl, p);
  return Math.abs(x) < 0.11 && y < 0.7;
}

const ropeDistance = (c, d) => {
  const ox = c[0] - WORLD.centre[0], oz = c[2] - WORLD.centre[1], b = ox * d[0] + oz * d[2];
  return -b + Math.sqrt(Math.max(0, b * b - (ox * ox + oz * oz - WORLD.rope ** 2)));
};

// Ground ball with low bounces, tabulated once per shot.
function bounces(y0, vy0, e, ms) {
  const dt = 1 / 120, n = Math.ceil(ms / 1000 / dt) + 2, table = new Float32Array(n);
  let y = y0, vy = vy0;
  for (let i = 0; i < n; i++) {
    table[i] = y; vy -= G * dt; y += vy * dt;
    if (y < BALL_R) { y = BALL_R; vy = Math.abs(vy) > 0.5 ? -vy * e : 0; }
  }
  return t => { const f = clamp(t / 1000 / dt, 0, n - 2), i = Math.floor(f); return lerp(table[i], table[i + 1], f - i); };
}

export const SHOT_DIRECTIONS = Object.freeze({ off: -38, straight: 0, leg: 48 });

// What the ball does after contact. `quality` is 1 for a perfect strike and 0 at the edge of the window.
export function shot(dir, runs, pc, pl) {
  const early = clamp((timing.centre - pc) / timing.single, -1, 1);
  const psi = rad(SHOT_DIRECTIONS[dir] + 10 * early), d = [Math.sin(psi), 0, -Math.cos(psi)];
  const c = afterBounce(pl, pc), dr = ropeDistance(c, d), at = s => [c[0] + d[0] * s, 0, c[2] + d[2] * s];
  const quality = clamp(1 - Math.abs(pc - timing.centre) / timing.single, 0, 1);
  if (runs >= 6) {
    const ms = 3100, T = ms / 1000, land = dr + 10 + 6 * quality, e = at(land);
    const hLand = standHeight(Math.hypot(e[0] - WORLD.centre[0], e[2] - WORLD.centre[1])), vy = (hLand - c[1] + 0.5 * G * T * T) / T;
    return { kind: "six", psi, runs, from: c, ms, dir, quality, end: [e[0], hLand, e[2]], after: 2900,
      pos: t => { const s = Math.min(t, ms) / ms, tau = s * T; return [c[0] + d[0] * land * s, c[1] + vy * tau - 0.5 * G * tau * tau, c[2] + d[2] * land * s]; } };
  }
  if (runs >= 4) {
    const ms = 2400, k = 0.5, bounce = bounces(c[1], -1.5, 0.5, ms + 400), reach = dr + 1.4, norm = 1 - Math.exp(-k * ms / 1000);
    return { kind: "four", psi, runs, from: c, ms, dir, quality, end: at(reach), after: 2300,
      pos: t => { const s = reach * (1 - Math.exp(-k * Math.min(t, ms) / 1000)) / norm, p = at(s); return [p[0], bounce(Math.min(t, ms)), p[2]]; } };
  }
  const ms = 2000, reach = 11 + 7 * quality, bounce = bounces(c[1], -1, 0.35, ms + 400);
  return { kind: "single", psi, runs, from: c, ms, dir, quality, end: at(reach), after: 1800,
    pos: t => { const x = Math.min(t, ms) / ms, p = at(reach * (1 - (1 - x) ** 2)); return [p[0], bounce(Math.min(t, ms)), p[2]]; } };
}

export const FIELD = Object.freeze([
  { name: "mid-off", at: [-7.5, -23.5] }, { name: "mid-on", at: [8, -23.5] },
  { name: "cover", at: [-14, -16] }, { name: "midwicket", at: [14, -16] },
  { name: "long-off", at: [-21, -60] }, { name: "long-on", at: [21, -60] },
  { name: "deep cover", at: [-40, -42] }, { name: "deep midwicket", at: [40, -42] }
]);

const RUN_SPEED = 7;
const distToRay = (p, sh) => {
  const c = sh.from, d = [sh.end[0] - c[0], sh.end[2] - c[2]], l2 = d[0] * d[0] + d[1] * d[1] || 1;
  const s = clamp(((p[0] - c[0]) * d[0] + (p[1] - c[2]) * d[1]) / l2, 0, 1);
  return Math.hypot(p[0] - (c[0] + d[0] * s), p[1] - (c[2] + d[1] * s));
};
const closest = (list, cost) => list.map((f, i) => [i, cost(f)]).sort((a, b) => a[1] - b[1]);

// Fielders `t` ms after contact (sh = null before a shot): position, facing yaw, running speed, head tilt.
export function fieldAt(sh, t) {
  const jobs = new Map(), go = Math.max(0, t - 120) / 1000;
  if (sh?.kind === "single") jobs.set(closest(FIELD.slice(0, 4), f => distToRay(f.at, sh))[0][0], { gather: true });
  if (sh?.kind === "four") closest(FIELD, f => distToRay(f.at, sh)).slice(0, 2).forEach(([i]) => jobs.set(i, { give: 6 }));
  if (sh?.kind === "six") jobs.set(closest(FIELD, f => Math.hypot(f.at[0] - sh.end[0], f.at[1] - sh.end[2]))[0][0], { give: 5 });
  const ball = sh ? sh.pos(clamp(t, 0, sh.ms)) : null;
  return FIELD.map((f, i) => {
    let [x, z] = f.at, run = 0;
    const job = jobs.get(i);
    if (job) {
      const dx = sh.end[0] - x, dz = sh.end[2] - z, dist = Math.hypot(dx, dz) || 1;
      let travel, goal;
      if (job.gather) { // arrives just as the ball stops, easing in to field it
        goal = dist; travel = dist * (1 - (1 - clamp(go * 1000 / (sh.ms * 0.88 - 120), 0, 1)) ** 2);
      } else { goal = Math.max(0, dist - job.give); travel = Math.min(goal, go * RUN_SPEED); }
      x += dx / dist * travel; z += dz / dist * travel;
      run = travel > 0.05 && travel < goal - 0.05 ? RUN_SPEED : 0;
    }
    const face = Math.atan2((ball ? ball[0] : 0) - x, -((ball ? ball[2] : -1.2) - z));
    return { name: f.name, x, z, face, run, look: sh?.kind === "six" ? clamp(t / 700, 0, 1) * 0.7 : 0 };
  });
}

// The bowler `t` ms into the delivery: position, heading (yaw, 0 = looking down the pitch to -z) and run speed.
export function bowlerState(pl, t) {
  const { from, runLen, hand } = pl.prof, tr = pl.tRelease, crease = [hand[0] + 0.1, -18.85];
  const s = clamp(t / tr, 0, 1), eased = (s < 0.15 ? s * s / 0.3 : s - 0.075) / 0.925; // gentle start, then steady
  let x = lerp(from[0], crease[0], eased), z = lerp(from[1], crease[1], eased);
  const v0 = runLen / (tr / 1000), after = clamp((t - tr) / 1000, 0, 1.2);
  const travel = Math.min(3, v0 * (after - after * after / 2.4)), heading = Math.atan2(crease[0] - from[0], -(crease[1] - from[1]));
  // After release he drifts off the protected strip, as bowlers must.
  if (t > tr) { x -= 1.6 * after; z += travel; }
  return { x, z, yaw: heading, speed: t < tr ? v0 * Math.min(1, s / 0.15) : v0 * Math.max(0, 1 - after / 1.2), after: Math.max(0, t - tr) };
}
