import test from "node:test";
import assert from "node:assert/strict";
import { batChase, chaseState, newInnings } from "../../site/rules.js";
import { createMatch } from "../../site/match.js";
import { GAP_MS, LEAD_MS, SWING_MS, plan } from "../../site/flight.js";

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

function playMatch(positions, chase = true) {
  const match = createMatch(), events = [];
  assert.equal(match.begin(0, { chase }), true);
  let start = LEAD_MS;
  for (const [i, position] of positions.entries()) {
    events.push(...match.update(start));
    const pl = plan(i), press = start + pl.tBounce + pl.F * position - SWING_MS;
    const delivery = match.swing("straight", press);
    assert.ok(delivery, `ball ${i + 1} is live`);
    events.push(...match.update(delivery.settleAt));
    events.push(...match.update(delivery.endAt));
    start = delivery.endAt + GAP_MS;
  }
  events.push(...match.update(start + 100000));
  return { match, events };
}

test("match finishes an exact chase on ball six", () => {
  const { match, events } = playMatch([.65, .65, .65, .65, .65, .65]);
  assert.deepEqual(match.state.innings.shots, [4, 4, 4, 4, 4, 4]);
  assert.equal(chaseState(match.state.innings).result, "won");
  assert.equal(match.state.phase, "done");
  assert.equal(events.filter(e => e.type === "finish").length, 1);
  assert.equal(match.swing("straight", 1000000), null);
});

test("match loses a 23-run chase after six deliveries", () => {
  const { match, events } = playMatch([.75, .65, .65, .65, .65, .57]);
  assert.deepEqual(match.state.innings.shots, [6, 4, 4, 4, 4, 1]);
  assert.deepEqual(chaseState(match.state.innings), { runsRemaining: 1, ballsRemaining: 0, result: "lost" });
  assert.equal(match.state.deliveries.length, 6);
  assert.equal(events.filter(e => e.type === "finish").length, 1);
  assert.equal(match.swing("straight", 1000000), null);
});

test("match stops early on a win but free play continues", () => {
  const chase = playMatch([.75, .75, .75, .75]);
  assert.equal(chase.match.state.phase, "done");
  assert.equal(chase.match.state.deliveries.length, 4);
  assert.equal(chase.match.state.innings.runs, 24);
  assert.equal(chase.events.filter(e => e.type === "finish").length, 1);
  const free = playMatch([.75, .75, .75, .75, .75, .75], false);
  assert.equal(free.match.state.deliveries.length, 6);
  assert.equal(free.match.state.innings.runs, 36);
});
