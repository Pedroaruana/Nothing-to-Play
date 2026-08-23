// mosaico resolvido por pixel. três coisas definem o resultado:
//
// 1. quem é a célula: diagrama de potência, ou seja distância ao quadrado MENOS
//    um peso. peso somado mantém as fronteiras retas mesmo com células de
//    tamanhos diferentes. peso dividindo entortaria tudo.
// 2. o formato: a borda é a menor distância até as bissetrizes com as vizinhas,
//    combinada com mínimo suave. isso dá o polígono exato com canto arredondado.
// 3. a lente: um fator que multiplica o afastamento do centro. dentro do raio
//    ele encolhe (aumenta a imagem), fora dele é 1 e nada é distorcido.

export const VORONOI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export const VORONOI_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform vec2 u_res;
uniform float u_time;

uniform vec2 u_cam;
uniform float u_zoom;

uniform float u_lensOn;
uniform float u_bulge;       // 0 sem lente, perto de 1 aumenta muito o centro
uniform float u_bulgeRadius;

uniform float u_jitter;
uniform float u_roundness;   // arredondamento do canto da célula
uniform float u_border;      // espessura do bisel
uniform float u_mediaScale;
uniform float u_weightBias;
uniform float u_focusOffset;
uniform float u_falloff;
uniform float u_desat;
uniform float u_dof;

uniform sampler2D u_cells; // xy = posição simulada, z = peso do foco
uniform ivec2 u_lattice;   // colunas e linhas
uniform vec2 u_cellSize;

uniform ivec2 u_focusCell; // posição do foco no lattice, sempre candidata
uniform int u_focus;
uniform int u_count;
uniform ivec2 u_metaSize;
uniform sampler2D u_meta;

uniform sampler2DArray u_atlas;
uniform int u_loadedPages;
uniform ivec2 u_atlasCells;
uniform vec2 u_cellUv;

uniform sampler2DArray u_neighbors; // capas grandes da vizinhança do foco
uniform sampler2D u_hires;
uniform float u_hasHires;
uniform float u_xScale;  // estica o eixo x antes de medir distância
uniform float u_ripple;  // onda radial percorrendo o mural
uniform float u_wobble;  // ruído somado à lente
uniform float u_mediaDome;
uniform float u_debug;   // 1 = pinta o motivo do pixel em vez da cor
uniform float u_darkFar; // quanto a capa some longe do foco
uniform float u_edgeNorm; // leva o campo pra escala que o pós espera // curvatura da capa, como se ela estivesse num vidro convexo

out vec4 fragColor;

const vec2 COVER = vec2(32.0 / 45.0, 1.0);

float dot2(vec2 v) {
  return dot(v, v);
}

float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

