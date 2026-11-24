// The scene: turns the match clock into a picture. Everything here is a function of (match state, time) except the camera,
// which eases towards where it should be. The stadium is passed in, so a test can hand it a recorder instead of WebGL.
import * as F from "./figures.js";
import * as FL from "./flight.js";
import { OVER, timing } from "./rules.js";
import { clamp, lerp, mix, rad, smooth } from "./gl.js";

// Framed so the batter, the near stumps and the timing strip stay above the control dock (the bottom ~22% of a 16:9 screen).
export const PLAY = Object.freeze({ eye: [-0.4, 2.6, 6.8], target: [0.1, -1.19, -12], fov: 40 });
const PLANS = Array.from({ length: OVER }, (_, i) => FL.plan(i));
const BASE = FL.fieldAt(null, 0);
const MIN_HFOV = rad(46); // keeps the pitch in frame on a phone held upright
const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ms after contact at which the umpire signals, and how long a ball stays visible once it has come to rest
const SIGNAL_MS = 350, REST_MS = 250;

export const bowled = d => FL.stumpsHit(d.pl) && !d.shot;

// Where the ball is at absolute time `now`; null while it is in the bowler's hand, once it is gone, or when it passes the camera.
export function ballAt(d, now) {
  if (!d) return null;
  if (d.shot && now >= d.contact) { const s = now - d.contact; return s > d.shot.ms + REST_MS ? null : d.shot.pos(s); }
  const t = now - d.T, p = t < d.pl.tEnd ? FL.ballAt(d.pl, t) : FL.carry(d.pl, t - d.pl.tEnd);
  return p && p[2] < 3 ? p : null;
}

// The bowler on screen and how far into his delivery he is (negative: waiting at his mark for the next ball).
function bowlerFor(m, d, now) {
  if (!d) return [PLANS[0], -1];
  if (m.phase === "lead") return [PLANS[Math.min(d.i + 1, OVER - 1)], -1];
  if (m.phase === "play" && d.i < OVER - 1 && now >= d.endAt - 500) return [PLANS[d.i + 1], -1];
  return [d.pl, now - d.T];
}

// Fielders chase the last shot, then jog back to their places while the next ball is bowled.
function fielders(m, now) {
  let hit = null;
  for (const d of m.deliveries) if (d.shot && now >= d.contact) hit = d;
  if (!hit) return BASE;
  const since = now - hit.contact, sh = hit.shot;
  if (since <= sh.after) return FL.fieldAt(sh, since);
  return FL.fieldAt(sh, sh.after).map((a, i) => {
    const b = BASE[i], dist = Math.hypot(b.x - a.x, b.z - a.z), dur = clamp(dist / 8 * 1000, 300, 2400), k = (since - sh.after) / dur;
    if (dist < 0.05 || k >= 1) return b;
    return { ...b, x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), face: Math.atan2(b.x - a.x, -(b.z - a.z)), run: clamp(dist / dur * 1000, 3, 7), look: a.look * (1 - k) };
  });
}

// How worked up the crowd is: a calm baseline, then a burst after each result that fades away.
function excitement(m, now) {
  let last = null;
  for (const d of m.deliveries) if (d.settled && now >= d.settleAt) last = d;
  const base = m.phase === "title" ? 0.35 : 0.15;
  if (!last) return base;
  const level = { 6: 1, 4: 0.7, 1: 0.2 }[last.runs] ?? 0;
  return clamp(base + level * Math.exp(-(now - last.settleAt) / (last.runs === 6 ? 3500 : 2200)));
}

const hero = (now, wob, aspect) => {
  const x = wob * Math.sin(now / 8000), tall = aspect < 1;
  return { eye: [-5 + 0.9 * x, 1.25 + 0.15 * wob * Math.sin(now / 6100), -7 + 0.5 * wob * Math.cos(now / 8000)], target: tall ? [0.3, 1.15, 0] : [1.5, 1.1, -0.9], fov: tall ? 36 : 30, tau: 0.45 };
};
const wide = (now, wob) => {
  const a = wob * now / 14000;
  return { eye: [-26 * Math.cos(a) + 5 * Math.sin(a), 11, 24 + 3 * Math.sin(a)], target: [0, 2.5, -22], fov: 38, tau: 0.8 };
};

