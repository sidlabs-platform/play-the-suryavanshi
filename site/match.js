// The match clock: what happens when, from the walk-out to the last ball. Pure functions of time: no DOM, no WebGL.
// Times are absolute milliseconds from whatever clock the caller uses, so a big jump forward lands in the right state.
import { OVER, bat, newInnings, runsAt } from "./rules.js";
import { GAP_MS, LEAD_MS, SWING_MS, ballAt, contactP, plan, shot as makeShot } from "./flight.js";

export const MISS_MS = 1500; // a missed ball keeps the scene busy this long before the next delivery

const delivery = (i, T) => {
  const pl = plan(i);
  // With no swing the ball simply arrives at the bat at tEnd, so that is when the result is known.
  return { i, pl, T, press: null, shot: null, pc: null, contact: null, runs: null, settled: false, settleAt: T + pl.tEnd, endAt: T + pl.tEnd + MISS_MS };
};

// phase: title -> lead (walk-out, or the pause between balls) -> play (one delivery and its aftermath) -> ... -> done
export function createMatch() {
  const m = { phase: "title", innings: newInnings(), deliveries: [], nextT: 0, chase: null }, queue = [];
  let over = newInnings();
  const current = () => m.deliveries.at(-1) ?? null;

  function advance(now) {
    for (let guard = 0; guard < 4 * (m.chase?.overs ?? 1) * OVER + 1; guard++) {
      const d = current();
      if (m.phase === "lead" && now >= m.nextT) {
        m.deliveries.push(delivery(m.deliveries.length, m.nextT)); m.phase = "play"; queue.push({ type: "start", at: m.nextT, d: current() });
      } else if (m.phase === "play" && !d.settled && now >= d.settleAt) {
        if (over.shots.length === OVER) over = newInnings();
        over = bat(over, d.press ? d.pc : 1); d.runs = over.shots.at(-1);
        m.innings = { shots: [...m.innings.shots, d.runs], runs: m.innings.runs + d.runs, sixes: m.innings.sixes + Number(d.runs === 6) };
        d.settled = true;
        if (m.chase && m.innings.runs >= m.chase.target) m.chase.outcome = "won";
        else if (m.chase && m.innings.shots.length === m.chase.overs * OVER) m.chase.outcome = "lost";
        queue.push({ type: "settle", at: d.settleAt, d });
      } else if (m.phase === "play" && d.settled && now >= d.endAt) {
        if (m.chase?.outcome || (!m.chase && d.i === OVER - 1)) { m.phase = "done"; queue.push({ type: "finish", at: d.endAt }); }
        else { m.phase = "lead"; m.nextT = d.endAt + GAP_MS; queue.push({ type: "lead", at: d.endAt, next: d.i + 1 }); }
      } else break;
    }
  }

  return {
    state: m,
    get current() { return current(); },
    begin(now, chase = null) {
      if (m.phase !== "title" && m.phase !== "done") return false;
      if (chase && (!Number.isInteger(chase.target) || chase.target < 1 || chase.target > 999 ||
        !Number.isInteger(chase.overs) || chase.overs < 1 || chase.overs > 10)) throw new RangeError("Invalid chase settings.");
      queue.length = 0; over = newInnings(); m.innings = newInnings(); m.deliveries = [];
      m.chase = chase ? { target: chase.target, overs: chase.overs, outcome: null } : null;
      m.phase = "lead"; m.nextT = now + LEAD_MS; return true;
    },
    setup() { if (m.phase !== "done") return false; m.phase = "title"; return true; },
    // Moves the clock to `now` and returns what happened on the way, in order.
    update(now) { advance(now); return queue.splice(0); },
    // A swing at `now` towards "off", "straight" or "leg". Returns the delivery, or null when the ball is not live.
    swing(dir, now) {
      advance(now);
      const d = current();
      if (m.phase !== "play" || d.press || d.settled || now - d.T >= d.pl.tEnd) return null;
      const tp = now - d.T, pc = contactP(d.pl, tp), runs = runsAt(pc), sh = runs > 0 ? makeShot(dir, runs, pc, d.pl) : null;
      // S is where the bat meets the ball; before release the ball is still in the bowler's hand, so aim at its release point.
      d.press = { tp, dir, shot: sh, S: ballAt(d.pl, Math.max(tp + SWING_MS, d.pl.tRelease)) };
      d.pc = pc; d.shot = sh; d.contact = d.T + tp + SWING_MS;
      d.settleAt = sh ? d.contact : Math.max(d.contact, d.T + d.pl.tEnd);
      d.endAt = d.settleAt + (sh ? sh.after : MISS_MS);
      return d;
    }
  };
}
