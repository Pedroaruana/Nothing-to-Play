export type Locale = 'pt' | 'en'

export type Dict = {
  /** duas linhas, o "?" é colado na segunda pela própria tela */
  title: readonly [string, string]
  lede: string
  enter: string
  hint: string
  githubLabel: string
  localeLabel: string
}

export const DICT: Record<Locale, Dict> = {
  pt: {
    title: ['Nada pra', 'Jogar'],
    lede: 'Você tem centenas de jogos instalados e mesmo assim acha que não tem nada pra jogar.',
    enter: 'entrar no acervo',
    hint: 'ou pressione enter',
    githubLabel: 'Repositório do projeto no GitHub',
    localeLabel: 'Trocar idioma'
  },
  en: {
    title: ['Nothing', 'to Play'],
    lede: 'You have hundreds of games installed and still think there is nothing to play.',
    enter: 'enter the archive',
    hint: 'or press enter',
    githubLabel: 'Project repository on GitHub',
    localeLabel: 'Change language'
  }
}
