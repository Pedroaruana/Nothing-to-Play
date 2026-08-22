'use client'

import { useEffect, useRef, useState } from 'react'
import { createProgram } from '@/src/gl/program'
import { useReducedMotion } from '@/src/hooks/useReducedMotion'
import type { Phase } from '@/src/state/phase'
import { AMBIENT_FRAG, AMBIENT_VERT } from './shaders/ambient'

// canvas que fica atrás de tudo, da intro até o mosaico.
// desenho inteiro sai de um fragment shader, sem geometria nem textura

type Props = { phase: Phase }

// acima disso só come gpu em tela 4k e não muda nada na tela
const DPR_CAP = 1.5

const BASE_SPEED = 0.045 // velocidade de cruzeiro na intro
const DIVE_SPEED = 0.26 // velocidade quando a câmera mergulha no acervo

const AmbientField = ({ phase }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>(phase)
  const [supported, setSupported] = useState(true)
  const reduced = useReducedMotion()

  // fase vai num ref pq o loop monta uma vez só. se recriar, o tempo do shader zera
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance'
    })

    if (!gl) {
      setSupported(false)
      return
    }

    const program = createProgram(gl, AMBIENT_VERT, AMBIENT_FRAG)
    if (!program) {
      setSupported(false)
      return
    }

    // WebGL2 exige um VAO ligado mesmo quando não há atributo nenhum
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.useProgram(program)

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uTime = gl.getUniformLocation(program, 'u_time')
    const uFlight = gl.getUniformLocation(program, 'u_flight')
    const uResolve = gl.getUniformLocation(program, 'u_resolve')
    const uPointer = gl.getUniformLocation(program, 'u_pointer')

    let raf = 0
    let last = performance.now()
    let time = 0
    let flight = 0
    let resolve = 0
    let dirty = true
    let lastPhase = phaseRef.current

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }

    // devolve true se mudou de tamanho, aí sei que preciso redesenhar
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width === width && canvas.height === height) return false

      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
      return true
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.targetY = (0.5 - event.clientY / window.innerHeight) * 2
    }

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      if (phaseRef.current !== lastPhase) {
        lastPhase = phaseRef.current
        dirty = true
      }

      const target = phaseRef.current === 'intro' ? 0 : 1

      if (reduced) {
        resolve = target
      } else {
        // lerp amortecido, não depende do fps. somar fração fixa por frame
        // ficaria lento em tela de 30hz
        const k = 1 - Math.exp(-1.7 * dt)
        resolve += (target - resolve) * k
        time += dt

        // acumula a distância aqui em vez de tirar do tempo dentro do shader,
        // assim dá pra acelerar sem as placas pularem de lugar
        flight += dt * (BASE_SPEED + (DIVE_SPEED - BASE_SPEED) * resolve)
        pointer.x += (pointer.targetX - pointer.x) * (1 - Math.exp(-4 * dt))
        pointer.y += (pointer.targetY - pointer.y) * (1 - Math.exp(-4 * dt))
      }

      if (resize()) dirty = true

      // com reduced motion nada anima, então só redesenho quando muda algo
      if (!reduced || dirty) {
        gl.uniform2f(uRes, canvas.width, canvas.height)
        gl.uniform1f(uTime, time)
        gl.uniform1f(uFlight, flight)
        gl.uniform1f(uResolve, resolve)
        gl.uniform2f(uPointer, pointer.x, pointer.y)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        dirty = false
      }

      raf = requestAnimationFrame(frame)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    raf = requestAnimationFrame(frame)

    // sem soltar o contexto o strict mode deixa dois canvas vivos no dev
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [reduced])

  // fallback sem WebGL2: mesmo clima, custo zero
  if (!supported) {
    return (
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-void"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.07), transparent 62%), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 46px, transparent 46px 58px), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 62px, transparent 62px 76px)'
        }}
      />
    )
  }

  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 -z-10 h-full w-full" />
}

export default AmbientField
