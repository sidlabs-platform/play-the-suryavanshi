import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { GAP_MS, LEAD_MS, SWING_MS, perfectPress, plan, shot } from "../../site/flight.js";
import { OVER, timing } from "../../site/rules.js";
import { prefix, serve } from "../../scripts/serve.js";

test("changing player mode after a completed duel clears match details and keeps an over summary", async () => {
  const server = serve().listen(0, "127.0.0.1");
  let browser;
  try {
    await once(server, "listening");
    browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
    const page = await browser.newPage();
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:10Z"));
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}?gl=off`);
    await page.evaluate(() => {
      const players = document.getElementById("players");
      players.checked = true;
      players.dispatchEvent(new Event("change"));
    });
    await page.clock.fastForward(40);

    const clock = () => page.evaluate(() => performance.now());
    const at = async time => {
      const ms = Math.round(time - await clock());
      if (ms > 0) await page.clock.fastForward(ms);
    };
    const playOver = async () => {
      const first = await clock();
      await page.keyboard.press("Space");
      let T = first + LEAD_MS;
      for (let i = 0; i < OVER; i++) {
        const pl = plan(i), pressAt = T + perfectPress(pl);
        await at(pressAt);
        await page.keyboard.press("Space");
        const contact = pressAt + SWING_MS;
        await at(contact + 50);
        T = contact + shot("straight", 6, timing.centre, pl).after + GAP_MS;
      }
      await at(T - GAP_MS + 50);
    };

    await playOver();
    assert.match(await page.locator("#detail").textContent(), /needs 37 to win/);
    await playOver();
    assert.equal(await page.locator("#detail").textContent(), "Scores level on 36: it's a tie!");

    await page.locator("#players").uncheck();
    assert.equal(await page.locator("#detail").textContent(), "");
    assert.equal(await page.locator("#rank").textContent(), "Six for six. Zero defects. Ship it.");
    assert.equal(await page.locator("#overOf").textContent(), "Over summary");

    await page.locator("#players").check();
    assert.equal(await page.locator("#detail").textContent(), "");
    assert.equal(await page.locator("#rank").textContent(), "Six for six. Zero defects. Ship it.");
    assert.equal(await page.locator("#overOf").textContent(), "Over summary");
    assert.equal(await page.locator("#action").textContent(), "Start match");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
