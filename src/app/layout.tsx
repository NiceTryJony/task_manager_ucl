import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TaskFlow',
  description: 'Smart task manager for Telegram',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0C0C13',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className="bg-bg-base text-text-primary antialiased">
        {children}
      </body>
    </html>
  )
}
