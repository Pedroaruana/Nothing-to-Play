'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/src/hooks/useReducedMotion'
import { unitsPerPixel, worldAt, zoomAt, type Camera } from './engine/grid'
import { gameOfSlot } from './engine/layout'
import { loadManifest, type Manifest } from './engine/manifest'
import { createRenderer, type Look, type Renderer } from './engine/renderer'
import FocusCard from './FocusCard'
import MosaicHud from './MosaicHud'
import { PRESETS, type PresetId } from './presets'
import { createSimulation, type Simulation } from './engine/simulation'

const ATLAS = '/atlas'
const IGDB_COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x'
const IGDB_COVER_BIG = 'https://images.igdb.com/igdb/image/upload/t_cover_big'

// nível de alta resolução da vizinhança do foco, desligado enquanto investigo
const NEIGHBOR_TIER = false
const DPR_CAP = 1.5

const ENTRY_ZOOM = 26
const HOME_ZOOM = 12

// não dá pra chegar mais perto que o repouso: a lente amplia 7x no centro, e
// abaixo disso a tela inteira cabe dentro do vão entre duas células, que é preto
// modo seleção: aproxima e engorda a célula escolhida
const SELECT_ZOOM = 5.5
const SELECT_MS = 900

const MIN_ZOOM = 8
const MAX_ZOOM = 14
const ENTRY_MS = 2000

// o ponteiro conduz a câmera. sem isso o mosaico só reage a arrastar
const STEER = 0.055
const DEADZONE = 0.05

const LOOK = PRESETS.depth.look

// fração da meia altura da tela que a lente cobre. tem que ser bem menor que 1:
// só o miolo é ampliado, o resto da tela mantém a densidade normal de células
const LENS_SPAN = 0.38

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

// mesma lente do shader, pra saber onde o clique caiu de verdade
const bulgeEase = (a: number) => {
  const x = Math.min(Math.max(a * a, 0), 1)
  if (x > 0.5) return (x * x * x) / (3 * x * x - 3 * x + 1)
  return x * x * x * (x * (6 * x - 15) + 10)
}

const lensWorld = (x: number, y: number, camX: number, camY: number, radius: number) => {
  const dx = x - camX
  const dy = y - camY
  const factor = 1 + (bulgeEase(Math.hypot(dx, dy) / radius) - 1) * LOOK.bulge

  return { x: camX + dx * factor, y: camY + dy * factor }
}

type Props = { onReady: () => void; onReplay: () => void }

