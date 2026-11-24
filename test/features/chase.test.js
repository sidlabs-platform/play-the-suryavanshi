import test from "node:test";
import assert from "node:assert/strict";
import { batChase, chaseState, newInnings } from "../../site/rules.js";

const play = positions => positions.reduce((innings, position) => batChase(innings, position), newInnings());

test("four on the sixth ball wins an exact 24-run chase", () => {
  const beforeLast = play([.65, .65, .65, .65, .65]);
  assert.deepEqual(chaseState(beforeLast), { runsRemaining: 4, ballsRemaining: 1, result: "playing" });
  const innings = batChase(beforeLast, .65);
  assert.deepEqual(innings.shots, [4, 4, 4, 4, 4, 4]);
  assert.deepEqual(chaseState(innings), { runsRemaining: 0, ballsRemaining: 0, result: "won" });
  assert.deepEqual(batChase(innings, .75), innings);
});

test("23 from six legal shots loses, without a seventh delivery", () => {
  const innings = play([.75, .65, .65, .65, .65, .57]);
  assert.deepEqual(innings.shots, [6, 4, 4, 4, 4, 1]);
  assert.equal(innings.runs, 23);
  assert.deepEqual(chaseState(innings), { runsRemaining: 1, ballsRemaining: 0, result: "lost" });
  assert.deepEqual(batChase(innings, .57), innings);
});

test("a chase ends as soon as the target is reached", () => {
  const innings = play([.75, .75, .75, .75]);
  assert.deepEqual(chaseState(innings), { runsRemaining: 0, ballsRemaining: 2, result: "won" });
  assert.deepEqual(batChase(innings, .75), innings);
});
