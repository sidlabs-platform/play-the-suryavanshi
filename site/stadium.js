// The night stadium: owns the WebGL2 context, the static scene and the per-frame draw order.
import {
  m4, rad, norm, add, mul, cross, sphereMesh, cylinderMesh, roundBoxMesh, revolveMesh, torusMesh, groundMesh,
  upload, compile, createBatch, createSprites
} from "./gl.js";
import { WORLD } from "./flight.js";
import * as S from "./shaders.js";

const CZ = WORLD.centre[1];
const KINDS = () => ({ sphere: sphereMesh(14, 20), cyl: cylinderMesh(14), box: roundBoxMesh(0.35, 8, 14) });

// Four floodlight banks on the roof rim. Azimuth is measured from the line down the pitch.
const BANKS = [[-35, 0.55], [35, 0.55], [-145, 0.85], [145, 0.85]].map(([deg, weight]) => {
  const a = rad(deg), pos = [113 * Math.sin(a), 34, CZ - 113 * Math.cos(a)];
  return { pos, weight, dir: norm([pos[0], pos[1] + 30, pos[2] - CZ]) }; // lit as if from higher up, so shadows stay short
});
const LIGHT_DIRS = new Float32Array(BANKS.flatMap(b => b.dir));
const LIGHT_COLOURS = new Float32Array(BANKS.flatMap(b => [1 * b.weight, 0.96 * b.weight, 0.88 * b.weight]));

export const SLOGANS = [["TRUST BUT VERIFY", "#ffd34d"], ["GREEN CHECKS ONLY", "#5df2b0"], ["REVIEW BEFORE YOU MERGE", "#6cc7ff"], ["PLAY THE SURYAVANSHI", "#ff7a5c"]];

function adsTexture(gl) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 1024, 32);
  g.textBaseline = "middle";
  let size = 25;
  const widthAt = s => { g.font = `bold ${s}px Menlo, Consolas, "DejaVu Sans Mono", monospace`; return SLOGANS.reduce((n, [t]) => n + g.measureText(t).width + 30, 0); };
  while (size > 12 && widthAt(size) > 1010) size--;
  widthAt(size);
  let x = 10;
  for (const [text, colour] of SLOGANS) { g.fillStyle = colour; g.fillText(text, x, 17); x += g.measureText(text).width + 30; }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return tex;
}

