// The game: the clock, the controls and the scoreboard. The rules live in rules.js, the timeline in match.js, the picture in scene.js.
import { OVER, timing } from "./rules.js";
import { FIELD, contactP, plan, stumpsHit } from "./flight.js";
import { createMatch } from "./match.js";
import { createSound } from "./sound.js";
import { recordBest } from "./session-best.js";
import { batter, complete, describe, newDuel, record, verdict } from "./duel.js";

const $ = id => document.getElementById(id);
const el = Object.fromEntries("view runs sixes ball shots bowler speed call detail tip action off leg marker fourZone sixZone guide mute notice total rank wheel spokes players strike duel board overOf best".split(" ").map(id => [id, $(id)]));
const body = document.body, query = new URLSearchParams(location.search), low = query.get("q") === "low";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const match = createMatch(), m = match.state, sound = createSound(), heard = new Set();
let scene = null, guide = el.guide.checked, scale = low ? 0.6 : 1, duel = newDuel(el.players.checked ? 2 : 1);
let best = 0;

for (const [id, radius] of [["fourZone", timing.four], ["sixZone", timing.six]]) {
  el[id].style.left = `${100 * (timing.centre - radius)}%`;
  el[id].style.width = `${200 * radius}%`;
}

// --- the clock: it stops while the tab is hidden, so a ball in flight waits for you instead of playing itself out
let offset = 0, hiddenAt = null;
const now = () => performance.now() - offset;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = performance.now();
  else if (hiddenAt != null) { offset += performance.now() - hiddenAt; hiddenAt = null; }
});

// --- small writers: only touch the page when a value changed
const put = (node, value) => { value = String(value); if (node.textContent !== value) node.textContent = value; };
const action = (label, enabled) => { put(el.action, label); el.action.setAttribute("aria-disabled", String(!enabled)); };
const sides = on => { for (const b of [el.off, el.leg]) b.setAttribute("aria-disabled", String(!on)); };
const bowled = d => stumpsHit(d.pl) && !d.shot;

