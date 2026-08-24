// pós-processamento por raymarching, na mesma técnica do preset "Depth" do
// original.
//
// o passe principal escreve dois alvos: a cor chapada do mosaico e o campo de
// distância das células. aqui esse campo vira um MAPA DE ALTURA: cada célula é
// uma almofada de topo achatado com um leve afundamento no meio. um raio é
// marchado contra essa superfície, a normal sai de seis amostras do campo, e
// a iluminação é calculada em cima dela.
//
// duas consequências que nenhum sombreamento no passe principal daria:
// 1. a câmera fica sobre o foco, então as células perto aparecem de frente e
//    as distantes de esguelha. é isso que produz o túnel.
// 2. a capa é amostrada NO PONTO ONDE O RAIO BATE, o que dobra a imagem como
//    vidro de verdade em vez de colar uma textura plana.

export const POST_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export const POST_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_color;  // cor chapada do mosaico
uniform sampler2D u_height; // campo de distância das células
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_focusScreen; // foco em coordenadas de tela corrigidas por aspecto

uniform float u_edgeScale;  // converte o campo em altura
uniform float u_relief;     // altura máxima da almofada
uniform float u_light;
uniform float u_env;

out vec4 fragColor;

const float TAU = 6.2831853;
const int STEPS = 40;

float aspect;
float objId = 0.0;   // 0 = moldura, 1 = capa
float lastHeight;

vec2 toUv(vec3 p) {
  return vec2(p.x / aspect * 0.5 + 0.5, p.y * 0.5 + 0.5);
}

// ruído 3D compacto, usado no ambiente e na luz de preenchimento
float noise3(vec3 p) {
  const vec3 s = vec3(7.0, 157.0, 113.0);
  vec3 ip = floor(p);
  p -= ip;

  vec4 h = vec4(0.0, s.yz, s.y + s.z) + dot(ip, s);
  p = p * p * (3.0 - 2.0 * p);
  h = mix(fract(sin(mod(h, TAU)) * 43758.5453), fract(sin(mod(h + s.x, TAU)) * 43758.5453), p.x);
  h.xy = mix(h.xz, h.yw, p.y);

  return mix(h.x, h.y, p.z);
}

// mapa de ambiente falso: reflexo quente que anda devagar
vec3 envMap(vec3 rd) {
  rd.xy -= u_time * 0.25;
  rd *= 3.0;

  float c = noise3(rd) * 0.57 + noise3(rd * 2.0) * 0.28 + noise3(rd * 4.0) * 0.15;
  c = smoothstep(0.5, 1.0, c);

  vec3 col = vec3(c, c * c, c * c * c * c);
  return mix(col, col.zyx, noise3(rd * 2.0));
}

// altura da almofada a partir do campo de distância.
//
// port literal do hm() do post-depth.frag deles, incluindo o 51.5 e a
// depressão exponencial. o miolo da célula afundar até o nível da base NÃO é
// defeito: é o que deixa a capa no fundo de uma moldura em relevo. já tentei
// "corrigir" isso e o que eu fiz foi achatar o relevo inteiro
float heightAt(vec2 uv) {
  float raw = texture(u_height, uv).r;

  objId = smoothstep(0.02, 0.0225, raw);

  float h = raw * 51.5 * u_edgeScale;
  float maxHeight = u_relief;

  const float decay = 8.0;
  const float depressionDecay = 2.0;
  const float depressionBlendWidth = 0.5;
  float depressionStart = maxHeight * 1.3;

  float flattened = maxHeight * (1.0 - exp(-h * decay));
  float depression = 0.0;

  if (h > depressionStart) {
    float adjusted = max(0.0, h - depressionStart);
    float blend = smoothstep(depressionStart, depressionStart + depressionBlendWidth, h);
    depression = maxHeight * (1.0 - exp(-adjusted * depressionDecay)) * blend;
  }

  return flattened - depression;
}

// superfície: plano de fundo deslocado pela altura
float surface(vec3 p, float rmMod) {
  float h = heightAt(toUv(p));
  lastHeight = h;
  return -p.z - (h - 1.0) * rmMod * rmMod * rmMod;
}

