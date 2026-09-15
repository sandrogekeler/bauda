/**
 * The 3D -> ASCII conversion (features.md section 2.1).
 *
 * Three passes:
 *   DOG_FS   difference-of-gaussians over scene luminance, at subpixel
 *            resolution. Suppresses smooth shading so the Sobel pass finds
 *            structural edges (silhouettes, roof ridges, corners) rather than
 *            gradients.
 *   CELL_FS  one fragment per character cell. Averages color and luminance,
 *            runs Sobel over the DoG buffer to get an edge *direction*, picks a
 *            glyph, composites the UI overlay. Its output IS the cell buffer.
 *   DISPLAY_FS  one fragment per screen pixel. Looks up the cell's glyph in the
 *            atlas and colors it. Deliberately trivial: all the expensive work
 *            happened at cell resolution.
 *
 * Splitting cell decisions from display is what makes this cheap. The scene
 * renders to roughly a thumbnail (96x54 cells x 3 supersamples), and the
 * per-pixel pass is two texture fetches.
 */

export const QUAD_VS = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const DOG_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uTexel;
out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float blur(vec2 uv, float r) {
  float s = 0.0, w = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      float g = exp(-dot(o, o) / (2.0 * r * r));
      s += lum(texture(tScene, uv + o * uTexel).rgb) * g;
      w += g;
    }
  }
  return s / w;
}

void main() {
  float l = lum(texture(tScene, vUv).rgb);
  float d = blur(vUv, 0.9) - blur(vUv, 2.2);
  fragColor = vec4(l, d * 0.5 + 0.5, 0.0, 1.0);
}
`

export const CELL_FS = /* glsl */ `
precision highp float;
in vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tDog;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tOverlay;

uniform vec2  uGrid;          // cols, rows
uniform float uSS;            // supersamples per cell axis
uniform float uShades;        // phosphor shade count for this tier
uniform float uEdges;         // 0/1 directional Sobel glyphs
uniform float uNormals;       // 0/1 normal-driven glyph selection
uniform float uEdgeThreshold;
uniform float uRamp[10];      // glyph indices, dark -> bright
uniform float uEdgeGlyph[4];  // horizontal, /, vertical, \\

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

/**
 * Is there actual geometry here, or just a gradient?
 *
 * Luminance edges alone fire on the aura heatmap painted across the ground,
 * which fills the frame with meaningless diagonals. A depth laplacian is zero
 * across any flat plane however steeply it recedes, and spikes at silhouettes;
 * normal discontinuity catches the wall/ground and wall/roof creases. Only
 * where one of those fires do we let a directional edge glyph through.
 */
