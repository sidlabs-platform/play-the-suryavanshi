// GLSL for the night stadium. Everything is procedural: no textures or images are downloaded.
const HEAD = "#version 300 es\nprecision highp float;\n";

// Shared by every fragment shader: noise, the four floodlights, and the final grade.
const COMMON = `
uniform vec2 uRes; uniform float uTime, uDesat, uFocus, uExposure;
uniform vec3 uEye; uniform vec3 uL[4]; uniform vec3 uLc[4];
const vec2 C0 = vec2(0., -10.06);
float hash21(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
vec3 lighting(vec3 N, vec3 V, vec3 alb, float gloss){
  vec3 sum = mix(vec3(.05, .07, .06), vec3(.20, .25, .38), N.y * .5 + .5), sp = vec3(0.);
  for (int i = 0; i < 4; i++) {
    sum += uLc[i] * max(dot(N, uL[i]), 0.);
    sp += uLc[i] * pow(max(dot(N, normalize(uL[i] + V)), 0.), mix(12., 110., gloss)) * gloss;
  }
  return alb * sum + sp * .9 + pow(1. - max(dot(N, V), 0.), 3.) * vec3(.22, .3, .5) * (.25 + gloss);
}
vec3 fogged(vec3 c, float d){ return mix(c, vec3(.025, .04, .085), 1. - exp(-d * .0034)); }
vec3 grade(vec3 c){
  c *= uExposure;
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  c = mix(vec3(dot(c, vec3(.299, .587, .114))), c, 1. - uDesat * .75);
  vec2 uv = gl_FragCoord.xy / uRes - .5;
  c *= 1. - uFocus * dot(uv, uv) * 1.9;
  return pow(max(c, 0.), vec3(1. / 2.2));
}
`;

export const worldVS = `${HEAD}
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
uniform mat4 uVP; out vec3 vW; out vec3 vN;
void main(){ vW = aPos; vN = aNor; gl_Position = uVP * vec4(aPos, 1.); }`;

export const skyVS = `${HEAD}
layout(location=0) in vec3 aPos; uniform mat4 uVP; uniform vec3 uEye; out vec3 vDir;
void main(){ vDir = aPos; gl_Position = (uVP * vec4(aPos * 500. + uEye, 1.)).xyww; }`;

export const skyFS = `${HEAD}${COMMON}
in vec3 vDir; out vec4 o;
void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.);
  vec3 col = mix(vec3(.07, .11, .2), vec3(.006, .012, .04), pow(h, .45));
  vec2 sp = vec2(atan(d.x, d.z) * 55., h * 110.); vec2 id = floor(sp), f = fract(sp) - .5;
  float star = step(.982, hash21(id)) * smoothstep(.12, .5, h) * (1. - smoothstep(.0, .22, length(f)));
  col += vec3(.75, .82, 1.) * star * (.5 + .5 * sin(uTime * 1.6 + hash21(id + 3.) * 30.));
  col += vec3(.07, .1, .16) * pow(1. - h, 6.);
  o = vec4(grade(col * 1.5), 1.);
}`;

