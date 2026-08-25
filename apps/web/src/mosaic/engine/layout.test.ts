import { describe, expect, it } from 'vitest'
import { gameOfSlot, spiralIndex } from './layout'

describe('spiralIndex', () => {
  it('põe o índice 0 no centro', () => {
    expect(spiralIndex(0, 0)).toBe(0)
  })

  // esta é a propriedade que sustenta o mosaico inteiro: se dois pontos
  // diferentes caírem no mesmo índice, dois lugares da tela mostram o mesmo
  // jogo. e se sobrar buraco, algum jogo do acervo nunca aparece
  it('é bijeção: cobre 0..n sem repetir e sem buraco', () => {
    const raio = 12
    const vistos = new Set<number>()

    for (let drow = -raio; drow <= raio; drow++) {
      for (let dcol = -raio; dcol <= raio; dcol++) {
        vistos.add(spiralIndex(dcol, drow))
      }
    }

    const lado = 2 * raio + 1
    expect(vistos.size).toBe(lado * lado)
    expect(Math.min(...vistos)).toBe(0)
    expect(Math.max(...vistos)).toBe(lado * lado - 1)
  })

  it('mantém a ordem dos anéis: quem está mais perto do centro vem antes', () => {
    // todo mundo do anel 1 tem índice menor que qualquer um do anel 2
    const anel1 = [spiralIndex(1, 0), spiralIndex(0, 1), spiralIndex(-1, -1)]
    const anel2 = [spiralIndex(2, 0), spiralIndex(0, 2), spiralIndex(-2, 2)]

    expect(Math.max(...anel1)).toBeLessThan(Math.min(...anel2))
  })
})

describe('gameOfSlot', () => {
  it('nunca aponta pra fora do acervo', () => {
    const cols = 40
    const rows = 30
    const count = 137

    for (let slot = 0; slot < cols * rows; slot++) {
      const jogo = gameOfSlot(slot, cols, rows, count)
      expect(jogo).toBeGreaterThanOrEqual(0)
      expect(jogo).toBeLessThan(count)
    }
  })

  it('coloca o jogo 0 no meio do lattice', () => {
    const cols = 41
    const rows = 31
    const meio = (rows >> 1) * cols + (cols >> 1)

    expect(gameOfSlot(meio, cols, rows, 25000)).toBe(0)
  })

  it('com acervo menor que o lattice, repete em vez de deixar buraco', () => {
    const cols = 10
    const rows = 10
    const count = 7
    const usados = new Set<number>()

    for (let slot = 0; slot < cols * rows; slot++) {
      usados.add(gameOfSlot(slot, cols, rows, count))
    }

    // todos os 7 jogos aparecem em algum lugar
    expect(usados.size).toBe(count)
  })
})
