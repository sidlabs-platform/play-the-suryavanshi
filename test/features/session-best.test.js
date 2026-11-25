import assert from "node:assert/strict";
import test from "node:test";
import { recordBest } from "../../site/session-best.js";

test("session best records the first over and a higher over", () => {
  assert.equal(recordBest(0, 12), 12);
  assert.equal(recordBest(12, 36), 36);
});

test("session best retains an equal score", () => {
  assert.equal(recordBest(24, 24), 24);
});

test("DEMO: a lower over must not replace the session best (intentional failure)", () => {
  assert.equal(recordBest(36, 6), 36);
});
