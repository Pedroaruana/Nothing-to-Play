// formato do manifesto que o front lê junto com os atlas.
// tudo little endian. a posição do jogo no arquivo é a posição dele no mosaico,
// então dá pra achar a célula com aritmética, sem índice nenhum

export const MAGIC = 'NTPM'
export const VERSION = 1

export const CELL_W = 32
export const CELL_H = 45
export const PAGE_SIZE = 2048

// sobra faixa no rodapé da página porque 2048 não é múltiplo de 45. é barato
// e mexer nisso viraria capa esticada, que estraga o mosaico inteiro
export const COLS = Math.floor(PAGE_SIZE / CELL_W) // 64
export const ROWS = Math.floor(PAGE_SIZE / CELL_H) // 45
export const PER_PAGE = COLS * ROWS // 2880

export const HEADER_BYTES = 20
export const RECORD_BYTES = 14

/**
 * header: magic(4) versao(2) tamanhoDoRegistro(2) total(4) cellW(2) cellH(2) cols(2) rows(2)
 * registro: id(4) r(1) g(1) b(1) nota(1) ano(2) generos(2) plataformas(2)
 */
export const writeHeader = (buffer: Buffer, count: number) => {
  buffer.write(MAGIC, 0, 'ascii')
  buffer.writeUInt16LE(VERSION, 4)
  buffer.writeUInt16LE(RECORD_BYTES, 6)
  buffer.writeUInt32LE(count, 8)
  buffer.writeUInt16LE(CELL_W, 12)
  buffer.writeUInt16LE(CELL_H, 14)
  buffer.writeUInt16LE(COLS, 16)
  buffer.writeUInt16LE(ROWS, 18)
}

export type Record = {
  id: number
  r: number
  g: number
  b: number
  rating: number // 255 quando não tem nota
  year: number // 0 quando não tem data
  genreMask: number
  platformMask: number
}

export const writeRecord = (buffer: Buffer, index: number, record: Record) => {
  const at = HEADER_BYTES + index * RECORD_BYTES

  buffer.writeUInt32LE(record.id, at)
  buffer.writeUInt8(record.r, at + 4)
  buffer.writeUInt8(record.g, at + 5)
  buffer.writeUInt8(record.b, at + 6)
  buffer.writeUInt8(record.rating, at + 7)
  buffer.writeUInt16LE(record.year, at + 8)
  buffer.writeUInt16LE(record.genreMask, at + 10)
  buffer.writeUInt16LE(record.platformMask, at + 12)
}
