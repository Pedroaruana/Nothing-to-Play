// câmera do mosaico. o mundo é medido em células do lattice, e o zoom é
// quantas células cabem em meia tela de altura. tudo função pura, dá pra testar

export type Camera = { x: number; y: number; zoom: number }

export type Viewport = { width: number; height: number }

/** quanto de mundo vale um pixel na altura atual */
export const unitsPerPixel = (camera: Camera, viewport: Viewport) => (camera.zoom * 2) / viewport.height

/** pixel da tela para coordenada de mundo, antes de qualquer deformação de lente */
export const worldAt = (px: number, py: number, camera: Camera, viewport: Viewport) => {
  const scale = unitsPerPixel(camera, viewport)

  return {
    x: camera.x + (px - viewport.width / 2) * scale,
    y: camera.y - (py - viewport.height / 2) * scale
  }
}

/** zoom mirando no cursor: o ponto sob o mouse continua no mesmo lugar */
export const zoomAt = (
  camera: Camera,
  px: number,
  py: number,
  viewport: Viewport,
  factor: number,
  min: number,
  max: number
): Camera => {
  const zoom = Math.min(max, Math.max(min, camera.zoom * factor))
  const before = worldAt(px, py, camera, viewport)
  const after = worldAt(px, py, { ...camera, zoom }, viewport)

  return {
    zoom,
    x: camera.x + (before.x - after.x),
    y: camera.y + (before.y - after.y)
  }
}