vec2 hash22(vec2 p) {
  float a = dot(p, vec2(127.1, 311.7));
  float b = dot(p, vec2(269.5, 183.3));
  return fract(sin(vec2(a, b)) * 43758.5453) * 2.0 - 1.0;
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i, vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// mínimo suave: é ele que arredonda o canto onde duas fronteiras se encontram
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

int spiralIndex(ivec2 d) {
  int r = max(abs(d.x), abs(d.y));
  if (r == 0) return 0;

  int base = (2 * r - 1) * (2 * r - 1);
  int side = 2 * r;

  if (d.x == r)  return base + (d.y + r);
  if (d.y == r)  return base + side + (r - d.x);
  if (d.x == -r) return base + 2 * side + (r - d.y);
  return base + 3 * side + (d.x + r);
}

// o acervo não tem borda: o lattice inteiro se repete pros quatro lados.
// a célula fora dele é a mesma célula de dentro, deslocada por um período
int wrapInt(int v, int n) {
  int m = v % n;
  return m < 0 ? m + n : m;
}

ivec2 wrapCell(ivec2 cell) {
  return ivec2(wrapInt(cell.x, u_lattice.x), wrapInt(cell.y, u_lattice.y));
}

ivec2 tileOf(ivec2 cell) {
  return (cell - wrapCell(cell)) / u_lattice;
}

int indexOfCell(ivec2 cell) {
  return spiralIndex(wrapCell(cell) - u_lattice / 2) % u_count;
}


vec4 metaOf(int index) {
  return texelFetch(u_meta, ivec2(index % u_metaSize.x, index / u_metaSize.x), 0);
}

// posição vem da simulação, não de ruído. é ela que move o mosaico
vec4 cellData(ivec2 cell) {
  return texelFetch(u_cells, cell, 0);
}

// peso somado na distância ao quadrado. quanto maior, maior a célula
float offsetOf(int index, float focusWeight) {
  float fame = 1.0 - float(index) / float(u_count);
  return u_weightBias * (fame * fame) * 0.45 + u_focusOffset * focusWeight;
}

// a lente deles: suavização em s aplicada como fator multiplicativo do
// afastamento. no centro o fator tende a (1 - força), o que amplia; a partir
// do raio ele vale 1 e o resto do mosaico fica intacto
float bulgeEase(float a) {
  float x = clamp(a * a, 0.0, 1.0);
  if (x > 0.5) return (x * x * x) / (3.0 * x * x - 3.0 * x + 1.0);
  return x * x * x * (x * (6.0 * x - 15.0) + 10.0);
}

vec2 lens(vec2 p) {
  if (u_lensOn < 0.5) return p;

  vec2 d = p - u_cam;
  float l = length(d) / max(u_bulgeRadius, 1e-4);
  float factor = mix(1.0, bulgeEase(l), u_bulge);

  // onda radial: frequência 30, velocidade 2, decaimento 0.75, e um termo que
  // a mantém presa perto do centro. números do shader original
  if (u_ripple > 0.0) {
    float hold = l < 1.0 ? (l - 1.0) * (l - 1.0) : 0.0;
    float wave = sin(30.0 * l - u_time * 2.0) * 0.02 * hold;
    factor *= 1.0 + wave * 0.25 * u_ripple;
  }

  // ruído de baixa frequência somado à lente, amplitude 0.05 como no original
  if (u_wobble > 0.0) {
    factor *= 1.0 + (noise21(p * 0.35 + u_time * 0.06) - 0.5) * 0.05 * u_wobble;
  }

  return u_cam + d * factor;
}

void main() {
  vec2 screen = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 p = lens(u_cam + screen * u_zoom * 2.0);

  // a célula mais provável é a que tem a origem mais perto. como a origem é
  // uma grade regular, isso é conta direta em vez de busca
  ivec2 home = ivec2(round(p / u_cellSize + vec2(u_lattice - 1) * 0.5));

  float best = 1e9;
  int bestIndex = -1;
  ivec2 bestCell = home;
  vec2 bestCenter = vec2(0.0);
  float bestOffset = 0.0;

  for (int dy = -3; dy <= 3; dy++) {
    for (int dx = -3; dx <= 3; dx++) {
      ivec2 cell = home + ivec2(dx, dy);

      vec4 data = cellData(wrapCell(cell));
      vec2 center = data.xy + vec2(tileOf(cell)) * vec2(u_lattice) * u_cellSize;
      int index = indexOfCell(cell);
      float offset = offsetOf(index, data.z);

      float d = dot2((p - center) * vec2(u_xScale, 1.0)) - offset;

      if (d < best) {
        best = d;
        bestIndex = index;
        bestCell = cell;
        bestCenter = center;
        bestOffset = offset;
      }
    }
  }

  // a célula em foco tem peso alto e por isso vence pixels longe dela. se ela
  // não entrar como candidata aqui, a segunda varredura a encontra e derruba o
  // vencedor, o campo fica negativo e o pixel não é pintado: buraco preto
  {
    ivec2 cell = u_focusCell;
    vec4 data = cellData(wrapCell(cell));

    // procura a cópia do lattice mais próxima deste pixel
    vec2 period = vec2(u_lattice) * u_cellSize;
    vec2 tile = floor((p - data.xy) / period + 0.5);
    vec2 center = data.xy + tile * period;

    int index = indexOfCell(cell);
    float offset = offsetOf(index, data.z);
    float d = dot2((p - center) * vec2(u_xScale, 1.0)) - offset;

    if (d < best) {
      best = d;
      bestIndex = index;
      bestCell = cell + ivec2(tile) * u_lattice;
      bestCenter = center;
      bestOffset = offset;
    }
  }

#ifdef PICK
  outIndex = uint(bestIndex + 1);
  return;
#endif

  // formato da célula e caixa da capa saem da mesma varredura de vizinhas.
  //
  // guardo as duas menores distâncias em vez de ir aplicando mínimo suave a
  // cada vizinha: o smin subtrai k*h*(1-h) toda vez que roda, e 24 aplicações
  // acumulam até 0.6 negativo, o que zera o campo inteiro. o canto arredondado
  // só existe entre as duas fronteiras mais próximas, então basta suavizar lá
  float near1 = 1e9;
  float near2 = 1e9;
  vec2 midSum = vec2(0.0);
  vec2 bbMin = vec2(1e9);
  vec2 bbMax = vec2(-1e9);
  float used = 0.0;

  for (int dy = -3; dy <= 3; dy++) {
    for (int dx = -3; dx <= 3; dx++) {
      ivec2 cell = bestCell + ivec2(dx, dy);
      if (dx == 0 && dy == 0) continue;

      vec4 data = cellData(wrapCell(cell));
      vec2 center = data.xy + vec2(tileOf(cell)) * vec2(u_lattice) * u_cellSize;
      float offset = offsetOf(indexOfCell(cell), data.z);

      // tudo medido no espaço esticado em x, como no original
      vec2 sc = vec2(u_xScale, 1.0);
      vec2 diff = (bestCenter - center) * sc;
      float base = max(dot2(diff), 1e-4);

      // a bissetriz desliza conforme a diferença de peso. é isso que deixa a
      // célula maior sem entortar a fronteira
      float slide = 0.5 + (bestOffset - offset) / (2.0 * base);
      vec2 mid = mix(bestCenter * sc, center * sc, slide);
      vec2 dir = diff * inversesqrt(base);
      float len = dot(dir, p * sc - mid);

      // desfaz o estica no comprimento, senão a moldura fica mais grossa em x
      len *= mix(1.0, 1.0 / u_xScale, abs(dir.x));

      if (len < near1) {
        near2 = near1;
        near1 = len;
      } else if (len < near2) {
        near2 = len;
      }

      // a caixa da capa usa só as oito vizinhas coladas
      if (abs(dx) <= 1 && abs(dy) <= 1) {
        vec2 midFlat = mid / sc;
        midSum += midFlat;
        bbMin = min(bbMin, midFlat);
        bbMax = max(bbMax, midFlat);
        used += 1.0;
      }
    }
  }

  // mesmo raciocínio na segunda varredura: o foco precisa ser considerado
  if (bestCell != u_focusCell) {
    vec4 data = cellData(wrapCell(u_focusCell));
    vec2 period = vec2(u_lattice) * u_cellSize;
    vec2 tile = floor((p - data.xy) / period + 0.5);
    vec2 center = data.xy + tile * period;
    float offset = offsetOf(indexOfCell(u_focusCell), data.z);

    vec2 sc = vec2(u_xScale, 1.0);
    vec2 diff = (bestCenter - center) * sc;
    float base = max(dot2(diff), 1e-4);
    float slide = 0.5 + (bestOffset - offset) / (2.0 * base);
    vec2 mid = mix(bestCenter * sc, center * sc, slide);
    vec2 dir = diff * inversesqrt(base);
    float len = dot(dir, p * sc - mid) * mix(1.0, 1.0 / u_xScale, abs(dir.x));

    if (len < near1) {
      near2 = near1;
      near1 = len;
    } else if (len < near2) {
      near2 = len;
    }
  }

  // o campo fica negativo quando as duas varreduras discordam sobre o dono do
  // pixel, o que acontece quando uma célula anda muito. nesse caso o pixel
  // assume a capa do vencedor em vez de virar buraco preto
  float rawEdge = smin(near1, near2, u_roundness);
  bool disputed = rawEdge <= 0.0;
  float edge = max(rawEdge, 0.0);
  float aa = fwidth(edge) + 1e-6;

  vec2 avg = midSum / max(used, 1.0);
  vec2 box = max(bbMax - bbMin - u_border, vec2(0.001));
  float fit = min(box.x / COVER.x, box.y / COVER.y) * u_mediaScale;
  vec2 uv = (p - avg) / (COVER * fit) + 0.5;

  vec4 meta = metaOf(bestIndex);
  vec3 media = meta.rgb;

  int perPage = u_atlasCells.x * u_atlasCells.y;
  int page = bestIndex / perPage;
  bool isFocus = bestIndex == u_focus;

  bool onMedia = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;

  if (onMedia) {
    // o item em foco usa a capa grande; o resto vem do atlas de 32x45
    float layer = cellData(wrapCell(bestCell)).w;

    if (isFocus && u_hasHires > 0.5) {
      media = texture(u_hires, vec2(uv.x, 1.0 - uv.y)).rgb;
    } else if (layer >= 0.0) {
      // vizinha do foco: capa em 264x374 em vez dos 32x45 do atlas
      media = texture(u_neighbors, vec3(uv.x, 1.0 - uv.y, layer)).rgb;
    } else if (((u_loadedPages >> page) & 1) == 1) {
      int slot = bestIndex - page * perPage;
      vec2 at = vec2(float(slot % u_atlasCells.x), float(slot / u_atlasCells.x));
      media = texture(u_atlas, vec3((at + vec2(uv.x, 1.0 - uv.y)) * u_cellUv, float(page))).rgb;
    }
  }

  // o cinza vem do PESO da célula, não da distância de tela: célula longe do
  // foco perde a cor e perto dele recupera. é o postEffectsColor do original
  vec4 bestData = cellData(wrapCell(bestCell));
  float weight = bestData.z;
  float grey = dot(media, vec3(0.2126, 0.7152, 0.0722));
  media = mix(media, vec3(grey), u_desat * (1.0 - weight));

  // e afunda no escuro junto: longe do foco sobra só a conta, sem capa legível
  media *= mix(u_darkFar, 1.0, weight);

  // o passe principal não sombreia nada: só a cor chapada e o vão preto.
  // todo o volume é feito depois, no raymarching sobre o campo de distância
  float edgeStep = disputed ? 1.0 : smoothstep(0.0, max(u_border, aa * 2.0), edge);
  vec3 color = mix(vec3(0.0), media, edgeStep);

#ifndef PICK
  if (u_debug > 0.5) {
    // vermelho: nenhum vencedor. verde: campo negativo. azul: fora da célula.
    // amarelo: dentro da célula mas fora da capa
    vec3 why = vec3(0.0);
    if (bestIndex < 0) why = vec3(1.0, 0.0, 0.0);
    else if (edge <= 0.0) why = vec3(0.0, 1.0, 0.0);
    else if (edgeStep < 0.5) why = vec3(0.0, 0.0, 1.0);
    else if (!onMedia) why = vec3(1.0, 1.0, 0.0);
    else why = vec3(0.25);

    fragColor = vec4(why, 1.0);
    edgeOut = vec4(edge * u_edgeNorm, weight, 0.0, 1.0);
    return;
  }

  fragColor = vec4(max(color, 0.0), 1.0);

  // segundo alvo: o campo de distância e o peso, que o pós usa como relevo
  edgeOut = vec4(edge * u_edgeNorm, weight, 0.0, 1.0);
#endif
}
`
