import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadManifest } from './manifest'

const HEADER_BYTES = 20
const RECORD_BYTES = 14

/** monta um manifest.bin sintético, no mesmo layout que o etl escreve */
const montarBinario = (
  jogos: { id: number; cor: [number, number, number]; nota: number; ano: number; genero: number; plataforma: number }[],
  { cols = 4, rows = 3, magic = 'NTPM' } = {}
) => {
  const buffer = new ArrayBuffer(HEADER_BYTES + jogos.length * RECORD_BYTES)
  const view = new DataView(buffer)

  for (let i = 0; i < 4; i++) view.setUint8(i, magic.charCodeAt(i))
  view.setUint16(6, RECORD_BYTES, true)
  view.setUint32(8, jogos.length, true)
  view.setUint16(16, cols, true)
  view.setUint16(18, rows, true)

  jogos.forEach((j, i) => {
    const at = HEADER_BYTES + i * RECORD_BYTES
    view.setUint32(at, j.id, true)
    view.setUint8(at + 4, j.cor[0])
    view.setUint8(at + 5, j.cor[1])
    view.setUint8(at + 6, j.cor[2])
    view.setUint8(at + 7, j.nota)
    view.setUint16(at + 8, j.ano, true)
    view.setUint16(at + 10, j.genero, true)
    view.setUint16(at + 12, j.plataforma, true)
  })

  return buffer
}

const servir = (buffer: ArrayBuffer, ok = true) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () => buffer
  }))

afterEach(() => vi.unstubAllGlobals())

describe('loadManifest', () => {
  const jogos = [
    { id: 1942, cor: [10, 20, 30] as [number, number, number], nota: 88, ano: 2011, genero: 0b101, plataforma: 0b11 },
    { id: 7, cor: [200, 100, 50] as [number, number, number], nota: 71, ano: 1998, genero: 0b10, plataforma: 0b1000 }
  ]

  it('lê cada campo na posição certa', async () => {
    servir(montarBinario(jogos))
    const m = await loadManifest('/atlas/manifest.bin')

    expect(m.count).toBe(2)
    expect([...m.ids]).toEqual([1942, 7])
    expect([...m.years]).toEqual([2011, 1998])
    expect([...m.genreMask]).toEqual([0b101, 0b10])
    expect([...m.platformMask]).toEqual([0b11, 0b1000])
    // meta é rgba: cor média nos três primeiros, nota no quarto
    expect([...m.meta.slice(0, 4)]).toEqual([10, 20, 30, 88])
    expect([...m.meta.slice(4, 8)]).toEqual([200, 100, 50, 71])
  })

  it('calcula as páginas a partir de cols x rows', async () => {
    servir(montarBinario(jogos, { cols: 4, rows: 3 }))
    const m = await loadManifest('/atlas/manifest.bin')

    expect(m.perPage).toBe(12)
    expect(m.pages).toBe(1)
  })

  it('arredonda a última página pra cima', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({ ...jogos[0]!, id: i }))
    servir(montarBinario(muitos, { cols: 4, rows: 3 }))
    const m = await loadManifest('/atlas/manifest.bin')

    // 25 jogos em páginas de 12 dão 3 páginas, a última pela metade
    expect(m.pages).toBe(3)
  })

  it('recusa arquivo com formato desconhecido', async () => {
    servir(montarBinario(jogos, { magic: 'XXXX' }))

    await expect(loadManifest('/atlas/manifest.bin')).rejects.toThrow(/formato desconhecido/)
  })

  it('avisa quando o arquivo não vem', async () => {
    servir(new ArrayBuffer(0), false)

    await expect(loadManifest('/atlas/manifest.bin')).rejects.toThrow(/404/)
  })
})
