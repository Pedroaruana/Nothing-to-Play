// lê o manifest.bin gerado pelo etl. 14 bytes por jogo, na mesma ordem do atlas

const MAGIC = 'NTPM'
const HEADER_BYTES = 20

export type Manifest = {
  count: number
  cols: number
  rows: number
  perPage: number
  pages: number
  ids: Uint32Array
  /** rgba por jogo: cor média da capa nos três primeiros, nota no quarto */
  meta: Uint8Array
  years: Uint16Array
  genreMask: Uint16Array
  platformMask: Uint16Array
}

export const loadManifest = async (url: string): Promise<Manifest> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`manifesto não carregou (${res.status})`)

  const buffer = await res.arrayBuffer()
  const view = new DataView(buffer)

  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (magic !== MAGIC) throw new Error('manifesto com formato desconhecido')

  const recordBytes = view.getUint16(6, true)
  const count = view.getUint32(8, true)
  const cols = view.getUint16(16, true)
  const rows = view.getUint16(18, true)
  const perPage = cols * rows

  const ids = new Uint32Array(count)
  const meta = new Uint8Array(count * 4)
  const years = new Uint16Array(count)
  const genreMask = new Uint16Array(count)
  const platformMask = new Uint16Array(count)

  for (let i = 0; i < count; i++) {
    const at = HEADER_BYTES + i * recordBytes

    ids[i] = view.getUint32(at, true)
    meta[i * 4] = view.getUint8(at + 4)
    meta[i * 4 + 1] = view.getUint8(at + 5)
    meta[i * 4 + 2] = view.getUint8(at + 6)
    meta[i * 4 + 3] = view.getUint8(at + 7)
    years[i] = view.getUint16(at + 8, true)
    genreMask[i] = view.getUint16(at + 10, true)
    platformMask[i] = view.getUint16(at + 12, true)
  }

  return {
    count,
    cols,
    rows,
    perPage,
    pages: Math.ceil(count / perPage),
    ids,
    meta,
    years,
    genreMask,
    platformMask
  }
}
