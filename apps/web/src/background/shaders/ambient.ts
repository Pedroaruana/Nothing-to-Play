// corredor infinito de placas, tipo o mosaico antes de ter capa de verdade.
// 9 camadas passando pela câmera em loop, tudo procedural, nenhuma imagem aqui

// triângulo de tela cheia, sem buffer nenhum, sai do próprio gl_VertexID
export const AMBIENT_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export const AMBIENT_FRAG = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;    // tempo contínuo, alimenta ondas, reflexo e lâmpada
uniform float u_flight;  // distância percorrida, acumulada na CPU
uniform float u_resolve; // 0 = intro, 1 = câmera mergulhando no acervo
uniform vec2 u_pointer;  // ponteiro suavizado, só pro parallax
uniform vec2 u_mouse;    // ponteiro cru no mesmo espaço do uv, pra seleção
uniform float u_hasMouse;

out vec4 fragColor;

const int LAYERS = 9;
const float FAR = 11.0;
const float NEAR = 0.55;
const vec2 CELL = vec2(0.34, 0.45); // proporção 3:4 da capa

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + 19.19));
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// distância assinada de um retângulo com cantos arredondados
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// bem dessaturado, senão a parede fica cinza morto
vec3 tintFor(float seed) {
  vec3 cold = vec3(0.60, 0.72, 1.00);
  vec3 warm = vec3(1.00, 0.84, 0.64);
  vec3 pale = vec3(0.76, 1.00, 0.90);
  vec3 t = mix(cold, warm, smoothstep(0.05, 0.65, seed));
  t = mix(t, pale, smoothstep(0.80, 1.0, seed));
  return mix(vec3(1.0), t, 0.30);
}

// detalhe de dentro da placa: gradiente, reflexo, faixa de título e moldura
float plaqueDetail(vec2 luv, float seed, float t) {
  float g = mix(1.20, 0.70, luv.y);

  // reflexo diagonal atravessando a capa, cada uma no seu tempo
  float slide = fract(seed * 7.13 + t * 0.07);
  float band = abs((luv.x + luv.y * 0.55) * 0.72 - slide * 1.45 + 0.22);
  g += smoothstep(0.18, 0.0, band) * (0.30 + seed * 0.55);

  // faixa de título na base, como capa de jogo de verdade
  float title = smoothstep(0.78, 0.81, luv.y) * (1.0 - smoothstep(0.93, 0.96, luv.y));
  g = mix(g, g * 0.40 + 0.12, title * 0.85);

  // moldura interna clareando a borda
  float edge = min(min(luv.x, 1.0 - luv.x), min(luv.y, 1.0 - luv.y));
  g += smoothstep(0.045, 0.0, edge) * 0.25;

  return g;
}

// mesma deformação de câmera pro fragmento e pro cursor, senão a seleção sai torta
vec2 warp(vec2 v) {
  float roll = sin(u_time * 0.055) * 0.04 * (1.0 - u_resolve * 0.75);
  float cs = cos(roll);
  float sn = sin(roll);
  vec2 sp = mat2(cs, -sn, sn, cs) * v;

  // curvatura de lente: as bordas afundam, o centro avança
  sp *= 1.0 + mix(0.30, 0.12, u_resolve) * dot(sp, sp);

  // deriva lateral da câmera + parallax do ponteiro
  sp += vec2(sin(u_time * 0.11) * 0.05, cos(u_time * 0.083) * 0.035);
  sp += u_pointer * 0.06;
  return sp;
}

float layerT(int r, float phase) {
  return (phase + float(r)) / float(LAYERS);
}

float layerFade(float t) {
  // some antes de bater na câmera, senão a camada da frente cobre a tela toda
  return smoothstep(0.0, 0.16, t) * (1.0 - smoothstep(0.52, 0.95, t));
}

