// o que a IGDB devolve, só os campos que a gente pede
export type RawGame = {
  id: number
  name: string
  slug: string
  summary?: string
  first_release_date?: number // unix em segundos
  total_rating?: number // 0 a 100, junta crítica e usuários
  total_rating_count?: number
  aggregated_rating?: number // só crítica
  cover?: { image_id: string }
  genres?: { id: number; name: string }[]
  platforms?: { id: number; abbreviation?: string; name: string }[]
}