export const groundFS = `${HEAD}${COMMON}
in vec3 vW; out vec4 o;
uniform vec4 uBand; uniform vec4 uAssist; uniform vec4 uBall;
float lineAA(float d, float w){ float fw = fwidth(d) * .8; return 1. - smoothstep(w - fw, w + fw, abs(d)); }
void main(){
  vec2 p = vW.xz; vec3 V = uEye - vW; float dist = length(V); V /= dist;
  float r = length(p - C0), far = smoothstep(14., 70., dist);
  float s = fract(p.x / 6.5), stripe = smoothstep(0., .03, s) - smoothstep(.5, .53, s);
  float blades = mix(fbm(p * 2.1) * .55 + fbm(p * 13.) * .45, .5, far);
  vec3 turf = mix(vec3(.060, .245, .075), vec3(.105, .355, .105), stripe) * (.62 + .72 * blades);
  turf *= .86 + .28 * fbm(p * .35);
  // the pitch: baked clay with wear where the ball lands and where the bowlers push off
  float edge = 1. - smoothstep(1.47, 1.58, abs(p.x));
  float onPitch = edge * smoothstep(-21.45, -21.3, p.y) * (1. - smoothstep(1.2, 1.32, p.y));
  float wear = exp(-pow((p.y + 6.2) / 3.2, 2.)) * .28 + exp(-pow((p.y + 17.2) / 1.9, 2.)) * .36 + exp(-pow((p.y + .9) / 1.5, 2.)) * .22;
  float clayN = mix(fbm(p * vec2(5., 2.4)) * .6 + fbm(p * 22.) * .4, .5, far);
  vec3 clay = mix(vec3(.52, .40, .26), vec3(.34, .25, .15), clamp(wear, 0., 1.)) * (.74 + .5 * clayN);
  clay += vec3(.05, .045, .03) * smoothstep(.42, .55, fbm(p * vec2(9., 3.)));
  vec3 surf = mix(turf, clay, onPitch);
  // paint: creases at both ends, 30-yard dashes and the boundary line
  float cr = 0.;
  for (int e = 0; e < 2; e++) {
    float z0 = e == 0 ? 0. : -20.12, dir = e == 0 ? -1. : 1.;
    float zp = z0 + dir * 1.22, zb = z0 - dir * 2.44;
    cr = max(cr, lineAA(p.y - z0, .026) * step(abs(p.x), 1.32));
    cr = max(cr, lineAA(p.y - zp, .026) * step(abs(p.x), 1.83));
    cr = max(cr, lineAA(abs(p.x) - 1.32, .026) * step(min(zp, zb), p.y) * step(p.y, max(zp, zb)));
  }
  float ang = atan(p.x, -(p.y - C0.y));
  float ring = lineAA(r - 27.43, .07) * step(.5, fract(ang * 27.43 / 1.7));
  float rope = lineAA(r - 68., .09);
  surf = mix(surf, vec3(.92, .93, .9), clamp(cr * .9 + ring * .6 + rope * .5, 0., 1.));
  float lit = mix(1.3, .26, smoothstep(8., 86., r)) * (1. + .12 * sin(ang * 4. + 1.));
  vec3 col = surf * lit;
  col += pow(1. - V.y, 5.) * vec3(.09, .15, .13) * (.5 + blades) * (1. - onPitch * .5);
  // timing carpet: gold = six, mint = four, white = single (centred where the ball must be when you swing)
  if (uAssist.x > .5) {
    float dz = abs(p.y - uBand.x), inX = 1. - smoothstep(1.15, 1.5, abs(p.x));
    float pulse = .88 + .12 * sin(uTime * 7.), soft = .035;
    col = mix(col, vec3(1., .98, .9), (1. - smoothstep(uBand.w - soft, uBand.w + soft, dz)) * .24 * inX * uAssist.y);
    col = mix(col, vec3(.45, 1., .78), (1. - smoothstep(uBand.z - soft, uBand.z + soft, dz)) * .4 * inX * uAssist.y);
    col = mix(col, vec3(1., .78, .2), (1. - smoothstep(uBand.y - soft, uBand.y + soft, dz)) * .78 * inX * uAssist.y * pulse);
  }
  float bd = length(p - uBall.xy);
  col += vec3(1., .95, .75) * uBall.z * (exp(-bd * bd * 22.) * .8 + .5 * (1. - smoothstep(.03, .06, abs(bd - .34))) * exp(-bd * 2.));
  o = vec4(grade(fogged(col, length(uEye - vW))), 1.);
}`;

export const standsFS = `${HEAD}${COMMON}
in vec3 vW; in vec3 vN; out vec4 o;
uniform float uExcite;
vec3 shirt(float h){
  if (h < .32) return vec3(.06, .18, .85);
  if (h < .47) return vec3(.95, .95, .9);
  if (h < .60) return vec3(1., .72, .12);
  if (h < .70) return vec3(.9, .12, .16);
  if (h < .80) return vec3(.08, .6, .3);
  if (h < .90) return vec3(.1, .1, .14);
  return vec3(.6, .28, .72);
}
void main(){
  vec2 q = vW.xz - C0; float ang = atan(q.x, -q.y), y = vW.y;
  float upper = step(16., y), walk = step(14.15, y) * (1. - upper);
  vec2 g = vec2(ang * 82. / .55, y / mix(.62, .56, upper)); vec2 id = floor(g), f = fract(g);
  float aa = max(fwidth(g.x), fwidth(g.y)), lod = smoothstep(.28, .85, aa);
  float h1 = hash21(id), h2 = hash21(id + 7.7), h3 = hash21(id + 13.1);
  float present = step(.07, h3) * step(1., mod(id.x, 22.));
  float head = 1. - smoothstep(.15, .21, length((f - vec2(.5, .74)) * vec2(1., 1.15)));
  float body = step(abs(f.x - .5), .36) * step(f.y, .56) * step(abs(f.x - .5), .46 - f.y * .2);
  float arm = step(1. - .5 * uExcite, h2) * step(.3, h1) * step(abs(f.x - .5 - (h1 - .5) * .8), .09) * step(.5, f.y) * step(f.y, .98);
  vec3 skin = mix(vec3(.45, .28, .2), vec3(.9, .7, .55), h3);
  vec3 c = vec3(.012, .014, .02);
  c = mix(c, shirt(h1) * (.45 + .7 * h2), body * present);
  c = mix(c, skin, max(head, arm) * present);
  c = mix(c, vec3(.16, .17, .24) * (.6 + h2), lod);
  float riser = mix(.55, 1., smoothstep(0., .22, f.y));
  c *= mix(riser, 1., lod);
  float flash = step(.993, h2) * step(fract(uTime * .65 + h1 * 9.), .07);
  c += vec3(1., 1., .95) * flash * mix(1. - smoothstep(0., .4, length(f - .5)), 1., lod) * 4.;
  float lit = mix(1.05, .42, smoothstep(0., 30., y)) * mix(1., .8, upper);
  c *= lit * (1. + uExcite * .35);
  // concourse: dark wall with a lit lip
  vec3 wall = vec3(.025, .03, .05) + vec3(.9, .92, 1.) * (1. - smoothstep(0., .08, abs(y - 14.45))) * .8;
  c = mix(c, wall, walk);
  o = vec4(grade(fogged(c * .85, length(uEye - vW))), 1.);
}`;

