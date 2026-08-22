import type { Metadata, Viewport } from 'next'
import { Inter_Tight, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const display = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap'
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Nothing to Play?',
  description:
    'Vinte e cinco mil capas de jogos em um mosaico infinito. Encontre o que jogar, o preço e onde comprar.'
}

export const viewport: Viewport = {
  themeColor: '#08080a',
  colorScheme: 'dark'
}

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="pt-BR" className={`${display.variable} ${mono.variable}`}>
    <body className="bg-void text-bone antialiased">{children}</body>
  </html>
)

export default RootLayout
