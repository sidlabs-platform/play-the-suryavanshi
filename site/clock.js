// The game clock. Its rate slows the whole match (ball, bat, camera) without touching the scoring: the timing zones are fractions of
// the ball's flight, so a half-speed ball just gives the player twice the real time to reach the same zone.
// At rate 1 it reads exactly like performance.now(). While the tab is hidden it stands still, so a ball in flight waits for you.
export function createClock(real = () => performance.now()) {
  let base = 0, anchor = 0, rate = 1, hiddenAt = null;
  const now = () => base + ((hiddenAt ?? real()) - anchor) * rate;
  return {
    now,
    get rate() { return rate; },
    // Changing the rate re-anchors the clock, so it never jumps or runs backwards.
    setRate(next) { base = now(); anchor = hiddenAt ?? real(); rate = next; },
    hide() { if (hiddenAt === null) hiddenAt = real(); },
    show() { if (hiddenAt !== null) { anchor += real() - hiddenAt; hiddenAt = null; } }
  };
}
