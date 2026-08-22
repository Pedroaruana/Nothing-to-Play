// helpers de WebGL2. se falhar devolve null e a UI cai no fallback,
// erro de shader não pode derrubar a tela inteira

const compile = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null => {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[gl] falha ao compilar shader:', gl.getShaderInfoLog(shader))
    }
    gl.deleteShader(shader)
    return null
  }

  return shader
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string
): WebGLProgram | null => {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSource)
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSource)
  if (!vert || !frag) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  // os shaders já podem ser liberados, o programa linkado guarda o que precisa
  gl.deleteShader(vert)
  gl.deleteShader(frag)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[gl] falha ao linkar programa:', gl.getProgramInfoLog(program))
    }
    gl.deleteProgram(program)
    return null
  }

  return program
}
