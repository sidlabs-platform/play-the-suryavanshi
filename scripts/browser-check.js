import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { serve, prefix } from "./serve.js";
import { bowlerAt, timing } from "../site/rules.js";

const server = serve().listen(0,"127.0.0.1"); let browser;
try {
  await once(server,"listening"); browser = await chromium.launch();
  const page = await browser.newPage({ viewport: {width: 375,height: 780}, reducedMotion:"reduce" });
  const errors = []; page.on("pageerror",error=>errors.push(error.message));
  await page.clock.install({time:new Date("2026-01-01T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-01-01T00:00:10Z"));
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.getByRole("button",{name:"Walk out to bat"}).focus();
  await page.keyboard.press("Space");
  for (let n=0;n<6;n++) {
    assert.match(await page.locator("#bowler").innerText(),new RegExp(bowlerAt(n).name));
    await page.clock.runFor(Math.round(bowlerAt(n).flight * timing.centre));
    await page.keyboard.press("Space"); await page.keyboard.press("Space");
    assert.equal(await page.locator("#sixes").innerText(),String(n+1));
    await page.clock.runFor(1060);
  }
  // One further frame may be needed after the last dead ball.
  await page.clock.runFor(20);
  assert.equal(await page.locator("#call").innerText(),"Over complete: 36 runs!");
  assert.equal(await page.locator("#shots li.six").count(),6);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole("button",{name:"Bat again"}).click();
  assert.equal(await page.locator("#runs").innerText(),"0");
  assert.deepEqual(errors,[]); process.stdout.write("Player journey: six earned sixes, three bowlers, replay reset. PASS\n");
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