function say(text, kind, fresh) {
  put(el.call, text);
  if (kind) body.dataset.call = kind; else delete body.dataset.call;
  if (fresh && !reduced) el.call.animate?.([{ transform: "scale(.88)", opacity: 0.3 }, { transform: "scale(1)", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.3)" });
}
function card(pl) {
  put(el.bowler, `${pl.bowler.name} · ${pl.bowler.style}`); put(el.speed, `${pl.prof.kmh} km/h`);
  body.style.setProperty("--b", pl.bowler.color);
}
function renderCard() {
  const { runs, sixes, shots } = m.innings;
  put(el.runs, runs); put(el.sixes, sixes); put(el.ball, `${Math.min(shots.length + 1, OVER)} / ${OVER}`);
  el.shots.replaceChildren(...Array.from({ length: OVER }, (_, i) => {
    const chip = document.createElement("li"), runs = shots[i];
    chip.textContent = runs ?? "–";
    if (runs === 6) chip.classList.add("six"); else if (runs === 4) chip.classList.add("four"); else if (runs > 0) chip.classList.add("run");
    chip.setAttribute("aria-label", `Ball ${i + 1}: ${runs ?? "not bowled"}`); return chip;
  }));
}

// --- two-player match: whose over it is, and the totals side by side on the same scoreboard
const duo = () => duel.players === 2, who = () => duo() ? `Player ${batter(duel) + 1}` : "Vaibhav";
function renderDuel() {
  body.dataset.players = String(duel.players);
  put(el.overOf, m.phase === "done" ? "Over summary" : duo() ? `Player ${batter(duel) + 1}’s over` : "Your over");
  if (!duo()) { put(el.strike, "On strike"); el.board.replaceChildren(); return; }
  const live = m.phase !== "title" && !complete(duel) && m.phase !== "done" ? m.innings.runs : null, n = batter(duel), v = verdict(duel);
  const score = i => duel.totals[i] ?? (i === n && live != null ? live : null);
  put(el.strike, `P${n + 1} on strike`);
  put(el.duel, [0, 1].map(i => `P${i + 1} ${score(i) ?? "–"}`).join(" · "));
  el.board.replaceChildren(...[0, 1].map(i => {
    const row = document.createElement("li"), name = document.createElement("span"), runs = document.createElement("b");
    name.textContent = `Player ${i + 1}`; runs.textContent = duel.totals[i] ?? "yet to bat";
    if (v && v.winner === i) row.classList.add("win");
    if (!v && i === duel.totals.length) row.classList.add("now");
    row.append(name, runs); return row;
  }));
}
function setPlayers(two) {
  if (m.phase !== "title" && m.phase !== "done") { el.players.checked = duo(); return; }
  el.players.checked = two; duel = newDuel(two ? 2 : 1); renderDuel();
  if (m.phase === "done") {
    put(el.detail, ""); put(el.rank, rank(Number(el.total.textContent)));
    action(two ? "Start match" : "Bat again", true); put(el.tip, two ? "Player 1 bats first." : "");
  }
}

// --- what the commentary says about a settled ball
const near = (x, z) => FIELD.reduce((a, f) => Math.hypot(f.at[0] - x, f.at[1] - z) < Math.hypot(a.at[0] - x, a.at[1] - z) ? f : a).name;
const feel = (kind, off) => Math.abs(off) < 0.012 ? "Perfect timing" : kind === "six" ? "Middled it" : kind === "four" ? `A touch ${off < 0 ? "early" : "late"}` : `Mistimed ${off < 0 ? "early" : "late"}`;
function result(d) {
  const sh = d.shot, off = d.pc - timing.centre;
  if (sh) {
    const [x, , z] = sh.end, side = Math.abs(x) < 9 && z < -30 ? null : near(x, z), how = feel(sh.kind, off);
    if (sh.kind === "six") return ["SIX! Into the stands!", `${Math.round(Math.hypot(x - sh.from[0], z - sh.from[2]))} m · ${side ? `over ${side}` : "straight down the ground"} · ${how}`, "six"];
    if (sh.kind === "four") return ["FOUR! Through the gap!", `${side ? `Past ${side}` : "Straight past the bowler"} · ${how}`, "four"];
    return ["Quick single!", `Pushed to ${side ?? "mid-on"} · ${how}`, "single"];
  }
  if (bowled(d)) return ["Timber!", "Bowled him! Arcade rules: no wickets, no problem.", "dot"];
  return ["Dot ball.", !d.press ? "No shot offered." : d.pc < 0.3 ? "Way too early" : d.pc < timing.centre ? "Too early" : "Too late", "dot"];
}
const rank = r => r === 36 ? "Six for six. Zero defects. Ship it." : r >= 25 ? "Merge-ready — just one flaky test." : r >= 13 ? "Needs review. Several comments." : r > 0 ? "Tests failing. Back to the nets." : "Build failed. Did you press anything?";
const cheer = { six: sound.six, four: sound.four, single: sound.single, dot: sound.miss };

// --- wagon wheel: bowler at the top, off side on the left, one spoke per shot
const mark = (tag, attrs) => { const node = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; };
function renderWheel() {
  const settled = m.deliveries.filter(d => d.settled), marks = [];
  let dots = 0;
  for (const { shot: sh } of settled) {
    if (!sh) { marks.push(mark("circle", { cx: (dots++ - 2.5) * 9, cy: 24, r: 3, fill: "#ff6b57" })); continue; }
    const len = { six: 88, four: 72 }[sh.kind] ?? 30, stroke = { six: "#ffc93c", four: "#5df2b0" }[sh.kind] ?? "#fff";
    marks.push(mark("line", { x1: 0, y1: 0, x2: (Math.sin(sh.psi) * len).toFixed(1), y2: (-Math.cos(sh.psi) * len).toFixed(1), stroke }));
  }
  el.spokes.replaceChildren(...marks);
  const count = r => settled.filter(d => d.runs === r).length;
  el.wheel.setAttribute("aria-label", `Wagon wheel: ${count(6)} sixes, ${count(4)} fours, ${count(1)} singles, ${count(0)} dot balls`);
}

// --- the match, as the page sees it
function begin() {
  if (m.phase === "done" && complete(duel)) duel = newDuel(duel.players);
  if (!match.begin(now())) return;
  el.players.disabled = true;
  heard.clear(); card(plan(0)); renderCard(); renderWheel(); renderDuel();
  say(`${who()} takes guard…`); put(el.detail, ""); put(el.tip, "Get set. Swing with ← ↑ → as the ball crosses the gold strip.");
  action("Taking guard…", false); sides(false); sound.tick();
}
function swing(dir) {
  if (!match.swing(dir, now())) return;
  sound.swish(); action("Ball dead", false); sides(false);
}
const act = () => m.phase === "title" || m.phase === "done" ? begin() : swing("straight");

function handle(e, n) {
  const fresh = n - e.at < 500; // after a long stall the scoreboard catches up quietly
  if (e.type === "start") {
    const { bowler } = e.d.pl;
    card(e.d.pl); say(`${bowler.name} bowls…`, null, fresh); put(el.detail, ""); put(el.tip, bowler.release); action("Swing!", true); sides(true);
  } else if (e.type === "settle") {
    const d = e.d, [call, detail, kind] = result(d);
    renderCard(); renderWheel(); renderDuel(); say(call, kind, fresh); put(el.detail, detail);
    action("Ball dead", false); sides(false); put(el.tip, d.i === OVER - 1 ? "The scorer is adding it up." : "Get set for the next delivery.");
    if (fresh && !(kind === "dot" && bowled(d))) cheer[kind]();
    if (fresh && kind === "six" && !reduced) navigator.vibrate?.(40);
  } else if (e.type === "lead") {
    card(plan(e.next));
  } else if (e.type === "finish") {
    const { runs, sixes } = m.innings;
    best = recordBest(best, runs); put(el.best, best);
    const name = who();
    if (duo()) duel = record(duel, runs);
    el.players.disabled = false;
    say(`Over complete: ${runs} runs!`, null, fresh); put(el.detail, ""); put(el.tip, `${name} hit ${sixes} ${sixes === 1 ? "six" : "sixes"}.`);
    put(el.total, runs); put(el.rank, rank(runs)); sides(false);
    if (!duo()) action("Bat again", true);
    else if (!complete(duel)) { action(`Player ${batter(duel) + 1} bats`, true); put(el.detail, `Player ${batter(duel) + 1} needs ${runs + 1} to win`); }
    else { action("New match", true); put(el.detail, describe(duel)); put(el.rank, describe(duel)); }
    renderDuel();
  }
}

// Sounds that belong to the ball rather than to the bat: the bounce, and the stumps going over.
function ambient(n) {
  const d = match.current;
  if (m.phase !== "play" || !d) return;
  const once = (key, at, play) => { if (n < at || heard.has(key)) return; heard.add(key); if (n - at < 400) play(); };
  once(`${d.i}:bounce`, d.T + d.pl.tBounce, sound.bounce);
  once(`${d.i}:wicket`, d.T + d.pl.tBounce + d.pl.F * (-d.pl.zb / d.pl.L), () => { if (bowled(d)) sound.bowled(); });
}

function paint(n) {
  const d = match.current, p = m.phase === "play" && d ? (d.press ? d.pc : contactP(d.pl, n - d.T)) : 0, left = `${(p * 100).toFixed(2)}%`;
  if (el.marker.style.left !== left) el.marker.style.left = left;
  if (body.dataset.phase !== m.phase) body.dataset.phase = m.phase;
}

// --- the picture: WebGL when the browser has it, otherwise the same game with the scoreboard doing the talking
function fallback(why) {
  scene = null; body.dataset.render = "dom"; put(el.notice, why);
}
async function boot() {
  if (query.get("gl") === "off") return fallback("The 3D stadium is switched off (?gl=off). Same rules, same timing.");
  try {
    const [{ createStadium }, { createScene }] = await Promise.all([import("./stadium.js"), import("./scene.js")]);
    const stadium = createStadium(el.view, { low, onLost: () => fallback("The 3D stadium was interrupted, so you’re in lite mode. Same rules, same timing.") });
    scene = createScene(stadium, { reduced }); body.dataset.render = "webgl";
  } catch (error) {
    console.warn(error); fallback("This browser can’t draw the 3D stadium (it needs WebGL 2), so you’re in lite mode. Same rules, same timing.");
  }
}

let wall = performance.now(), avg = 16, slow = 0;
function loop() {
  requestAnimationFrame(loop);
  const n = now(), clock = performance.now(), dt = clock - wall; wall = clock;
  for (const e of match.update(n)) handle(e, n);
  ambient(n); paint(n);
  if (!scene) return;
  try { scene.frame(m, n, { assist: guide, scale }); } catch (error) { console.warn(error); fallback("The 3D stadium hit a problem, so you’re in lite mode. Same rules, same timing."); return; }
  if (dt < 250) { // a slow GPU, not a stalled tab: trade sharpness for smoothness, never the other way round
    avg += (dt - avg) * 0.1; slow = avg > 40 ? slow + 1 : 0;
    if (slow > 20 && scale > 0.5) { scale = Math.max(0.5, scale * 0.85); slow = 0; }
  }
}

// --- controls
const KEYS = { ArrowUp: "straight", KeyW: "straight", ArrowLeft: "off", KeyA: "off", ArrowRight: "leg", KeyD: "leg" };
const togglePlayers = () => setPlayers(!el.players.checked);
const toggleGuide = () => { el.guide.checked = !el.guide.checked; guide = el.guide.checked; };
const toggleSound = () => { const muted = sound.toggle(); el.mute.setAttribute("aria-pressed", String(!muted)); };
const restsOn = a => a === body || a === el.action;
addEventListener("keydown", event => {
  sound.unlock();
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const a = document.activeElement;
  // Space is the swing only where it would not already mean something else (a focused checkbox or button keeps its own Space).
  if (event.code === "Space" && restsOn(a)) { event.preventDefault(); if (!event.repeat) act(); return; }
  if (event.repeat) return;
  const dir = KEYS[event.code];
  if (dir) { if (restsOn(a) || a?.tagName === "BUTTON" || a === el.guide) { event.preventDefault(); swing(dir); } }
  else if (event.code === "KeyT") toggleGuide();
  else if (event.code === "KeyM") toggleSound();
  else if (event.code === "KeyP") togglePlayers();
});
addEventListener("keyup", event => { if (event.code === "Space" && restsOn(document.activeElement)) event.preventDefault(); });
for (const type of ["pointerdown", "touchend", "click"]) addEventListener(type, () => sound.unlock(), { capture: true, passive: true });

// A swing happens on pointerdown, not on click: waiting for the finger to lift costs the timing. A click with no pointer behind it
// (Enter on a focused button, a screen reader, a script) still works.
for (const [id, press] of [["off", () => swing("off")], ["action", act], ["leg", () => swing("leg")]]) {
  el[id].addEventListener("pointerdown", event => { if (event.button > 0) return; event.preventDefault(); press(); });
  el[id].addEventListener("click", event => { if (event.detail === 0) press(); });
}
el.view.addEventListener("pointerdown", event => {
  if (event.button > 0) return;
  if (m.phase === "title") return act();
  const box = el.view.getBoundingClientRect(), x = (event.clientX - box.left) / box.width;
  swing(x < 1 / 3 ? "off" : x > 2 / 3 ? "leg" : "straight");
});
el.guide.addEventListener("change", () => { guide = el.guide.checked; });
el.players.addEventListener("change", () => setPlayers(el.players.checked));
el.mute.addEventListener("click", toggleSound);

card(plan(0)); renderCard(); renderWheel(); renderDuel(); body.dataset.phase = m.phase;
requestAnimationFrame(loop); boot();