// normal por seis amostras alternadas do campo
vec3 normalAt(vec3 p, float rmMod) {
  float sgn = 1.0;
  vec3 e = vec3(0.0025, 0.0, 0.0);
  vec3 acc = vec3(0.0);

  for (int i = 0; i < 6; i++) {
    acc.x += surface(p + sgn * e, rmMod) * sgn;
    sgn = -sgn;
    if ((i & 1) == 1) {
      acc = acc.yzx;
      e = e.zxy;
    }
  }

  return normalize(acc);
}

void main() {
  aspect = u_res.x / u_res.y;

  vec2 u = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
  vec2 cf = u_focusScreen * 0.85;

  float cfDist = clamp(length(u - cf), 0.0, 1.0);
  cfDist = (cfDist + 0.3) / 1.3 * 0.45;
  float rmMod = clamp(1.0 - cfDist, 0.0, 1.0);

  // a câmera senta sobre o foco: é isso que inclina as células distantes
  vec3 o = vec3(mix(u, cf, rmMod), -rmMod);
  vec3 lightPos = o + vec3(0.0, 0.0, 4.5);
  vec3 rd = normalize(vec3(u - cf, 2.0));

  float t = cfDist;
  float step = 0.0;
  vec3 p = o;
  float last = 1.0;

  float iterations = float(STEPS) * rmMod;
  int whole = int(iterations);

  for (int i = 0; i < STEPS; i++) {
    if (i >= whole) break;
    t += step;
    p = o + rd * t;

    float d = surface(p, rmMod);
    last = abs(d);

    if (last < 0.01) {
      step = 0.0;
      break;
    }
    step = d * 0.28 * rmMod;
  }

  if (step > 0.0) {
    t += step * (iterations - float(whole));
    p = o + rd * t;
    last = abs(surface(p, rmMod));
  }

  float hitId = objId;
  float hitHeight = lastHeight;

  // a capa é lida no ponto de impacto do raio, direto, como no original.
  // limitar esse desvio e misturar por um fator de convergência era o que
  // produzia o buraco: no centro o raio não converge, o fator caía a zero e
  // o pixel ia parar no ramo de moldura, multiplicado por pow(0.02, 0.8) * 1.6
  vec2 uv = toUv(p);

  vec3 frame = vec3(0.05);
  vec3 media = hitId > 0.0 ? texture(u_color, uv).rgb : vec3(0.0);
  vec3 c = mix(frame, media, hitId);

  vec3 n = normalAt(p, rmMod);

  vec3 l = lightPos - p;
  float lightDist = max(length(l), 0.001);
  l /= lightDist;

  // luz de preenchimento por trás, com variação de ruído
  float backFill = max(dot(vec3(-l.xy, 0.0), n), 0.0);
  float ns = smoothstep(-0.25, 0.25, noise3(p * 3.0 + u_time * 0.25) - 0.5);
  c += c * mix(vec3(1.0, 0.55, 0.35), vec3(1.0, 0.7, 0.6), ns * 0.5) * backFill * 18.0 * pow(rmMod, 3.0) * u_light;

  // brilho de borda tipo fresnel
  float fres = pow(max(1.0 - max(dot(-rd, n), 0.0), 0.0), 4.0);
  c += c * vec3(0.35, 0.5, 0.85) * fres * 1.6 * pow(rmMod, 3.0) * u_light;

  // especular com reflexo do ambiente
  vec3 halfDir = normalize(-rd + l);
  vec3 reflected = reflect(rd, n);
  float spec = pow(max(dot(halfDir, n), 0.0), 8.0);
  c += spec * envMap(reflected) * 2.0 * u_env;

  // a moldura recebe sombra conforme afunda
  if (hitId < 1.0) {
    c *= min(vec3(pow(hitHeight + 0.02, 0.8)) * 1.6, vec3(1.0));
  }

  float ambience = length(sin(n * 2.0) * 0.5 + 0.5) / sqrt(3.0) * smoothstep(-1.0, 1.0, -n.z) * 1.5;
  c = pow(max(c * ambience, 0.0), vec3(1.0 / 1.3));

  fragColor = vec4(c, 1.0);
}
`
