import test from "node:test";
import assert from "node:assert/strict";
import { bat, newInnings, bowlerAt, runsAt, timing } from "../site/rules.js";

test("six legal centre strikes earn 36 runs, with no seventh ball", () => {
  let card = newInnings(); for(let n=0;n<6;n++) card=bat(card,timing.centre);
  assert.deepEqual(card,{runs:36,sixes:6,shots:[6,6,6,6,6,6]});
  assert.deepEqual(bat(card,timing.centre),card);
});
test("three bowlers deliver two balls each with distinct flight times", () => {
  const spells = Array.from({length:6},(_,n)=>bowlerAt(n));
  assert.deepEqual(spells.map(b=>b.name),["Kite","Kite","Comet","Comet","Orbit","Orbit"]);
  assert.equal(new Set(spells.map(b=>b.flight)).size,3);
});
test("a missed ball, a single, a four and a six are distinct", () => {
  assert.deepEqual([1,.57,.65,.75].map(runsAt),[0,1,4,6]);
  assert.throws(()=>runsAt(NaN),RangeError);
});
