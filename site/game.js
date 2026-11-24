import { OVER, bat, batChase, bowlerAt, chaseState, newInnings, timing } from "./rules.js";

const $ = id => document.getElementById(id);
let innings = newInnings(), phase = "ready", release = 0, nextAt = 0, frame = 0, impact = 0, challenge = false;
const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
for (const [id, radius] of [["fourZone", timing.four], ["sixZone", timing.six]]) {
  $(id).style.left = `${100 * (timing.centre - radius)}%`;
  $(id).style.width = `${radius * 200}%`;
}
function renderCard() {
  $("runs").textContent = innings.runs;
  $("sixes").textContent = innings.sixes;
  $("ball").textContent = `${Math.min(innings.shots.length + 1, OVER)} / ${OVER}`;
  $("chase").hidden = !challenge;
  if (challenge) {
    const { runsRemaining, ballsRemaining } = chaseState(innings);
    $("chase").textContent = `${runsRemaining} ${runsRemaining === 1 ? "run" : "runs"} needed from ${ballsRemaining} ${ballsRemaining === 1 ? "ball" : "balls"}`;
  }
  $("shots").replaceChildren(...Array.from({length: OVER}, (_, i) => {
    const chip = document.createElement("li"), runs = innings.shots[i];
    chip.textContent = runs ?? "–"; if (runs === 6) chip.classList.add("six");
    chip.setAttribute("aria-label", `Ball ${i + 1}: ${runs ?? "not bowled"}`); return chip;
  }));
}
function paint(position, loft = 0) {
  $("marker").style.left = `${position * 100}%`;
  const travel = Math.min(1, position / timing.centre);
  $("delivery").setAttribute("cx", 202 + travel * 406 - loft * 220);
  $("delivery").setAttribute("cy", 84 + travel * 39 - (motion ? Math.sin(travel * Math.PI) * 26 : 0) - loft * 120);
  $("bat").setAttribute("transform", loft > 0 ? "rotate(-70 608 114)" : "");
}
function bowl(now) {
  phase = "flight"; release = now;
  const bowler = bowlerAt(innings.shots.length);
  $("bowler").textContent = `${bowler.name} · ${bowler.style}`;
  $("bowlerFigure").setAttribute("stroke", bowler.color);
  $("bowlerFigure").querySelector("circle").setAttribute("fill", bowler.color);
  $("call").textContent = `${bowler.name} bowls…`; $("tip").textContent = bowler.release;
  $("action").textContent = "Swing!"; $("action").setAttribute("aria-disabled", "false"); paint(0);
}
function positionAt(now) {
  return Math.max(0, Math.min(1, (now - release) / bowlerAt(innings.shots.length).flight));
}
function settle(position, now) {
  innings = (challenge ? batChase : bat)(innings, position); impact = position; renderCard();
  const runs = innings.shots.at(-1);
  $("call").textContent = ["Dot ball.", "Quick single!"][runs] ?? (runs === 6 ? "SIX! Into the stands!" : "FOUR! Through the gap!");
  phase = "between"; nextAt = now + 1050;
  $("action").textContent = "Ball dead"; $("action").setAttribute("aria-disabled", "true");
  $("tip").textContent = innings.shots.length === OVER || (challenge && chaseState(innings).result !== "playing") ? "The scorer is adding it up." : "Get set for the next delivery.";
  paint(position);
}
function tick(now) {
  if (phase === "flight") {
    const pos = positionAt(now); paint(pos);
    if (pos === 1) settle(1, now);
  } else if (phase === "between") {
    if (motion && innings.shots.at(-1) === 6) paint(impact, 1 - Math.max(0, nextAt - now) / 1050);
    if (now >= nextAt) {
      if (innings.shots.length < OVER && (!challenge || chaseState(innings).result === "playing")) bowl(now);
      else {
        phase = "done";
        $("call").textContent = challenge ? (chaseState(innings).result === "won" ? "Chase won!" : "Chase lost.") : `Over complete: ${innings.runs} runs!`;
        $("chaseMode").disabled = false;
        $("action").textContent = "Bat again"; $("action").setAttribute("aria-disabled", "false");
        $("tip").textContent = `Vaibhav hit ${innings.sixes} ${innings.sixes === 1 ? "six" : "sixes"}.`;
      }
    }
  }
  if (phase === "flight" || phase === "between") frame = requestAnimationFrame(tick);
}
function act() {
  const now = performance.now();
  if (phase === "flight") settle(positionAt(now), now);
  else if (phase === "ready" || phase === "done") {
    cancelAnimationFrame(frame); challenge = $("chaseMode").checked; $("chaseMode").disabled = true;
    innings = newInnings(); renderCard(); bowl(now); frame = requestAnimationFrame(tick);
  }
}
$("action").addEventListener("click", act);
window.addEventListener("keydown", event => {
  if (event.code !== "Space" || ![document.body, $("action")].includes(document.activeElement)) return;
  event.preventDefault(); if (!event.repeat) act();
});
renderCard(); paint(0);
