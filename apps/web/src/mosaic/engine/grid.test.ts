import { describe, expect, it } from 'vitest'
import { unitsPerPixel, worldAt, zoomAt, type Camera, type Viewport } from './grid'

const tela: Viewport = { width: 1600, height: 900 }
const cam: Camera = { x: 3, y: -2, zoom: 12 }

describe('worldAt', () => {
  it('o centro da tela é a posição da câmera', () => {
    const p = worldAt(tela.width / 2, tela.height / 2, cam, tela)

    expect(p.x).toBeCloseTo(cam.x)
    expect(p.y).toBeCloseTo(cam.y)
  })

  it('y cresce pra cima, ao contrário do pixel', () => {
    const acima = worldAt(800, 100, cam, tela)
    const abaixo = worldAt(800, 800, cam, tela)

    expect(acima.y).toBeGreaterThan(abaixo.y)
  })
})

describe('unitsPerPixel', () => {
  it('zoom maior mostra mais mundo por pixel', () => {
    const perto = unitsPerPixel({ ...cam, zoom: 6 }, tela)
    const longe = unitsPerPixel({ ...cam, zoom: 24 }, tela)

    expect(longe).toBeGreaterThan(perto)
  })
})

describe('zoomAt', () => {
  // a razão de existir da função: o ponto sob o cursor não pode escapar
  // enquanto a roda do mouse gira
  it('mantém o ponto sob o cursor parado', () => {
    const px = 1200
    const py = 300

    for (const fator of [0.5, 0.8, 1.25, 2]) {
      const antes = worldAt(px, py, cam, tela)
      const depois = zoomAt(cam, px, py, tela, fator, 1, 100)
      const agora = worldAt(px, py, depois, tela)

      expect(agora.x).toBeCloseTo(antes.x, 6)
      expect(agora.y).toBeCloseTo(antes.y, 6)
    }
  })

  it('respeita os limites de zoom', () => {
    expect(zoomAt(cam, 800, 450, tela, 0.001, 8, 14).zoom).toBe(8)
    expect(zoomAt(cam, 800, 450, tela, 1000, 8, 14).zoom).toBe(14)
  })

  it('no limite, a câmera não desliza', () => {
    const travado: Camera = { x: 3, y: -2, zoom: 8 }
    const r = zoomAt(travado, 1200, 300, tela, 0.5, 8, 14)

    expect(r.zoom).toBe(8)
    expect(r.x).toBeCloseTo(travado.x)
    expect(r.y).toBeCloseTo(travado.y)
  })
})