// Look from `base` towards `aim` by a fraction of the angle (not of the distance), so a ball in the air lifts the view without staring at the sky.
function aimBetween(eye, base, aim, k) {
  const a = sub(base, eye), b = sub(aim, eye), yaw = v => Math.atan2(v[0], -v[2]), pitch = v => Math.atan2(v[1], Math.hypot(v[0], v[2]));
  const y = lerp(yaw(a), yaw(b), k), p = lerp(pitch(a), pitch(b), k), r = Math.max(Math.hypot(...b), 8);
  return [eye[0] + r * Math.cos(p) * Math.sin(y), eye[1] + r * Math.sin(p), eye[2] - r * Math.cos(p) * Math.cos(y)];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Camera after contact: stay on the batter while the bat comes through, track the ball, then come back to him for the reaction.
const HOLD_MS = 260;
const TRACK = { six: { eye: [-0.4, 3.8, 8.6], fov: 46, k: 0.62, back: 1500 }, four: { eye: [-0.4, 3.1, 7.6], fov: 42, k: 0.8, back: 1250 } };
function follow(d, now, ball) {
  const s = now - d.contact, sh = d.shot, aim = ball ?? sh.end, c = TRACK[sh.kind] ?? { eye: PLAY.eye, fov: PLAY.fov, k: 0.45, back: 900 };
  const track = smooth((s - HOLD_MS) / 700) * (1 - smooth((s - c.back) / 800)), eye = mix(PLAY.eye, c.eye, track);
  return { eye, target: aimBetween(eye, PLAY.target, aim, c.k * track), fov: lerp(PLAY.fov, c.fov, track), tau: 0.16, tauEye: 0.5 };
}

// Bowled: cut low beside the stumps so the player sees them cartwheel.
const STUMP_CAM = Object.freeze({ eye: [-4.2, 0.9, 1.2], target: [0, 0.6, 1], fov: 42 });

export function createScene(st, { reduced = false } = {}) {
  const cam = { eye: [...PLAY.eye], target: [...PLAY.target], fov: PLAY.fov, last: null, lastBall: [0, 1, -12] };
  const wob = reduced ? 0 : 1;

  function goalFor(m, d, now, ball, aspect) {
    if (m.phase === "title") return hero(now, wob, aspect);
    if (m.phase === "done") return wide(now, wob);
    const playing = m.phase === "play" && d;
    if (playing && d.shot && now >= d.contact) return follow(d, now, ball);
    if (playing && bowled(d) && now >= d.T + d.pl.tBounce + d.pl.F * (-d.pl.zb / d.pl.L) - 40) return { ...STUMP_CAM, tau: 0.12, tauEye: 0.2 };
    // A gentle push in as the ball closes on the bat (the target dips with it so the stumps stay above the dock); back out between deliveries.
    const push = playing && !reduced ? smooth((now - d.T - d.pl.tBounce) / d.pl.F) : 0;
    return { eye: PLAY.eye, target: [PLAY.target[0], PLAY.target[1] - 0.3 * push, PLAY.target[2]], fov: lerp(PLAY.fov, PLAY.fov - 3, push), tau: playing ? 0.3 : 0.55 };
  }

  function frame(m, now, { assist = true, scale = 1 } = {}) {
    st.resize?.(scale); // so the very first frame is framed for the real canvas, not a guess
    const d = m.deliveries.at(-1) ?? null, [w, h] = st.size, aspect = w > 1 && h > 1 ? w / h : 16 / 9;
    const ball = ballAt(d, now);
    if (ball) cam.lastBall = ball;
    const [pl, t] = bowlerFor(m, d, now);

    // --- people
    const b = st.actors;
    b.reset(); st.batter.reset();
    const age = d && bowled(d) ? now - (d.T + d.pl.tBounce + d.pl.F * (-d.pl.zb / d.pl.L)) : -1;
    F.drawStumps(b, 0, age >= 0 && now < d.endAt ? age : null);
    F.drawStumps(b, FL.WORLD.bowlerZ, null);
    F.drawBowler(b, pl, t);
    const sig = d?.shot && (d.shot.kind === "six" || d.shot.kind === "four") && now >= d.contact + SIGNAL_MS && now < d.endAt;
    F.drawUmpire(b, sig ? { kind: d.shot.kind, age: now - d.contact - SIGNAL_MS } : null, now);
    F.drawNonStriker(b, now);
    fielders(m, now).forEach((f, i) => F.drawFielder(b, f, now, i, ball));
    F.drawBatter(st.batter, d ? F.batterPose(d.pl, now - d.T, d.press) : F.batterPose(null, now, null), ball && ball[2] < -3 ? ball : [0, 1, -10]);

    // --- ball, trail and the spark of contact
    const dd = p => Math.hypot(p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]);
    if (ball) {
      b.ball(ball, FL.BALL_R, [1.2, 0.2, 0.18], 0.6, 0.35);
      st.sprites.add(ball, 0.1 + 0.012 * dd(ball), 0.9, 0.4, 0.3, 0.8);
      const hit = d.shot && now >= d.contact, n = hit && d.shot.kind === "six" ? 9 : 6, step = hit ? 30 : 22;
      for (let k = 1; k <= n; k++) {
        const p = ballAt(d, now - k * step);
        if (!p) break;
        st.sprites.add(p, (0.06 + 0.009 * dd(p)) * (1 - 0.6 * k / n), 0.9, 0.45, 0.3, 0.5 * (1 - k / n));
      }
    }
    if (d?.shot) {
      const u = (now - d.contact) / 420, sh = d.shot, power = sh.kind === "six" ? 1.4 : sh.kind === "four" ? 1.1 : 0.7;
      if (u >= 0 && u < 1) {
        st.sprites.add(sh.from, (0.5 + 1.1 * u) * power, 1, 0.85, 0.5, 0.7 * (1 - u) ** 2);
        for (let i = 0; i < 14; i++) {
          const a = rnd(d.i * 40 + i) * 2 * Math.PI, e = rnd(d.i * 40 + i + 17), sp = (1.5 + 4.5 * e) * power, s = u * 0.42;
          st.sprites.add([sh.from[0] + Math.sin(a) * sp * s, sh.from[1] + (rnd(i + 3) * 2 - 0.4) * sp * s - 4.9 * s * s, sh.from[2] + Math.cos(a) * sp * s * 0.6],
            0.02 + 0.05 * power * (1 - u), 1, 0.8 - 0.3 * e, 0.35, 1 - u);
        }
      }
    }

    // --- the timing carpet and the ball's glow on the grass
    const playing = m.phase === "play" && d, live = playing && !d.settled;
    const plan = live ? d.pl : m.phase === "lead" ? PLANS[Math.min(m.deliveries.length, OVER - 1)] : null;
    let alpha = 0;
    if (m.phase === "lead") alpha = smooth((now - (m.nextT - 300)) / 300);
    else if (playing) alpha = d.settled ? 1 - smooth((now - d.settleAt) / 400) : 1;
    const pre = live && ball && (!d.press || now < d.contact), ap = plan ?? PLANS[0];
    const zone = pre ? smooth(1 - Math.abs(FL.contactP(d.pl, now - d.T) - timing.centre) / 0.3) : 0;

    // --- camera
    const dt = cam.last == null ? Infinity : Math.max(0, (now - cam.last) / 1000);
    cam.last = now;
    const goal = goalFor(m, d, now, ball ?? cam.lastBall, aspect), kP = 1 - Math.exp(-dt / (goal.tauEye ?? goal.tau)), kT = 1 - Math.exp(-dt / goal.tau);
    for (let i = 0; i < 3; i++) { cam.eye[i] += (goal.eye[i] - cam.eye[i]) * kP; cam.target[i] += (goal.target[i] - cam.target[i]) * kT; }
    cam.fov += (goal.fov - cam.fov) * (1 - Math.exp(-dt / Math.max(goal.tau, 0.3)));

    // a six shakes the stand a little
    let shake = [0, 0, 0], six = null;
    for (const x of m.deliveries) if (x.shot?.kind === "six" && now >= x.contact) six = x;
    if (!reduced && six && now - six.contact < 900) { const k = 0.05 * Math.exp(-(now - six.contact) / 220); shake = [Math.sin(now * 0.09) * k, Math.sin(now * 0.13 + 1) * k, 0]; }
    const eye = cam.eye.map((v, i) => v + shake[i]), target = cam.target.map((v, i) => v + shake[i]);

    st.draw({
      eye, target, fov: Math.max(rad(cam.fov), 2 * Math.atan(Math.tan(MIN_HFOV / 2) / aspect)), time: now / 1000, desat: 0.15 * zone, focus: 0.35 + 0.3 * zone, exposure: 1,
      band: [ap.zb + ap.L * FL.assistP(ap), 0.043 * ap.L, 0.12 * ap.L, 0.21 * ap.L], assist, assistAlpha: alpha,
      ballDot: assist && pre ? [ball[0], ball[2], 1, 0] : [0, 0, 0, 0], excite: excitement(m, now), scale
    });
  }

  return { frame, cam };
}