float geometryEdge(vec2 uv, vec2 t) {
  float d0 = texture(tDepth, uv).r;
  float dl = texture(tDepth, uv - vec2(t.x, 0.0)).r;
  float dr = texture(tDepth, uv + vec2(t.x, 0.0)).r;
  float du = texture(tDepth, uv + vec2(0.0, t.y)).r;
  float dd = texture(tDepth, uv - vec2(0.0, t.y)).r;
  float lap = abs(dl + dr + du + dd - 4.0 * d0);

  vec3 n0 = texture(tNormal, uv).rgb * 2.0 - 1.0;
  float nd = 0.0;
  nd = max(nd, 1.0 - dot(n0, texture(tNormal, uv - vec2(t.x, 0.0)).rgb * 2.0 - 1.0));
  nd = max(nd, 1.0 - dot(n0, texture(tNormal, uv + vec2(t.x, 0.0)).rgb * 2.0 - 1.0));
  nd = max(nd, 1.0 - dot(n0, texture(tNormal, uv - vec2(0.0, t.y)).rgb * 2.0 - 1.0));
  nd = max(nd, 1.0 - dot(n0, texture(tNormal, uv + vec2(0.0, t.y)).rgb * 2.0 - 1.0));

  // Deliberately strict. A loose gate turns every facet of a low-poly cylinder
  // into an edge and the building dissolves into line spaghetti; we only want
  // silhouettes against the ground and hard creases like roof-meets-wall.
  return max(smoothstep(0.0006, 0.0024, lap), smoothstep(0.38, 0.78, nd));
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  vec2 cellOrigin = cell / uGrid;
  vec2 cellSize = 1.0 / uGrid;
  vec2 sceneTexel = cellSize / uSS;

  // --- UI overlay wins outright ---------------------------------------------
  // The cell buffer is authored with row 0 at the top; texture v runs bottom-up.
  vec2 ovUv = (vec2(cell.x, uGrid.y - 1.0 - cell.y) + 0.5) / uGrid;
  vec4 ov = texture(tOverlay, ovUv);
  if (ov.a > 0.5) {
    // b channel: 0 = world cell, 0.5 = UI cell, 1.0 = UI cell, inverse video
    float inv = ov.b > 0.001 ? 1.0 : 0.5;
    fragColor = vec4(ov.r, ov.g, inv, 1.0);
    return;
  }

  // --- average luminance and up-facing-ness across the cell's subpixels -----
  float lumSum = 0.0;
  float upSum = 0.0;
  float n = 0.0;
  int ss = int(uSS);
  for (int j = 0; j < 4; j++) {
    if (j >= ss) break;
    for (int i = 0; i < 4; i++) {
      if (i >= ss) break;
      vec2 uv = cellOrigin + (vec2(float(i), float(j)) + 0.5) * sceneTexel;
      lumSum += lum(texture(tScene, uv).rgb);
      upSum += texture(tNormal, uv).g;
      n += 1.0;
    }
  }
  float avgLum = lumSum / n;
  float upFace = upSum / n;

  // --- Sobel over the DoG buffer, per subpixel, binned by direction ----------
  float bins[4];
  bins[0] = 0.0; bins[1] = 0.0; bins[2] = 0.0; bins[3] = 0.0;
  float edgeTotal = 0.0;

  if (uEdges > 0.5) {
    for (int j = 0; j < 4; j++) {
      if (j >= ss) break;
      for (int i = 0; i < 4; i++) {
        if (i >= ss) break;
        vec2 uv = cellOrigin + (vec2(float(i), float(j)) + 0.5) * sceneTexel;
        float geo = geometryEdge(uv, sceneTexel);
        if (geo < 0.08) continue;
        float tl = texture(tDog, uv + vec2(-1,  1) * sceneTexel).g;
        float t  = texture(tDog, uv + vec2( 0,  1) * sceneTexel).g;
        float tr = texture(tDog, uv + vec2( 1,  1) * sceneTexel).g;
        float l  = texture(tDog, uv + vec2(-1,  0) * sceneTexel).g;
        float r  = texture(tDog, uv + vec2( 1,  0) * sceneTexel).g;
        float bl = texture(tDog, uv + vec2(-1, -1) * sceneTexel).g;
        float b  = texture(tDog, uv + vec2( 0, -1) * sceneTexel).g;
        float br = texture(tDog, uv + vec2( 1, -1) * sceneTexel).g;

        float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
        float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
        float mag = length(vec2(gx, gy)) * geo;
        if (mag < 0.02) continue;

        // Edge runs perpendicular to the gradient.
        float ang = atan(gy, gx) + 1.5707963;
        float a = mod(ang + 3.1415926 * 2.0, 3.1415926);      // 0..pi
        int bin = int(floor(a / 3.1415926 * 4.0 + 0.5)); // 0..4
        if (bin > 3) bin = 0;
        if (bin == 0) bins[0] += mag;
        else if (bin == 1) bins[1] += mag;
        else if (bin == 2) bins[2] += mag;
        else bins[3] += mag;
        edgeTotal += mag;
      }
    }
  }

  float glyph;
  float shade;

  float best = max(max(bins[0], bins[1]), max(bins[2], bins[3]));
  if (uEdges > 0.5 && edgeTotal / n > uEdgeThreshold) {
    int bi = 0;
    if (bins[1] == best) bi = 1;
    else if (bins[2] == best) bi = 2;
    else if (bins[3] == best) bi = 3;
    glyph = uEdgeGlyph[bi];
    shade = 1.0; // edges always render at full brightness: they carry the form
  } else {
    // Normals separate roof from wall even at equal brightness.
    float l = avgLum;
    if (uNormals > 0.5) l = clamp(l * (0.72 + 0.46 * upFace), 0.0, 1.0);
    int ri = int(clamp(floor(l * 10.0), 0.0, 9.0));
    glyph = uRamp[ri];
    shade = clamp(0.25 + l * 0.75, 0.0, 1.0);
  }

  float shadeIdx = floor(shade * (uShades - 1.0) + 0.5);
  fragColor = vec4(glyph / 255.0, shadeIdx / 255.0, 0.0, 1.0);
}
`

export const DISPLAY_FS = /* glsl */ `
precision highp float;
in vec2 vUv;

uniform sampler2D tCell;
uniform sampler2D tGlyph;
uniform vec2  uGrid;
uniform vec2  uAtlasGrid;
uniform vec3  uPhosphor;
uniform vec3  uUiColors[8];
uniform float uShades;
uniform float uCrt;
uniform vec2  uResolution;

out vec4 fragColor;

void main() {
  vec2 g = vUv * uGrid;
  vec2 cell = floor(g);
  vec2 cellUV = fract(g);

  vec4 c = texture(tCell, (cell + 0.5) / uGrid);
  float glyph = floor(c.r * 255.0 + 0.5);
  bool isUi = c.b > 0.25;

  vec2 a = vec2(mod(glyph, uAtlasGrid.x), floor(glyph / uAtlasGrid.x));
  vec2 auv = (a + vec2(cellUV.x, 1.0 - cellUV.y)) / uAtlasGrid;
  float ink = texture(tGlyph, auv).r;

  vec3 color;
  if (isUi) {
    int ci = int(floor(c.g * 255.0 + 0.5));
    color = uUiColors[0];
    for (int i = 0; i < 8; i++) if (i == ci) color = uUiColors[i];
    if (c.b > 0.75) { ink = 1.0 - ink; }  // inverse video
  } else {
    float shadeIdx = floor(c.g * 255.0 + 0.5);
    float level = uShades <= 1.0 ? 1.0 : shadeIdx / (uShades - 1.0);
    color = uPhosphor * (0.18 + 0.82 * level);
  }

  vec3 outc = color * ink;

  if (uCrt > 0.5) {
    float scan = 0.88 + 0.12 * sin(vUv.y * uResolution.y * 3.14159);
    vec2 d = vUv - 0.5;
    float vig = 1.0 - dot(d, d) * 0.55;
    outc *= scan * vig;
    outc += vec3(0.012, 0.006, 0.0);   // phosphor glow floor
  }

  fragColor = vec4(outc, 1.0);
}
`