export function createStadium(canvas, { low = false, onLost = () => {} } = {}) {
  const gl = canvas.getContext("webgl2", { antialias: !low, stencil: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("WebGL 2 is not available in this browser.");
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); onLost(); });

  const defs = {
    sky: [S.skyVS, S.skyFS], ground: [S.worldVS, S.groundFS], stands: [S.worldVS, S.standsFS], boards: [S.worldVS, S.boardsFS],
    solid: [S.worldVS, S.solidFS], lit: [S.litVS, S.litFS], shadow: [S.shadowVS, S.shadowFS], sprite: [S.spriteVS, S.spriteFS]
  };
  const P = Object.fromEntries(Object.entries(defs).map(([name, [vs, fs]]) => [name, compile(gl, vs, fs)]));

  const standProfile = [[74, 0], [90, 14.15], [90, 14.15], [90.01, 16], [90.01, 16], [112, 30.5]];
  const roofProfile = [[112, 30.5], [112, 30.5], [112, 36], [112, 36], [95, 38.5]];
  const boardProfile = [[69.8, 0], [69.8, 1.02], [69.8, 1.02], [71.3, 1.07]];
  const mesh = {
    ground: upload(gl, groundMesh(170)), stands: upload(gl, revolveMesh(standProfile, CZ, low ? 160 : 288)),
    roof: upload(gl, revolveMesh(roofProfile, CZ, 96)), boards: upload(gl, revolveMesh(boardProfile, CZ, 240)),
    rope: upload(gl, torusMesh(WORLD.rope, 0.06, CZ, 360, 6)), sky: upload(gl, sphereMesh(16, 32))
  };
  const ads = adsTexture(gl);

  const fixed = createBatch(gl, KINDS()), actors = createBatch(gl, KINDS()), batter = createBatch(gl, KINDS());
  const sprites = createSprites(gl, 384);

  // Sightscreen behind the bowler's arm, and the lamp grids of the four floodlight banks.
  fixed.blob("box", [0, 3.1, -82.4], [8.4, 0, 0], [0, 3.1, 0], [0, 0, 0.3], [0.05, 0.055, 0.07], 0.3);
  fixed.blob("box", [0, 3.1, -82.05], [8, 0, 0], [0, 2.7, 0], [0, 0, 0.1], [0.004, 0.005, 0.008], 0.05);
  for (const bank of BANKS) {
    const fw = norm([-bank.pos[0], 0, CZ - bank.pos[2]]), right = cross([0, 1, 0], fw);
    fixed.blob("box", bank.pos, mul(right, 4.2), [0, 2.6, 0], mul(fw, 0.4), [0.03, 0.03, 0.04], 0.1);
    for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) {
      const c = add(add(bank.pos, mul(right, i * 1.15)), [0, j * 1.45, 0]);
      fixed.blob("box", add(c, mul(fw, 0.5)), mul(right, 0.42), [0, 0.5, 0], mul(fw, 0.1), [1, 0.97, 0.88], 0.2, 9);
    }
  }
  fixed.flush();

  let drawW = 0, drawH = 0;
  const resize = (scale = 1) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), cssW = canvas.clientWidth || 640, cssH = canvas.clientHeight || 360;
    let k = dpr * scale;
    if (cssW * cssH * k * k > 2.4e6) k = Math.sqrt(2.4e6 / (cssW * cssH));
    const w = Math.max(2, Math.round(cssW * k)), h = Math.max(2, Math.round(cssH * k));
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
    drawW = w; drawH = h;
    return w / h;
  };

  const solid = (m, colour, emis = 0) => { P.solid.set({ uColor: colour, uEmis: emis }); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); };
  const plain = m => { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); };

  function shadows(shared, shade) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.depthMask(false);
    P.shadow.use(); P.shadow.set({ uVP: shared.uVP, uShade: shade });
    for (const bank of BANKS) {
      gl.clear(gl.STENCIL_BUFFER_BIT);
      P.shadow.set({ uToLight: bank.dir, uMirror: 1 }); actors.draw();
      P.shadow.set({ uMirror: -1 }); batter.draw();
    }
    gl.depthMask(true); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
  }

  // One frame. `v` carries camera, grade, timing carpet and ball glow; figures were added to the batches by the caller.
  function draw(v) {
    const aspect = resize(v.scale ?? 1);
    gl.viewport(0, 0, drawW, drawH);
    gl.clearColor(0.02, 0.03, 0.06, 1); gl.clearStencil(0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    const view = m4.lookAt(v.eye, v.target), vp = m4.multiply(m4.perspective(v.fov, aspect, 0.25, 1000), view);
    const shared = {
      uVP: vp, uEye: v.eye, uL: LIGHT_DIRS, uLc: LIGHT_COLOURS, uRes: [drawW, drawH], uTime: v.time,
      uDesat: v.desat ?? 0, uFocus: v.focus ?? 0.35, uExposure: v.exposure ?? 1, uMirror: 1
    };

    gl.depthMask(false);
    P.sky.use(); P.sky.set(shared); plain(mesh.sky);
    gl.depthMask(true);

    P.ground.use(); P.ground.set({ ...shared, uBand: v.band ?? [0, 0, 0, 0], uAssist: [v.assist ? 1 : 0, v.assistAlpha ?? 1, 0, 0], uBall: v.ballDot ?? [0, 0, 0, 0] });
    plain(mesh.ground);
    P.stands.use(); P.stands.set({ ...shared, uExcite: v.excite ?? 0 }); plain(mesh.stands);
    P.boards.use(); P.boards.set({ ...shared, uScroll: (v.time * 0.012) % 1 });
    gl.bindTexture(gl.TEXTURE_2D, ads); gl.uniform1i(gl.getUniformLocation(P.boards.program, "uAds"), 0);
    plain(mesh.boards);
    P.solid.use(); P.solid.set(shared);
    solid(mesh.rope, [0.95, 0.95, 0.92, 0.3], 0.25);
    solid(mesh.roof, [0.012, 0.014, 0.02, 0]);

    actors.flush(); batter.flush();
    shadows(shared, 0.17);

    P.lit.use(); P.lit.set(shared);
    fixed.draw(); actors.draw();
    P.lit.set({ uMirror: -1 }); batter.draw();

    // Additive glow: floodlights, then whatever the game queued (ball, trail, sparks).
    for (const bank of BANKS) sprites.add(add(bank.pos, mul(norm([-bank.pos[0], 0, CZ - bank.pos[2]]), 1)), 46, 0.55, 0.6, 0.75, 0.5);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    P.sprite.use(); P.sprite.set({ uVP: vp, uRight: [view[0], view[4], view[8]], uUp: [view[1], view[5], view[9]] });
    sprites.draw();
    gl.depthMask(true); gl.disable(gl.BLEND);
    sprites.reset();
  }

  return { gl, canvas, actors, batter, sprites, draw, resize, lights: BANKS, get size() { return [drawW, drawH]; } };
}
