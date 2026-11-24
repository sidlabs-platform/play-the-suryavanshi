import test from "node:test";
import assert from "node:assert/strict";
import { OVER, runsAt } from "../../site/rules.js";
import { LEAD_MS, perfectPress, plan } from "../../site/flight.js";
import { createClock } from "../../site/clock.js";
import { createMatch } from "../../site/match.js";

// Plays a whole over against a fake wall clock, swinging at the perfect moment on the game clock however slowly it runs.
function playOver(rate) {
  let real = 5000;
  const clock = createClock(() => real), match = createMatch();
  clock.setRate(rate);
  match.begin(clock.now());
  const started = real;
  for (let ball = 0; ball < OVER; ball++) {
    real += (match.state.nextT - clock.now()) / rate + 1; // wait for the release in real time (the +1 absorbs rounding)
    match.update(clock.now());
    const d = match.current;
    real += perfectPress(d.pl) / rate;
    assert.ok(match.swing("straight", clock.now()), `ball ${ball + 1} is live`);
    real += (d.endAt - clock.now()) / rate + 1;
    match.update(clock.now());
  }
  return { runs: match.state.innings.runs, phase: match.state.phase, realMs: real - started };
}

test("practice nets score the same over, but give twice the real time to play it", () => {
  const normal = playOver(1), nets = playOver(0.5);
  assert.deepEqual([normal.runs, nets.runs], [36, 36]);
  assert.deepEqual([normal.phase, nets.phase], ["done", "done"]);
  assert.ok(Math.abs(nets.realMs / normal.realMs - 2) < 0.01, `${nets.realMs} ms against ${normal.realMs} ms`);
});

test("a swing timed for normal pace is too early in the nets", () => {
  const swingAfter = (rate, realMs) => {
    let real = 5000;
    const clock = createClock(() => real), match = createMatch();
    clock.setRate(rate);
    match.begin(clock.now());
    real += realMs;
    const d = match.swing("straight", clock.now());
    return d ? runsAt(d.pc) : null; // null: the ball has not been bowled yet
  };
  const perfect = LEAD_MS + perfectPress(plan(0));
  assert.equal(swingAfter(1, perfect), 6);
  assert.equal(swingAfter(0.5, 2 * perfect), 6);
  assert.ok([null, 0].includes(swingAfter(0.5, perfect)));
});

test("changing the pace never makes the clock jump, and a hidden tab does not count", () => {
  let real = 1000;
  const clock = createClock(() => real);
  assert.equal(clock.now(), 1000, "at normal pace it reads like performance.now()");
  real = 1500; clock.setRate(0.5);
  assert.equal(clock.now(), 1500);
  real = 2500;
  assert.equal(clock.now(), 2000);
  clock.hide(); real = 90_000;
  assert.equal(clock.now(), 2000);
  clock.show(); real += 1000;
  assert.equal(clock.now(), 2500);
  clock.setRate(1); real += 100;
  assert.equal(clock.now(), 2600);
});