vec2 layerOffset(float cycle, int r) {
  // id fixo da camada, senão pisca toda vez que dá a volta
  float layerId = cycle - float(r);
  return hash22(vec2(layerId, layerId * 1.7 + 3.1)) * 31.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 sp = warp(uv);
  vec2 sm = warp(u_mouse);

  // fundo quase preto com uma respiração de luz no centro
  float glow = 1.0 - smoothstep(0.0, 1.0, length(uv));
  float breath = 0.70 + 0.30 * sin(u_time * 0.37);
  vec3 col = mix(vec3(0.012, 0.013, 0.017), vec3(0.055, 0.058, 0.072), glow * breath);

  // lâmpada viajando pelo mural, acende as placas por onde passa
  vec2 lamp = vec2(sin(u_time * 0.19) * 3.2, cos(u_time * 0.147) * 2.1);

  // quebrar a distância em inteiro + fração deixa as camadas já ordenadas do
  // fundo pra frente, aí dá pra compor com mix() sem depth e sem ordenar nada
  float steps = float(LAYERS);
  float cycle = floor(u_flight * steps);
  float phase = fract(u_flight * steps);

  // passada só pra achar a placa sob o cursor. como o loop vai do fundo pra
  // frente, o último acerto é o da camada mais próxima, que é a que o olho vê
  float hoverLayer = -1.0;
  vec2 hoverCell = vec2(0.0);

  if (u_hasMouse > 0.5) {
    for (int r = 0; r < LAYERS; r++) {
      float t = layerT(r, phase);

      // placa muito apagada não deve ser selecionável
      if (layerFade(t) <= 0.3) continue;

      float z = mix(FAR, NEAR, pow(t, 1.35));
      vec2 pm = sm * z + layerOffset(cycle, r);
      vec2 gm = pm / CELL;
      vec2 fm = (fract(gm) - 0.5) * CELL;

      // dentro da placa, descontando o vão entre elas
      if (all(lessThan(abs(fm), CELL * 0.5 - 0.035))) {
        hoverLayer = float(r);
        hoverCell = floor(gm);
      }
    }
  }

  for (int r = 0; r < LAYERS; r++) {
    float t = layerT(r, phase);
    float fade = layerFade(t);

    // é igual pra todo pixel, então pode sair antes do fwidth lá embaixo
    if (fade <= 0.002) continue;

    vec2 off = layerOffset(cycle, r);
    float z = mix(FAR, NEAR, pow(t, 1.35));
    vec2 p = sp * z + off;

    vec2 gp = p / CELL;
    vec2 id = floor(gp);
    vec2 cellUv = fract(gp);
    vec2 luv = vec2(cellUv.x, 1.0 - cellUv.y);
    vec2 f = (cellUv - 0.5) * CELL;

    float hit = float(r) == hoverLayer && all(equal(id, hoverCell)) ? 1.0 : 0.0;

    // a placa nasce menor e assenta conforme se aproxima. a selecionada incha um pouco
    float grow = mix(0.86, 1.0, smoothstep(0.0, 0.35, t)) * (1.0 + 0.07 * hit);
    float gut = mix(0.030, 0.016, u_resolve);
    float sd = roundedBox(f, CELL * 0.5 * grow - gut, 0.012);

    // antialias pela derivada da distância, aí a borda fica igual em qualquer profundidade
    float aa = fwidth(sd) + 1e-5;
    float mask = 1.0 - smoothstep(-aa, aa, sd);

    float seed = hash21(id + off);
    float rare = pow(seed, 2.2); // capas muito claras são exceção, como numa estante real

    float wave = noise21(id * 0.26 + vec2(u_time * 0.055, -u_time * 0.042));
    float d = length(id * CELL - lamp);
    float lit = exp(-d * d * 0.16);

    // piscada rara: uma capa "carregando" aqui e ali
    float blink = step(0.9955, hash21(id + floor(u_time * 0.7)));

    float lum = mix(0.018, 0.30, rare) * (0.45 + 1.55 * wave);
    lum += lit * (0.045 + 0.30 * rare);
    lum += blink * 0.22;
    lum *= plaqueDetail(luv, seed, u_time);

    // halo em volta do cursor: as vizinhas também acendem um pouco, dá profundidade
    vec2 pm = sm * z + off;
    float dm = length((id + 0.5) * CELL - pm);
    lum += exp(-dm * dm * 5.0) * 0.09 * u_hasMouse;

    lum *= mix(0.22, 1.05, t); // névoa: o fundo escurece
    lum *= mix(0.90, 1.55, u_resolve);

    // selecionada: acende, ganha contorno e perde a cor pro branco
    float ring = smoothstep(0.012, 0.0, abs(sd)) * hit;
    lum = mix(lum, lum * 2.6 + 0.16, hit);
    lum += ring * 0.5;

    // frio no fundo, quente na frente
    vec3 tint = mix(vec3(0.84, 0.89, 1.0), vec3(1.0, 0.96, 0.90), t);
    tint = mix(tint, vec3(1.0), hit * 0.7);

    col = mix(col, vec3(lum) * tint, clamp(mask + ring, 0.0, 1.0) * fade);
  }

  // brilho fraco nas áreas já claras, no lugar de um bloom caro
  col += smoothstep(0.32, 1.0, col) * 0.22;

  col *= 1.0 - 0.62 * smoothstep(0.40, 1.32, length(uv));

  // dither: mata o banding nos gradientes escuros
  col += (hash21(gl_FragCoord.xy + fract(u_time) * 137.0) - 0.5) * 0.006;

  fragColor = vec4(max(col, 0.0), 1.0);
}
`
