import { createProgram } from '@/src/gl/program'
import type { Manifest } from './manifest'
import { POST_FRAG, POST_VERT } from './shaders/post'
import { VORONOI_FRAG, VORONOI_VERT } from './shaders/voronoi'

const ATLAS_SIZE = 2048
const META_WIDTH = 512

export type Look = {
  jitter: number
  /** arredondamento do canto onde duas fronteiras se encontram */
  roundness: number
  border: number
  mediaScale: number
  weightBias: number
  focusOffset: number
  /** força da lente: perto de 1 aumenta muito o centro */
  bulge: number
  bulgeRadius: number
  falloff: number
  desat: number
  dof: number
  /** curvatura da capa, como se ela estivesse deitada num vidro convexo */
  mediaDome: number
  /** estica o eixo x antes de medir distância (X_DIST_SCALING do original) */
  xScale: number
  ripple: number
  wobble: number
  /** leva o campo de distância pra escala que o pós espera */
  /** quanto a capa some longe do foco */
  darkFar: number
  edgeNorm: number
  edgeScale: number
  relief: number
  light: number
  env: number
}

export type Frame = {
  camX: number
  camY: number
  zoom: number
  focus: number
  /** foco em coordenadas de tela corrigidas por aspecto, pro raymarching */
  focusScreenX: number
  focusScreenY: number
  /** posição do foco no lattice, pro shader considerar sempre */
  focusCol: number
  focusRow: number
  /** quantos jogos do acervo entram. o resto do lattice repete os primeiros */
  count: number
  look: Look
}

export type Renderer = {
  resize: () => boolean
  draw: (frame: Frame) => void
  /** roda o mesmo shader num pixel só, num ponto de mundo já sem lente */
  pick: (frame: Frame, worldX: number, worldY: number) => number
  uploadCells: (positions: Float32Array, weights: Float32Array, layers: Float32Array) => void
  /** false quando o bitmap não bate com a camada, aí a célula não deve apontar pra ela */
  uploadNeighbor: (layer: number, bitmap: ImageBitmap) => boolean
  neighborLayers: number
  uploadPage: (page: number, bitmap: ImageBitmap) => void
  allPagesReady: () => void
  setHires: (bitmap: ImageBitmap | null) => void
  size: () => { width: number; height: number }
  dispose: () => void
  setDebug: (on: boolean) => void
  setPost: (on: boolean) => void
}

const PICK_OUTPUT = `
#ifdef PICK
layout(location = 0) out uint outIndex;
#else
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 edgeOut;
#endif
`

export type Lattice = { cols: number; rows: number; cellW: number; cellH: number }

