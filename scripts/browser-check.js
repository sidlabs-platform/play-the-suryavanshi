// The CI journey: play a real over in headless Chromium against the same static files Pages serves.
// A fake clock puts every swing exactly where the timing strip says, so the run is the same on a slow software renderer as on a laptop.
import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { GAP_MS, LEAD_MS, SWING_MS, perfectPress, plan, shot, stumpsHit } from "../site/flight.js";
import { MISS_MS } from "../site/match.js";
import { OVER, timing } from "../site/rules.js";
import { prefix, serve } from "./serve.js";

// Runners have no GPU. SwiftShader gives them a software WebGL 2, and these flags let headless Chromium use it.
const GL_FLAGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const DESKTOP = { width: 1280, height: 720 }, PHONE = { width: 375, height: 780 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// plan: one entry per ball. A key to press (desktop), a button to tap (phone), or null to leave the ball alone.
const JOURNEYS = [
  { name: "desktop, full quality", viewport: DESKTOP, query: "", render: "webgl", plan: [] },
  { name: "desktop, 3D stadium", viewport: DESKTOP, query: "?q=low", render: "webgl", plan: ["Space", "ArrowRight", "ArrowLeft", "ArrowUp", null, "Space"] },
  { name: "phone, 3D stadium, reduced motion", viewport: PHONE, phone: true, motion: "reduce", query: "?q=low", render: "webgl", plan: ["#action", "#leg", "#off", "#leg", "#off", "#action"] },
  { name: "phone, lite mode", viewport: PHONE, phone: true, query: "?gl=off", render: "dom", plan: ["#leg", "#action", "#off", "#action", "#leg", "#off"] },
];

async function play(browser, origin, { name, viewport, phone = false, motion = "no-preference", query, render, plan: balls }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: motion, isMobile: phone, hasTouch: phone });
  const page = await context.newPage(), problems = [];
  const is = (actual, expected, what) => assert.deepEqual(actual, expected, `${name}: ${what}`);
  page.on("pageerror", error => problems.push(`page error: ${error.message}`));
  page.on("console", message => { if (message.type() === "error" && !/ReadPixels|GPU stall/.test(message.text())) problems.push(`console error: ${message.text()}`); });

  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:10Z"));
  await page.goto(`${origin}${prefix}${query}`);
  await page.waitForSelector('body[data-render="webgl"], body[data-render="dom"]', { timeout: 30_000 });
  await page.clock.fastForward(40);

  // With the clock paused, never poll the page (waitForFunction, expect().toHaveText): read it, then move the clock yourself.
  const clock = () => page.evaluate(() => performance.now());
  const at = async t => { const ms = Math.round(t - await clock()); if (ms > 0) await page.clock.fastForward(ms); };
  const hud = () => page.evaluate(() => {
    const text = id => document.getElementById(id).textContent.trim(), root = document.documentElement;
    return {
      render: document.body.dataset.render, notice: text("notice"), runs: text("runs"), sixes: text("sixes"), ball: text("ball"), call: text("call"),
      bowler: text("bowler"), action: text("action"), total: text("total"), rank: text("rank"),
      ready: document.getElementById("action").getAttribute("aria-disabled") === "false",
      chips: [...document.querySelectorAll("#shots li")].map(chip => chip.getAttribute("aria-label")),
      sixChips: document.querySelectorAll("#shots li.six").length,
      spills: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight + 1,
    };
  });
  const press = async entry => {
    if (!phone) return page.keyboard.press(entry);
    const { x, y, hit } = await page.evaluate(selector => {
      const box = document.querySelector(selector).getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      return { x, y, hit: Boolean(document.elementFromPoint(x, y)?.closest(selector)) };
    }, entry);
    assert(hit, `${name}: ${entry} is covered by something else, so a thumb cannot reach it`);
    await page.touchscreen.tap(x, y);
  };
  // A drawn stadium is 5 to 10 times heavier as a PNG than the bare page behind it; a blank or transparent canvas is not.
  const painted = async when => {
    if (render !== "webgl") return;
    await sleep(400); // let the software renderer present the frame
    const box = await page.evaluate(() => { const { x, y, width, height } = document.getElementById("view").getBoundingClientRect(); return { x, y, width, height }; });
    const weigh = async css => {
      const style = await page.addStyleTag({ content: css });
      await sleep(200);
      const { length } = await page.screenshot({ clip: box });
      await style.evaluate(node => node.remove());
      return length;
    };
    const stadium = await weigh(".hud{visibility:hidden!important}"), bare = await weigh(".hud,#view{visibility:hidden!important}");
    assert(stadium > 2 * bare, `${name}: the 3D stadium looks blank ${when} (${stadium} bytes, the bare page is ${bare})`);
  };
  const start = phone ? "#action" : "Space";

  let h = await hud();
  is(h.render, render, "rendering mode");
  is(h.notice === "", render === "webgl", `notice text is "${h.notice}"`);
  is(h.action, "Walk out to bat", "title button");
  is(h.spills, false, "the title screen scrolls");
  await painted("at the title");

  if (balls.length) {
    const first = await clock();
    await press(start);
    is((await hud()).call, "Vaibhav takes guard…", "walking out");

    let T = first + LEAD_MS, runs = 0, sixes = 0;
    for (const [i, entry] of balls.entries()) {
      const pl = plan(i), pressAt = T + perfectPress(pl);
      await at(T + pl.tBounce / 2);
      h = await hud();
      is(h.call, `${pl.bowler.name} bowls…`, `ball ${i + 1} call`);
      is([h.action, h.ready], ["Swing!", true], `ball ${i + 1} button`);
      assert(h.bowler.includes(pl.bowler.name), `${name}: ball ${i + 1} bowler card says "${h.bowler}"`);

      if (entry === null) { // no swing: the over carries on, and Orbit Spin hits the stumps
        await at(T + pl.tEnd + 50);
        is((await hud()).call, stumpsHit(pl) ? "Timber!" : "Dot ball.", `ball ${i + 1} left alone`);
        T += pl.tEnd + MISS_MS + GAP_MS;
        continue;
      }
      await at(pressAt); await press(entry);
      h = await hud();
      is([h.action, h.ready], ["Ball dead", false], `ball ${i + 1} button after the swing`);
      const contact = pressAt + SWING_MS;
      await at(contact + 50);
      h = await hud(); runs += 6; sixes += 1;
      is([h.call, h.sixes, h.runs], ["SIX! Into the stands!", String(sixes), String(runs)], `ball ${i + 1} result`);
      T = contact + shot("straight", 6, timing.centre, pl).after + GAP_MS;
    }

    await at(T - GAP_MS + 50); // the last ball has settled
    h = await hud();
    is(h.call, `Over complete: ${runs} runs!`, "end of the over");
    is([h.action, h.ready, h.total, h.ball], ["Bat again", true, String(runs), `${OVER} / ${OVER}`], "scorecard");
    is(h.sixChips, sixes, "six chips");
    is(h.chips, balls.map((entry, i) => `Ball ${i + 1}: ${entry === null ? 0 : 6}`), "ball chips");
    assert(h.rank !== "", `${name}: no rank line`);
    is(h.spills, false, "the scorecard scrolls");
    await painted("at the end of the over");

    await press(start);
    h = await hud();
    is([h.runs, h.ball, h.call], ["0", `1 / ${OVER}`, "Vaibhav takes guard…"], "bat again");
    assert(h.chips.every(label => label.endsWith("not bowled")), `${name}: bat again left old chips behind`);
    await at(await clock() + LEAD_MS + 300);
    is((await hud()).call, `${plan(0).bowler.name} bowls…`, "the next over starts bowling");
  }

  is((await hud()).render, render, "still rendering the same way at the end");
  is(problems, [], "console and page errors");
  await context.close();
}

// A hung step must fail the job, not hold the runner for hours.
setTimeout(() => { console.error("browser check: gave up after 5 minutes"); process.exit(1); }, 300_000).unref();

const server = serve().listen(0, "127.0.0.1");
let browser;
try {
  await once(server, "listening");
  browser = await chromium.launch({ args: GL_FLAGS });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const journey of JOURNEYS) {
    const began = Date.now();
    await play(browser, origin, journey);
    process.stdout.write(`ok  ${journey.name} (${((Date.now() - began) / 1000).toFixed(1)}s)\n`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
