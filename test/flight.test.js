import test from "node:test";
import assert from "node:assert/strict";
import { OVER, timing } from "../site/rules.js";
import * as FL from "../site/flight.js";
import { createMatch } from "../site/match.js";
import { createScene } from "../site/scene.js";

const plans = Array.from({ length: OVER }, (_, i) => FL.plan(i));
const DIRS = Object.keys(FL.SHOT_DIRECTIONS);

test("a perfectly timed swing meets the ball at the bat", () => {
  for (const pl of plans) {
    const [x, y, z] = FL.ballAt(pl, FL.perfectPress(pl) + FL.SWING_MS);
    assert.ok(Math.abs(z - FL.CONTACT.z) < 1e-6 && Math.abs(y - FL.CONTACT.y) < 1e-6 && Math.abs(x - pl.line) < 1e-6, `ball ${pl.index}`);
    assert.ok(Math.abs(FL.contactP(pl, FL.perfectPress(pl)) - timing.centre) < 1e-9);
  }
});

test("every ball pitches before it reaches the bat, and a six lands in the stands in every direction", () => {
  for (const pl of plans) {
    const [, y] = FL.ballAt(pl, pl.tBounce);
    assert.ok(y <= FL.BALL_R + 1e-6, "bounces on the pitch");
    for (const dir of DIRS) {
      const sh = FL.shot(dir, 6, timing.centre, pl), [ex, , ez] = sh.end;
      assert.ok(Math.hypot(ex - FL.WORLD.centre[0], ez - FL.WORLD.centre[1]) > FL.WORLD.rope, `${dir} six clears the rope`);
      for (let t = 0; t <= sh.ms + 300; t += 25) assert.ok(sh.pos(t).every(Number.isFinite));
    }
  }
});

test("only the last Orbit ball would hit the stumps", () => {
  assert.deepEqual(plans.map(FL.stumpsHit), [false, false, false, false, true, false]);
});

// ---- the match clock
const first = 1000;
function drive(pressFor) {
  const match = createMatch(), events = [];
  assert.equal(match.begin(first), true);
  assert.equal(match.begin(first), false, "cannot restart mid-match");
  for (let i = 0; i < OVER; i++) {
    const T = match.state.nextT;
    events.push(...match.update(T));
    const d = match.current, p = pressFor(d);
    if (p) assert.ok(match.swing(p.dir, T + p.tp), `ball ${i} accepts a swing`);
    // One big step to just before the next delivery: the result and the end of this ball must both happen, in order.
    events.push(...match.update(d.endAt + FL.GAP_MS - 1));
  }
  return { match, events };
}
const perfect = d => ({ dir: "straight", tp: FL.perfectPress(d.pl) });
const TYPES = ["start", "settle", "lead", "start", "settle", "lead", "start", "settle", "lead", "start", "settle", "lead", "start", "settle", "lead", "start", "settle", "finish"];

test("six perfect swings make 36 runs and the over ends there, whatever the frame rate", () => {
  const { match, events } = drive(perfect);
  assert.equal(match.state.innings.runs, 36);
  assert.equal(match.state.phase, "done");
  assert.deepEqual(events.map(e => e.type), TYPES);
  assert.ok(events.every((e, i) => i === 0 || e.at >= events[i - 1].at), "events arrive in time order");
  assert.equal(match.swing("straight", 1e9), null, "no seventh ball");
  assert.equal(match.state.deliveries.length, OVER);
});

test("a clock that jumps hours ahead still plays out the whole over in order", () => {
  const match = createMatch();
  match.begin(0);
  const events = match.update(1e7);
  assert.deepEqual(events.map(e => e.type), TYPES);
  assert.ok(events.every((e, i) => i === 0 || e.at >= events[i - 1].at));
  assert.deepEqual([match.state.innings.runs, match.state.phase], [0, "done"]);
});

