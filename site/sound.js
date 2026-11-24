// Crowd and cricket sounds, synthesised on the fly: no audio files, nothing stored, and silent until the first tap or key press.
export function createSound() {
  const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let ctx = null, master = null, crowd = null, noise = null, muted = false, broken = false;

  function boot() {
    if (ctx || broken || !Ctx) return;
    try {
      ctx = new Ctx(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0); let brown = 0;
      for (let i = 0; i < data.length; i++) { brown = 0.97 * brown + 0.03 * (Math.random() * 2 - 1); data[i] = brown * 7; }
      const src = ctx.createBufferSource(), band = ctx.createBiquadFilter();
      src.buffer = noise; src.loop = true; band.type = "bandpass"; band.frequency.value = 650; band.Q.value = 0.45;
      crowd = ctx.createGain(); crowd.gain.value = 0.05;
      src.connect(band); band.connect(crowd); crowd.connect(master); src.start();
    } catch { broken = true; ctx = null; }
  }
  const live = () => ctx && ctx.state === "running";

  function burst(at, dur, { type = "bandpass", freq = 1500, q = 1, gain = 0.3, sweep = 0 } = {}) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, at);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + dur);
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(at, Math.random() * 1.5); src.stop(at + dur + 0.05);
  }
  function tone(at, from, to, dur, gain = 0.25, type = "sine") {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.05);
  }
  function roar(level, secs) {
    const at = ctx.currentTime; crowd.gain.cancelScheduledValues(at); crowd.gain.setValueAtTime(crowd.gain.value, at);
    crowd.gain.linearRampToValueAtTime(level, at + 0.25); crowd.gain.setTargetAtTime(0.05, at + 0.25 + secs * 0.35, secs * 0.3);
  }
  const chime = (notes, gain = 0.07) => notes.forEach((hz, i) => tone(ctx.currentTime + 0.06 + i * 0.09, hz, hz * 1.002, 0.5, gain, "triangle"));
  const crack = quality => {
    const at = ctx.currentTime;
    burst(at, 0.06, { type: "highpass", freq: 1800, gain: 0.35 + 0.35 * quality }); tone(at, 190, 62, 0.11, 0.3 + 0.25 * quality); tone(at, 2600, 1700, 0.03, 0.12);
  };

  const play = fn => (...args) => { if (live()) try { fn(...args); } catch { broken = true; } };
  return {
    unlock() { boot(); ctx?.resume?.(); },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    get muted() { return muted; },
    swish: play(() => burst(ctx.currentTime, 0.16, { freq: 500, sweep: 2200, q: 1.4, gain: 0.18 })),
    bounce: play(() => { tone(ctx.currentTime, 120, 48, 0.08, 0.22); burst(ctx.currentTime, 0.05, { type: "lowpass", freq: 600, gain: 0.12 }); }),
    six: play(() => { crack(1); roar(0.55, 3.2); chime([523, 659, 784, 1047]); }),
    four: play(() => { crack(0.7); roar(0.34, 2.2); chime([659, 880], 0.06); }),
    single: play(() => { crack(0.35); roar(0.14, 1.2); }),
    miss: play(() => { tone(ctx.currentTime + 0.05, 230, 130, 0.7, 0.05, "sawtooth"); roar(0.02, 1); }),
    bowled: play(() => { for (let i = 0; i < 6; i++) { burst(ctx.currentTime + i * 0.045, 0.05, { type: "highpass", freq: 2200, gain: 0.25 }); tone(ctx.currentTime + i * 0.045, 900 - i * 90, 400, 0.04, 0.1, "square"); } roar(0.18, 1.4); }),
    tick: play(() => tone(ctx.currentTime, 880, 1320, 0.05, 0.06, "triangle"))
  };
}
