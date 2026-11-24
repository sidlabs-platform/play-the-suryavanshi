import test from "node:test";
import assert from "node:assert/strict";
import { createMatch } from "../../site/match.js";
import { LEAD_MS, perfectPress } from "../../site/flight.js";

function deliver(match, position = "six") {
  const start = match.state.nextT;
  match.update(start);
  const d = match.current;
  if (position === "six") match.swing("straight", start + perfectPress(d.pl));
  match.update(d.settleAt);
  match.update(d.endAt);
}

test("a chase accumulates scores across overs and ends as soon as the target is reached", () => {
  const match = createMatch();
  match.begin(0, { target: 37, overs: 2 });
  assert.equal(match.state.nextT, LEAD_MS);
  for (let i = 0; i < 6; i++) deliver(match);
  assert.equal(match.state.innings.runs, 36);
  assert.equal(match.state.phase, "lead");
  deliver(match);
  assert.deepEqual(match.state.innings, { runs: 42, sixes: 7, shots: [6, 6, 6, 6, 6, 6, 6] });
  assert.equal(match.state.chase.outcome, "won");
  assert.equal(match.state.phase, "done");
  match.update(1e9);
  assert.equal(match.state.deliveries.length, 7);
});

test("a tied score below the target loses at the ball limit and a new chase resets the card", () => {
  const match = createMatch();
  match.begin(0, { target: 1, overs: 2 });
  match.update(1e9);
  assert.equal(match.state.phase, "done");
  assert.equal(match.state.chase.outcome, "lost");
  assert.equal(match.state.innings.shots.length, 12);
  assert.equal(match.state.innings.runs, 0);
  assert.equal(match.begin(1e9, { target: 6, overs: 1 }), true);
  assert.deepEqual(match.state.innings.shots, []);
  assert.equal(match.state.chase.outcome, null);
  deliver(match);
  assert.equal(match.state.chase.outcome, "won");
});

test("invalid settings are rejected and classic mode remains one over", () => {
  const match = createMatch();
  for (const settings of [{ target: 0, overs: 1 }, { target: 1, overs: 0 }, { target: 1, overs: 11 }, { target: 1.5, overs: 1 }]) {
    assert.throws(() => match.begin(0, settings), RangeError);
  }
  match.begin(0);
  match.update(1e9);
  assert.equal(match.state.phase, "done");
  assert.equal(match.state.innings.shots.length, 6);
  assert.equal(match.state.chase, null);
});