const MosaicStage = ({ onReady, onReplay }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readyRef = useRef(onReady)
  const reduced = useReducedMotion()

  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const [pages, setPages] = useState(0)
  const [names, setNames] = useState<string[] | null>(null)
  const [focus, setFocus] = useState(-1)
  const [selected, setSelected] = useState(-1)
  const closeRef = useRef<() => void>(() => {})
  const [preset, setPreset] = useState<PresetId>('depth')
  const [count, setCount] = useState(25000)
  const [stats, setStats] = useState<string | null>(null)
  const [focusPoint, setFocusPoint] = useState({ x: 0, y: 0 })

  // o laço de render lê destes refs, senão trocar preset recriaria o webgl
  const presetRef = useRef<PresetId>('depth')
  const countRef = useRef(25000)
  const statsRef = useRef(false)
  const manifestRef = useRef<Manifest | null>(null)
  const [taxonomy, setTaxonomy] = useState<{ genres: { bit: number; label: string }[] } | null>(null)

  useEffect(() => {
    readyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: Renderer | null = null
    let manifest: Manifest | null = null
    let sim: Simulation | null = null
    let covers: string[] | null = null
    let raf = 0
    let alive = true

    const camera: Camera = { x: 0, y: 0, zoom: ENTRY_ZOOM }
    const target = { x: 0, y: 0, active: false }
    const drag = { active: false, lastX: 0, lastY: 0, moved: false }
    const pointer = { px: 0, py: 0, inside: false }

    let focused = -1
    let start = 0
    let hiresToken = 0

    // seleção: guarda o zoom de onde veio pra poder voltar
    let frameMs = 0
    let lastStats = 0
    let painted = false

    // enquanto o atlas não chega, a célula só tem a cor média da capa. escurecer
    // isso deixa a tela preta nos primeiros segundos, então o escurecimento só
    // entra depois que a primeira página carregou, e em rampa
    let warmup = 0
    let layers: Float32Array | null = null
    let neighborToken = 0
    let loadedPages = 0
    let focusCol = 0
    let focusRow = 0
    let selectedSlot = -1
    let selectAt = 0
    let zoomBefore = HOME_ZOOM

    closeRef.current = () => {
      selectedSlot = -1
      selectAt = performance.now()
      setSelected(-1)
    }

    const toCanvas = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const ratio = canvas.width / rect.width
      return { x: (clientX - rect.left) * ratio, y: (clientY - rect.top) * ratio }
    }

    // a capa em foco é buscada em 528x748 no cdn da igdb. o atlas de 32x45
    // serve pro mosaico e não serve pro destaque, ali a nitidez aparece
    const loadHires = async (index: number) => {
      if (!renderer || !covers) return

      const token = ++hiresToken
      const imageId = covers[index]
      if (!imageId) return

      try {
        const res = await fetch(`${IGDB_COVER}/${imageId}.jpg`)
        if (!res.ok) return

        const bitmap = await createImageBitmap(await res.blob())
        if (!alive || token !== hiresToken || !renderer) {
          bitmap.close()
          return
        }

        renderer.setHires(bitmap)
      } catch {
        // capa grande é enfeite: se falhar, fica a do atlas
      }
    }

    // as células em volta do foco sobem pra 264x374. sem isso, ao aproximar
    // elas continuam nos 32x45 do atlas e ficam visivelmente borradas
    const loadNeighbors = async (centerSlot: number) => {
      // DESLIGADO: este recurso é o suspeito do anel preto em volta do foco.
      // fica fora até eu provar por medição que não é ele
      if (!NEIGHBOR_TIER) return
      if (!renderer || !sim || !covers || !layers || centerSlot < 0) return

      const token = ++neighborToken
      const half = Math.floor(Math.sqrt(renderer.neighborLayers) / 2)
      const col = centerSlot % sim.cols
      const row = (centerSlot - col) / sim.cols

      layers.fill(-1)
      let layer = 0

      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (layer >= renderer.neighborLayers) break

          const c = ((col + dx) % sim.cols + sim.cols) % sim.cols
          const r = ((row + dy) % sim.rows + sim.rows) % sim.rows
          const slot = r * sim.cols + c
          const game = gameOfSlot(slot, sim.cols, sim.rows, manifest!.count)
          const imageId = covers[game]
          if (!imageId) continue

          const mine = layer++

          void (async () => {
            try {
              const res = await fetch(`${IGDB_COVER_BIG}/${imageId}.jpg`)
              if (!res.ok) return

              const bitmap = await createImageBitmap(await res.blob())
              if (!alive || token !== neighborToken || !renderer || !layers) {
                bitmap.close()
                return
              }

              renderer.uploadNeighbor(mine, bitmap)

              // a célula só passa a apontar pra camada DEPOIS que a imagem
              // chegou. marcar antes faz o shader ler textura vazia, que é preta
              layers[slot] = mine
            } catch {
              // vizinha em alta é melhoria: se falhar, fica o atlas
            }
          })()
        }
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      drag.active = true
      drag.moved = false
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      target.active = false
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const point = toCanvas(event.clientX, event.clientY)
      pointer.px = point.x
      pointer.py = point.y
      pointer.inside = true

      if (!drag.active || !renderer) return

      const ratio = canvas.width / canvas.getBoundingClientRect().width
      const scale = unitsPerPixel(camera, renderer.size())

      camera.x -= (event.clientX - drag.lastX) * ratio * scale
      camera.y += (event.clientY - drag.lastY) * ratio * scale

      drag.lastX = event.clientX
      drag.lastY = event.clientY
      drag.moved = true
    }

    const onPointerUp = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      drag.active = false

      // clique sem arrastar traz a célula pro centro e entra em modo seleção
      if (!drag.moved && renderer && sim) {
        const point = toCanvas(event.clientX, event.clientY)
        const raw = worldAt(point.x, point.y, camera, renderer.size())
        const world = lensWorld(raw.x, raw.y, camera.x, camera.y, camera.zoom * LENS_SPAN)

        target.x = world.x
        target.y = world.y
        target.active = true

        if (selectedSlot < 0) zoomBefore = camera.zoom
        selectedSlot = sim.slotAt(world.x, world.y)
        selectAt = performance.now()
        setSelected(focused)
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (!renderer) return

      const point = toCanvas(event.clientX, event.clientY)
      const next = zoomAt(camera, point.x, point.y, renderer.size(), Math.exp(event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM)

      camera.x = next.x
      camera.y = next.y
      camera.zoom = next.zoom
    }

    const frame = (now: number) => {
      if (!alive || !renderer) return

      if (start === 0) start = now
      const entry = reduced ? 1 : Math.min((now - start) / ENTRY_MS, 1)

      if (entry < 1) {
        camera.zoom = ENTRY_ZOOM + (HOME_ZOOM - ENTRY_ZOOM) * easeOutExpo(entry)
      } else if (selectAt > 0) {
        // entra e sai da seleção com a mesma curva da tela inicial
        const t = Math.min((now - selectAt) / SELECT_MS, 1)
        const from = selectedSlot >= 0 ? zoomBefore : SELECT_ZOOM
        const to = selectedSlot >= 0 ? SELECT_ZOOM : zoomBefore

        camera.zoom = from + (to - from) * easeOutExpo(t)
        if (t >= 1) selectAt = 0
      }

      renderer.resize()

      // voo até a célula clicada, e fora disso o ponteiro conduz sozinho
      if (target.active) {
        camera.x += (target.x - camera.x) * 0.12
        camera.y += (target.y - camera.y) * 0.12
        if (Math.hypot(target.x - camera.x, target.y - camera.y) < 0.002) target.active = false
      } else if (pointer.inside && !drag.active && entry >= 1) {
        const size = renderer.size()
        const raw = worldAt(pointer.px, pointer.py, camera, size)
        const world = lensWorld(raw.x, raw.y, camera.x, camera.y, camera.zoom * LENS_SPAN)
        const dx = world.x - camera.x
        const dy = world.y - camera.y

        // zona morta no meio pra imagem não tremer com o mouse parado no centro
        if (Math.hypot(dx, dy) > DEADZONE) {
          camera.x += dx * STEER
          camera.y += dy * STEER
        }
      }

      const size = renderer.size()

      // posição do foco em coordenadas de tela corrigidas por aspecto: é o
      // ponto onde a câmera do raymarching senta
      const focusX = pointer.inside ? (pointer.px * 2 - size.width) / size.height : 0
      const focusY = pointer.inside ? (pointer.py * 2 - size.height) / size.height : 0

      const state = {
        camX: camera.x,
        camY: camera.y,
        zoom: camera.zoom,
        focus: focused,
        focusScreenX: focusX,
        focusScreenY: -focusY,
        focusCol,
        focusRow,
        count: countRef.current,
        look: {
          ...PRESETS[presetRef.current].look,
          bulgeRadius: camera.zoom * LENS_SPAN,
          focusOffset:
            selectedSlot >= 0
              ? PRESETS[presetRef.current].look.focusOffset * 2.4
              : PRESETS[presetRef.current].look.focusOffset,

          // hover deixa só a roseta acesa; seleção acende o acervo inteiro
          darkFar:
            selectedSlot >= 0
              ? 0.85
              : 1 - (1 - PRESETS[presetRef.current].look.darkFar) * warmup,
          desat: selectedSlot >= 0 ? 0.15 : PRESETS[presetRef.current].look.desat
        }
      }

      // a simulação roda antes do desenho. o foco é a célula sob o ponteiro e
      // o empurrão sai dela com raio igual à diagonal da tela, como no original
      if (sim && manifest) {
        const aim = pointer.inside ? worldAt(pointer.px, pointer.py, camera, size) : camera
        const slot = sim.slotAt(aim.x, aim.y)
        focusCol = slot % sim.cols
        focusRow = (slot - focusCol) / sim.cols

        const halfWidth = (size.width / size.height) * camera.zoom
        sim.step(slot, Math.hypot(halfWidth * 2, camera.zoom * 2))
        renderer.uploadCells(sim.positions, sim.weights, layers!)

        // gancho de diagnóstico: dá pra inspecionar a simulação pelo console
        if (process.env.NODE_ENV !== 'production') {
          ;(window as unknown as { __mosaic?: unknown }).__mosaic = { sim, camera, slot }
        }

        const game = slot >= 0 ? gameOfSlot(slot, sim.cols, sim.rows, manifest.count) : -1

        if (game !== focused) {
          focused = game
          setFocus(game)
          void loadHires(game)
          void loadNeighbors(slot)

          // o cartão fica embaixo e à esquerda da capa em foco, como na referência
          const rect = canvas.getBoundingClientRect()
          const ratio = rect.width / Math.max(size.width, 1)

          // mantém o cartão inteiro dentro da tela
          setFocusPoint({
            x: Math.min(rect.width - 24, Math.max(300, pointer.px * ratio - 40)),
            y: Math.min(rect.height - 120, Math.max(120, pointer.py * ratio + 90))
          })
        }

        state.focus = focused
      }

      // a rampa só começa depois da primeira página de atlas
      if (loadedPages > 0) warmup = Math.min(warmup + 0.02, 1)

      renderer.draw(state)

      if (!painted) {
        painted = true
        canvas.style.opacity = '1'
      }

      // medidor: média móvel do tempo de quadro, ligado pelo painel
      if (statsRef.current) {
        frameMs += (performance.now() - now - frameMs) * 0.1
        if (now - lastStats > 500) {
          lastStats = now
          setStats(`${frameMs.toFixed(1)} ms · ${Math.round(1000 / Math.max(frameMs, 0.1))} fps`)
        }
      }

      raf = requestAnimationFrame(frame)
    }

    const boot = async () => {
      try {
        manifest = await loadManifest(`${ATLAS}/manifest.bin`)
        manifestRef.current = manifest
        if (!alive) return

        // proporção da célula igual à da capa, 3:4
        sim = createSimulation(manifest.count, 0.75)
        layers = new Float32Array(sim.cols * sim.rows).fill(-1)

        renderer = createRenderer(
          canvas,
          manifest,
          { cols: sim.cols, rows: sim.rows, cellW: sim.cellW, cellH: sim.cellH },
          DPR_CAP
        )

        if (!renderer) {
          setFailed(true)
          return
        }

        renderer.uploadCells(sim.positions, sim.weights, layers)

        if (process.env.NODE_ENV !== 'production') {
          const hooks = window as unknown as {
            __debugMosaic?: (on: boolean) => void
            __postMosaic?: (on: boolean) => void
          }
          hooks.__debugMosaic = (on) => renderer?.setDebug(on)
          hooks.__postMosaic = (on) => renderer?.setPost(on)
        }

        setPages(manifest.pages)
        renderer.resize()
        raf = requestAnimationFrame(frame)

        for (let page = 0; page < manifest.pages; page++) {
          const res = await fetch(`${ATLAS}/atlas_${String(page).padStart(3, '0')}.webp`)
          if (!alive) return
          if (!res.ok) continue

          const bitmap = await createImageBitmap(await res.blob())
          if (!alive) {
            bitmap.close()
            return
          }

          renderer.uploadPage(page, bitmap)
          loadedPages = page + 1
          setLoaded(page + 1)
          if (page === 0) readyRef.current()
        }

        renderer.allPagesReady()

        const [namesRes, coversRes] = await Promise.all([
          fetch(`${ATLAS}/names.json`),
          fetch(`${ATLAS}/covers.json`)
        ])

        if (!alive) return
        if (namesRes.ok) setNames((await namesRes.json()) as string[])

        const taxRes = await fetch(`${ATLAS}/taxonomy.json`)
        if (alive && taxRes.ok) setTaxonomy((await taxRes.json()) as { genres: { bit: number; label: string }[] })
        if (coversRes.ok) covers = (await coversRes.json()) as string[]
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') console.error('[mosaico]', error)
        setFailed(true)
      }
    }

    const onPointerLeave = () => {
      pointer.inside = false
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    void boot()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      renderer?.dispose()
    }
  }, [reduced])

  const label = focus >= 0 && names ? names[focus] : null

  // o manifesto já traz ano, nota e máscara de gênero, então o painel não
  // depende de servidor nenhum
  const target = selected >= 0 ? selected : focus
  const info =
    target >= 0 && manifestRef.current && taxonomy
      ? {
          year: manifestRef.current.years[target] ?? 0,
          rating: manifestRef.current.meta[target * 4 + 3] ?? 255,
          genres: taxonomy.genres
            .filter((g) => ((manifestRef.current!.genreMask[target] ?? 0) >> g.bit) & 1)
            .map((g) => g.label)
            .slice(0, 4)
        }
      : null
  const progress = pages > 0 ? loaded / pages : 0

  if (failed) {
    return (
      <p className="fixed inset-0 z-10 grid place-items-center font-mono text-[11px] uppercase tracking-[0.3em] text-bone/40">
        o acervo não carregou
      </p>
    )
  }

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 z-10 h-full w-full cursor-grab touch-none opacity-0 transition-opacity duration-500 active:cursor-grabbing" />

      {label && selected < 0 && info && (
        <FocusCard
          name={label}
          year={info.year}
          rating={info.rating}
          genres={info.genres}
          x={focusPoint.x}
          y={focusPoint.y}
        />
      )}

      {selected >= 0 && names && (
        <aside className="fixed left-6 top-6 z-30 w-[min(26rem,80vw)] overflow-hidden rounded-sm border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl md:left-10 md:top-10">
          <h2 className="font-display text-3xl leading-tight text-bone">
            {names[selected]}
            {info?.year ? <span className="text-bone/40"> ({info.year})</span> : null}
          </h2>

          {info && info.rating < 255 && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-bone/50">
              nota {info.rating}
            </p>
          )}

          {info && info.genres.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {info.genres.map((genre) => (
                <li
                  key={genre}
                  className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/70"
                >
                  {genre}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => closeRef.current()}
            className="mt-6 border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em] text-bone/70 transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-void"
          >
            fechar
          </button>
        </aside>
      )}

      <span
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-px origin-left bg-bone/40 transition-[transform,opacity] duration-500"
        style={{ transform: `scaleX(${progress})`, opacity: progress >= 1 ? 0 : 1 }}
      />

      <MosaicHud
        preset={preset}
        count={count}
        stats={stats}
        onPreset={(next) => {
          presetRef.current = next
          setPreset(next)
        }}
        onCount={(next) => {
          countRef.current = next
          setCount(next)
        }}
        onStats={(on) => {
          statsRef.current = on
          setStats(on ? '...' : null)
        }}
        onReplay={onReplay}
      />
    </>
  )
}

export default MosaicStage
