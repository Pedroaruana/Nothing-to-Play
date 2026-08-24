export type Locale = 'pt' | 'en'

export type Dict = {
  /** duas linhas, o "?" é colado na segunda pela própria tela */
  title: readonly [string, string]
  lede: string
  enter: string
  hint: string
  githubLabel: string
  localeLabel: string
  close: string
  rating: string
  released: string
  platforms: string
  where: string
  favorite: string
  unfavorite: string
  noSummary: string
}

export const DICT: Record<Locale, Dict> = {
  pt: {
    title: ['Nada pra', 'Jogar'],
    lede: 'Você tem centenas de jogos instalados e mesmo assim acha que não tem nada pra jogar.',
    enter: 'entrar no acervo',
    hint: 'ou pressione enter',
    githubLabel: 'Repositório do projeto no GitHub',
    localeLabel: 'Trocar idioma',
    close: 'fechar',
    rating: 'nota',
    released: 'lançamento',
    platforms: 'plataformas',
    where: 'onde encontrar',
    favorite: 'salvar nos favoritos',
    unfavorite: 'tirar dos favoritos',
    noSummary: 'sem descrição no acervo'
  },
  en: {
    title: ['Nothing', 'to Play'],
    lede: 'You have hundreds of games installed and still think there is nothing to play.',
    enter: 'enter the archive',
    hint: 'or press enter',
    githubLabel: 'Project repository on GitHub',
    localeLabel: 'Change language',
    close: 'close',
    rating: 'rating',
    released: 'released',
    platforms: 'platforms',
    where: 'where to find',
    favorite: 'save to favorites',
    unfavorite: 'remove from favorites',
    noSummary: 'no description in the archive'
  }
}
