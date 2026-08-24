import type { Look } from './engine/renderer'

// os presets do original trocam a métrica de distância e o relevo. aqui é a
// mesma ideia: cada um é um conjunto de parâmetros do shader, não outro código
export type PresetId = 'minimal' | 'depth' | 'chaos'

const BASE: Look = {
  jitter: 0,
  // EDGE_BORDER_ROUNDNESS_BASE deles, que bate com a nossa escala de mundo
  roundness: 0.155,
  // EDGE_BORDER_THICKNESS_BASE é 0.075, mas lá ele ainda multiplica por
  // borderThicknessScale, que vale 0.1 com EDGE_CELL_SCALING_BORDER_THICKNESS
  // desligado. usar 0.075 aqui deixa a borda dez vezes mais grossa que a deles
  border: 0.055,
  mediaScale: 1.12,
  // quase zero: no diagrama de potência, peso diferente é tamanho diferente, e
  // dar peso por popularidade quebra o alinhamento em linhas e colunas. eles só
  // usam peso no item em foco
  weightBias: 0.08,
  focusOffset: 2.3,
  bulge: 0.3,
  bulgeRadius: 5.5,
  falloff: 0.6,
  desat: 0.55,
  dof: 0.7,
  mediaDome: 0.2,
  darkFar: 0.2,
  // leva o campo pra escala de tela que o pós espera, a mesma do original
  edgeNorm: 0.2,
  edgeScale: 1,
  relief: 0.65,
  light: 1,
  env: 1,
  xScale: 1.5,
  ripple: 1,
  wobble: 1
}

export const PRESETS: Record<PresetId, { label: string; look: Look }> = {
  // sem relevo e sem reflexo: o mosaico chapado, que é o mais rápido
  minimal: {
    label: 'Minimal',
    look: { ...BASE, relief: 0, light: 0, env: 0, mediaDome: 0, ripple: 0, wobble: 0, border: 0.1, darkFar: 0.3, desat: 0.35 }
  },
  // o padrão: almofada com volume, vidro e reflexo de ambiente
  depth: {
    label: 'Depth',
    look: BASE
  },
  // célula mais irregular, onda mais forte e borda mais dura
  chaos: {
    label: 'Chaos',
    look: {
      ...BASE,
      // sem desalinhar a grade: o caos vem da onda, do relevo e do formato da
      // célula, não de jogar os centros fora do lugar
      roundness: 0.08,
      border: 0.075,
      ripple: 3.2,
      wobble: 2.4,
      relief: 0.85,
      env: 1.8,
      xScale: 2.2,
      darkFar: 0.12
    }
  }
}

/** níveis do acervo. o shader só precisa saber quantos jogos existem */
export const COUNTS = [5000, 10000, 25000] as const
