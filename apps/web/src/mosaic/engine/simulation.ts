// simulação de forças das células.
//
// isto é o coração do mosaico, e não o shader. as células não ficam paradas num
// lattice: elas são partículas com velocidade, puxadas de volta pra origem,
// empurradas pra fora a partir do foco e ligadas às vizinhas por molas.
// o "túnel" é o buraco que o empurrão abre em volta da célula em foco.
//
// os fatores em y são maiores que em x de propósito: é isso que dá o formato
// alongado da roseta central em vez de um círculo.

export type SimConfig = {
  alpha: number
  velocityDecay: number
  originStrength: number
  originYFactor: number
  pushStrength: number
  pushYFactor: number
  latticeStrength: number
  latticeYFactor: number
  latticeMaxLevels: number
}

// teto do empurrão por quadro, em fração de célula. sem isso a vizinha imediata
// do foco recebe uma força que tende ao infinito e sai voando da tela
const MAX_PUSH = 0.6

// deslocamento máximo em unidades de mundo (a célula tem 1 de altura)
const MAX_DRIFT = 1.2

// respiração diafragmática: ciclo de 6 segundos, inspira rápido e solta devagar.
// é o que faz o mural pulsar de leve mesmo com o mouse parado
const BREATH_CYCLE = 6000
const BREATH_DEPTH = 0.16

// vagar constante: cada célula tem um rumo próprio que gira devagar, então o
// mural nunca fica parado nem quando o ponteiro está imóvel
const WANDER = 0.0006
const WANDER_SPEED = 0.00022

// até quantas células de distância do foco a cor sobrevive. além disso a
// célula vira conta escura, que é o fundo do túnel
const WEIGHT_REACH = 4

const breathing = (now: number) => {
  const t = (now % BREATH_CYCLE) / BREATH_CYCLE
  const phase = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6

  // curva em s pros extremos não terem quina
  const eased = phase * phase * (3 - 2 * phase)
  return 1 + (eased - 0.5) * 2 * BREATH_DEPTH
}

export const DEFAULT_SIM: SimConfig = {
  alpha: 0.15,
  velocityDecay: 0.7,
  originStrength: 1.7,
  originYFactor: 1.5,
  pushStrength: 0.09,
  pushYFactor: 2.5,
  latticeStrength: 0.8,
  latticeYFactor: 3.75,
  latticeMaxLevels: 30
}

export type Simulation = {
  cols: number
  rows: number
  cellW: number
  cellH: number
  /** x, y de cada célula, na ordem do lattice. é o que sobe pra gpu */
  positions: Float32Array
  weights: Float32Array
  slotAt: (worldX: number, worldY: number) => number
  originOf: (slot: number) => { x: number; y: number }
  /** diagnóstico: maior deslocamento, extensão ocupada e se explodiu */
  stats: () => {
    maxDrift: number
    minX: number
    maxX: number
    minY: number
    maxY: number
    broken: number
  }
  step: (focusSlot: number, pushRadius: number) => void
}