export const createRenderer = (
  canvas: HTMLCanvasElement,
  manifest: Manifest,
  lattice: Lattice,
  dprCap: number
): Renderer | null => {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance'
  })
  if (!gl) return null

  const base = VORONOI_FRAG.replace('out vec4 fragColor;', PICK_OUTPUT.trim())

  // a seleção sai do mesmo código do desenho. reimplementar a busca em js
  // daria divergência na primeira mudança de ruído, de peso ou de métrica
  const drawProgram = createProgram(gl, VORONOI_VERT, base)
  const pickProgram = createProgram(gl, VORONOI_VERT, base.replace('#version 300 es\n', '#version 300 es\n#define PICK 1\n'))
  if (!drawProgram || !pickProgram) return null

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)

  const metaHeight = Math.ceil(manifest.count / META_WIDTH)
  const metaPixels = new Uint8Array(META_WIDTH * metaHeight * 4)
  metaPixels.set(manifest.meta)

  const metaTexture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, metaTexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, META_WIDTH, metaHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, metaPixels)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const atlas = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas)
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, ATLAS_SIZE, ATLAS_SIZE, manifest.pages)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // segundo nível de textura: a capa grande de quem está em foco
  const hires = gl.createTexture()
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, hires)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // unidade própria: sem o activeTexture ela cai na unidade que sobrou do bind
  // anterior, a 2, que é a do u_hires. aí um sampler2D float acaba lendo uma
  // textura de inteiro sem sinal e o driver descarta o draw inteiro
  const pickTexture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE7)
  gl.bindTexture(gl.TEXTURE_2D, pickTexture)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32UI, 1, 1)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

  const pickBuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, pickBuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickTexture, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const pickResult = new Uint32Array(1)

  // posições da simulação. sobe uma vez por quadro: 25 mil células viram uma
  // textura de float, e o shader lê a posição de cada uma com texelFetch
  const cells = gl.createTexture()
  gl.activeTexture(gl.TEXTURE3)
  gl.bindTexture(gl.TEXTURE_2D, cells)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, lattice.cols, lattice.rows)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const cellPixels = new Float32Array(lattice.cols * lattice.rows * 4)

  // vizinhança em alta: as capas em volta do foco também sobem de resolução,
  // senão ao aproximar elas continuam nos 32x45 do atlas e ficam borradas
  const NEIGHBOR_LAYERS = 25
  const NEIGHBOR_W = 264
  const NEIGHBOR_H = 374

  const neighbors = gl.createTexture()
  gl.activeTexture(gl.TEXTURE6)
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, neighbors)
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, NEIGHBOR_W, NEIGHBOR_H, NEIGHBOR_LAYERS)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // dois alvos: a cor chapada do mosaico e o campo de distância que vira relevo
  const postProgram = createProgram(gl, POST_VERT, POST_FRAG)
  if (!postProgram) return null

  // o campo precisa de precisão: em 8 bits a normal do raymarching fica em degraus
  const canFloat = gl.getExtension('EXT_color_buffer_float') !== null
  const heightFormat = canFloat ? gl.RGBA16F : gl.RGBA8

  const makeTarget = (unit: number, format: number) => {
    const texture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return { texture, unit, format }
  }

  const colorTarget = makeTarget(4, gl.RGBA8)
  const heightTarget = makeTarget(5, heightFormat)
  const sceneBuffer = gl.createFramebuffer()

  let sceneWidth = 0
  let sceneHeight = 0

  const resizeScene = (width: number, height: number) => {
    if (sceneWidth === width && sceneHeight === height) return

    sceneWidth = width
    sceneHeight = height

    for (const target of [colorTarget, heightTarget]) {
      gl.activeTexture(gl.TEXTURE0 + target.unit)
      gl.bindTexture(gl.TEXTURE_2D, target.texture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        target.format,
        width,
        height,
        0,
        gl.RGBA,
        target.format === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        null
      )
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneBuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTarget.texture, 0)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, heightTarget.texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  let loadedPages = 0
  let hasHires = 0
  let debug = false
  let postOn = true

  const setup = (
    program: WebGLProgram,
    frame: Frame,
    width: number,
    height: number,
    camX: number,
    camY: number,
    lensOn: number
  ) => {
    const u = (name: string) => gl.getUniformLocation(program, name)

    gl.useProgram(program)
    gl.uniform2f(u('u_res'), width, height)
    gl.uniform1f(u('u_time'), performance.now() / 1000)
    gl.uniform2f(u('u_cam'), camX, camY)
    gl.uniform1f(u('u_zoom'), frame.zoom)
    gl.uniform1f(u('u_lensOn'), lensOn)

    gl.uniform1f(u('u_bulge'), frame.look.bulge)
    gl.uniform1f(u('u_bulgeRadius'), frame.look.bulgeRadius)
    gl.uniform1f(u('u_roundness'), frame.look.roundness)
    gl.uniform1f(u('u_jitter'), frame.look.jitter)
    gl.uniform1f(u('u_border'), frame.look.border)
    gl.uniform1f(u('u_mediaScale'), frame.look.mediaScale)
    gl.uniform1f(u('u_weightBias'), frame.look.weightBias)
    gl.uniform1f(u('u_focusOffset'), frame.look.focusOffset)
    gl.uniform1f(u('u_falloff'), frame.look.falloff)
    gl.uniform1f(u('u_desat'), frame.look.desat)
    gl.uniform1f(u('u_dof'), frame.look.dof)
    gl.uniform1f(u('u_mediaDome'), frame.look.mediaDome)
    gl.uniform1f(u('u_edgeNorm'), frame.look.edgeNorm)
    gl.uniform1f(u('u_darkFar'), frame.look.darkFar)
    gl.uniform1f(u('u_debug'), debug ? 1 : 0)
    gl.uniform1f(u('u_xScale'), frame.look.xScale)
    gl.uniform1f(u('u_ripple'), frame.look.ripple)
    gl.uniform1f(u('u_wobble'), frame.look.wobble)

    gl.uniform1i(u('u_focus'), frame.focus)
    gl.uniform2i(u('u_focusCell'), frame.focusCol, frame.focusRow)
    gl.uniform1i(u('u_count'), Math.min(frame.count, manifest.count))
    gl.uniform1i(u('u_cells'), 3)
    gl.uniform2i(u('u_lattice'), lattice.cols, lattice.rows)
    gl.uniform2f(u('u_cellSize'), lattice.cellW, lattice.cellH)
    gl.uniform2i(u('u_metaSize'), META_WIDTH, metaHeight)
    gl.uniform1i(u('u_meta'), 1)
    gl.uniform1i(u('u_atlas'), 0)
    gl.uniform1i(u('u_hires'), 2)
    gl.uniform1i(u('u_neighbors'), 6)
    gl.uniform1f(u('u_hasHires'), hasHires)
    gl.uniform1i(u('u_loadedPages'), loadedPages)
    gl.uniform2i(u('u_atlasCells'), manifest.cols, manifest.rows)
    gl.uniform2f(u('u_cellUv'), 32 / ATLAS_SIZE, 45 / ATLAS_SIZE)
  }

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width === width && canvas.height === height) return false

    canvas.width = width
    canvas.height = height
    return true
  }

  return {
    resize,
    size: () => ({ width: canvas.width, height: canvas.height }),

    draw: (frame) => {
      resizeScene(canvas.width, canvas.height)
      gl.bindVertexArray(vao)

      // preset sem relevo não passa pelo raymarching: lá o minimal cai no
      // post-default, que é um passthrough de uma linha. rodar o pós com
      // relief 0 deixa a altura zerada, e o ramo de moldura multiplica a cor
      // por pow(0.02, 0.8) * 1.6, o que apaga metade da tela
      if (!postOn || frame.look.relief <= 0.0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.drawBuffers([gl.BACK])
        gl.viewport(0, 0, canvas.width, canvas.height)
        setup(drawProgram, frame, canvas.width, canvas.height, frame.camX, frame.camY, 1)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        return
      }

      // 1. mosaico chapado e campo de distância, nos dois alvos
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneBuffer)
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
      gl.viewport(0, 0, canvas.width, canvas.height)

      // limpa antes de desenhar: sem isso um quadro que falhe deixa o conteúdo
      // do quadro anterior no alvo, e o que aparece na tela é resto velho
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)

      setup(drawProgram, frame, canvas.width, canvas.height, frame.camX, frame.camY, 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // 2. raymarching sobre o relevo, direto na tela
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(postProgram)

      const pu = (name: string) => gl.getUniformLocation(postProgram, name)
      gl.uniform1i(pu('u_color'), colorTarget.unit)
      gl.uniform1i(pu('u_height'), heightTarget.unit)
      gl.uniform2f(pu('u_res'), canvas.width, canvas.height)
      gl.uniform1f(pu('u_time'), performance.now() / 1000)
      gl.uniform2f(pu('u_focusScreen'), frame.focusScreenX, frame.focusScreenY)
      gl.uniform1f(pu('u_edgeScale'), frame.look.edgeScale)
      gl.uniform1f(pu('u_relief'), frame.look.relief)
      gl.uniform1f(pu('u_light'), frame.look.light)
      gl.uniform1f(pu('u_env'), frame.look.env)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },

    // num alvo de 1x1 o único pixel cai no centro da câmera. então basta pôr a
    // câmera no ponto que interessa e desligar a lente, que já foi aplicada
    pick: (frame, worldX, worldY) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pickBuffer)
      gl.viewport(0, 0, 1, 1)
      gl.bindVertexArray(vao)

      setup(pickProgram, frame, 1, 1, worldX, worldY, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.readPixels(0, 0, 1, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, pickResult)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      return pickResult[0]! - 1 // o shader soma 1 pra deixar 0 significar nada
    },

    neighborLayers: NEIGHBOR_LAYERS,

    uploadNeighbor: (layer, bitmap) => {
      // a camada tem tamanho fixo. bitmap de outro tamanho faz o driver recusar
      // o upload inteiro e a camada continua preta, então nem tenta
      if (bitmap.width !== NEIGHBOR_W || bitmap.height !== NEIGHBOR_H) {
        bitmap.close()
        return false
      }

      gl.activeTexture(gl.TEXTURE6)
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, neighbors)
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0, 0, 0, layer,
        NEIGHBOR_W, NEIGHBOR_H, 1,
        gl.RGBA, gl.UNSIGNED_BYTE, bitmap
      )
      bitmap.close()
      return true
    },

    uploadCells: (positions, weights, layers) => {
      for (let i = 0; i < weights.length; i++) {
        cellPixels[i * 4] = positions[i * 2]!
        cellPixels[i * 4 + 1] = positions[i * 2 + 1]!
        cellPixels[i * 4 + 2] = weights[i]!
        cellPixels[i * 4 + 3] = layers[i]!
      }

      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, cells)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, lattice.cols, lattice.rows, gl.RGBA, gl.FLOAT, cellPixels)
    },

    uploadPage: (page, bitmap) => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas)
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, page, ATLAS_SIZE, ATLAS_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
      loadedPages |= 1 << page
      bitmap.close()
    },

    setHires: (bitmap) => {
      if (!bitmap) {
        hasHires = 0
        return
      }

      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, hires)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
      hasHires = 1
      bitmap.close()
    },

    allPagesReady: () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas)
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, 4)
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    },

    setDebug: (on) => {
      debug = on
    },

    setPost: (on) => {
      postOn = on
    },

    dispose: () => {
      gl.deleteFramebuffer(sceneBuffer)
      gl.deleteTexture(colorTarget.texture)
      gl.deleteTexture(heightTarget.texture)
      gl.deleteProgram(postProgram)
      gl.deleteTexture(neighbors)
      gl.deleteTexture(cells)
      gl.deleteFramebuffer(pickBuffer)
      gl.deleteTexture(pickTexture)
      gl.deleteTexture(hires)
      gl.deleteTexture(atlas)
      gl.deleteTexture(metaTexture)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(drawProgram)
      gl.deleteProgram(pickProgram)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}
