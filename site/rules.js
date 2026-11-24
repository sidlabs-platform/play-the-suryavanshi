export const OVER = 6;
export const bowlers = Object.freeze([
  { name: "Kite", style: "Seam", color: "#66cdc4", flight: 1600, release: "Straight down the pitch." },
  { name: "Comet", style: "Pace", color: "#fb8b6f", flight: 1100, release: "Quick through the air." },
  { name: "Orbit", style: "Spin", color: "#ddbefa", flight: 1950, release: "Wait for the slower ball." }
]);
export const bowlerAt = ball => bowlers[Math.floor(ball / 2) % bowlers.length];
// The same landmarks drive both the scores and the visible timing strip.
export const timing = Object.freeze({ centre: .75, six: .043, four: .12, single: .21 });
export const newInnings = () => ({ shots: [], runs: 0, sixes: 0 });
export function runsAt(position) {
  if (!Number.isFinite(position) || position < 0 || position > 1) throw new RangeError("Invalid ball position.");
  const distance = Math.abs(position - timing.centre);
  return distance <= timing.six ? 6 : distance <= timing.four ? 4 : distance <= timing.single ? 1 : 0;
}
export function bat(innings, position) {
  if (innings.shots.length === OVER) return innings;
  const runs = runsAt(position);
  return { shots: [...innings.shots, runs], runs: innings.runs + runs, sixes: innings.sixes + Number(runs === 6) };
}
export function chaseState(innings) {
  const runsRemaining = Math.max(0, 24 - innings.runs);
  const ballsRemaining = OVER - innings.shots.length;
  return { runsRemaining, ballsRemaining, result: runsRemaining === 0 ? "won" : ballsRemaining === 0 ? "lost" : "playing" };
}
export function batChase(innings, position) {
  return chaseState(innings).result === "playing" ? bat(innings, position) : innings;
}