// The advertising boards are an LED strip: a 1024x32 canvas read one texel per lamp.
export const boardsFS = `${HEAD}${COMMON}
in vec3 vW; in vec3 vN; out vec4 o;
uniform sampler2D uAds; uniform float uScroll;
void main(){
  vec2 q = vW.xz - C0; float ang = atan(q.x, -q.y);
  vec2 size = vec2(1024., 32.), t = vec2(fract((ang / 6.2831853 + .5) * 12. + uScroll), 1. - clamp(vW.y / 1.02, 0., .999)) * size;
  vec3 led = texelFetch(uAds, ivec2(min(floor(t), size - 1.)), 0).rgb;
  float lamp = 1. - smoothstep(.26, .5, length(fract(t) - .5));
  lamp = mix(lamp, .62, smoothstep(.6, 1.4, max(fwidth(t.x), fwidth(t.y))));
  float top = step(.88, vN.y);
  vec3 c = mix(led * lamp * 2.2 + vec3(.012, .014, .02), vec3(.05, .055, .08), top);
  o = vec4(grade(fogged(c, length(uEye - vW))), 1.);
}`;

export const solidFS = `${HEAD}${COMMON}
in vec3 vW; in vec3 vN; out vec4 o;
uniform vec4 uColor; uniform float uEmis;
void main(){
  vec3 V = normalize(uEye - vW), N = normalize(vN);
  vec3 c = lighting(N, V, uColor.rgb, uColor.a) + uColor.rgb * uEmis;
  o = vec4(grade(fogged(c, length(uEye - vW))), 1.);
}`;

const instanced = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
layout(location=2) in vec4 i0; layout(location=3) in vec4 i1; layout(location=4) in vec4 i2; layout(location=5) in vec4 i3;
layout(location=6) in vec4 iCol; layout(location=7) in vec4 iMisc;
uniform mat4 uVP; uniform float uMirror;
vec3 normalOf(vec3 n){ vec3 a = i0.xyz, b = i1.xyz, c = i2.xyz; return n.x * a / dot(a, a) + n.y * b / dot(b, b) + n.z * c / dot(c, c); }
vec4 worldOf(){ vec3 p = aPos; p.xz *= mix(1., iMisc.x, p.y); vec4 w = mat4(i0, i1, i2, i3) * vec4(p, 1.); w.x *= uMirror; return w; }
`;

export const litVS = `${HEAD}${instanced}
out vec3 vW; out vec3 vN; out vec4 vCol; out float vEmis;
void main(){ vec4 w = worldOf(); vec3 n = normalOf(aNor); n.x *= uMirror; vW = w.xyz; vN = n; vCol = iCol; vEmis = iMisc.y; gl_Position = uVP * w; }`;

export const litFS = `${HEAD}${COMMON}
in vec3 vW; in vec3 vN; in vec4 vCol; in float vEmis; out vec4 o;
void main(){
  vec3 V = normalize(uEye - vW), N = normalize(vN);
  vec3 c = lighting(N, V, vCol.rgb, vCol.a) + vCol.rgb * vEmis;
  o = vec4(grade(fogged(c, length(uEye - vW))), 1.);
}`;

export const shadowVS = `${HEAD}${instanced}
uniform vec3 uToLight;
void main(){ vec4 w = worldOf(); vec3 q = w.xyz - uToLight * (w.y / uToLight.y); gl_Position = uVP * vec4(q.x, .012, q.z, 1.); }`;
export const shadowFS = `${HEAD}uniform float uShade; out vec4 o; void main(){ o = vec4(0., 0., 0., uShade); }`;

export const spriteVS = `${HEAD}
layout(location=0) in vec2 aQuad; layout(location=1) in vec4 iPos; layout(location=2) in vec4 iCol;
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp; out vec2 vUV; out vec4 vCol;
void main(){ vUV = aQuad; vCol = iCol; gl_Position = uVP * vec4(iPos.xyz + (uRight * aQuad.x + uUp * aQuad.y) * iPos.w, 1.); }`;
export const spriteFS = `${HEAD}
in vec2 vUV; in vec4 vCol; out vec4 o;
void main(){ float d = length(vUV), a = exp(-d * d * 3.2) * (1. - smoothstep(.8, 1., d)); o = vec4(vCol.rgb * vCol.a * a, a); }`;