test("a swing that is too early, too late or never made scores nothing, and the over still finishes", () => {
  const early = drive(d => ({ dir: "off", tp: d.pl.tRelease }));
  assert.equal(early.match.state.innings.runs, 0);
  assert.equal(drive(() => null).match.state.innings.runs, 0);
  assert.equal(early.match.state.phase, "done");
});

test("swinging while the ball is not live does nothing, and a ball can be hit only once", () => {
  const match = createMatch();
  assert.equal(match.swing("straight", 0), null, "title screen");
  match.begin(0);
  assert.equal(match.swing("straight", FL.LEAD_MS - 1), null, "still walking out");
  match.update(FL.LEAD_MS);
  const d = match.current, tp = FL.perfectPress(d.pl);
  assert.equal(match.swing("leg", FL.LEAD_MS + tp), d);
  assert.equal(match.swing("leg", FL.LEAD_MS + tp + 10), null);
  assert.equal(d.shot.kind, "six");
  assert.equal(match.begin(5), false);
});

test("Bat again starts a fresh over", () => {
  const { match } = drive(perfect);
  assert.equal(match.begin(2e6), true);
  assert.deepEqual([match.state.phase, match.state.innings.runs, match.state.deliveries.length], ["lead", 0, 0]);
});

// ---- the scene, against a recording stadium instead of WebGL
function recorder() {
  const bad = [], seen = { calls: 0, draws: 0, eyes: [] };
  const rec = name => (...args) => { seen.calls++; if (args.flat(4).some(v => typeof v === "number" && !Number.isFinite(v))) bad.push(name); };
  const batch = () => new Proxy({ reset() {} }, { get: (t, k) => (k in t ? t[k] : rec(String(k))) });
  const st = {
    size: [1280, 720], actors: batch(), batter: batch(), sprites: { add: rec("sprite") },
    draw(v) {
      seen.draws++; seen.eyes.push(v.eye);
      if (Object.values(v).flat(3).some(x => typeof x === "number" && !Number.isFinite(x))) bad.push("draw");
    }
  };
  return { st, bad, seen };
}

test("a whole over, with sixes, a four, a miss and a bowled ball, never produces a NaN and keeps the camera near the action", () => {
  const { st, bad, seen } = recorder(), scene = createScene(st), match = createMatch();
  const press = [d => ({ dir: "leg", tp: FL.perfectPress(d.pl) }), d => ({ dir: "off", tp: FL.perfectPress(d.pl) }), d => ({ dir: "straight", tp: FL.perfectPress(d.pl) + 70 }),
    () => null, () => null, d => ({ dir: "straight", tp: FL.perfectPress(d.pl) - 90 })];
  let now = 0, last = null;
  match.begin(0);
  for (let guard = 0; guard < 6000 && match.state.phase !== "done"; guard++, now += 16) {
    match.update(now);
    const d = match.current;
    if (d && d !== last) last = d;
    if (d && !d.press && match.state.phase === "play" && press[d.i](d) && now - d.T >= press[d.i](d).tp) match.swing(press[d.i](d).dir, now);
    scene.frame(match.state, now, { assist: true, scale: 1 });
  }
  for (let k = 0; k < 400; k++, now += 16) { match.update(now); scene.frame(match.state, now, { assist: false, scale: 1 }); }
  assert.deepEqual(bad, []);
  assert.equal(match.state.phase, "done");
  assert.ok(seen.draws > 800 && seen.calls > 100000);
  for (const [x, y, z] of seen.eyes) assert.ok(Math.abs(x) < 60 && y > 0.5 && y < 40 && Math.abs(z) < 60, `eye ${x},${y},${z}`);
});

test("the scene copes with a long stall (a backgrounded tab) and with reduced motion", () => {
  const { st, bad } = recorder(), scene = createScene(st, { reduced: true }), match = createMatch();
  match.begin(0);
  for (const now of [0, 100, 9000, 9016, 90000, 400000]) { match.update(now); scene.frame(match.state, now, { assist: true, scale: 0.5 }); }
  assert.deepEqual(bad, []);
  assert.equal(match.state.phase, "done");
});
