// Two-player match: players take turns batting one over each, then the totals are compared. Pure data, no DOM.
export const newDuel = (players = 1) => ({ players, totals: [] });
// Who is batting now (or bats next): the first player without a total.
export const batter = duel => Math.min(duel.totals.length, duel.players - 1);
export const complete = duel => duel.totals.length >= duel.players;
export const record = (duel, runs) => complete(duel) ? duel : { ...duel, totals: [...duel.totals, runs] };

// { winner: player index or null for a tie, margin: runs } once every player has batted, otherwise null.
export function verdict(duel) {
  if (!complete(duel) || duel.players < 2) return null;
  const best = Math.max(...duel.totals), leaders = duel.totals.flatMap((t, i) => t === best ? [i] : []);
  if (leaders.length > 1) return { winner: null, margin: 0 };
  const runnerUp = Math.max(...duel.totals.filter((_, i) => i !== leaders[0]));
  return { winner: leaders[0], margin: best - runnerUp };
}
export function describe(duel) {
  const v = verdict(duel);
  if (!v) return "";
  if (v.winner === null) return `Scores level on ${duel.totals[0]}: it's a tie!`;
  return `Player ${v.winner + 1} wins by ${v.margin} ${v.margin === 1 ? "run" : "runs"}!`;
}
