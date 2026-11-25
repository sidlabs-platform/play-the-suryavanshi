import test from "node:test";
import assert from "node:assert/strict";
import { batter, complete, describe, newDuel, record, verdict } from "../../site/duel.js";
import { bat, newInnings, timing } from "../../site/rules.js";

const over = positions => positions.reduce(bat, newInnings()).runs;

test("players take turns: player 1 bats, then player 2, then the match is over", () => {
  let duel = newDuel(2);
  assert.equal(batter(duel), 0); assert.equal(complete(duel), false); assert.equal(verdict(duel), null);
  duel = record(duel, over([timing.centre, timing.centre, 1, 1, 1, 1]));
  assert.equal(batter(duel), 1); assert.equal(complete(duel), false); assert.equal(describe(duel), "");
  duel = record(duel, over([timing.centre, 1, 1, 1, 1, 1]));
  assert.equal(complete(duel), true);
  assert.deepEqual(duel.totals, [12, 6]);
  assert.deepEqual(record(duel, 36), duel, "no third innings");
});

test("the higher total wins by the run margin, and equal totals tie", () => {
  assert.deepEqual(verdict({ players: 2, totals: [12, 13] }), { winner: 1, margin: 1 });
  assert.equal(describe({ players: 2, totals: [12, 13] }), "Player 2 wins by 1 run!");
  assert.equal(describe({ players: 2, totals: [36, 0] }), "Player 1 wins by 36 runs!");
  assert.deepEqual(verdict({ players: 2, totals: [0, 0] }), { winner: null, margin: 0 });
  assert.equal(describe({ players: 2, totals: [24, 24] }), "Scores level on 24: it's a tie!");
});

test("single-player mode never produces a match verdict", () => {
  const solo = record(newDuel(), 36);
  assert.equal(complete(solo), true); assert.equal(verdict(solo), null); assert.equal(describe(solo), "");
});
