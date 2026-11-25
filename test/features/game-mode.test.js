import test from "node:test";
import assert from "node:assert/strict";
import { GAP_MS, LEAD_MS, SWING_MS, perfectPress, plan, shot } from "../../site/flight.js";
import { OVER, timing } from "../../site/rules.js";

test("changing player mode after an over clears match details and keeps an over summary", async t => {
  class Element extends EventTarget {
    constructor() {
      super();
      this.textContent = "";
      this.style = { setProperty() {} };
      this.dataset = {};
      this.classList = { add() {} };
    }
    setAttribute() {}
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children = children; }
  }
  const elements = new Map(), body = new Element(), events = new EventTarget();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const doc = new EventTarget();
  Object.assign(doc, {
    body, activeElement: body, getElementById: get,
    createElement: () => new Element(), createElementNS: () => new Element()
  });
  let time = 0, frame;
  const globals = {
    document: doc, location: { search: "?gl=off" },
    matchMedia: () => ({ matches: true }), performance: { now: () => time },
    requestAnimationFrame: callback => { frame = callback; },
    addEventListener: events.addEventListener.bind(events)
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  await import("../../site/game.js");

  const key = code => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "code", { value: code });
    events.dispatchEvent(event);
  };
  const at = value => { time = value; frame(); };
  const toggle = checked => { get("players").checked = checked; get("players").dispatchEvent(new Event("change")); };
  const playOver = () => {
    key("Space");
    let T = time + LEAD_MS;
    for (let i = 0; i < OVER; i++) {
      const pl = plan(i), pressAt = T + perfectPress(pl);
      at(pressAt); key("Space");
      const contact = pressAt + SWING_MS;
      at(contact + 50);
      T = contact + shot("straight", 6, timing.centre, pl).after + GAP_MS;
    }
    at(T - GAP_MS + 50);
  };
  const assertReset = () => {
    assert.equal(get("detail").textContent, "");
    assert.equal(get("rank").textContent, "Six for six. Zero defects. Ship it.");
    assert.equal(get("overOf").textContent, "Over summary");
  };

  toggle(true);
  playOver();
  assert.equal(get("best").textContent, "36");
  assert.match(get("detail").textContent, /needs 37 to win/);
  toggle(false);
  assertReset();
  toggle(true);
  assertReset();
  assert.equal(get("action").textContent, "Start match");
  playOver();
  playOver();
  assert.equal(get("detail").textContent, "Scores level on 36: it's a tie!");
  toggle(false);
  assertReset();
  toggle(true);
  assertReset();
  assert.equal(get("action").textContent, "Start match");
});