export const createSimulation = (
  count: number,
  cellAspect: number,
  config: SimConfig = DEFAULT_SIM
): Simulation => {
  // lattice mais próximo do quadrado na tela, considerando que a célula é
  // mais alta que larga
  const cols = Math.max(2, Math.round(Math.sqrt(count / cellAspect)))
  const rows = Math.ceil(count / cols)
  const total = cols * rows

  const cellW = cellAspect
  const cellH = 1

  const positions = new Float32Array(total * 2)
  const velocities = new Float32Array(total * 2)
  const origins = new Float32Array(total * 2)
  const weights = new Float32Array(total)

  for (let slot = 0; slot < total; slot++) {
    const col = slot % cols
    const row = (slot - col) / cols
    const x = (col - (cols - 1) / 2) * cellW
    const y = (row - (rows - 1) / 2) * cellH

    origins[slot * 2] = x
    origins[slot * 2 + 1] = y
    positions[slot * 2] = x
    positions[slot * 2 + 1] = y
  }

  const originOf = (slot: number) => ({
    x: origins[slot * 2]!,
    y: origins[slot * 2 + 1]!
  })

  // qual célula está mais perto de um ponto. usa a origem, não a posição:
  // a origem é uma grade regular, então é uma conta direta em vez de busca
  // o lattice se repete pros quatro lados, então coluna e linha dão a volta
  const wrap = (value: number, size: number) => ((value % size) + size) % size

  const slotAt = (worldX: number, worldY: number) => {
    const col = wrap(Math.round(worldX / cellW + (cols - 1) / 2), cols)
    const row = wrap(Math.round(worldY / cellH + (rows - 1) / 2), rows)

    return row * cols + col
  }

  const decay = 1 - config.velocityDecay

  const step = (focusSlot: number, pushRadius: number) => {
    const alpha = config.alpha
    const originX = config.originStrength * alpha
    const originY = originX * config.originYFactor
    const breath = breathing(performance.now())
    const pushMod = config.pushStrength * alpha * breath
    const pushYMod = config.pushYFactor
    const radiusSq = pushRadius * pushRadius

    const hasFocus = focusSlot >= 0 && focusSlot < total
    const centerX = hasFocus ? positions[focusSlot * 2]! : 0
    const centerY = hasFocus ? positions[focusSlot * 2 + 1]! : 0

    // molas entre vizinhas, só na janela em volta do foco. rodar isso nas 25 mil
    // não muda nada visível longe do centro e custa caro
    if (hasFocus) {
      const focusCol = focusSlot % cols
      const focusRow = (focusSlot - focusCol) / cols
      const levels = config.latticeMaxLevels

      const minCol = Math.max(focusCol - levels, 1)
      const maxCol = Math.min(focusCol + levels, cols)
      const minRow = Math.max(focusRow - levels, 1)
      const maxRow = Math.min(focusRow + levels, rows)

      for (let row = minRow; row < maxRow; row++) {
        for (let col = minCol; col < maxCol; col++) {
          const slot = row * cols + col
          if (slot >= total) continue

          // a mola enfraquece conforme se afasta do foco
          const level = Math.max(Math.abs(col - focusCol), Math.abs(row - focusRow))
          // a respiração também afrouxa e aperta as molas
          const strength = (config.latticeStrength * (levels - level) * breath) / levels
          if (strength <= 0) continue

          link(slot, slot - 1, cellW, strength, alpha)
          link(slot, slot - cols, cellH, strength, alpha)
        }
      }
    }

    const now = performance.now()

    for (let slot = 0; slot < total; slot++) {
      const px = slot * 2
      const py = px + 1

      // volta pra origem
      velocities[px]! += (origins[px]! - positions[px]!) * originX
      velocities[py]! += (origins[py]! - positions[py]!) * originY

      // rumo próprio, girando devagar. o seno do índice serve de semente
      const seed = slot * 0.7548776662
      const angle = (seed - Math.floor(seed)) * 6.2831853 + now * WANDER_SPEED
      velocities[px]! += Math.cos(angle) * WANDER
      velocities[py]! += Math.sin(angle) * WANDER * 0.7

      // a célula em foco não se empurra: sem isso ela é ejetada pelo próprio
      // campo e a roseta fica sem centro
      if (hasFocus && slot !== focusSlot) {
        const dx = positions[px]! + velocities[px]! - centerX
        const dy = positions[py]! + velocities[py]! - centerY
        const distSq = dx * dx + dy * dy

        // empurrão a partir do foco. o fator (raio - l) / l explode quando a
        // célula está colada no centro, e é isso que abre o buraco da roseta
        if (distSq > 0 && distSq < radiusSq) {
          const dist = Math.sqrt(distSq)

          // o teto evita que a vizinha imediata seja arremessada pra fora da tela
          const force = Math.min(((pushRadius - dist) / dist) * pushMod, MAX_PUSH)

          velocities[px]! += dx * force
          velocities[py]! += dy * force * pushYMod
        }
      }

      velocities[px]! *= decay
      velocities[py]! *= decay
      positions[px]! += velocities[px]!
      positions[py]! += velocities[py]!

      // trava o quanto a célula pode se afastar da origem.
      //
      // não é enfeite: o shader procura a célula dona do pixel numa janela de
      // 5x5 em volta da origem. se uma célula andar mais que isso, o vencedor
      // encontrado é o errado, o campo de distância fica negativo e o pixel
      // some. o original resolve com lista de adjacência pré-calculada; sem
      // ela, o deslocamento tem que caber na janela
      const driftX = positions[px]! - origins[px]!
      const driftY = positions[py]! - origins[py]!
      const drift = Math.hypot(driftX, driftY)

      if (drift > MAX_DRIFT) {
        const scale = MAX_DRIFT / drift
        positions[px]! = origins[px]! + driftX * scale
        positions[py]! = origins[py]! + driftY * scale
      }
    }

    // o peso cai com a distância até o foco, em degraus de célula. é ele que
    // define o que tem cor e o que afunda no escuro, como no original
    const focusCol = hasFocus ? focusSlot % cols : 0
    const focusRow = hasFocus ? (focusSlot - focusCol) / cols : 0

    for (let slot = 0; slot < total; slot++) {
      let target = 0

      if (hasFocus) {
        const col = slot % cols
        const row = (slot - col) / cols
        const level = Math.max(Math.abs(col - focusCol), Math.abs(row - focusRow))
        target = Math.max(0, 1 - level / WEIGHT_REACH)
      }

      // sobe rápido e desce devagar: a luz alcança o cursor sem atraso, mas o
      // rastro atrás dele não pisca
      const rate = target > weights[slot]! ? 0.32 : 0.1
      weights[slot]! += (target - weights[slot]!) * rate
    }
  }

  function link(a: number, b: number, rest: number, strength: number, alpha: number) {
    if (b < 0 || b >= total) return

    const ax = a * 2
    const bx = b * 2
    const dx = positions[bx]! + velocities[bx]! - positions[ax]! - velocities[ax]!
    const dy = positions[bx + 1]! + velocities[bx + 1]! - positions[ax + 1]! - velocities[ax + 1]!

    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
    const factor = ((dist - rest) / dist) * alpha * strength

    const fx = dx * factor
    const fy = dy * factor * config.latticeYFactor

    velocities[bx]! -= fx
    velocities[bx + 1]! -= fy
    velocities[ax]! += fx
    velocities[ax + 1]! += fy
  }

  const stats = () => {
    let maxDrift = 0
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let broken = 0

    for (let slot = 0; slot < total; slot++) {
      const x = positions[slot * 2]!
      const y = positions[slot * 2 + 1]!

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        broken++
        continue
      }

      maxDrift = Math.max(maxDrift, Math.hypot(x - origins[slot * 2]!, y - origins[slot * 2 + 1]!))
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }

    return { maxDrift, minX, maxX, minY, maxY, broken }
  }

  return { cols, rows, cellW, cellH, positions, weights, slotAt, originOf, step, stats }
}
