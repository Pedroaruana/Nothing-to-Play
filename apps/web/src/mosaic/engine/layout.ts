// mapeamento de posição do lattice para jogo. espiral quadrada a partir do
// centro: o índice 0 fica no meio e a popularidade cai pra fora, então você
// sempre começa cercado do que reconhece.
//
// a mesma conta existe no shader. se mudar aqui, tem que mudar lá.
export const spiralIndex = (dcol: number, drow: number) => {
  const ring = Math.max(Math.abs(dcol), Math.abs(drow))
  if (ring === 0) return 0

  const base = (2 * ring - 1) * (2 * ring - 1)
  const side = 2 * ring

  if (dcol === ring) return base + (drow + ring)
  if (drow === ring) return base + side + (ring - dcol)
  if (dcol === -ring) return base + 2 * side + (ring - drow)
  return base + 3 * side + (dcol + ring)
}

/** jogo mostrado numa posição do lattice */
export const gameOfSlot = (
  slot: number,
  cols: number,
  rows: number,
  count: number
) => {
  const col = slot % cols
  const row = (slot - col) / cols

  return spiralIndex(col - (cols >> 1), row - (rows >> 1)) % count
}
